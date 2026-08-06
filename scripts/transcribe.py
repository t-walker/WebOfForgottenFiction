"""
Transcribes downloaded episode audio into timestamped Markdown transcripts.

    python scripts/transcribe.py            # all episodes, small.en
    python scripts/transcribe.py --model medium.en
    python scripts/transcribe.py --only 3 7

Existing transcripts are skipped, so this is safe to interrupt and re-run.
Output lands in transcripts/ep##.md, which is git-ignored -- the audio and
transcripts are the hosts' content and stay local.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
OUT_DIR = ROOT / "transcripts"
DATA = ROOT / "src" / "data" / "forgotten-fiction.json"


def hms(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def episode_meta():
    """Map episode number -> (id, title, date, [featured work titles])."""
    data = json.loads(DATA.read_text(encoding="utf8"))
    works = {w["id"]: w for w in data["works"]}
    picks: dict[str, list[str]] = {}
    for row in data["episodeWorks"]:
        if row["role"] == "featured":
            picks.setdefault(row["episodeId"], []).append(works[row["workId"]]["title"])
    return {
        ep["number"]: (ep["id"], ep["title"], ep["date"], picks.get(ep["id"], []))
        for ep in data["episodes"]
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--only", nargs="*", type=int, default=None)
    parser.add_argument("--threads", type=int, default=16)
    args = parser.parse_args()

    files = sorted(AUDIO_DIR.glob("ep*.mp3"))
    if not files:
        print("No audio found. Run: npm run audio:fetch", file=sys.stderr)
        return 1

    if args.only:
        wanted = set(args.only)
        files = [f for f in files if int(re.search(r"\d+", f.stem).group()) in wanted]

    pending = [f for f in files if not (OUT_DIR / f"{f.stem}.md").exists()]
    print(f"{len(files)} episode(s) selected, {len(pending)} to transcribe")
    if not pending:
        return 0

    OUT_DIR.mkdir(exist_ok=True)
    meta = episode_meta()

    print(f"loading {args.model} (cpu, int8, {args.threads} threads) ...", flush=True)
    model = WhisperModel(
        args.model, device="cpu", compute_type="int8", cpu_threads=args.threads
    )

    overall = time.time()

    for path in pending:
        number = int(re.search(r"\d+", path.stem).group())
        ep_id, title, date, picks = meta.get(number, (f"ep{number}", "", "", []))
        out = OUT_DIR / f"{path.stem}.md"

        print(f"\n>> ep{number:02d}  {title}", flush=True)
        started = time.time()

        segments, info = model.transcribe(
            str(path), beam_size=5, vad_filter=True, condition_on_previous_text=False
        )

        lines = [
            "---",
            f"episodeId: {ep_id}",
            f"number: {number}",
            f"title: {json.dumps(title)}",
            f"date: {date}",
            f"works: [{', '.join(picks)}]",
            f"source: whisper {args.model}",
            "---",
            "",
            f"# Ep. {number} - {title}",
            "",
        ]

        last_report = time.time()
        count = 0

        for seg in segments:
            lines.append(f"[{hms(seg.start)}] {seg.text.strip()}")
            count += 1
            if time.time() - last_report > 30:
                pct = seg.end / info.duration * 100
                print(f"   {pct:5.1f}%  ({hms(seg.end)} / {hms(info.duration)})", flush=True)
                last_report = time.time()

        out.write_text("\n".join(lines) + "\n", encoding="utf8", newline="\n")
        elapsed = time.time() - started
        print(
            f"   done: {count} segments, {elapsed / 60:.1f} min "
            f"({info.duration / elapsed:.1f}x realtime) -> {out.name}",
            flush=True,
        )

    print(f"\nAll done in {(time.time() - overall) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
