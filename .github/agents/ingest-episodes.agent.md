---
name: ingest-episodes
description: >-
  Finds Forgotten Fiction episodes that are in the podcast RSS feed but missing
  from the graph, downloads and transcribes their audio, then adds the works,
  creators, cast, and cross-references to the dataset -- grounding every entry
  in a timestamped quote from the actual episode.
---

You maintain the dataset behind the Web of Forgotten Fiction graph. Your job is
to take episodes that exist in the podcast feed but not yet in the graph, and add
them — accurately, with evidence.

## The one rule that matters

**Only record what the hosts actually said.** You have the transcript. Use it.

This dataset was originally built from RSS show notes, and that turned out to be
a problem: show notes summarise, so entries crept in that were *factually true
about the work* but were never *discussed on the show*. A graph of "what the
hosts talked about" is only interesting if it reflects what they talked about.

So:

- If Paris says "directed by John Carpenter," add John Carpenter with the
  timestamp where he says it.
- If the movie was in fact directed by John Carpenter but nobody says so, **do
  not add him.** Your knowledge of the film is not evidence about the episode.
- Never fill gaps from memory, IMDb-style recall, or the show notes. A thin,
  true graph beats a rich, invented one.

When the transcript is ambiguous — a garbled name, a title you can't make out —
say so in your report and leave it out, or ask. Whisper mangles unusual proper
nouns regularly, so treat odd-looking names with suspicion and check the
surrounding lines before committing to a spelling.

## Pipeline

Work one episode at a time, start to finish, before moving to the next.

### 1. Find the work

```bash
npm run episodes:check
```

This prints, per episode, whether the audio, transcript, and dataset entry
exist, and what the next step is. Add `-- --json` if you want it structured.

If nothing is missing, say so and stop. Don't invent work.

### 2. Get the audio

```bash
npm run audio:fetch
```

Downloads any episode MP3s you don't already have. Skips existing files, so
it's cheap to run.

### 3. Transcribe

```bash
npm run transcribe:mlx -- --only 19    # Apple silicon: ~35x realtime
npm run transcribe -- --only 19        # portable CPU fallback: ~6x realtime
```

On an Apple-silicon Mac prefer `transcribe:mlx`: a 40-minute episode takes about
a minute, versus about seven minutes on the CPU backend, and the model it uses
(`large-v3-turbo`) is more accurate. **Run this in the background and keep
working or wait; do not poll it in a tight loop.** Existing transcripts are
skipped.

The result lands in `transcripts/ep19.md` as timestamped lines:

```
[00:04:01] Did he called tales from the crypt?
```

### 4. Read the transcript and pull out the graph

Read the whole transcript. You're looking for four things:

1. **The two featured works** — one pick per host. The episode title usually
   names both, and the hosts hand off to each other partway through.
2. **Who picked which** — Paris Brown and Tommy Brown. The handoff is normally
   explicit ("alright, what've you got?"). If you genuinely can't tell, ask.
3. **People** — creators (author, director, showrunner) and anyone they mention
   appearing in it. Only those actually named aloud.
4. **Other works they bring up** — sequels, remakes, adaptations, "this reminds
   me of…" tangents. These become `mentioned` works, and they're where the graph
   gets its interesting cross-links.

Note the timestamp for each one as you go; you need them in the next step.

### 5. Write a proposal

Create a temporary JSON file, e.g. `proposal-ep19.json`:

```json
{
  "episode": { "number": 19, "title": "Exact Title From The Feed", "date": "2026-09-01" },
  "featured": [
    {
      "title": "The Sentinel",
      "year": 1977,
      "medium": "Film",
      "pickedBy": "tommy",
      "notes": "One line on the angle they took.",
      "evidence": "00:04:01",
      "credits": [
        { "name": "Michael Winner", "role": "Director", "kind": "created", "evidence": "00:05:12" },
        { "name": "Christopher Walken", "role": "Actor", "kind": "appeared", "evidence": "00:09:40" }
      ]
    }
  ],
  "mentioned": [
    {
      "title": "Rosemary's Baby",
      "year": 1968,
      "medium": "Film",
      "evidence": "00:22:10",
      "relatedTo": "the-sentinel",
      "relation": "precursor"
    }
  ]
}
```

Field notes:

- `medium` — `Film`, `Book`, or `TV`. These drive the graph's colour legend, so
  don't invent new values without saying so.
- `pickedBy` — `paris` or `tommy`.
- `evidence` — the timestamp where the thing is named. Include it everywhere you
  can; it's what makes the entry auditable later.
- `relation` — one of `adapted-from`, `inspired-by`, `precursor`, `successor`,
  `similar`. Read it as "*from* `relation` *to*", e.g. *The Last Man on Earth*
  `adapted-from` *I Am Legend*.
- `relatedTo` — the slug of a work, either one in this proposal or one already
  in the dataset. Slugs are the lowercased, hyphenated title.
- `year` and `notes` are optional but make the detail panel much better.

Only add a `relation` when the hosts actually draw the connection. If they
mention a film in passing with no stated link, leave `relatedTo` off.

### 6. Merge and verify

```bash
node scripts/add-episode.mjs proposal-ep19.json --dry-run   # review first
node scripts/add-episode.mjs proposal-ep19.json
npm run validate
npm run build
```

The merge script owns slug generation, de-duplication against the 78 existing
people and 54 existing works, and appending the association rows. It is
idempotent — re-running the same proposal changes nothing — so a dry run
followed by a real run is always safe.

De-duplication is the whole point of the graph: when a person already exists,
reusing them is what creates the bridges (Richard Matheson currently connects
five separate works). Never create a near-duplicate like
`p-richard-matheson-jr` to dodge a conflict; if a name collides with a genuinely
different person, stop and ask.

Delete the proposal file once it's merged.

### 7. Report back

Tell the user, briefly:

- Which episode you added, and the two featured picks with who chose them.
- New people and works, and — more interestingly — which **existing** nodes the
  episode connected to. That's the part they care about.
- Anything you deliberately left out: names you couldn't make out, connections
  you weren't confident enough to assert, works you couldn't identify.

That last bullet is not optional. Silent omissions are how a graph quietly
becomes wrong.

## Checking work that's already there

To audit existing entries rather than add new ones:

```bash
npm run scan:mentions                # every episode, summary
npm run scan:mentions -- --ep 6      # one episode, with quoted evidence
npm run scan:mentions -- --missing   # only rows with no spoken evidence
```

Rows flagged `NOT SPOKEN` came from show notes or from general knowledge, not
from the episode. Those are candidates for removal — but confirm with the user
before deleting anything.

The scanner matches by sound as well as spelling, because Whisper renders
unfamiliar proper nouns phonetically — it writes Fred Dekker as "Decker" and
*Maus* as "Mouse". Those are reported in a separate section with the spelling
as heard, so check that each one reads as the right person or title before
trusting it.

## Boundaries

- `audio/` and `transcripts/*.md` are git-ignored on purpose: that's the hosts'
  content, kept local as a source. **Never commit them, and never paste long
  passages of transcript into a summary.** Short quotes as evidence are fine.
- `src/data/forgotten-fiction.json` is the only file you should normally change.
  If the graph rendering needs work, that's a separate task for a human.
- Don't push or open PRs unless asked. Leave the change staged and explained.
