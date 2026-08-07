/**
 * Fuzzy matching for the transcript audit.
 *
 * Whisper spells unfamiliar names by ear: Dekker becomes "Decker", Janssen
 * "Jenssen", Maus "Mouse", Vampyre "Vampire", Polidori "Poledori". A literal
 * search therefore reports names as unspoken when they were said perfectly
 * clearly, which is worse than useless for a provenance check -- it invites
 * deleting true rows.
 *
 * Kept apart from the scanner so it can be tested without running a scan.
 */

/** Loose match: case/punctuation insensitive, tolerates "the" and subtitles. */
export function normalize(text) {
  return text
    .normalize('NFD')
    // Fold accents rather than dropping them: "José" became "jos", which is
    // short enough to be discarded as a stopword, leaving "Rivera" to be
    // fuzzy-matched alone against "river".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Butt-Head" vs "Butthead": compare with all spacing removed too. */
export const compact = (text) => text.replace(/[^a-z0-9]/g, '');

export function searchTerms(title) {
  const terms = new Set([title]);
  terms.add(title.replace(/^(the|a|an)\s+/i, ''));
  const colon = title.split(/[:(]/)[0].trim();
  if (colon.length > 4) terms.add(colon);
  return [...terms].map(normalize).filter((t) => t.length > 3);
}

/** Surnames are how people are usually referenced out loud. */
export function nameTerms(name) {
  const parts = normalize(name).split(/\s+/);
  const last = parts[parts.length - 1];
  const terms = [normalize(name)];
  if (last.length > 4) terms.push(last);
  return terms;
}

const SOUNDEX_CODES = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
};

/**
 * Silent initial clusters, as in Metaphone. "Feiffer" is said, and transcribed,
 * as "Pfeiffer"; soundex keeps the first letter verbatim and so calls them
 * different names.
 */
const INITIAL_CLUSTERS = [
  [/^pf/, 'f'], [/^kn/, 'n'], [/^gn/, 'n'], [/^pn/, 'n'],
  [/^wr/, 'r'], [/^ps/, 's'], [/^x/, 's'], [/^wh/, 'w'], [/^ae/, 'e'],
];

export function soundex(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  for (const [pattern, replacement] of INITIAL_CLUSTERS) w = w.replace(pattern, replacement);
  if (!w) return '';
  let out = w[0].toUpperCase();
  let prev = SOUNDEX_CODES[w[0]] ?? '';
  for (const ch of w.slice(1)) {
    const code = SOUNDEX_CODES[ch] ?? '';
    // h and w are transparent: they do not break a run of like-sounding letters.
    if (code && code !== prev) out += code;
    if (ch !== 'h' && ch !== 'w') prev = code;
    if (out.length === 4) break;
  }
  return out.padEnd(4, '0');
}

/** Levenshtein, used only to reject soundex collisions. */
export function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Words carrying the identity of a title or name; "the", "of", "a" do not. */
export const contentWords = (term) => term.split(' ').filter((w) => w.length >= 4);

/**
 * Function words that must never be swallowed into a joined run. Without this,
 * any short word adjacent to another becomes raw material for a false match:
 * "rest" + "on" builds Reston, "river" + "at" builds Rivera.
 */
const JOINABLE_NEVER = new Set([
  'the', 'and', 'but', 'for', 'nor', 'yet', 'was', 'were', 'are', 'his', 'her',
  'its', 'our', 'out', 'off', 'not', 'had', 'has', 'you', 'she', 'him', 'they',
  'them', 'that', 'this', 'with', 'from', 'into', 'onto', 'over', 'than', 'then',
  'when', 'what', 'were', 'been', 'have', 'just', 'like', 'very', 'some', 'more',
]);

/** Strip the possessive so "Decker's" still reads as "Decker". */
const bare = (word) => word.replace(/['\u2019]s$/, '').replace(/[^a-z]/g, '');

/**
 * Sounds the same and is spelled close enough. Both tests are needed: soundex
 * alone lets Gaines match Goines, edit distance alone lets Maus match House.
 *
 * Deliberately generous -- "Maus"/"Mouse" differ by two edits -- because a
 * missed name is worse than a flagged one. Every phonetic hit is reported with
 * its quote for review, and findHits only ever applies this to a full name or
 * title, never a bare surname.
 */
export function soundsLike(a, b) {
  const [x, y] = [bare(a), bare(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  if (soundex(x) !== soundex(y)) return false;
  return editDistance(x, y) <= Math.max(1, Math.ceil(Math.max(x.length, y.length) / 4));
}

/**
 * Match across a sliding 3-line window so phrases split by segments still hit.
 *
 * Two passes: an exact one, then a phonetic one that records how the name was
 * actually transcribed. The distinction matters -- an exact hit is evidence,
 * a phonetic hit is evidence plus a spelling to eyeball.
 */
export function findHits(segments, terms) {
  const hits = [];
  const add = (segment, term, heard) => {
    if (hits.some((h) => h.time === segment.time)) return;
    hits.push({ time: segment.time, text: segment.text, term, heard });
  };
  const wordsOf = (window) => window.flatMap((s) => s.norm.split(' ').filter(Boolean));

  /**
   * Exact, but respecting word boundaries. Comparing against the window with
   * all spacing stripped -- the obvious way to let "Butt-Head" match
   * "Butthead" -- also lets "Rivera" match the "river at" in "down to the
   * river at night", which silently invents evidence for a credit. Joining a
   * run of whole words instead keeps the convenience without the accident.
   */
  const exactAt = (words, term) => {
    const want = term.split(' ');
    const squashed = compact(term);
    // A function word that the term itself contains is fair game -- the "and"
    // in "Beavis and Butt-Head" has to be joined to reach "Beavis and Butthead".
    const own = new Set(want);
    for (let i = 0; i < words.length; i += 1) {
      if (words.slice(i, i + want.length).join(' ') === term) return words.slice(i, i + want.length);
      for (let n = 1; n <= want.length + 2 && i + n <= words.length; n += 1) {
        const run = words.slice(i, i + n);
        // Joining words is how "Savage Land" reaches Savageland and "Butt-Head"
        // reaches Butthead. Requiring every joined word to carry meaning is what
        // stops "the rest on" reaching Reston and "river at" reaching Rivera.
        if (n > 1 && run.some((w) => !own.has(w) && (w.length < 3 || JOINABLE_NEVER.has(w)))) continue;
        if (compact(run.join('')) === squashed) return run;
      }
    }
    return null;
  };

  for (let i = 0; i < segments.length; i += 1) {
    const window = segments.slice(i, i + 3);
    const words = wordsOf(window);
    let matched = null;
    const term = terms.find((t) => (matched = exactAt(words, t)));
    if (!term) continue;
    const line = window.find((s) => matched.every((w) => s.norm.includes(w))) ?? window[0];
    add(line, term, null);
  }

  // Whisper capitalises proper nouns. That is a cheap, strong signal for
  // separating a real phonetic rendering from a coincidence: "Mouse" for Maus
  // is capitalised, the "mass" in "mass extinction" is not.
  const capitalsIn = (window) => {
    const caps = new Set();
    for (const s of window) {
      for (const m of s.text.match(/\b[A-Z][A-Za-z'\u2019-]*/g) ?? []) {
        const w = normalize(m);
        if (w) caps.add(w);
      }
    }
    return caps;
  };

  // Only the full name or title is matched by sound. A bare surname is far
  // too easy to hit by accident -- "Frost" against "first", "Lynch" against
  // "lunch", "Rivera" against "river" -- and would silently manufacture
  // evidence. Requiring "Mark Frost" makes an accident vanishingly unlikely.
  const phoneticPass = (requireCapitals) => {
    const full = terms.slice(0, 1);
    for (let i = 0; i < segments.length && !hits.length; i += 1) {
      const window = segments.slice(i, i + 3);
      const words = wordsOf(window);
      const caps = requireCapitals ? capitalsIn(window) : null;
      for (const term of full) {
        const wanted = contentWords(term);
        if (!wanted.length) continue;
        // Words must appear in order and close together, not merely somewhere in
        // the window, or "Fred" and "Decker" match across unrelated sentences.
        let at = -1;
        const heard = [];
        const ok = wanted.every((want) => {
          const found = words.findIndex(
            (w, k) =>
              k > at &&
              (at < 0 || k <= at + 3) &&
              (!caps || caps.has(bare(w)) || caps.has(w)) &&
              soundsLike(want, w),
          );
          if (found < 0) return false;
          at = found;
          heard.push(words[found]);
          return true;
        });
        if (!ok) continue;
        const line = window.find((s) => heard.every((h) => s.norm.includes(h))) ?? window[0];
        add(line, term, heard.join(' '));
        break;
      }
    }
  };

  if (!hits.length) phoneticPass(true);
  if (!hits.length) phoneticPass(false);

  hits.sort((a, b) => a.time.localeCompare(b.time));
  // Collapse repeats: one hit per minute is plenty of evidence.
  return hits.filter(
    (hit, idx) => idx === 0 || hit.time.slice(0, 5) !== hits[idx - 1].time.slice(0, 5),
  );
}
