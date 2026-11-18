"""抽樣若干 slot，抓該 slot 所有 builder 送到各 relay 的出價 (builder_blocks_received)。

輸入：data/raw/delivered_*.jsonl
輸出：data/raw/bids/<slot>.json.gz（精簡欄位）、data/raw/bids_meta.json、data/raw/sample_slots.json
用法：python analysis/02_fetch_bids.py
"""
import gzip
import json
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
BIDS = RAW / "bids"
BIDS.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "relay-data-client"}
SEED = 20261118
N_SAMPLE = 1000
PATH = "/relay/v1/data/bidtraces/builder_blocks_received"
BID_RELAYS = {
    "flashbots": "boost-relay.flashbots.net",
    "ultrasound": "relay.ultrasound.money",
    "agnostic": "agnostic-relay.net",
    "aestus": "aestus.live",
    "titan": "titanrelay.xyz",
    "bloxroute_regulated": "bloxroute.regulated.blxrbdn.com",
    "ethgas": "relay.ethgas.com",
}
_sem = {k: threading.Semaphore(3) for k in BID_RELAYS}  # 每個 relay 同時最多 3 個連線


def load_delivered_slots():
    slots = set()
    for p in RAW.glob("delivered_*.jsonl"):
        with p.open(encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    slots.add(int(json.loads(line)["slot"]))
    return sorted(slots)


def fetch_one(name, host, slot):
    with _sem[name]:
        for i in range(4):
            try:
                r = requests.get(f"https://{host}{PATH}", params={"slot": slot, "limit": 500},
                                 headers=UA, timeout=60)
                if r.status_code == 200:
                    d = r.json()
                    return [[x["builder_pubkey"], x["value"], x.get("timestamp_ms") or
                             str(int(x.get("timestamp", 0)) * 1000), x["block_hash"]] for x in d]
                if r.status_code in (429, 500, 502, 503, 504):
                    time.sleep(2 + 4 * i)
                    continue
                return None
            except Exception:
                time.sleep(2 + 4 * i)
        return None


def do_slot(slot):
    out = BIDS / f"{slot}.json.gz"
    if out.exists():
        return slot, None
    rec = {"slot": slot, "relays": {}}
    status = {}
    with ThreadPoolExecutor(max_workers=len(BID_RELAYS)) as ex:
        futs = {name: ex.submit(fetch_one, name, host, slot) for name, host in BID_RELAYS.items()}
        for name, fu in futs.items():
            res = fu.result()
            status[name] = None if res is None else len(res)
            if res is not None:
                rec["relays"][name] = res
    rec["status"] = status
    with gzip.open(out, "wt", encoding="utf-8", newline="\n") as f:
        json.dump(rec, f, separators=(",", ":"))
    return slot, status


def main():
    slots = load_delivered_slots()
    rng = random.Random(SEED)
    sample = sorted(rng.sample(slots, N_SAMPLE))
    (RAW / "sample_slots.json").write_text(json.dumps(sample), encoding="utf-8", newline="\n")
    print(f"有 relay 交付紀錄的 slot 共 {len(slots)} 個，抽 {len(sample)} 個", flush=True)
    t0 = time.time()
    done = 0
    fail = {k: 0 for k in BID_RELAYS}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for slot, status in ex.map(do_slot, sample):
            done += 1
            if status:
                for k, v in status.items():
                    if v is None:
                        fail[k] += 1
            if done % 50 == 0:
                print(f"{done}/{len(sample)}  {time.time() - t0:.0f}s  失敗次數 {fail}", flush=True)
    meta = {"seed": SEED, "n_sample": len(sample), "n_delivered_slots": len(slots),
            "relays": BID_RELAYS, "failed_requests_this_run": fail,
            "fetched_at_unix": int(time.time())}
    (RAW / "bids_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(meta, indent=2), flush=True)


if __name__ == "__main__":
    main()
