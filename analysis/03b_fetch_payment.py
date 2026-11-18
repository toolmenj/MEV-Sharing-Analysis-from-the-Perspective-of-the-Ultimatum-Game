"""補查「付給 proposer 的那筆交易」是誰付的。

03 只記了區塊最後一筆交易。若最後一筆不是「miner 位址付出、金額等於 relay 申報的得標價」，
就重新讀整個區塊，找金額等於得標價的交易：
  kind = miner  ：由 builder 的 miner 位址付款（只是不在最後一筆）
  kind = other  ：由另一個位址付款 → 另外查那個位址在該區塊前後的餘額
  kind = none   ：區塊裡找不到金額相符的一般交易（可能是合約內部轉帳）
輸出：data/raw/chain_payment_fix.jsonl
用法：python analysis/03b_fetch_payment.py   （要在 03 之後跑）
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
spec = importlib.util.spec_from_file_location("fc", Path(__file__).with_name("03_fetch_chain.py"))
fc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fc)


def main():
    delivered = fc.load_delivered()
    rows = [json.loads(x) for x in (RAW / "chain_sample.jsonl").open(encoding="utf-8") if x.strip()]
    todo = []
    for r in rows:
        v = int(delivered[r["slot"]]["value"])
        clean = r["last_tx_from"] == r["miner"] and r["last_tx_value"] == v
        if not clean and r["hash_matches_relay"]:
            todo.append((str(r["slot"]), (r, v)))

    def fix(arg):
        r, v = arg
        n = r["block_number"]
        b = fc.rpc("eth_getBlockByNumber", [hex(n), True])
        if b is None:
            return None
        match = [t for t in b["transactions"] if int(t["value"], 16) == v]
        res = {"slot": r["slot"], "block_number": n, "n_value_matches": len(match)}
        if any(t["from"].lower() == r["miner"] for t in match):
            res["kind"] = "miner"
        elif match:
            payer = match[-1]["from"].lower()
            b1, b0 = fc.bal(payer, n), fc.bal(payer, n - 1)
            if b1 is None or b0 is None:
                return None
            res.update({"kind": "other", "payer": payer, "payer_to": (match[-1]["to"] or "").lower(),
                        "payer_balance_after": b1, "payer_balance_before": b0})
        else:
            res["kind"] = "none"
        return res

    fc.run(fix, todo, RAW / "chain_payment_fix.jsonl", "付款交易補查")


if __name__ == "__main__":
    main()
