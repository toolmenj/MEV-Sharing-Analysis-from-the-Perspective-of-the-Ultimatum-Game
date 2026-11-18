"""從公開以太坊節點補鏈上資料，用來估計「區塊總價值」。

A. 抽樣 slot 的得標區塊：區塊內容（miner、extraData、最後一筆交易）＋ miner 在該區塊前後的餘額
B. 每個曾得標的 builder pubkey 各查一個區塊，取得 miner 位址與 extraData（用來把 pubkey 歸到同一家 builder）
C. 隨機抽區塊，找出「沒有任何 relay 交付紀錄」的區塊（疑似 proposer 自己建塊），量它的價值，當作外部選項 L 的代理

輸出：data/raw/chain_sample.jsonl、builder_pubkeys.jsonl、chain_random_blocks.jsonl
用法：python analysis/03_fetch_chain.py
"""
import itertools
import json
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RPCS = ["https://eth.drpc.org", "https://rpc.mevblocker.io"]
GENESIS = 1606824023
SEED = 20261118
N_RANDOM_BLOCKS = 3000
_rr = itertools.count()
_lock = threading.Lock()
_fail = {r: 0 for r in RPCS}


def rpc(method, params, tries=8):
    for i in range(tries):
        url = RPCS[next(_rr) % len(RPCS)]
        try:
            r = requests.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                              timeout=40)
            j = r.json()
            if "result" in j and j["result"] is not None:
                return j["result"]
        except Exception:
            pass
        with _lock:
            _fail[url] += 1
        time.sleep(0.5 + 0.7 * i)
    return None


def load_delivered():
    by_slot = {}
    for p in RAW.glob("delivered_*.jsonl"):
        relay = p.stem.replace("delivered_", "")
        with p.open(encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                x = json.loads(line)
                s = int(x["slot"])
                e = by_slot.setdefault(s, {**x, "relays": []})
                e["relays"].append(relay)
    return by_slot


def bal(addr, n):
    r = rpc("eth_getBalance", [addr, hex(n)])
    return None if r is None else int(r, 16)


def sample_block(d):
    n = int(d["block_number"])
    b = rpc("eth_getBlockByNumber", [hex(n), True])
    if b is None:
        return None
    txs = b["transactions"]
    last = txs[-1] if txs else None
    miner = b["miner"]
    b1, b0 = bal(miner, n), bal(miner, n - 1)
    if b1 is None or b0 is None:
        return None
    return {
        "slot": int(d["slot"]), "block_number": n,
        "hash_matches_relay": b["hash"].lower() == d["block_hash"].lower(),
        "miner": miner.lower(), "extra_data": b["extraData"],
        "base_fee": int(b["baseFeePerGas"], 16), "gas_used": int(b["gasUsed"], 16),
        "n_tx": len(txs),
        "last_tx_from": last["from"].lower() if last else None,
        "last_tx_to": (last["to"] or "").lower() if last else None,
        "last_tx_value": int(last["value"], 16) if last else None,
        "miner_balance_after": b1, "miner_balance_before": b0,
    }


def header_only(n):
    b = rpc("eth_getBlockByNumber", [hex(n), False])
    if b is None:
        return None
    return {"block_number": n, "miner": b["miner"].lower(), "extra_data": b["extraData"],
            "timestamp": int(b["timestamp"], 16), "n_tx": len(b["transactions"]),
            "base_fee": int(b["baseFeePerGas"], 16), "gas_used": int(b["gasUsed"], 16)}


def run(fn, items, out_path, label):
    done_keys = set()
    if out_path.exists():
        with out_path.open(encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    done_keys.add(json.loads(line)["_key"])
    todo = [(k, v) for k, v in items if k not in done_keys]
    print(f"[{label}] 待抓 {len(todo)}（已有 {len(done_keys)}）", flush=True)
    t0 = time.time()
    n_ok = 0
    with out_path.open("a", encoding="utf-8", newline="\n") as f, ThreadPoolExecutor(max_workers=6) as ex:
        for i, ((k, _), res) in enumerate(zip(todo, ex.map(lambda kv: fn(kv[1]), todo)), 1):
            if res is not None:
                res["_key"] = k
                f.write(json.dumps(res, separators=(",", ":")) + "\n")
                n_ok += 1
            if i % 200 == 0:
                print(f"[{label}] {i}/{len(todo)} 成功 {n_ok} {time.time() - t0:.0f}s 失敗累計 {_fail}", flush=True)
    print(f"[{label}] 完成，成功 {n_ok}/{len(todo)}", flush=True)


def main():
    delivered = load_delivered()
    sample = json.loads((RAW / "sample_slots.json").read_text(encoding="utf-8"))

    # A
    run(sample_block, [(str(s), delivered[s]) for s in sample], RAW / "chain_sample.jsonl", "A 抽樣區塊")

    # B
    first_block = {}
    for s, d in delivered.items():
        first_block.setdefault(d["builder_pubkey"], int(d["block_number"]))

    def pk_block(n):
        return header_only(n)
    run(pk_block, sorted(first_block.items()), RAW / "builder_pubkeys.jsonl", "B builder pubkey")

    # C
    nums = [int(d["block_number"]) for d in delivered.values()]
    lo, hi = min(nums), max(nums)
    rng = random.Random(SEED)
    picks = sorted(rng.sample(range(lo, hi + 1), N_RANDOM_BLOCKS))
    delivered_blocks = set(nums)

    def rand_block(n):
        h = header_only(n)
        if h is None:
            return None
        h["slot"] = (h["timestamp"] - GENESIS) // 12
        h["in_relay_data"] = n in delivered_blocks
        if not h["in_relay_data"]:
            b1, b0 = bal(h["miner"], n), bal(h["miner"], n - 1)
            if b1 is None or b0 is None:
                return None
            h["miner_balance_after"], h["miner_balance_before"] = b1, b0
        return h
    run(rand_block, [(str(n), n) for n in picks], RAW / "chain_random_blocks.jsonl", "C 隨機區塊")
    print("RPC 失敗累計", _fail, flush=True)


if __name__ == "__main__":
    main()
