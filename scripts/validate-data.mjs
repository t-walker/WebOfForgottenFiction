/**
 * Referential integrity check for the normalized dataset.
 * Run with: npm run validate
 */
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('src/data/forgotten-fiction.json', 'utf8'));
const errors = [];

const index = (table) => {
  const ids = new Set();
  for (const row of data[table]) {
    if (!row.id) errors.push(`${table}: row is missing an id`);
    else if (ids.has(row.id)) errors.push(`${table}: duplicate id "${row.id}"`);
    ids.add(row.id);
  }
  return ids;
};

const hostIds = index('hosts');
const personIds = index('people');
const workIds = index('works');
const episodeIds = index('episodes');

const fk = (value, pool, label, where) => {
  if (!pool.has(value)) errors.push(`${where}: unknown ${label} "${value}"`);
};

const covered = new Set();
const RELATIONS = new Set(['adapted-from', 'inspired-by', 'precursor', 'successor', 'similar']);

data.episodeWorks.forEach((row, i) => {
  const where = `episodeWorks[${i}]`;
  fk(row.episodeId, episodeIds, 'episodeId', where);
  fk(row.workId, workIds, 'workId', where);

  if (row.role !== 'featured' && row.role !== 'mentioned') {
    errors.push(`${where}: role must be "featured" or "mentioned", got "${row.role}"`);
  }

  const work = data.works.find((w) => w.id === row.workId);
  if (row.role === 'featured') {
    if (!row.pickedByHostId) errors.push(`${where}: featured works need a pickedByHostId`);
    else fk(row.pickedByHostId, hostIds, 'pickedByHostId', where);
    if (work && work.featured !== true) {
      errors.push(`${where}: work "${row.workId}" is featured here but has featured=false`);
    }
  } else if (row.pickedByHostId) {
    errors.push(`${where}: mentioned works must have pickedByHostId null`);
  }

  covered.add(row.workId);
});

data.credits.forEach((row, i) => {
  const where = `credits[${i}]`;
  fk(row.personId, personIds, 'personId', where);
  fk(row.workId, workIds, 'workId', where);
  if (row.kind !== 'created' && row.kind !== 'appeared') {
    errors.push(`${where}: kind must be "created" or "appeared", got "${row.kind}"`);
  }
});

data.workRelations.forEach((row, i) => {
  const where = `workRelations[${i}]`;
  fk(row.fromWorkId, workIds, 'fromWorkId', where);
  fk(row.toWorkId, workIds, 'toWorkId', where);
  if (!RELATIONS.has(row.relation)) {
    errors.push(`${where}: relation must be one of ${[...RELATIONS].join(', ')}`);
  }
  if (row.fromWorkId === row.toWorkId) {
    errors.push(`${where}: a work cannot relate to itself`);
  }
});

(data.hostRelations ?? []).forEach((row, i) => {
  const where = `hostRelations[${i}]`;
  fk(row.fromHostId, hostIds, 'fromHostId', where);
  fk(row.toHostId, hostIds, 'toHostId', where);
  if (!row.label) errors.push(`${where}: label is required`);
  if (row.fromHostId === row.toHostId) {
    errors.push(`${where}: a host cannot relate to themselves`);
  }
});

for (const work of data.works) {
  if (typeof work.featured !== 'boolean') {
    errors.push(`works: "${work.id}" is missing a boolean featured flag`);
  }
}

for (const id of workIds) {
  if (!covered.has(id)) errors.push(`works: "${id}" is not linked to any episode`);
}

if (errors.length) {
  console.error(`x ${errors.length} problem(s) found:\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

const featured = data.works.filter((w) => w.featured).length;

console.log(
  `ok - data valid: ${data.hosts.length} hosts, ${data.people.length} people, ` +
    `${data.works.length} works (${featured} featured / ${data.works.length - featured} mentioned), ` +
    `${data.episodes.length} episodes, ${data.episodeWorks.length} episode-work links, ` +
    `${data.credits.length} credits, ${data.workRelations.length} work relations`,
);
