const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const POT = ethers.parseEther("1");
const DEP = ethers.parseEther("0.1");
const COMMIT_PERIOD = 3600;
const REVEAL_PERIOD = 3600;
const salt = (s) => ethers.id(s);

describe("UltimatumGame", function () {
  async function deploy() {
    const [funder, proposer, responder, outsider] = await ethers.getSigners();
    const game = await (await ethers.getContractFactory("UltimatumGame")).deploy();
    return { game, funder, proposer, responder, outsider };
  }

  async function created() {
    const ctx = await deploy();
    const { game, funder, proposer, responder } = ctx;
    await game
      .connect(funder)
      .createGame(proposer.address, responder.address, DEP, COMMIT_PERIOD, REVEAL_PERIOD, { value: POT });
    return { ...ctx, id: 1n };
  }

  // 雙方都已承諾：offer、threshold 由參數決定
  function committed(offer, threshold) {
    return async function committedFixture() {
      const ctx = await created();
      const { game, proposer, responder, id } = ctx;
      const cO = await game.commitmentOf(id, proposer.address, offer, salt("p"));
      const cT = await game.commitmentOf(id, responder.address, threshold, salt("r"));
      await game.connect(proposer).commit(id, cO, { value: DEP });
      await game.connect(responder).commit(id, cT, { value: DEP });
      return { ...ctx, offer, threshold };
    };
  }
  const acceptCase = committed(ethers.parseEther("0.4"), ethers.parseEther("0.3"));
  const rejectCase = committed(ethers.parseEther("0.1"), ethers.parseEther("0.3"));
  const equalCase = committed(ethers.parseEther("0.3"), ethers.parseEther("0.3"));

  describe("開局", function () {
    it("記錄參數並發出事件", async function () {
      const { game, funder, proposer, responder } = await loadFixture(deploy);
      await expect(
        game
          .connect(funder)
          .createGame(proposer.address, responder.address, DEP, COMMIT_PERIOD, REVEAL_PERIOD, { value: POT })
      ).to.emit(game, "GameCreated");
      const g = await game.games(1);
      expect(g.pot).to.equal(POT);
      expect(g.deposit).to.equal(DEP);
      expect(g.phase).to.equal(1n); // Commit
      expect(await ethers.provider.getBalance(game.target)).to.equal(POT);
    });

    it("拒絕不合理的參數", async function () {
      const { game, proposer, responder } = await loadFixture(deploy);
      const bad = (p, r, d, c, rv, v) =>
        expect(game.createGame(p, r, d, c, rv, { value: v })).to.be.revertedWithCustomError(game, "BadParams");
      await bad(proposer.address, responder.address, DEP, COMMIT_PERIOD, REVEAL_PERIOD, 0n); // 沒有 pot
      await bad(proposer.address, proposer.address, DEP, COMMIT_PERIOD, REVEAL_PERIOD, POT); // 自己跟自己玩
      await bad(proposer.address, responder.address, 0n, COMMIT_PERIOD, REVEAL_PERIOD, POT); // 沒有押金
      await bad(ethers.ZeroAddress, responder.address, DEP, COMMIT_PERIOD, REVEAL_PERIOD, POT);
      await bad(proposer.address, responder.address, DEP, 0, REVEAL_PERIOD, POT);
      await bad(proposer.address, responder.address, DEP, COMMIT_PERIOD, 0, POT);
    });
  });

  describe("承諾", function () {
    it("非玩家不能承諾", async function () {
      const { game, outsider, id } = await loadFixture(created);
      await expect(game.connect(outsider).commit(id, salt("x"), { value: DEP })).to.be.revertedWithCustomError(
        game,
        "NotPlayer"
      );
    });

    it("押金金額必須正確", async function () {
      const { game, proposer, id } = await loadFixture(created);
      await expect(game.connect(proposer).commit(id, salt("x"), { value: DEP - 1n })).to.be.revertedWithCustomError(
        game,
        "WrongDeposit"
      );
    });

    it("不能重複承諾、不能送空承諾", async function () {
      const { game, proposer, id } = await loadFixture(created);
      await expect(
        game.connect(proposer).commit(id, ethers.ZeroHash, { value: DEP })
      ).to.be.revertedWithCustomError(game, "BadParams");
      await game.connect(proposer).commit(id, salt("x"), { value: DEP });
      await expect(game.connect(proposer).commit(id, salt("y"), { value: DEP })).to.be.revertedWithCustomError(
        game,
        "AlreadyCommitted"
      );
    });

    it("承諾期過後不能承諾", async function () {
      const { game, proposer, id } = await loadFixture(created);
      await time.increase(COMMIT_PERIOD + 1);
      await expect(game.connect(proposer).commit(id, salt("x"), { value: DEP })).to.be.revertedWithCustomError(
        game,
        "DeadlinePassed"
      );
    });

    it("只有一方承諾時還不能揭露", async function () {
      const { game, proposer, id } = await loadFixture(created);
      const c = await game.commitmentOf(id, proposer.address, 1n, salt("p"));
      await game.connect(proposer).commit(id, c, { value: DEP });
      await expect(game.connect(proposer).reveal(id, 1n, salt("p"))).to.be.revertedWithCustomError(
        game,
        "WrongPhase"
      );
    });

    it("雙方都承諾後進入揭露期", async function () {
      const { game, id } = await loadFixture(acceptCase);
      const g = await game.games(id);
      expect(g.phase).to.equal(2n); // Reveal
      expect(g.revealDeadline).to.be.greaterThan(0n);
    });

    it("照抄對手的承諾沒有用（承諾綁定玩家位址）", async function () {
      const { game, proposer, responder, id } = await loadFixture(created);
      const offer = ethers.parseEther("0.4");
      const cO = await game.commitmentOf(id, proposer.address, offer, salt("p"));
      await game.connect(proposer).commit(id, cO, { value: DEP });
      await game.connect(responder).commit(id, cO, { value: DEP }); // 回應者照抄
      await game.connect(proposer).reveal(id, offer, salt("p"));
      // 回應者就算看到了 offer 與 salt，也無法用同一組值通過驗證
      await expect(game.connect(responder).reveal(id, offer, salt("p"))).to.be.revertedWithCustomError(
        game,
        "BadReveal"
      );
    });
  });

  describe("揭露與結算", function () {
    it("offer >= threshold：接受，分配為 (pot - offer, offer)，押金退回", async function () {
      const { game, proposer, responder, funder, id, offer, threshold } = await loadFixture(acceptCase);
      await game.connect(responder).reveal(id, threshold, salt("r"));
      await expect(game.connect(proposer).reveal(id, offer, salt("p")))
        .to.emit(game, "Settled")
        .withArgs(id, offer, threshold, true);
      expect(await game.balances(proposer.address)).to.equal(POT - offer + DEP);
      expect(await game.balances(responder.address)).to.equal(offer + DEP);
      expect(await game.balances(funder.address)).to.equal(0n);
    });

    it("offer == threshold：視為接受", async function () {
      const { game, proposer, responder, id, offer, threshold } = await loadFixture(equalCase);
      await game.connect(proposer).reveal(id, offer, salt("p"));
      await expect(game.connect(responder).reveal(id, threshold, salt("r")))
        .to.emit(game, "Settled")
        .withArgs(id, offer, threshold, true);
    });

    it("offer < threshold：拒絕，雙方只拿回押金，pot 退回實驗者", async function () {
      const { game, proposer, responder, funder, id, offer, threshold } = await loadFixture(rejectCase);
      await game.connect(proposer).reveal(id, offer, salt("p"));
      await expect(game.connect(responder).reveal(id, threshold, salt("r")))
        .to.emit(game, "Settled")
        .withArgs(id, offer, threshold, false);
      expect(await game.balances(proposer.address)).to.equal(DEP);
      expect(await game.balances(responder.address)).to.equal(DEP);
      expect(await game.balances(funder.address)).to.equal(POT);
    });

    it("揭露值或 salt 不符會被拒絕", async function () {
      const { game, proposer, id, offer } = await loadFixture(acceptCase);
      await expect(game.connect(proposer).reveal(id, offer + 1n, salt("p"))).to.be.revertedWithCustomError(
        game,
        "BadReveal"
      );
      await expect(game.connect(proposer).reveal(id, offer, salt("wrong"))).to.be.revertedWithCustomError(
        game,
        "BadReveal"
      );
    });

    it("揭露值不能超過 pot", async function () {
      const ctx = await loadFixture(committed(POT + 1n, 0n));
      await expect(
        ctx.game.connect(ctx.proposer).reveal(ctx.id, POT + 1n, salt("p"))
      ).to.be.revertedWithCustomError(ctx.game, "ValueOutOfRange");
    });

    it("不能重複揭露；非玩家不能揭露", async function () {
      const { game, proposer, outsider, id, offer } = await loadFixture(acceptCase);
      await game.connect(proposer).reveal(id, offer, salt("p"));
      await expect(game.connect(proposer).reveal(id, offer, salt("p"))).to.be.revertedWithCustomError(
        game,
        "AlreadyRevealed"
      );
      await expect(game.connect(outsider).reveal(id, offer, salt("p"))).to.be.revertedWithCustomError(
        game,
        "NotPlayer"
      );
    });

    it("揭露期過後不能揭露", async function () {
      const { game, proposer, id, offer } = await loadFixture(acceptCase);
      await time.increase(REVEAL_PERIOD + 1);
      await expect(game.connect(proposer).reveal(id, offer, salt("p"))).to.be.revertedWithCustomError(
        game,
        "DeadlinePassed"
      );
    });

    it("邊界值：offer = 0 且 threshold = 0 接受；offer = pot 全給", async function () {
      const a = await loadFixture(committed(0n, 0n));
      await a.game.connect(a.proposer).reveal(a.id, 0n, salt("p"));
      await a.game.connect(a.responder).reveal(a.id, 0n, salt("r"));
      expect(await a.game.balances(a.proposer.address)).to.equal(POT + DEP);
      expect(await a.game.balances(a.responder.address)).to.equal(DEP);

      const b = await loadFixture(committed(POT, POT));
      await b.game.connect(b.proposer).reveal(b.id, POT, salt("p"));
      await b.game.connect(b.responder).reveal(b.id, POT, salt("r"));
      expect(await b.game.balances(b.proposer.address)).to.equal(DEP);
      expect(await b.game.balances(b.responder.address)).to.equal(POT + DEP);
    });
  });

  describe("逾期處理", function () {
    it("承諾期內不能取消", async function () {
      const { game, id } = await loadFixture(created);
      await expect(game.cancel(id)).to.be.revertedWithCustomError(game, "DeadlineNotPassed");
    });

    it("承諾期逾期：取消，退回 pot 與已付押金", async function () {
      const { game, funder, proposer, responder, id } = await loadFixture(created);
      await game.connect(proposer).commit(id, salt("x"), { value: DEP });
      await time.increase(COMMIT_PERIOD + 1);
      await expect(game.cancel(id)).to.emit(game, "Cancelled").withArgs(id);
      expect(await game.balances(funder.address)).to.equal(POT);
      expect(await game.balances(proposer.address)).to.equal(DEP);
      expect(await game.balances(responder.address)).to.equal(0n);
      await expect(game.cancel(id)).to.be.revertedWithCustomError(game, "WrongPhase");
    });

    it("揭露期內不能主張逾期", async function () {
      const { game, id } = await loadFixture(acceptCase);
      await expect(game.claimTimeout(id)).to.be.revertedWithCustomError(game, "DeadlineNotPassed");
    });

    it("回應者不揭露：押金歸提議者，pot 退回實驗者", async function () {
      const { game, funder, proposer, responder, id, offer } = await loadFixture(acceptCase);
      await game.connect(proposer).reveal(id, offer, salt("p"));
      await time.increase(REVEAL_PERIOD + 1);
      await expect(game.claimTimeout(id)).to.emit(game, "Defaulted").withArgs(id, true, false);
      expect(await game.balances(proposer.address)).to.equal(2n * DEP);
      expect(await game.balances(responder.address)).to.equal(0n);
      expect(await game.balances(funder.address)).to.equal(POT);
    });

    it("提議者不揭露：押金歸回應者", async function () {
      const { game, funder, proposer, responder, id, threshold } = await loadFixture(acceptCase);
      await game.connect(responder).reveal(id, threshold, salt("r"));
      await time.increase(REVEAL_PERIOD + 1);
      await expect(game.claimTimeout(id)).to.emit(game, "Defaulted").withArgs(id, false, true);
      expect(await game.balances(responder.address)).to.equal(2n * DEP);
      expect(await game.balances(proposer.address)).to.equal(0n);
      expect(await game.balances(funder.address)).to.equal(POT);
    });

    it("雙方都不揭露：押金與 pot 都歸實驗者", async function () {
      const { game, funder, proposer, responder, id } = await loadFixture(acceptCase);
      await time.increase(REVEAL_PERIOD + 1);
      await game.claimTimeout(id);
      expect(await game.balances(funder.address)).to.equal(POT + 2n * DEP);
      expect(await game.balances(proposer.address)).to.equal(0n);
      expect(await game.balances(responder.address)).to.equal(0n);
      await expect(game.claimTimeout(id)).to.be.revertedWithCustomError(game, "WrongPhase");
    });
  });

  describe("提領", function () {
    it("提領後餘額歸零，實際收到正確金額", async function () {
      const { game, proposer, responder, id, offer, threshold } = await loadFixture(acceptCase);
      await game.connect(proposer).reveal(id, offer, salt("p"));
      await game.connect(responder).reveal(id, threshold, salt("r"));
      await expect(game.connect(responder).withdraw()).to.changeEtherBalance(responder, offer + DEP);
      expect(await game.balances(responder.address)).to.equal(0n);
      await expect(game.connect(responder).withdraw()).to.be.revertedWithCustomError(game, "NothingToWithdraw");
    });

    it("所有人提領完後合約餘額為 0（錢不多不少）", async function () {
      for (const fx of [acceptCase, rejectCase]) {
        const { game, funder, proposer, responder, id, offer, threshold } = await loadFixture(fx);
        await game.connect(proposer).reveal(id, offer, salt("p"));
        await game.connect(responder).reveal(id, threshold, salt("r"));
        for (const who of [funder, proposer, responder]) {
          if ((await game.balances(who.address)) > 0n) await game.connect(who).withdraw();
        }
        expect(await ethers.provider.getBalance(game.target)).to.equal(0n);
      }
    });

    it("重入攻擊拿不到多餘的錢", async function () {
      const { game, funder, proposer } = await loadFixture(deploy);
      const attacker = await (await ethers.getContractFactory("ReentrantPlayer")).deploy(game.target);
      // 開兩局：一局給攻擊者當回應者，另一局只是讓合約裡有別人的錢
      await game
        .connect(funder)
        .createGame(proposer.address, attacker.target, DEP, COMMIT_PERIOD, REVEAL_PERIOD, { value: POT });
      await game
        .connect(funder)
        .createGame(proposer.address, attacker.target, DEP, COMMIT_PERIOD, REVEAL_PERIOD, { value: POT });
      const offer = ethers.parseEther("0.5");
      const cO = await game.commitmentOf(1, proposer.address, offer, salt("p"));
      const cT = await game.commitmentOf(1, attacker.target, 0n, salt("r"));
      await game.connect(proposer).commit(1, cO, { value: DEP });
      await attacker.doCommit(1, cT, { value: DEP });
      await game.connect(proposer).reveal(1, offer, salt("p"));
      await attacker.doReveal(1, 0n, salt("r"));

      const before = await ethers.provider.getBalance(attacker.target);
      await attacker.doWithdraw();
      const after = await ethers.provider.getBalance(attacker.target);
      expect(after - before).to.equal(offer + DEP);
      expect(await attacker.reentryAttempts()).to.equal(1n);
      expect(await attacker.reentrySucceeded()).to.equal(false);
    });
  });

  describe("多局並行", function () {
    it("各局互不影響，承諾不能跨局重放", async function () {
      const { game, funder, proposer, responder } = await loadFixture(deploy);
      for (let i = 0; i < 2; i++) {
        await game
          .connect(funder)
          .createGame(proposer.address, responder.address, DEP, COMMIT_PERIOD, REVEAL_PERIOD, { value: POT });
      }
      const offer = ethers.parseEther("0.2");
      const c1 = await game.commitmentOf(1, proposer.address, offer, salt("p"));
      expect(c1).to.not.equal(await game.commitmentOf(2, proposer.address, offer, salt("p")));
      // 把第 1 局的承諾拿到第 2 局用，揭露時會失敗
      await game.connect(proposer).commit(2, c1, { value: DEP });
      await game.connect(responder).commit(2, await game.commitmentOf(2, responder.address, 0n, salt("r")), {
        value: DEP,
      });
      await expect(game.connect(proposer).reveal(2, offer, salt("p"))).to.be.revertedWithCustomError(
        game,
        "BadReveal"
      );
      expect((await game.games(1)).phase).to.equal(1n); // 第 1 局仍在承諾期
    });
  });
});
