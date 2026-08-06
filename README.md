# Web of Forgotten Fiction

An interactive graph of every work of fiction covered on the **Forgotten Fiction** podcast
(hosted by Paris Brown & Tommy Brown, BrownTown Productions).

Fully static: React + Vite, no backend, no database, no hosting costs.

## Data model

The dataset in [`src/data/forgotten-fiction.json`](src/data/forgotten-fiction.json) is
normalized like a relational database. **Entity tables** each store a row exactly once,
keyed by `id`; **association tables** connect them by referencing those ids.

### Entity tables

| Table      | Key  | Columns                                        |
| ---------- | ---- | ---------------------------------------------- |
| `hosts`    | `id` | `name`                                         |
| `people`   | `id` | `name`                                         |
| `works`    | `id` | `title`, `medium`, `year`, `notes`, `featured` |
| `episodes` | `id` | `number`, `title`, `date`                      |

`works.featured` is `true` for a host's pick and `false` for a work that was only
mentioned in discussion — adaptations, inspirations, and comparisons the hosts brought up
along the way.

### Association tables

| Table           | Foreign keys                            | Meaning                                       |
| --------------- | --------------------------------------- | --------------------------------------------- |
| `episodeWorks`  | `episodeId`, `workId`, `pickedByHostId` | This work came up in this episode             |
| `credits`       | `personId`, `workId`                    | This person was involved in this work         |
| `workRelations` | `fromWorkId`, `toWorkId`                | How one work connects to another              |

