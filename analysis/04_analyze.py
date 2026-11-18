"""鏈上資料分析：把 relay 與鏈上資料整理成每個 slot 一列，檢驗模型預測，輸出結果與圖。

輸入：data/raw/*
輸出：data/processed/slots.csv、results/empirical.json、report/figures/emp_*.png
用法：python analysis/04_analyze.py
"""
import gzip
import json
from collections import Counter, defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
RES = ROOT / "results"
FIG = ROOT / "report" / "figures"
for d in (PROC, RES, FIG):
    d.mkdir(parents=True, exist_ok=True)
ETH = 1e18
GENESIS = 1606824023
out = {}


def jl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(x) for x in f if x.strip()]


# ---------------------------------------------------------------- 1. 交付紀錄（全部 14 天）
meta = json.loads((RAW / "delivered_meta.json").read_text(encoding="utf-8"))
rows = []
for p in sorted(RAW.glob("delivered_*.jsonl")):
    relay = p.stem.replace("delivered_", "")
    for x in jl(p):
        rows.append((int(x["slot"]), relay, x["block_hash"].lower(), x["builder_pubkey"].lower(),
                     int(x["value"]), int(x["block_number"]), x["proposer_fee_recipient"].lower(),
                     x["proposer_pubkey"].lower()))
dl = pd.DataFrame(rows, columns=["slot", "relay", "block_hash", "builder_pubkey", "value_wei",
                                 "block_number", "proposer_fee_recipient", "proposer_pubkey"])
n_slots_range = meta["slot_hi"] - meta["slot_lo"] + 1
conflict = dl.groupby("slot")["block_hash"].nunique()
out["data"] = {
    "slot_lo": meta["slot_lo"], "slot_hi": meta["slot_hi"], "slots_in_range": n_slots_range,
    "date_lo_utc": pd.to_datetime(GENESIS + meta["slot_lo"] * 12, unit="s").strftime("%Y-%m-%d %H:%M"),
    "date_hi_utc": pd.to_datetime(GENESIS + meta["slot_hi"] * 12, unit="s").strftime("%Y-%m-%d %H:%M"),
    "delivered_rows_per_relay": dl.groupby("relay").size().to_dict(),
    "relays_unreachable": meta.get("relays_unreachable", []),
    "slots_with_delivery": int(dl["slot"].nunique()),
    "share_of_slots_with_delivery": float(dl["slot"].nunique() / n_slots_range),
    "slots_with_conflicting_block_hash": int((conflict > 1).sum()),
}
# 同一 slot 多個 relay 都有紀錄 → 留一筆（同一個區塊）
win = dl.sort_values(["slot", "relay"]).drop_duplicates("slot").set_index("slot")
win["n_relays_delivered"] = dl.groupby("slot")["relay"].nunique()

# ---------------------------------------------------------------- 2. builder 身分：pubkey → 實體
pk = pd.DataFrame(jl(RAW / "builder_pubkeys.jsonl")).rename(columns={"_key": "builder_pubkey"})
pk["builder_pubkey"] = pk["builder_pubkey"].str.lower()


def decode_extra(h):
    try:
        s = bytes.fromhex(h[2:]).decode("utf-8", "ignore")
    except Exception:
        return ""
    return "".join(ch for ch in s if ch.isprintable()).strip()


pk["extra"] = pk["extra_data"].map(decode_extra)
# 以 miner 位址（builder 收手續費的位址）當作實體；同一家 builder 的多把 pubkey 會共用位址
pk_to_entity = dict(zip(pk["builder_pubkey"], pk["miner"]))
entity_label = pk.groupby("miner")["extra"].agg(lambda s: Counter(s).most_common(1)[0][0]).to_dict()
win["entity"] = win["builder_pubkey"].map(pk_to_entity)
out["builders"] = {
    "winning_pubkeys": int(win["builder_pubkey"].nunique()),
    "pubkeys_mapped": int(win["builder_pubkey"].map(lambda k: k in pk_to_entity).groupby(win["builder_pubkey"]).first().sum()),
    "entities": int(win["entity"].nunique()),
}
win["entity"] = win["entity"].fillna(win["builder_pubkey"])

