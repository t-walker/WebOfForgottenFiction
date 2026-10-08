# Transcripts

Machine-generated transcripts of each episode, one file per episode
(`ep01.md` … `ep18.md`).

**These files are git-ignored on purpose.** The audio and its contents belong to
the show's hosts. The transcripts exist locally so the dataset can be grounded in
what was actually said, not so they can be republished. Only this README is
tracked.

## How they get here

```bash
npm run audio:fetch    # download episode MP3s from the podcast RSS feed
npm run transcribe:mlx # mlx-whisper on the GPU (Apple silicon) -> transcripts/epNN.md
npm run transcribe     # portable CPU fallback (faster-whisper, small.en)
```

Both steps skip work that's already done, so they're safe to re-run or interrupt.
The MLX backend runs at roughly 35x realtime, so the full catalogue takes a few
minutes; the CPU backend runs at roughly 6x realtime and takes a few hours.

## Format

Each file has YAML front-matter followed by timestamped segments:

```
---
episodeId: ep1
number: 1
title: "Tales From The Crypt & Beavis and Butthead"
date: 2026-04-28
works: [Tales from the Crypt, Beavis and Butt-Head]
source: whisper mlx-community/whisper-large-v3-turbo (mlx)
---

# Ep. 1 - Tales From The Crypt & Beavis and Butthead

[00:04:01] Did he called tales from the crypt?
```

There is no speaker diarisation, so lines are not attributed to Paris or Tommy.

## Why this exists

The dataset in `src/data/forgotten-fiction.json` was originally built from the
RSS show notes. Show notes summarise; they don't list everyone the hosts talked
about, and they can imply things that were never said out loud. That made every
row a claim without evidence.

`npm run scan:mentions` closes that gap. It searches the transcripts for every
work title and person name in the dataset and reports the timestamp where each
is actually spoken:

```bash
npm run scan:mentions              # summary across all episodes
npm run scan:mentions -- --ep 6    # detail plus quoted evidence
npm run scan:mentions -- --missing # only rows with no spoken evidence
```

A row flagged `NOT SPOKEN` is one that came from the show notes or from general
knowledge about the work, not from the episode itself. Those are the rows to
review before trusting the graph.

Transcripts are lossy: Whisper mangles unusual proper nouns, and the scanner
matches on text, so treat it as a strong signal rather than proof.
