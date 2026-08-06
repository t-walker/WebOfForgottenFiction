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
data.episodeWorks.forEach((row, i) => {
  const where = `episodeWorks[${i}]`;
  fk(row.episodeId, episodeIds, 'episodeId', where);
  fk(row.workId, workIds, 'workId', where);
  fk(row.pickedByHostId, hostIds, 'pickedByHostId', where);
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

for (const id of workIds) {
  if (!covered.has(id)) errors.push(`works: "${id}" is not linked to any episode`);
}

if (errors.length) {
  console.error(`x ${errors.length} problem(s) found:\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

console.log(
  `ok - data valid: ${data.hosts.length} hosts, ${data.people.length} people, ` +
    `${data.works.length} works, ${data.episodes.length} episodes, ` +
    `${data.episodeWorks.length} episode-work links, ${data.credits.length} credits`,
);