share = win["entity"].value_counts(normalize=True)
out["market"] = {
    "hhi_overall": float((share ** 2).sum()),
    "top1_share": float(share.iloc[0]), "top2_share": float(share.iloc[:2].sum()),
    "top3_share": float(share.iloc[:3].sum()), "top5_share": float(share.iloc[:5].sum()),
    "top5": [{"entity": e, "label": entity_label.get(e, ""), "share": float(s)} for e, s in share.iloc[:5].items()],
    "median_winning_bid_eth": float(win["value_wei"].median() / ETH),
    "mean_winning_bid_eth": float(win["value_wei"].mean() / ETH),
}
top2_entities = set(share.index[:2])

# 每日與每 300 slot（1 小時）的集中度
win["day"] = pd.to_datetime(GENESIS + win.index.to_series() * 12, unit="s").dt.strftime("%Y-%m-%d")
win["hour_bin"] = (win.index.to_series() - meta["slot_lo"]) // 300


def hhi(s):
    p = s.value_counts(normalize=True)
    return float((p ** 2).sum())


daily = win.groupby("day").agg(hhi=("entity", hhi), blocks=("entity", "size"),
                               median_bid_eth=("value_wei", lambda v: float(np.median(v) / ETH)))
hourly_hhi = win.groupby("hour_bin")["entity"].apply(hhi)
out["daily"] = daily.reset_index().to_dict("records")

# ---------------------------------------------------------------- 3. 抽樣 slot 的全部出價
sample = json.loads((RAW / "sample_slots.json").read_text(encoding="utf-8"))
chain = {int(r["slot"]): r for r in jl(RAW / "chain_sample.jsonl")}
recs = []
bid_counts = []
for s in sample:
    p = RAW / "bids" / f"{s}.json.gz"
    if not p.exists() or s not in win.index:
        continue
    with gzip.open(p, "rt", encoding="utf-8") as f:
        rec = json.load(f)
    w = win.loc[s]
    bids = []
    for relay, lst in rec["relays"].items():
        for bpk, val, ts, bh in lst:
            bids.append((bpk.lower(), int(val), int(ts), bh.lower(), relay))
    if not bids:
        continue
    bid_counts.append(len(bids))
    w_entity = w["entity"]
    w_val = int(w["value_wei"])
    # 得標那筆出價送達 relay 的時間（取各 relay 中最早的）
    w_ts = [b[2] for b in bids if b[3] == w["block_hash"]]
    found = len(w_ts) > 0
    t_win = min(w_ts) if found else None
    ent = lambda k: pk_to_entity.get(k, k)
    rivals_all = [b for b in bids if ent(b[0]) != w_entity]
    rivals_before = [b for b in rivals_all if found and b[2] <= t_win]
    entities_bidding = {ent(b[0]) for b in bids}
    slot_start_ms = (GENESIS + s * 12) * 1000
    r = {
        "slot": s, "winning_bid_eth": w_val / ETH, "winner_entity": w_entity,
        "winner_label": entity_label.get(w_entity, ""),
        "winner_is_top2": w_entity in top2_entities,
        "winning_bid_found": found,
        "n_bids": len(bids), "n_entities": len(entities_bidding),
        "n_pubkeys": len({b[0] for b in bids}),
        "rival_best_before_eth": max((b[1] for b in rivals_before), default=0) / ETH if found else np.nan,
        "rival_best_any_eth": max((b[1] for b in rivals_all), default=0) / ETH,
        "has_rival_before": len(rivals_before) > 0,
        "win_time_ms_in_slot": (t_win - slot_start_ms) if found else np.nan,
        "hour_hhi": hourly_hhi.get(int(w["hour_bin"]), np.nan),
        "day": w["day"], "proposer_fee_recipient": w["proposer_fee_recipient"],
    }
    c = chain.get(s)
    if c and c["hash_matches_relay"]:
        delta = (c["miner_balance_after"] - c["miner_balance_before"]) / ETH
        pay_ok = (c["last_tx_from"] == c["miner"] and c["last_tx_to"] == w["proposer_fee_recipient"])
        r.update({
            "chain_ok": True, "miner": c["miner"],
            "miner_is_proposer": c["miner"] == w["proposer_fee_recipient"],
            "payment_tx_from_miner": bool(pay_ok),
            "last_tx_value_eth": (c["last_tx_value"] or 0) / ETH,
            "builder_net_eth": delta,                       # builder 位址在該區塊的餘額變化（已扣掉付給 proposer 的錢）
            "block_value_eth": delta + w_val / ETH,         # 區塊總價值 V 的估計
            "gas_used": c["gas_used"], "base_fee_gwei": c["base_fee"] / 1e9,
        })
    else:
        r["chain_ok"] = False
    recs.append(r)
