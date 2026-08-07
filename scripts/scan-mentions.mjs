/**
 * Scans generated transcripts for every work title and person name in the
 * dataset and reports where (timestamp) each one is actually spoken.
 *
 *   node scripts/scan-mentions.mjs            # summary table
 *   node scripts/scan-mentions.mjs --ep 6     # detail for one episode
 *   node scripts/scan-mentions.mjs --missing  # only unverified rows
 *
 * This is the provenance check: the dataset was originally built from RSS show
 * notes, so every credit here is a claim that needs evidence. A row that never
 * appears in its episode's transcript was inferred, not heard.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findHits, nameTerms, normalize, searchTerms } from './lib/match.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const transcriptDir = join(root, 'transcripts');
const data = JSON.parse(
  readFileSync(join(root, 'src', 'data', 'forgotten-fiction.json'), 'utf8'),
);

const args = process.argv.slice(2);
const onlyEp = args.includes('--ep') ? Number(args[args.indexOf('--ep') + 1]) : null;
const missingOnly = args.includes('--missing');

const works = new Map(data.works.map((w) => [w.id, w]));
const people = new Map(data.people.map((p) => [p.id, p]));

function loadTranscript(number) {
  const file = join(transcriptDir, `ep${String(number).padStart(2, '0')}.md`);
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  return lines
    .map((line) => line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$/))
    .filter(Boolean)
    .map((m) => ({ time: m[1], text: m[2], norm: normalize(m[2]) }));
}
const available = existsSync(transcriptDir)
  ? readdirSync(transcriptDir).filter((f) => /^ep\d+\.md$/.test(f)).length
  : 0;

if (available === 0) {
  console.error('No transcripts yet. Run: npm run transcribe');
  process.exit(1);
}

console.log(`Scanning ${available} transcript(s)\n`);

let verified = 0;
let unverified = 0;
const gaps = [];
const phonetic = [];

for (const episode of data.episodes) {
  if (onlyEp && episode.number !== onlyEp) continue;
  const segments = loadTranscript(episode.number);
  if (!segments) continue;

  const rows = [];

  for (const link of data.episodeWorks.filter((e) => e.episodeId === episode.id)) {
    const work = works.get(link.workId);
    const hits = findHits(segments, searchTerms(work.title));
    rows.push({ kind: link.role === 'featured' ? 'work*' : 'work ', label: work.title, hits });

    for (const credit of data.credits.filter((c) => c.workId === work.id)) {
      const person = people.get(credit.personId);
      const pHits = findHits(segments, nameTerms(person.name));
      rows.push({
        kind: `  ${credit.kind === 'created' ? 'by' : 'in'}`,
        label: `${person.name} (${work.title})`,
        hits: pHits,
      });
    }
  }

  const shown = missingOnly ? rows.filter((r) => r.hits.length === 0) : rows;
  if (shown.length) {
    console.log(`Ep. ${episode.number} - ${episode.title}`);
    for (const row of shown) {
      const hit = row.hits[0];
      const mark = !hit
        ? 'NOT SPOKEN'
        : hit.heard
          ? `heard @ ${hit.time} as "${hit.heard}"`
          : `heard @ ${hit.time}`;
      console.log(`  [${row.kind}] ${row.label.padEnd(52)} ${mark}`);
      if (onlyEp && row.hits.length) {
        for (const h of row.hits.slice(0, 3)) {
          console.log(`         ${h.time}  "${h.text.slice(0, 90)}"`);
        }
      }
    }
    console.log('');
  }

  for (const row of rows) {
    if (row.hits.length) {
      verified += 1;
      if (row.hits[0].heard) {
        phonetic.push(
          `Ep.${episode.number} ${row.label} -> "${row.hits[0].heard}" @ ${row.hits[0].time}`,
        );
      }
    } else {
      unverified += 1;
      gaps.push(`Ep.${episode.number} ${row.label}`);
    }
  }
}

console.log('-'.repeat(64));
console.log(`verified in audio : ${verified}`);
console.log(`  of those, heard only phonetically : ${phonetic.length}`);
console.log(`not spoken        : ${unverified}`);
if (phonetic.length) {
  console.log('\nMatched by sound, not spelling -- check these read correctly:');
  for (const line of phonetic) console.log(`  ${line}`);
}
if (unverified && !missingOnly) {
  console.log('\nRe-run with --missing to list only the unverified rows.');
}
