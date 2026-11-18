// 用「模擬玩家」在本機 Hardhat 鏈上把整個流程跑一遍（不是真人實驗）。
// 每一局都真的走 createGame → commit × 2 → reveal × 2 →（或逾期）→ withdraw，
// 結果從鏈上事件讀回來，寫到 ../data/contract_sim/。
//
// 用法：npx hardhat run scripts/simulate.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const SEED = 20261118;
const GAMES_PER_TREATMENT = 200;
const POT = ethers.parseEther("0.01");
const DEP = ethers.parseEther("0.001");
const UNIT = POT / 1000n; // 出價最小單位 = pot 的 0.1%
const NO_REVEAL_RATE = 0.05; // 每位玩家有 5% 機率不揭露，用來走逾期流程

// Fehr & Schmidt (1999) 表 III 的偏好分布
const ALPHA = [
  [0, 0.3],
  [0.5, 0.3],
  [1, 0.3],
  [4, 0.1],
];
const BETA = [
  [0, 0.3],
  [0.25, 0.3],
  [0.6, 0.4],
];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const draw = (dist) => {
  let u = rnd();
  for (const [v, p] of dist) {
    if (u < p) return v;
    u -= p;
  }
  return dist[dist.length - 1][0];
};

// 公平偏好回應者的接受門檻（占 pot 的比例）：alpha / (1 + 2 alpha)
const thresholdShare = (alpha) => alpha / (1 + 2 * alpha);
// 換成最小單位並無條件進位，確保門檻不會因取整而低於理論值
const toUnits = (share) => BigInt(Math.ceil(share * 1000 - 1e-9));

// 公平偏好提議者：beta > 1/2 直接對半分；否則在各門檻值中挑期望效用最大的出價
function fsOffer(beta) {
  if (beta > 0.5) return 500n;
  let best = null;
  for (const [a] of ALPHA) {
    const sUnits = toUnits(thresholdShare(a));
    const s = Number(sUnits) / 1000;
    const pAccept = ALPHA.filter(([x]) => toUnits(thresholdShare(x)) <= sUnits).reduce((acc, [, p]) => acc + p, 0);
    const u = pAccept * (1 - s - beta * Math.max(1 - 2 * s, 0));
    if (best === null || u > best.u + 1e-12) best = { u, sUnits };
  }
  return best.sUnits;
}

const TREATMENTS = {
  // 兩邊都是只看錢的理性玩家：出最小金額、什麼都接受
  SPE_vs_SPE: { offer: () => 1n, threshold: () => 0n },
  // 理性提議者遇到有公平偏好的回應者
  SPE_vs_FS: { offer: () => 1n, threshold: () => toUnits(thresholdShare(draw(ALPHA))) },
  // 兩邊都有公平偏好，提議者知道回應者偏好的分布
  FS_vs_FS: { offer: () => fsOffer(draw(BETA)), threshold: () => toUnits(thresholdShare(draw(ALPHA))) },
};