df = pd.DataFrame(recs)
df.to_csv(PROC / "slots.csv", index=False, lineterminator="\n")

out["sample"] = {
    "slots_sampled": len(sample), "slots_with_bids": int(len(df)),
    "median_bids_per_slot": float(np.median(bid_counts)), "median_entities_per_slot": float(df["n_entities"].median()),
    "min_entities_per_slot": int(df["n_entities"].min()), "max_entities_per_slot": int(df["n_entities"].max()),
    "winning_bid_found_in_bids": int(df["winning_bid_found"].sum()),
    "chain_ok": int(df["chain_ok"].sum()),
}


def q(s, ps=(0.05, 0.25, 0.5, 0.75, 0.95)):
    s = pd.Series(s).dropna()
    return {"n": int(len(s)), "mean": float(s.mean()), **{f"p{int(p * 100)}": float(s.quantile(p)) for p in ps}}


# ---------------------------------------------------------------- 4. 預測一：得標價 ≈ 第二強 builder 的出價
a = df[df["winning_bid_found"] & df["has_rival_before"]].copy()
a["ratio_before"] = a["rival_best_before_eth"] / a["winning_bid_eth"]
a["margin_before"] = 1 - a["ratio_before"]
df["ratio_any"] = df["rival_best_any_eth"] / df["winning_bid_eth"]
out["second_price"] = {
    "n": int(len(a)),
    "rival_before_over_winning": q(a["ratio_before"]),
    "share_within_1pct": float((a["margin_before"].abs() <= 0.01).mean()),
    "share_within_5pct": float((a["margin_before"].abs() <= 0.05).mean()),
    "share_within_10pct": float((a["margin_before"].abs() <= 0.10).mean()),
    "share_margin_over_20pct": float((a["margin_before"] > 0.20).mean()),
    "share_rival_higher_than_winner": float((a["ratio_before"] > 1).mean()),
    "rival_any_time_over_winning": q(df["ratio_any"]),
    "corr_log_win_log_rival": float(np.corrcoef(np.log(a["winning_bid_eth"]), np.log(a["rival_best_before_eth"].clip(lower=1e-9)))[0, 1]),
    "slots_without_rival_before": int((df["winning_bid_found"] & ~df["has_rival_before"]).sum()),
}

# ---------------------------------------------------------------- 5. Proposer 分潤比例 s / V
c = df[df["chain_ok"] & ~df["miner_is_proposer"].fillna(False).astype(bool)].copy()
c["share"] = c["winning_bid_eth"] / c["block_value_eth"]
valid = c[(c["block_value_eth"] > 0) & c["payment_tx_from_miner"]].copy()
out["proposer_share"] = {
    "chain_ok": int(df["chain_ok"].sum()),
    "miner_is_proposer_excluded": int(df["miner_is_proposer"].fillna(False).astype(bool).sum()),
    "payment_tx_not_from_miner_excluded": int((~c["payment_tx_from_miner"]).sum()),
    "nonpositive_block_value_excluded": int(((c["block_value_eth"] <= 0) & c["payment_tx_from_miner"]).sum()),
    "n": int(len(valid)),
    "share": q(valid["share"]),
    "share_below_20pct": float((valid["share"] < 0.2).mean()),
    "share_below_50pct": float((valid["share"] < 0.5).mean()),
    "share_between_40_50pct": float(((valid["share"] >= 0.4) & (valid["share"] <= 0.5)).mean()),
    "share_above_90pct": float((valid["share"] > 0.9).mean()),
    "share_above_100pct_builder_loss": float((valid["share"] > 1).mean()),
    "aggregate_share_sum_bids_over_sum_value": float(valid["winning_bid_eth"].sum() / valid["block_value_eth"].sum()),
    "block_value_eth": q(valid["block_value_eth"]),
    "builder_net_eth": q(valid["builder_net_eth"]),
    "by_winner_top2": {str(k): q(v["share"]) for k, v in valid.groupby("winner_is_top2")},
}
valid = valid.merge(a[["slot", "ratio_before"]], on="slot", how="left")
valid["rival_over_value"] = valid["rival_best_before_eth"] / valid["block_value_eth"]


