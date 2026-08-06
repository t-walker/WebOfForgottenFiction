/**
 * Merges a proposed episode into the dataset.
 *
 *   node scripts/add-episode.mjs proposal.json
 *   node scripts/add-episode.mjs proposal.json --dry-run
 *
 * The ingest agent drafts a small proposal file from a transcript; this script
 * does the mechanical part -- slug generation, de-duplication against existing
 * people and works, and appending association rows -- so the agent never has to
 * hand-edit the big JSON file.
 *
 * Re-running the same proposal is a no-op: everything is keyed by slug.
 *
 * Proposal shape:
 * {
 *   "episode": { "number": 19, "title": "...", "date": "2026-09-01" },
 *   "featured": [{
 *     "title": "Some Movie", "year": 1981, "medium": "Film",
 *     "pickedBy": "tommy",            // or "paris"
 *     "notes": "One line on why it came up.",
 *     "evidence": "00:04:01",         // timestamp where it's named
 *     "credits": [
 *       { "name": "Jane Doe", "role": "Director", "kind": "created", "evidence": "00:05:12" }
 *     ]
 *   }],
 *   "mentioned": [{
 *     "title": "Related Thing", "year": 1968, "medium": "Book",
 *     "evidence": "00:22:10",
 *     "relatedTo": "some-movie",      // slug of another work in this proposal or the dataset
 *     "relation": "inspired-by",
 *     "credits": [...]
 *   }]
 * }
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(root, 'src', 'data', 'forgotten-fiction.json');
const RELATIONS = ['adapted-from', 'inspired-by', 'precursor', 'successor', 'similar'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const proposalPath = args.find((a) => !a.startsWith('--'));

if (!proposalPath) {
  console.error('Usage: node scripts/add-episode.mjs <proposal.json> [--dry-run]');
  process.exit(1);
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));

const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

const ep = proposal.episode;
if (!ep?.number || !ep.title || !ep.date) {
  fail('proposal.episode needs number, title and date');
}

const episodeId = `ep${ep.number}`;
const added = { works: [], people: [], credits: 0, episodeWorks: 0, relations: 0 };

const workById = new Map(data.works.map((w) => [w.id, w]));
const personBySlug = new Map(data.people.map((p) => [p.id, p]));
const hostByName = new Map(
  data.hosts.map((h) => [h.name.split(' ')[0].toLowerCase(), h.id]),
);

/** Episodes are keyed by number, so re-running replaces rather than duplicates. */
const existingEpisode = data.episodes.find((e) => e.number === ep.number);
if (existingEpisode) {
  console.log(`Ep. ${ep.number} already present - merging into it.`);
} else {
  data.episodes.push({
    id: episodeId,
    number: ep.number,
    title: ep.title,
    date: ep.date,
  });
  data.episodes.sort((a, b) => a.number - b.number);
}

function upsertWork(entry, featured) {
  if (!entry.title) fail('every work needs a title');
  const id = entry.id ?? slug(entry.title);
  let work = workById.get(id);

  if (!work) {
    work = {
      id,
      title: entry.title,
      medium: entry.medium ?? 'Film',
      year: entry.year ?? null,
      notes: entry.notes ?? '',
      featured,
    };
    data.works.push(work);
    workById.set(id, work);
    added.works.push(`${id} (${featured ? 'featured' : 'mentioned'})`);
  } else if (featured && !work.featured) {
    // A work first seen as a mention can later become someone's pick.
    work.featured = true;
    console.log(`  promoted ${id} from mentioned to featured`);
  }

  return id;
}

function upsertPerson(name) {
  const id = `p-${slug(name)}`;
  if (!personBySlug.has(id)) {
    const person = { id, name };
    data.people.push(person);
    personBySlug.set(id, person);
    added.people.push(id);
  }
  return id;
}

function linkEpisodeWork(workId, role, hostId, evidence) {
  const existing = data.episodeWorks.find(
    (e) => e.episodeId === episodeId && e.workId === workId,
  );
  if (existing) return;

  const row = { episodeId, workId, pickedByHostId: hostId, role };
  if (evidence) row.evidence = evidence;
  data.episodeWorks.push(row);
  added.episodeWorks += 1;
}

function addCredits(workId, credits = []) {
  for (const credit of credits) {
    if (!credit.name) fail(`credit on ${workId} is missing a name`);
    const personId = upsertPerson(credit.name);
    const kind = credit.kind ?? 'appeared';

    if (kind !== 'created' && kind !== 'appeared') {
      fail(`credit kind must be 'created' or 'appeared', got '${kind}'`);
    }

    const dup = data.credits.some(
      (c) => c.personId === personId && c.workId === workId && c.role === credit.role,
    );
    if (dup) continue;

    const row = {
      personId,
      workId,
      role: credit.role ?? (kind === 'created' ? 'Creator' : 'Actor'),
      kind,
    };
    if (credit.evidence) row.evidence = credit.evidence;
    data.credits.push(row);
    added.credits += 1;
  }
}

for (const entry of proposal.featured ?? []) {
  const hostKey = String(entry.pickedBy ?? '').toLowerCase();
  const hostId = hostByName.get(hostKey);
  if (!hostId) {
    fail(`featured work '${entry.title}' needs pickedBy one of: ${[...hostByName.keys()].join(', ')}`);
  }
  const workId = upsertWork(entry, true);
  linkEpisodeWork(workId, 'featured', hostId, entry.evidence);
  addCredits(workId, entry.credits);
}

for (const entry of proposal.mentioned ?? []) {
  const workId = upsertWork(entry, false);
  linkEpisodeWork(workId, 'mentioned', null, entry.evidence);
  addCredits(workId, entry.credits);

  if (entry.relatedTo) {
    const target = entry.relatedTo;
    if (!workById.has(target)) fail(`'${entry.title}' relatedTo unknown work '${target}'`);
    if (!RELATIONS.includes(entry.relation)) {
      fail(`'${entry.title}' relation must be one of: ${RELATIONS.join(', ')}`);
    }
    if (target === workId) fail(`'${entry.title}' cannot relate to itself`);

    const dup = data.workRelations.some(
      (r) => r.fromWorkId === workId && r.toWorkId === target && r.relation === entry.relation,
    );
    if (!dup) {
      data.workRelations.push({
        fromWorkId: workId,
        toWorkId: target,
        relation: entry.relation,
      });
      added.relations += 1;
    }
  }
}

console.log(`\nEp. ${ep.number} - ${ep.title}`);
console.log(`  new works    : ${added.works.length ? added.works.join(', ') : 'none'}`);
console.log(`  new people   : ${added.people.length ? added.people.join(', ') : 'none'}`);
console.log(`  episodeWorks : +${added.episodeWorks}`);
console.log(`  credits      : +${added.credits}`);
console.log(`  relations    : +${added.relations}`);

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
} else {
  writeFileSync(DATA, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${DATA}`);
  console.log('Now run: npm run validate');
}
