# Forgotten Fiction — Graph

An interactive graph of every work of fiction covered on the **Forgotten Fiction** podcast
(hosted by Paris Brown & Tommy Brown, BrownTown Productions).

Fully static: React + Vite, no backend, no database, no hosting costs.

## The graph model

Think of it as a tiny Neo4j schema stored in one JSON file:

| Node type | Meaning                                       |
| --------- | --------------------------------------------- |
| `work`    | The forgotten piece of fiction (film/book/TV) |
| `person`  | Creators and anyone mentioned as involved     |
| `host`    | Paris or Tommy                                |
| `episode` | An episode of the show                        |

| Edge       | From → To      | Meaning                              |
| ---------- | -------------- | ------------------------------------ |
| `featured` | episode → work | The work was covered in that episode |
| `picked`   | host → work    | Which host brought it                |
| `created`  | person → work  | Author, director, writer, etc.       |
| `appeared` | person → work  | Actors and other people mentioned    |

Person nodes are de-duplicated by name, so recurring figures (Stephen King,
Richard Matheson, Fred Dekker) automatically bridge multiple works — that's where the
interesting structure shows up.

## Adding an episode

Everything lives in [`src/data/forgotten-fiction.json`](src/data/forgotten-fiction.json).
Append to `episodes`:

```jsonc
{
  "id": "ep19",
  "number": 19,
  "title": "Some Movie & Some Book",
  "date": "2026-08-11",
  "works": [
    {
      "id": "some-movie",        // unique slug
      "title": "Some Movie",
      "medium": "Film",          // Film | Book | TV
      "year": 1988,
      "pickedBy": "Paris Brown", // must match a name in podcast.hosts
      "creators": [{ "name": "Jane Director", "role": "Director" }],
      "people": [{ "name": "An Actor", "role": "Actor" }],
      "notes": "One-line hook shown in the sidebar."
    }
  ]
}
```

No other code changes needed — the graph rebuilds itself from the JSON.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # static output in dist/
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
