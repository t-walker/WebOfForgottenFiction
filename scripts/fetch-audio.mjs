/**
 * Downloads every episode's audio from the podcast RSS feed into audio/.
 * Files are named ep01.mp3 ... epNN.mp3 so they line up with transcripts/.
 *
 * Existing files are skipped, so this is safe to re-run and resumable.
 * The audio/ folder is git-ignored -- it is the hosts' content, kept local
 * only as a source for transcription.
 *
 * Run with: npm run audio:fetch
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { fetchFeed } from './lib/feed.mjs';

const DIR = 'audio';

const pad = (n) => String(n).padStart(2, '0');
const mb = (b) => (b / 1024 / 1024).toFixed(1);

const episodes = await fetchFeed();
mkdirSync(DIR, { recursive: true });

console.log(`${episodes.length} episodes in feed\n`);

let downloaded = 0;
let skipped = 0;

for (const ep of episodes) {
  const file = join(DIR, `ep${pad(ep.number)}.mp3`);

  if (existsSync(file) && statSync(file).size > 0) {
    skipped += 1;
    console.log(`= ep${pad(ep.number)}  already have ${mb(statSync(file).size)} MB`);
    continue;
  }

  const tmp = `${file}.part`;
  process.stdout.write(`> ep${pad(ep.number)}  ${ep.title.slice(0, 45)} ... `);

  try {
    const r = await fetch(ep.url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(tmp));
    await rename(tmp, file);
    downloaded += 1;
    console.log(`${mb(statSync(file).size)} MB`);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    console.log(`FAILED (${err.message})`);
  }
}

console.log(`\naudio: ${downloaded} downloaded, ${skipped} already present in ${DIR}/`);
