"""用數值方法核對報告第一、二部分的理論結果，並畫理論圖。

輸出：results/model_check.json、report/figures/model_*.png
用法：python analysis/model_check.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "report" / "figures"
RES = ROOT / "results"
FIG.mkdir(parents=True, exist_ok=True)
RES.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261118)
out = {}

# ---------- 1. 多 Builder 競爭：離散出價的第一價格拍賣，暴力找純策略均衡 ----------
def pure_nash_first_price(values, L, grid):
    """完全資訊、出價只能取 grid 上的值、同價時由估值最高者得標。
    回傳所有「沒有人使用劣勢策略(出價>估值)」的純策略均衡中，得標價的集合。"""
    n = len(values)
    eq_prices = set()
    cand = [[b for b in grid if b <= v + 1e-12] for v in values]

    def payoff(i, bids):
        top = max(bids)
        if top < L - 1e-12:  # 沒人出到外部選項，回應者自己建塊
            return 0.0
        winners = [j for j in range(n) if abs(bids[j] - top) < 1e-12]
        w = min(winners)  # values 已由大到小排序，同價由估值高者得標
        return values[i] - top if i == w else 0.0

    import itertools
    for bids in itertools.product(*cand):
        ok = True
        for i in range(n):
            cur = payoff(i, bids)
            for b in cand[i]:
                alt = list(bids)
                alt[i] = b
                if payoff(i, alt) > cur + 1e-12:
                    ok = False
                    break
            if not ok:
                break
        if ok and max(bids) >= L - 1e-12:
            eq_prices.add(round(max(bids), 6))
    return sorted(eq_prices)

grid = [round(x, 2) for x in np.arange(0, 1.0001, 0.05)]
cases = [
    {"values": [1.0, 0.7, 0.4], "L": 0.2},   # V2 > L：競爭決定價格
    {"values": [1.0, 0.3, 0.1], "L": 0.5},   # L > V2：外部選項決定價格
    {"values": [1.0, 0.6], "L": 0.0},        # 兩個 builder、沒有外部選項
    {"values": [1.0], "L": 0.25},            # 獨占 builder：退回最後通牒 + 外部選項
    {"values": [1.0], "L": 0.0},             # 教科書最後通牒
]
chk = []
for c in cases:
    prices = pure_nash_first_price(c["values"], c["L"], grid)
    v2 = c["values"][1] if len(c["values"]) > 1 else 0.0
    chk.append({**c, "equilibrium_winning_bids": prices, "theory_max_V2_L": max(v2, c["L"])})
out["first_price_bruteforce"] = chk

# ---------- 2. 分潤比例與 builder 數量：V_i 獨立同分布時 E[V2/V1] ----------
def share_by_n(sampler, ns, reps=200_000):
    res = {}
    for n in ns:
        v = np.sort(sampler((reps, n)), axis=1)
        res[n] = float(np.mean(v[:, -2] / v[:, -1]))
    return res

ns = [2, 3, 4, 5, 8, 12, 20, 30]
uni = share_by_n(lambda s: rng.uniform(0, 1, s), ns)
logn = share_by_n(lambda s: rng.lognormal(0, 1, s), ns)
# 均勻分布時 V2/V1 的期望值有解析解 (n-1)/n
out["share_vs_n"] = {"uniform_sim": uni, "uniform_theory": {n: (n - 1) / n for n in ns},
                     "lognormal_sim": logn}

fig, ax = plt.subplots(figsize=(6, 3.8))
ax.plot(ns, [uni[n] for n in ns], "o-", label="Uniform(0,1) simulation")
ax.plot(ns, [(n - 1) / n for n in ns], "k--", lw=1, label="(n-1)/n (closed form)")
ax.plot(ns, [logn[n] for n in ns], "s-", label="Lognormal(0,1) simulation")
ax.set_xlabel("number of competing builders n")
ax.set_ylabel("expected proposer share E[V2/V1]")
ax.set_ylim(0, 1)
ax.grid(alpha=0.3)
ax.legend()
fig.tight_layout()
fig.savefig(FIG / "model_share_vs_n.png", dpi=160)
plt.close(fig)

# ---------- 3. 外部選項：s* = max(V2, L) 的分潤比例 ----------
fig, ax = plt.subplots(figsize=(6, 3.8))
v2 = np.linspace(0, 1, 201)
for L in [0.0, 0.2, 0.5]:
    ax.plot(v2, np.maximum(v2, L), label=f"L/V1 = {L}")
ax.set_xlabel("runner-up value V2 / V1  (1 = perfect competition)")
ax.set_ylabel("proposer share s*/V1")
ax.grid(alpha=0.3)
ax.legend()
fig.tight_layout()
fig.savefig(FIG / "model_share_vs_gap.png", dpi=160)
plt.close(fig)

# ---------- 4. 公平偏好：門檻公式與提議者最適出價 ----------
def u_resp(s, V, a, b):
    return s - a * max(V - 2 * s, 0) - b * max(2 * s - V, 0)

fs = []
for a in [0, 0.5, 1, 4, 50]:
    V = 1.0
    ss = np.linspace(0, 1, 100001)
    acc = np.array([u_resp(s, V, a, 0.25) >= 0 for s in ss])
    fs.append({"alpha": a, "numeric_threshold": float(ss[acc.argmax()]),
               "formula_alpha_over_1_plus_2alpha": a / (1 + 2 * a)})
out["fs_threshold"] = fs

# 加外部選項：拒絕時報酬為 (提議者 0, 回應者 L)，回應者拒絕的效用是 L - beta*L。
# 接受門檻 (alpha V + (1 - beta) L) / (1 + 2 alpha)，適用於門檻 <= V/2
fsL = []
for a, b, L in [(0.5, 0.0, 0.1), (1, 0.25, 0.2), (4, 0.6, 0.3), (1, 0.25, 0.0), (0, 0.0, 0.2)]:
    ss = np.linspace(0, 1, 100001)
    acc = np.array([u_resp(s, 1.0, a, b) >= (1 - b) * L - 1e-12 for s in ss])
    fsL.append({"alpha": a, "beta": b, "L": L, "numeric_threshold": float(ss[acc.argmax()]),
                "formula": (a + (1 - b) * L) / (1 + 2 * a)})
out["fs_threshold_with_outside_option"] = fsL

# 提議者在回應者 alpha 分布（Fehr-Schmidt 1999 表 III）下的最適出價
ALPHA = [(0, 0.3), (0.5, 0.3), (1, 0.3), (4, 0.1)]
BETA = [(0, 0.3), (0.25, 0.3), (0.6, 0.4)]
opt = {}
for b, _ in BETA:
    best = None
    table = []
    for s in sorted({a / (1 + 2 * a) for a, _ in ALPHA} | {0.5}):
        p = sum(q for a, q in ALPHA if a / (1 + 2 * a) <= s + 1e-12)
        u = p * ((1 - s) - b * max(1 - 2 * s, 0))
        table.append({"offer": round(s, 4), "accept_prob": round(p, 2), "expected_utility": round(u, 4)})
        if best is None or u > best[1] + 1e-12:
            best = (s, u)
    opt[str(b)] = {"optimal_offer": round(best[0], 4), "expected_utility": round(best[1], 4), "table": table,
                   "_exact": best[0]}
out["fs_proposer_optimal_offer"] = opt
mean_offer = sum(q * opt[str(b)]["_exact"] for b, q in BETA)
acc_rate = sum(qb * sum(qa for a, qa in ALPHA if a / (1 + 2 * a) <= opt[str(b)]["_exact"] + 1e-12)
               for b, qb in BETA)
out["fs_population_prediction"] = {"mean_offer_share": round(mean_offer, 4), "accept_rate": round(acc_rate, 4)}

fig, ax = plt.subplots(figsize=(6, 3.8))
al = np.linspace(0, 6, 300)
ax.plot(al, al / (1 + 2 * al), label="L = 0")
ax.plot(al, (0.2 + al) / (1 + 2 * al), label="L = 0.2 V")
ax.axhline(0.5, color="k", ls=":", lw=1)
ax.set_xlabel("envy parameter alpha")
ax.set_ylabel("acceptance threshold / V")
ax.set_ylim(0, 0.55)
ax.grid(alpha=0.3)
ax.legend()
fig.tight_layout()
fig.savefig(FIG / "model_fs_threshold.png", dpi=160)
plt.close(fig)

# ---------- 5. 公平偏好 + 競爭：回應者只要有比 alpha 門檻更高的競價就不受公平偏好影響 ----------
# 得標價 = max(V2, 門檻)。在 V2/V1 的分布下，公平門檻「真的有作用」的機率
bind = {}
for n in [1, 2, 3, 5, 10, 20]:
    if n == 1:
        bind[n] = {str(a): 1.0 if a > 0 else 0.0 for a, _ in ALPHA}
        continue
    v = np.sort(rng.uniform(0, 1, (200_000, n)), axis=1)
    ratio = v[:, -2] / v[:, -1]
    bind[n] = {str(a): float(np.mean(ratio < a / (1 + 2 * a))) for a, _ in ALPHA}
out["prob_fairness_threshold_binds_uniform"] = bind

(RES / "model_check.json").write_text(json.dumps(out, indent=2), encoding="utf-8", newline="\n")
print(json.dumps(out, indent=2))