# ---------------------------------------------------------------- 6. 迴歸（OLS，異質變異穩健標準誤 HC1）
def ols(y, X, names):
    X = np.column_stack([np.ones(len(y))] + list(X))
    names = ["const"] + names
    XtX_inv = np.linalg.inv(X.T @ X)
    beta = XtX_inv @ X.T @ y
    e = y - X @ beta
    n, k = X.shape
    meat = (X * e[:, None]).T @ (X * e[:, None])
    V = XtX_inv @ meat @ XtX_inv * n / (n - k)
    se = np.sqrt(np.diag(V))
    r2 = 1 - (e @ e) / ((y - y.mean()) @ (y - y.mean()))
    from scipy import stats
    p = 2 * (1 - stats.t.cdf(np.abs(beta / se), n - k))
    return {"n": int(n), "r2": float(r2),
            "coef": {nm: {"b": float(b), "se": float(s), "t": float(b / s), "p": float(pp)}
                     for nm, b, s, pp in zip(names, beta, se, p)}}


reg = {}
# (a) 價格由誰決定：log(得標價) 對 log(對手最高出價)，模型預測斜率 1、截距 0
ra = a[(a["rival_best_before_eth"] > 0)]
reg["log_winning_on_log_rival"] = ols(np.log(ra["winning_bid_eth"].values),
                                      [np.log(ra["rival_best_before_eth"].values)], ["log_rival_best"])
# (b) 分潤比例對競爭強度：只留 share 在 [0, 1.5] 的觀測，避免極端值主導
rb = valid[(valid["share"] >= 0) & (valid["share"] <= 1.5) & valid["rival_over_value"].notna()].copy()
reg["share_on_competition"] = ols(
    rb["share"].values,
    [rb["rival_over_value"].clip(upper=1.5).values, np.log(rb["n_entities"].values),
     rb["hour_hhi"].values, rb["winner_is_top2"].astype(float).values, np.log(rb["block_value_eth"].values)],
    ["rival_best_over_V", "log_n_entities", "hour_hhi", "winner_is_top2", "log_block_value"])
reg["share_on_concentration_only"] = ols(
    rb["share"].values,
    [np.log(rb["n_entities"].values), rb["hour_hhi"].values, rb["winner_is_top2"].astype(float).values,
     np.log(rb["block_value_eth"].values)],
    ["log_n_entities", "hour_hhi", "winner_is_top2", "log_block_value"])
# (c) 得標者領先幅度（1 - 對手/得標）對集中度
rc = a[(a["margin_before"] > -0.5)].copy()
reg["margin_on_concentration"] = ols(
    rc["margin_before"].values,
    [np.log(rc["n_entities"].values), rc["hour_hhi"].values, rc["winner_is_top2"].astype(float).values,
     np.log(rc["winning_bid_eth"].values)],
    ["log_n_entities", "hour_hhi", "winner_is_top2", "log_winning_bid"])
out["regressions"] = reg

# ---------------------------------------------------------------- 7. 外部選項 L：疑似自建區塊 + 敏感度
rb_blocks = pd.DataFrame(jl(RAW / "chain_random_blocks.jsonl"))
known_builder_addr = set(pk["miner"]) | set(df.get("miner", pd.Series(dtype=str)).dropna())
nonrelay = rb_blocks[~rb_blocks["in_relay_data"]].copy()
nonrelay["value_eth"] = (nonrelay["miner_balance_after"].astype(float) - nonrelay["miner_balance_before"].astype(float)) / ETH
nonrelay["miner_is_known_builder"] = nonrelay["miner"].isin(known_builder_addr)
local = nonrelay[~nonrelay["miner_is_known_builder"] & (nonrelay["value_eth"] >= 0) & (nonrelay["value_eth"] < 50)]
out["outside_option"] = {
    "random_blocks": int(len(rb_blocks)),
    "in_relay_data": int(rb_blocks["in_relay_data"].sum()),
    "not_in_relay_data": int(len(nonrelay)),
    "not_in_relay_but_known_builder_address": int(nonrelay["miner_is_known_builder"].sum()),
    "local_candidates": int(len(local)),
    "local_block_value_eth": q(local["value_eth"]) if len(local) else None,
    "mevboost_winning_bid_eth_all": q(win["value_wei"] / ETH),
}
L_med = float(local["value_eth"].median()) if len(local) else float("nan")
sens = []
for L in [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1]:
    x = a["rival_best_before_eth"]
    sens.append({"L_eth": L,
                 "share_slots_L_above_rival_best": float((x < L).mean()),
                 "share_slots_L_above_winning_bid": float((a["winning_bid_eth"] < L).mean()),
                 "mean_predicted_price_over_actual": float((np.maximum(x, L) / a["winning_bid_eth"]).mean()),
                 "median_predicted_price_over_actual": float((np.maximum(x, L) / a["winning_bid_eth"]).median())})
