/**
 * The site's palette, taken from the podcast's cover art: a library due-date
 * card, aged manila paper ruled in faint blue, stamped with a red logo and
 * signed in ballpoint.
 *
 * These values are the single source of truth. The canvas needs them as
 * JavaScript, and the chrome needs them as CSS, so rather than writing each
 * colour twice and letting the two drift, `applyTheme` publishes them as
 * custom properties on :root and the stylesheet reads them from there.
 */

/** Paper, ink and stamp. Everything else is derived from these. */
export const PALETTE = {
  /** The page the graph sits on. Kept bright so the canvas reads as paper. */
  paper: '#faf6ec',
  /** Card stock for the side panels: a shade deeper, so they have an edge. */
  card: '#f2ebda',
  /** A crease rather than a drawn line. */
  edge: '#ddd2bb',
  /** Sunken wells: search box, stat tiles. */
  well: '#e8e0cc',
  /** Typewritten text on the card. */
  ink: '#2f2a23',
  /** Faded carbon copy. Dark enough to clear WCAG AA on the panels. */
  inkSoft: '#6b6046',
  /** The printed rule lines. */
  rule: '#a9bccd',
  /** The logo stamp. The one loud colour, so it stays reserved for accents. */
  stamp: '#c4362a',
} as const;

/**
 * Node colours. All are dark enough to read as marks on paper -- the previous
 * neon set was tuned for a near-black canvas and would wash out entirely.
 *
 * Hues are spread deliberately: red, blue, green, gold, violet and grey stay
 * apart at a glance, which a set of neighbouring earth tones would not.
 */
export const INK_COLORS = {
  /** The two names written in the borrower column. */
  host: PALETTE.stamp,
  /** Ballpoint blue. */
  person: '#3f5a8f',
  /** Date-due column: present but never the point, so it stays neutral. */
  episode: '#6f6355',
  film: '#96700f',
  book: '#2f7a3a',
  tv: '#7a4a99',
  /** Pencil, half-erased: works only mentioned in passing. */
  mentioned: '#a3947a',
} as const;

/** Canvas colours that have no CSS equivalent, kept here for the same reason. */
export const CANVAS = {
  background: PALETTE.paper,
  /** Links fade into the page unless they matter; these are alpha-composited. */
  link: 'rgba(74,92,110,0.30)',
  linkFaint: 'rgba(74,92,110,0.09)',
  linkStrong: 'rgba(47,42,35,0.55)',
  /** Work-to-work relations borrow the stamp so they read as editorial. */
  linkRelation: 'rgba(196,54,42,0.32)',
  /** Labels sit on a scrap of paper so links do not strike through them. */
  labelBackdrop: 'rgba(250,246,236,0.82)',
  labelStrong: 'rgba(47,42,35,0.95)',
  labelSoft: 'rgba(47,42,35,0.6)',
  nodeLabel: 'rgba(47,42,35,0.88)',
  nodeLabelSoft: 'rgba(47,42,35,0.5)',
  /** Ring around the selected node -- ink, since white vanishes on paper. */
  selection: '#2f2a23',
} as const;

/** Custom properties consumed by App.css. */
export const CSS_VARS: Record<string, string> = {
  '--bg': PALETTE.paper,
  '--panel': PALETTE.card,
  '--border': PALETTE.edge,
  '--well': PALETTE.well,
  '--text': PALETTE.ink,
  '--muted': PALETTE.inkSoft,
  '--rule': PALETTE.rule,
  '--accent': PALETTE.stamp,
};

/**
 * Publish the palette to the document. Called at module load rather than from
 * an effect so the first paint is already themed.
 */
export function applyTheme(root: HTMLElement): void {
  for (const [name, value] of Object.entries(CSS_VARS)) root.style.setProperty(name, value);
}