`episodeWorks.role` is `"featured"` (a host's pick — `pickedByHostId` is set) or
`"mentioned"` (`pickedByHostId` is `null`).

`credits.kind` is `"created"` (author, director, writer…) or `"appeared"` (actors and
others mentioned). `role` holds the human-readable label shown in the UI.

`workRelations.relation` is one of five kinds, read as _"from &lt;relation&gt; to"_:

| Relation       | Example                                          |
| -------------- | ------------------------------------------------ |
| `adapted-from` | The Last Man on Earth **adapted from** I Am Legend |
| `inspired-by`  | Night of the Living Dead **inspired by** I Am Legend |
| `precursor`    | The Faculty's **precursor** is Scream            |
| `successor`    | Murder Party's **successor** is Blue Ruin        |
| `similar`      | Eerie, Indiana is **similar to** Twin Peaks      |

Because a person is stored once, recurring figures bridge multiple works automatically —
Richard Matheson connects five (The Twilight Zone, I Am Legend, Prey, The Last Man on
Earth, Trilogy of Terror), and Bill Paxton, Lance Henriksen, and Jenette Goldstein each
tie Near Dark to Aliens. That's where the interesting graph structure comes from.

### How it becomes a graph

[`src/graph.ts`](src/graph.ts) joins the tables into nodes and edges at runtime:

| Edge                | From → To      | Source table    |
| ------------------- | -------------- | --------------- |
| `featured`          | episode → work | `episodeWorks`  |
| `mentioned`         | episode → work | `episodeWorks`  |
| `picked`            | host → work    | `episodeWorks`  |
| `created`           | person → work  | `credits`       |
| `appeared`          | person → work  | `credits`       |
| the five relations  | work → work    | `workRelations` |

Mentioned works render smaller and in a muted color, and work-to-work relations are drawn
as dashed edges, so the hosts' picks stay visually dominant. A sidebar toggle hides
mentioned works entirely.

## Adding an episode

The easiest way is to let the ingest agent do it — see
[Ingesting new episodes](#ingesting-new-episodes) below. To do it by hand:

1. Add a row to `episodes`.
2. Add a row to `works` for each piece of fiction (pick a unique slug `id`), setting
   `featured: true` for the hosts' picks and `false` for anything merely mentioned.
3. Add a row to `people` for anyone new.
4. Link them in `episodeWorks`, `credits`, and `workRelations` using those ids.

```jsonc
// episodes
{ "id": "ep19", "number": 19, "title": "Some Movie & Some Book", "date": "2026-08-11" }

// works — a host's pick
{ "id": "some-movie", "title": "Some Movie", "medium": "Film", "year": 1988,
  "notes": "One-line hook shown in the sidebar.", "featured": true }

// works — only mentioned on the show
{ "id": "some-sequel", "title": "Some Sequel", "medium": "Film", "year": 1991,
  "notes": "Came up when they compared the two.", "featured": false }

// people
{ "id": "p-jane-director", "name": "Jane Director" }

// episodeWorks
{ "episodeId": "ep19", "workId": "some-movie",
  "pickedByHostId": "h-paris-brown", "role": "featured" }
{ "episodeId": "ep19", "workId": "some-sequel",
  "pickedByHostId": null, "role": "mentioned" }

// credits
{ "personId": "p-jane-director", "workId": "some-movie",
  "role": "Director", "kind": "created" }

// workRelations
{ "fromWorkId": "some-movie", "toWorkId": "some-sequel", "relation": "successor" }
```

Then run `npm run validate` — it checks every foreign key, catches duplicate ids, verifies
that featured rows have a host (and mentioned rows don't), rejects unknown relation kinds,
and flags works that aren't linked to an episode. It also runs automatically before
`build`, so a broken reference fails the deploy instead of silently vanishing from the
graph.

`medium` should be `Film`, `Book`, or `TV` to pick up a legend color.

## Ingesting new episodes

There's a Copilot CLI agent in `.github/agents/ingest-episodes.agent.md` that
handles the whole loop: find episodes in the RSS feed that aren't in the graph,
download and transcribe their audio, read the transcript, and add the works,
people, and cross-references.

```bash
copilot
/agent ingest-episodes
```

Then just ask it to bring the graph up to date.

Its rule is that **everything it adds must be traceable to something a host
actually said**, with a timestamp. The dataset was originally built from RSS show
notes, which let in entries that were true about the work but never discussed on
the episode; grounding entries in transcripts is how that gets fixed.

The agent drives these scripts, all of which you can run yourself:

```bash
npm run episodes:check        # what's in the feed but not in the graph
npm run episodes:check -- --json
npm run audio:fetch           # download episode MP3s (skips existing)
npm run transcribe            # faster-whisper -> transcripts/epNN.md
npm run transcribe -- --only 19
npm run episode:add proposal.json --dry-run   # merge a drafted episode
npm run scan:mentions         # audit: is each existing entry actually spoken?
```

`episode:add` owns slug generation, de-duplication against existing people and
works, and appending association rows, so nobody has to hand-edit the big JSON
file. It's idempotent — re-running a proposal changes nothing.

Transcription runs on CPU at roughly 6x realtime and needs Python with
[`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) plus `ffmpeg`:

```bash
pip install faster-whisper
winget install Gyan.FFmpeg     # or: brew install ffmpeg
```

Audio and transcripts are git-ignored — they're the hosts' content and stay
local. See [`transcripts/README.md`](transcripts/README.md).

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run validate  # data integrity check
npm run build     # validate + typecheck + static output in dist/
npm run preview
```

## Deploy (free)

**GitHub Pages** — push to `main`; `.github/workflows/deploy.yml` builds and deploys.
Enable it once under _Settings → Pages → Source: GitHub Actions_. The workflow sets
`BASE_PATH` to `/<repo-name>/` automatically.

**Netlify / Vercel / Cloudflare Pages** — build command `npm run build`, publish
directory `dist`. Leave `BASE_PATH` unset.

## Data source

Episode titles, dates, and descriptions come from the podcast's public RSS feed
(`https://anchor.fm/s/111b27bec/podcast/rss`).

Creator and cast attributions were originally taken from the episode show notes.
Show notes summarise, so some of those entries are true about the work without
having been discussed on the episode. New episodes are ingested from transcripts
instead, with a timestamp recorded in an `evidence` field, and
`npm run scan:mentions` audits the older entries against the audio.
