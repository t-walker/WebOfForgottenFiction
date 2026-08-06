# Web of Forgotten Fiction

An interactive graph of every work of fiction covered on the **Forgotten Fiction** podcast
(hosted by Paris Brown & Tommy Brown, BrownTown Productions).

Fully static: React + Vite, no backend, no database, no hosting costs.

## Data model

The dataset in [`src/data/forgotten-fiction.json`](src/data/forgotten-fiction.json) is
normalized like a relational database. **Entity tables** each store a row exactly once,
keyed by `id`; **association tables** connect them by referencing those ids.

### Entity tables

| Table      | Key      | Columns                            |
| ---------- | -------- | ---------------------------------- |
| `hosts`    | `id`     | `name`                             |
| `people`   | `id`     | `name`                             |
| `works`    | `id`     | `title`, `medium`, `year`, `notes` |
| `episodes` | `id`     | `number`, `title`, `date`          |

### Association tables

| Table          | Foreign keys                             | Meaning                                     |
| -------------- | ---------------------------------------- | ------------------------------------------- |
| `episodeWorks` | `episodeId`, `workId`, `pickedByHostId`  | This work was covered in this episode, brought by this host |
| `credits`      | `personId`, `workId` (+ `role`, `kind`)  | This person was involved in this work       |

`credits.kind` is `"created"` (author, director, writer…) or `"appeared"` (actors and
others mentioned). `role` holds the human-readable label shown in the UI.

Because a person is stored once, recurring figures — Stephen King, Richard Matheson,
Fred Dekker — automatically bridge multiple works. That's where the interesting graph
structure comes from.

### How it becomes a graph

[`src/graph.ts`](src/graph.ts) joins the tables into nodes and edges at runtime:

| Edge       | From → To      | Source table   |
| ---------- | -------------- | -------------- |
| `featured` | episode → work | `episodeWorks` |
| `picked`   | host → work    | `episodeWorks` |
| `created`  | person → work  | `credits`      |
| `appeared` | person → work  | `credits`      |

## Adding an episode

1. Add a row to `episodes`.
2. Add a row to `works` for each piece of fiction (pick a unique slug `id`).
3. Add a row to `people` for anyone new.
4. Link them in `episodeWorks` and `credits` using those ids.

```jsonc
// episodes
{ "id": "ep19", "number": 19, "title": "Some Movie & Some Book", "date": "2026-08-11" }

// works
{ "id": "some-movie", "title": "Some Movie", "medium": "Film", "year": 1988,
  "notes": "One-line hook shown in the sidebar." }

// people
{ "id": "p-jane-director", "name": "Jane Director" }

// episodeWorks
{ "episodeId": "ep19", "workId": "some-movie", "pickedByHostId": "h-paris-brown" }

// credits
{ "personId": "p-jane-director", "workId": "some-movie",
  "role": "Director", "kind": "created" }
```

Then run `npm run validate` — it checks every foreign key, catches duplicate ids, and
flags works that aren't linked to an episode. It also runs automatically before `build`,
so a broken reference fails the deploy instead of silently vanishing from the graph.

`medium` should be `Film`, `Book`, or `TV` to pick up a legend color.

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
(`https://anchor.fm/s/111b27bec/podcast/rss`). Creator and cast attributions were
transcribed from the episode show notes.
