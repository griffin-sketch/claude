#!/usr/bin/env python3
"""
Submit / poll fal.ai jobs without keeping a process alive.
  python fal_queue.py submit job.json [--only 2,5]   -> writes ai_clips/requests.json
  python fal_queue.py poll   job.json                -> downloads finished clips, writes job_ai.json when all done
"""
import json, os, sys, urllib.request, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai_motion as am

def call(url, key, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Key " + key, "Content-Type": "application/json"},
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def am_complete(path):
    """True if ffprobe can read a duration (file not truncated)."""
    import subprocess
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True).stdout.strip()
    try: return float(out) > 1
    except ValueError: return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["submit", "poll"]); ap.add_argument("job")
    ap.add_argument("--only")
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    am.load_key(here); key = os.environ["FAL_KEY"]
    base = os.path.dirname(os.path.abspath(a.job))
    job = json.load(open(a.job))
    model = job.get("ai_model", am.DEFAULT_MODEL); secs = int(job.get("ai_seconds", 5))
    outdir = os.path.join(base, "ai_clips"); os.makedirs(outdir, exist_ok=True)
    rq_path = os.path.join(outdir, "requests.json")
    reqs = json.load(open(rq_path)) if os.path.exists(rq_path) else {}

    if a.cmd == "submit":
        only = {int(x) for x in a.only.split(",")} if a.only else None
        for i, s in enumerate(job["shots"]):
            if os.path.splitext(s["path"])[1].lower() in am.VIDEO_EXT or s.get("ai") is False: continue
            if only and (i + 1) not in only: continue
            if not only and str(i) in reqs: continue
            mv = am.pick_move(s, i)
            style = s.get("motion_style") or job.get("motion_style", "bold")
            src = os.path.join(base, s["path"])
            moves = am.MOVES_BOLD if style in ("bold", "endframe") else am.MOVES
            prompt = f"{am.BASE_BOLD if style != 'gentle' else am.BASE} {moves[mv]}"
            body = {"prompt": prompt, "image_url": am.data_uri(src),
                    "duration": str(secs), "negative_prompt": am.NEGATIVE,
                    "cfg_scale": 0.6 if style == "gentle" else 0.75}
            if style == "endframe":
                body["tail_image_url"] = am.end_frame_uri(src, mv)
            r = call(f"https://queue.fal.run/{model}", key, body)
            reqs[str(i)] = {"move": mv, "status_url": r["status_url"], "response_url": r["response_url"], "done": None}
            print(f"shot {i+1}: submitted [{mv}]")
        json.dump(reqs, open(rq_path, "w"), indent=2)
        return

    pending = 0
    for i, r in sorted(reqs.items(), key=lambda x: int(x[0])):
        if r.get("done"): continue
        dest = os.path.join(outdir, f"shot{int(i)+1:02d}_{r['move']}.mp4")
        if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000 and am_complete(dest):
            r["done"] = os.path.relpath(dest, base); print(f"shot {int(i)+1}: already downloaded"); continue
        try:
            st = call(r["status_url"], key)["status"]
        except Exception as e:
            print(f"shot {int(i)+1}: status error {e}"); pending += 1; continue
        if st != "COMPLETED":
            print(f"shot {int(i)+1}: {st}"); pending += 1; continue
        try:
            res = call(r["response_url"], key)
            am.download(res["video"]["url"], dest)
            json.dump(reqs, open(rq_path, "w"), indent=2)
            r["done"] = os.path.relpath(dest, base); print(f"shot {int(i)+1}: downloaded")
        except Exception as e:
            r["done"] = None; r["error"] = str(e)[:300]; print(f"shot {int(i)+1}: FAILED {r['error']}")
    json.dump(reqs, open(rq_path, "w"), indent=2)
    if pending == 0:
        for i, r in reqs.items():
            if r.get("done"):
                s = job["shots"][int(i)]
                s["original_photo"] = s["path"]; s["path"] = r["done"]; s.setdefault("duration", min(secs, 4.6))
        out = os.path.join(base, os.path.splitext(os.path.basename(a.job))[0] + "_ai.json")
        json.dump(job, open(out, "w"), indent=2); print("ALL DONE ->", out)
    else:
        print(f"{pending} still running")

if __name__ == "__main__":
    main()
