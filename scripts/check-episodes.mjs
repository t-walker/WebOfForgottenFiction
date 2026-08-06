/**
 * Reports which episodes in the RSS feed are missing from the dataset, and how
 * far along each one is in the pipeline (audio -> transcript -> dataset).
 *
 *   npm run episodes:check          # human-readable status table
 *   npm run episodes:check -- --json  # machine-readable, for the ingest agent
 *
 * This is the entry point for the ingest agent: it answers "what work is left?"
 * without the agent having to guess.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchFeed } from './lib/feed.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');
const pad = (n) => String(n).padStart(2, '0');

const data = JSON.parse(
  readFileSync(join(root, 'src', 'data', 'forgotten-fiction.json'), 'utf8'),
);
const known = new Map(data.episodes.map((e) => [e.number, e]));

const feed = await fetchFeed();

const report = feed.map((ep) => {
  const audio = join(root, 'audio', `ep${pad(ep.number)}.mp3`);
  const transcript = join(root, 'transcripts', `ep${pad(ep.number)}.md`);
  const inDataset = known.has(ep.number);

  const hasAudio = existsSync(audio) && statSync(audio).size > 0;
  const hasTranscript = existsSync(transcript);

  let next = 'done';
  if (!hasAudio) next = 'fetch-audio';
  else if (!hasTranscript) next = 'transcribe';
  else if (!inDataset) next = 'add-to-dataset';

  return {
    number: ep.number,
    title: ep.title,
    date: ep.date,
    inDataset,
    hasAudio,
    hasTranscript,
    next,
    audioPath: `audio/ep${pad(ep.number)}.mp3`,
    transcriptPath: `transcripts/ep${pad(ep.number)}.md`,
    description: ep.description,
  };
});

const missing = report.filter((r) => !r.inDataset);

if (asJson) {
  console.log(JSON.stringify({ total: report.length, missing, episodes: report }, null, 2));
} else {
  console.log(`Feed has ${report.length} episode(s); dataset has ${known.size}.\n`);
  console.log('  #  audio  transcript  dataset  next');
  console.log('  -  -----  ----------  -------  ----');
  for (const r of report) {
    const yn = (v) => (v ? ' yes ' : ' NO  ');
    console.log(
      ` ${pad(r.number)}  ${yn(r.hasAudio)}    ${yn(r.hasTranscript)}      ${yn(r.inDataset)}   ${
        r.next === 'done' ? '-' : r.next
      }`,
    );
  }

  if (missing.length === 0) {
    console.log('\nEvery episode in the feed is already in the graph.');
  } else {
    console.log(`\n${missing.length} episode(s) not yet in the graph:`);
    for (const r of missing) console.log(`  Ep. ${r.number} - ${r.title}  (next: ${r.next})`);
  }
}
