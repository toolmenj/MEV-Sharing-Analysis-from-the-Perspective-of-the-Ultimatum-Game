"""抓各 MEV-Boost relay「實際被 proposer 採用的區塊」(proposer_payload_delivered)。

範圍：最近 N_DAYS 天。輸出：data/raw/delivered_<relay>.jsonl（每行一筆原始紀錄）
用法：python analysis/01_fetch_delivered.py
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "relay-data-client"}
GENESIS = 1606824023  # beacon chain genesis (unix 秒)
N_DAYS = 14
SLOTS_PER_DAY = 7200

CANDIDATE_RELAYS = {
    "flashbots": "boost-relay.flashbots.net",
    "ultrasound": "relay.ultrasound.money",
    "agnostic": "agnostic-relay.net",
    "aestus": "aestus.live",
    "titan": "titanrelay.xyz",
    "bloxroute_maxprofit": "bloxroute.max-profit.blxrbdn.com",
    "bloxroute_regulated": "bloxroute.regulated.blxrbdn.com",
    "manifold": "mainnet-relay.securerpc.com",
    "ethgas": "relay.ethgas.com",
    "btcs": "relay.btcs.com",
}
PATH = "/relay/v1/data/bidtraces/proposer_payload_delivered"
LIMITS = {"bloxroute_regulated": 100}  # 這個 relay 單次上限 100，其餘 200


def get(host, params, tries=5):
    for i in range(tries):
        try:
            r = requests.get(f"https://{host}{PATH}", params=params, headers=UA, timeout=40)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 + 3 * i)
                continue
            return None
        except Exception:
            time.sleep(2 + 3 * i)
    return None


def fetch_relay(name, host, slot_lo, slot_hi):
    out = RAW / f"delivered_{name}.jsonl"
    seen = set()
    cursor = slot_hi
    n_req = 0
    with out.open("w", encoding="utf-8", newline="\n") as f:
        while cursor >= slot_lo:
            d = get(host, {"limit": LIMITS.get(name, 200), "cursor": cursor})
            n_req += 1
            if d is None:
                print(f"[{name}] 請求失敗，停在 cursor={cursor}", flush=True)
                break
            if not d:
                break
            slots = [int(x["slot"]) for x in d]
            for x in d:
                s = int(x["slot"])
                key = (s, x["block_hash"])
                if s < slot_lo or s > slot_hi or key in seen:
                    continue
                seen.add(key)
                f.write(json.dumps(x, separators=(",", ":")) + "\n")
            nxt = min(slots) - 1
            if nxt >= cursor:  # relay 不支援 cursor
                break
            cursor = nxt
            time.sleep(0.15)
    print(f"[{name}] {len(seen)} 筆，{n_req} 次請求", flush=True)
    return name, len(seen)


def main():
    # 用法二：python 01_fetch_delivered.py <relay 名稱>... → 只補抓指定 relay，沿用既有的 slot 範圍
    only = sys.argv[1:]
    meta_path = RAW / "delivered_meta.json"
    if only:
        old = json.loads(meta_path.read_text(encoding="utf-8"))
        slot_lo, slot_hi = old["slot_lo"], old["slot_hi"]
        res = [fetch_relay(n, CANDIDATE_RELAYS[n], slot_lo, slot_hi) for n in only]
        for n, k in res:
            old["rows_per_relay"][n] = k
            old["relays"][n] = CANDIDATE_RELAYS[n]
        meta_path.write_text(json.dumps(old, indent=2), encoding="utf-8", newline="\n")
        print(json.dumps(old, indent=2))
        return
    now_slot = (int(time.time()) - GENESIS) // 12
    slot_hi = now_slot - 64  # 留 2 個 epoch 緩衝，避開尚未定案的區塊
    slot_lo = slot_hi - N_DAYS * SLOTS_PER_DAY + 1
    alive = {}
    for name, host in CANDIDATE_RELAYS.items():
        try:
            r = requests.get(f"https://{host}{PATH}", params={"limit": 1}, headers=UA, timeout=15)
            ok = r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) > 0
        except Exception:
            ok = False
        print(f"探測 {name:22s} {host:40s} {'可用' if ok else '不可用'}", flush=True)
        if ok:
            alive[name] = host
    meta = {"slot_lo": slot_lo, "slot_hi": slot_hi, "n_days": N_DAYS,
            "fetched_at_unix": int(time.time()), "relays": alive,
            "relays_unreachable": sorted(set(CANDIDATE_RELAYS) - set(alive))}
    with ThreadPoolExecutor(max_workers=len(alive)) as ex:
        res = list(ex.map(lambda kv: fetch_relay(kv[0], kv[1], slot_lo, slot_hi), alive.items()))
    meta["rows_per_relay"] = dict(res)
    (RAW / "delivered_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    sys.exit(main())