async function main() {
  const signers = await ethers.getSigners();
  const funder = signers[0];
  const players = signers.slice(1);
  const game = await (await ethers.getContractFactory("UltimatumGame")).deploy();
  await game.waitForDeployment();

  const rows = [];
  let totalIn = 0n;
  for (const [name, tr] of Object.entries(TREATMENTS)) {
    for (let i = 0; i < GAMES_PER_TREATMENT; i++) {
      const pi = Math.floor(rnd() * players.length);
      let ri = Math.floor(rnd() * (players.length - 1));
      if (ri >= pi) ri++;
      const P = players[pi];
      const R = players[ri];
      const offer = tr.offer() * UNIT;
      const threshold = tr.threshold() * UNIT;
      const saltP = ethers.hexlify(ethers.randomBytes(32));
      const saltR = ethers.hexlify(ethers.randomBytes(32));
      const pReveals = rnd() >= NO_REVEAL_RATE;
      const rReveals = rnd() >= NO_REVEAL_RATE;

      await (await game.connect(funder).createGame(P.address, R.address, DEP, 600, 600, { value: POT })).wait();
      const id = await game.gameCount();
      totalIn += POT + 2n * DEP;
      await (await game.connect(P).commit(id, await game.commitmentOf(id, P.address, offer, saltP), { value: DEP })).wait();
      await (await game.connect(R).commit(id, await game.commitmentOf(id, R.address, threshold, saltR), { value: DEP })).wait();
      if (pReveals) await (await game.connect(P).reveal(id, offer, saltP)).wait();
      if (rReveals) await (await game.connect(R).reveal(id, threshold, saltR)).wait();
      if (!(pReveals && rReveals)) {
        await time.increase(601);
        await (await game.claimTimeout(id)).wait();
      }
      rows.push({ gameId: Number(id), treatment: name, intendedOffer: offer, intendedThreshold: threshold });
    }
  }

  // 從鏈上事件讀回結果（而不是用腳本自己記的值）
  const settled = new Map();
  for (const e of await game.queryFilter(game.filters.Settled())) {
    settled.set(Number(e.args.gameId), e.args);
  }
  const defaulted = new Map();
  for (const e of await game.queryFilter(game.filters.Defaulted())) {
    defaulted.set(Number(e.args.gameId), e.args);
  }

  // 全員提領，確認合約最後不留錢
  let totalOut = 0n;
  for (const s of signers) {
    const b = await game.balances(s.address);
    if (b > 0n) {
      await (await game.connect(s).withdraw()).wait();
      totalOut += b;
    }
  }
  const leftover = await ethers.provider.getBalance(game.target);

  const outDir = path.join(__dirname, "..", "..", "data", "contract_sim");
  fs.mkdirSync(outDir, { recursive: true });
  const lines = ["game_id,treatment,outcome,offer_share,threshold_share,proposer_payoff_share,responder_payoff_share"];
  const summary = {};
  let mismatches = 0;
  for (const r of rows) {
    const t = (summary[r.treatment] ??= {
      games: 0, settled: 0, accepted: 0, rejected: 0, defaulted: 0,
      sum_offer_share: 0, sum_proposer_payoff_share: 0, sum_responder_payoff_share: 0,
    });
    t.games++;
    const potF = Number(POT);
    if (settled.has(r.gameId)) {
      const s = settled.get(r.gameId);
      if (s.offer !== r.intendedOffer || s.threshold !== r.intendedThreshold) mismatches++;
      if (s.accepted !== (s.offer >= s.threshold)) mismatches++;
      const o = Number(s.offer) / potF;
      const th = Number(s.threshold) / potF;
      const pp = s.accepted ? 1 - o : 0;
      const rp = s.accepted ? o : 0;
      t.settled++;
      t[s.accepted ? "accepted" : "rejected"]++;
      t.sum_offer_share += o;
      t.sum_proposer_payoff_share += pp;
      t.sum_responder_payoff_share += rp;
      lines.push([r.gameId, r.treatment, s.accepted ? "accepted" : "rejected", o, th, pp, rp].join(","));
    } else if (defaulted.has(r.gameId)) {
      t.defaulted++;
      lines.push([r.gameId, r.treatment, "defaulted", "", "", "", ""].join(","));
    } else {
      mismatches++;
    }
  }
  for (const t of Object.values(summary)) {
    t.accept_rate = t.accepted / t.settled;
    t.mean_offer_share = t.sum_offer_share / t.settled;
    t.mean_proposer_payoff_share = t.sum_proposer_payoff_share / t.settled;
    t.mean_responder_payoff_share = t.sum_responder_payoff_share / t.settled;
    delete t.sum_offer_share;
    delete t.sum_proposer_payoff_share;
    delete t.sum_responder_payoff_share;
  }
  const result = {
    note: "模擬玩家，本機 Hardhat 鏈；不是真人實驗",
    seed: SEED,
    games_per_treatment: GAMES_PER_TREATMENT,
    pot_wei: POT.toString(),
    deposit_wei: DEP.toString(),
    no_reveal_rate: NO_REVEAL_RATE,
    fs_proposer_offer_units_by_beta: Object.fromEntries(BETA.map(([b]) => [b, Number(fsOffer(b))])),
    fs_threshold_units_by_alpha: Object.fromEntries(ALPHA.map(([a]) => [a, Number(toUnits(thresholdShare(a)))])),
    summary,
    event_vs_intended_mismatches: mismatches,
    total_paid_in_wei: totalIn.toString(),
    total_withdrawn_wei: totalOut.toString(),
    contract_leftover_wei: leftover.toString(),
  };
  fs.writeFileSync(path.join(outDir, "games.csv"), lines.join("\n") + "\n");
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
