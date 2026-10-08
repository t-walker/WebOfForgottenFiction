"""
Transcribes downloaded episode audio into timestamped Markdown transcripts.

    python scripts/transcribe.py            # all episodes, faster-whisper small.en
    python scripts/transcribe.py --backend mlx      # Apple-silicon GPU, much faster
    python scripts/transcribe.py --model medium.en
    python scripts/transcribe.py --only 3 7

Two backends are available:

  faster-whisper  CPU / int8 via CTranslate2. Portable, ~6x realtime.
  mlx             Apple MLX on the Mac's GPU. Roughly an order of magnitude
                  faster on Apple silicon, and the default large-v3-turbo model
                  is more accurate than small.en. Needs `pip install mlx-whisper`.

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

DEFAULT_MODEL = {
    "faster-whisper": "small.en",
    "mlx": "mlx-community/whisper-large-v3-turbo",
}

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


def load_transcriber(backend: str, model_name: str, threads: int):
    """Return transcribe(path) -> (iterable of (start_seconds, text), duration).

    Normalising both backends to this shape keeps the caller's writing and
    progress-reporting loop identical regardless of which one is in use.
    """
    if backend == "faster-whisper":
        from faster_whisper import WhisperModel

        print(
            f"loading {model_name} (cpu, int8, {threads} threads) ...", flush=True
        )
        model = WhisperModel(
            model_name, device="cpu", compute_type="int8", cpu_threads=threads
        )

        def transcribe(path: Path):
            segments, info = model.transcribe(
                str(path),
                beam_size=5,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            return ((seg.start, seg.text) for seg in segments), info.duration

        return transcribe

    if backend == "mlx":
        try:
            import mlx_whisper
        except ImportError:
            print(
                "mlx backend needs mlx-whisper: pip install mlx-whisper",
                file=sys.stderr,
            )
            raise

        # mlx-whisper shells out to an ffmpeg binary to decode audio, which we
        # don't depend on. faster-whisper's decoder uses PyAV in-process and
        # hands back exactly the float32 16 kHz mono array whisper expects.
        from faster_whisper.audio import decode_audio

        print(f"using {model_name} (mlx, gpu) ...", flush=True)

        def transcribe(path: Path):
            audio = decode_audio(str(path), sampling_rate=16000)
            duration = len(audio) / 16000
            # MLX transcribes the whole file in one call rather than streaming,
            # so its own progress bar is the only feedback available -- but it
            # redraws constantly, which floods a captured log. Show it only when
            # someone is actually watching a terminal.
            result = mlx_whisper.transcribe(
                audio,
                path_or_hf_repo=model_name,
                condition_on_previous_text=False,
                verbose=False if sys.stdout.isatty() else None,
            )
            segments = result.get("segments", [])
            return ((s["start"], s["text"]) for s in segments), duration

        return transcribe

    raise ValueError(f"unknown backend: {backend}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--backend", default="faster-whisper", choices=sorted(DEFAULT_MODEL)
    )
    parser.add_argument("--model", default=None)
    parser.add_argument("--only", nargs="*", type=int, default=None)
    parser.add_argument("--threads", type=int, default=16)
    args = parser.parse_args()

    model_name = args.model or DEFAULT_MODEL[args.backend]

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

    transcribe = load_transcriber(args.backend, model_name, args.threads)

    overall = time.time()

    for path in pending:
        number = int(re.search(r"\d+", path.stem).group())
        ep_id, title, date, picks = meta.get(number, (f"ep{number}", "", "", []))
        out = OUT_DIR / f"{path.stem}.md"

        print(f"\n>> ep{number:02d}  {title}", flush=True)
        started = time.time()

        segments, duration = transcribe(path)

        lines = [
            "---",
            f"episodeId: {ep_id}",
            f"number: {number}",
            f"title: {json.dumps(title)}",
            f"date: {date}",
            f"works: [{', '.join(picks)}]",
            f"source: whisper {model_name} ({args.backend})",
            "---",
            "",
            f"# Ep. {number} - {title}",
            "",
        ]

        last_report = time.time()
        count = 0
        furthest = 0.0

        for start, text in segments:
            lines.append(f"[{hms(start)}] {text.strip()}")
            count += 1
            furthest = max(furthest, start)
            if time.time() - last_report > 30:
                if duration:
                    pct = start / duration * 100
                    print(
                        f"   {pct:5.1f}%  ({hms(start)} / {hms(duration)})", flush=True
                    )
                else:
                    print(f"   {hms(start)}", flush=True)
                last_report = time.time()

        out.write_text("\n".join(lines) + "\n", encoding="utf8", newline="\n")
        elapsed = time.time() - started
        speed = f"{(duration or furthest) / elapsed:.1f}x realtime" if elapsed else "n/a"
        print(
            f"   done: {count} segments, {elapsed / 60:.1f} min "
            f"({speed}) -> {out.name}",
            flush=True,
        )

    print(f"\nAll done in {(time.time() - overall) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
