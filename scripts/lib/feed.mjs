/**
 * Shared parsing of the podcast RSS feed.
 *
 * Every script that needs to know what episodes exist goes through here so
 * there is one definition of "an episode in the feed".
 */

export const FEED_URL = 'https://anchor.fm/s/111b27bec/podcast/rss';

const cdata = (block, tag) =>
  block.match(new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`))?.[1] ??
  block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ??
  '';

/** Strip HTML tags and decode the handful of entities the feed actually uses. */
export function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseFeed(xml) {
  const items = [];

  for (const block of xml.split('<item>').slice(1)) {
    const title = cdata(block, 'title').trim();
    const url = block.match(/<enclosure[^>]*\surl="([^"]+)"/)?.[1];
    const length = Number(block.match(/<enclosure[^>]*\slength="(\d+)"/)?.[1] ?? 0);
    const pubDate = cdata(block, 'pubDate').trim();
    const number = Number(title.match(/Ep\.?\s*(\d+)/i)?.[1]);

    if (!url || !Number.isFinite(number)) continue;

    items.push({
      number,
      title,
      url,
      length,
      date: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : '',
      description: stripHtml(cdata(block, 'description')),
    });
  }

  return items.sort((a, b) => a.number - b.number);
}

export async function fetchFeed() {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const episodes = parseFeed(await res.text());
  if (!episodes.length) throw new Error('No episodes parsed from feed');
  return episodes;
}