out["L_sensitivity"] = {"L_proxy_median_local_block_eth": L_med, "grid": sens,
                        "share_slots_Lproxy_above_rival_best": float((a["rival_best_before_eth"] < L_med).mean()) if L_med == L_med else None,
                        "share_all_winning_bids_below_Lproxy": float(((win["value_wei"] / ETH) < L_med).mean()) if L_med == L_med else None}

# ---------------------------------------------------------------- 8. 圖
fig, ax = plt.subplots(figsize=(6, 3.8))
ax.hist(a["ratio_before"].clip(0, 1.2), bins=60, color="#4477aa")
ax.axvline(1, color="k", ls="--", lw=1)
ax.set_xlabel("best rival bid / winning bid  (model: = 1)")
ax.set_ylabel("slots")
fig.tight_layout(); fig.savefig(FIG / "emp_rival_ratio_hist.png", dpi=160); plt.close(fig)

fig, ax = plt.subplots(figsize=(4.6, 4.4))
ax.loglog(a["rival_best_before_eth"].clip(lower=1e-4), a["winning_bid_eth"], ".", ms=3, alpha=0.5, color="#4477aa")
lim = [a["winning_bid_eth"].min() * 0.8, a["winning_bid_eth"].max() * 1.2]
ax.plot(lim, lim, "k--", lw=1)
ax.set_xlabel("best rival bid (ETH)"); ax.set_ylabel("winning bid (ETH)")
fig.tight_layout(); fig.savefig(FIG / "emp_win_vs_rival.png", dpi=160); plt.close(fig)

fig, ax = plt.subplots(figsize=(6, 3.8))
ax.hist(valid["share"].clip(0, 1.3), bins=65, color="#228833")
for x_, ls in [(0.2, ":"), (0.5, ":"), (1.0, "--")]:
    ax.axvline(x_, color="k", ls=ls, lw=1)
ax.set_xlabel("proposer share = payment / block value")
ax.set_ylabel("slots")
fig.tight_layout(); fig.savefig(FIG / "emp_share_hist.png", dpi=160); plt.close(fig)

fig, ax = plt.subplots(figsize=(4.6, 4.4))
ax.plot(valid["rival_over_value"].clip(0, 1.3), valid["share"].clip(0, 1.3), ".", ms=3, alpha=0.5, color="#228833")
ax.plot([0, 1.3], [0, 1.3], "k--", lw=1)
ax.set_xlabel("best rival bid / block value"); ax.set_ylabel("proposer share")
fig.tight_layout(); fig.savefig(FIG / "emp_share_vs_rival.png", dpi=160); plt.close(fig)

fig, ax1 = plt.subplots(figsize=(6.4, 3.8))
ax1.bar(range(len(daily)), daily["hhi"], color="#ccbb44")
ax1.set_xticks(range(len(daily))); ax1.set_xticklabels([d[5:] for d in daily.index], rotation=60, fontsize=8)
ax1.set_ylabel("builder HHI (daily)"); ax1.set_ylim(0, 1)
ax2 = ax1.twinx(); ax2.plot(range(len(daily)), daily["median_bid_eth"], "o-", color="#aa3377")
ax2.set_ylabel("median winning bid (ETH)")
fig.tight_layout(); fig.savefig(FIG / "emp_daily.png", dpi=160); plt.close(fig)

fig, ax = plt.subplots(figsize=(6, 3.8))
top = share.iloc[:8]
ax.bar(range(len(top)), top.values, color="#4477aa")
ax.set_xticks(range(len(top)))
ax.set_xticklabels([(entity_label.get(e, "") or e[:8])[:14] for e in top.index], rotation=40, ha="right", fontsize=8)
ax.set_ylabel("share of MEV-Boost blocks")
fig.tight_layout(); fig.savefig(FIG / "emp_builder_share.png", dpi=160); plt.close(fig)

(RES / "empirical.json").write_text(json.dumps(out, indent=2, ensure_ascii=False, default=float),
                                    encoding="utf-8", newline="\n")
print(json.dumps(out, indent=2, ensure_ascii=False, default=float))
