import type { GraphNode, NodeType } from './graph';

export type Layout = 'hierarchy' | 'web';

/**
 * Column positions for the left-to-right hierarchy, following how the show
 * works: a host picks something for an episode, which surfaces a work and the
 * people behind it.
 *
 * Left-to-right rather than top-down because labels are horizontal text --
 * spreading a tier down a column keeps labels from colliding, and the widest
 * tier (78 people) gets an axis it can grow along instead of fighting for
 * width.
 */
export const TIER_ORDER: NodeType[] = ['host', 'episode', 'work', 'person'];

export const TIER_LABELS: Record<NodeType, string> = {
  host: 'Hosts',
  episode: 'Episodes',
  work: 'Works',
  person: 'People',
};

/** Horizontal gap between adjacent columns, wide enough for a label to sit in. */
const COLUMN_GAP = 400;

/**
 * Places one column per tier that still has nodes, centred on the origin.
 *
 * Computed from what is actually on screen rather than fixed, so hiding a tier
 * closes the gap instead of leaving an empty lane in the middle of the graph.
 */
export function tierColumns(present: Iterable<NodeType>): Partial<Record<NodeType, number>> {
  const shown = new Set(present);
  const tiers = TIER_ORDER.filter((t) => shown.has(t));
  const span = (tiers.length - 1) * COLUMN_GAP;
  return Object.fromEntries(tiers.map((t, i) => [t, i * COLUMN_GAP - span / 2]));
}

/**
 * Pins nodes to their column, or releases them for the free-floating web view.
 *
 * y is deliberately left to the simulation so connected nodes drift level with
 * each other; only the horizontal axis carries meaning.
 */
export function applyLayout(
  nodes: GraphNode[],
  layout: Layout,
  columns: Partial<Record<NodeType, number>>,
): void {
  for (const node of nodes) {
    const x = columns[node.type];
    if (layout === 'hierarchy' && x != null) {
      node.fx = x;
      node.fy = undefined;
    } else {
      node.fx = undefined;
      node.fy = undefined;
    }
  }
}

/**
 * Force tuning per layout. The hierarchy needs stronger repulsion to spread a
 * column vertically, and shorter links so rows settle near what they connect to.
 */
export const FORCE_SETTINGS: Record<Layout, { charge: number; distance: number }> = {
  hierarchy: { charge: -260, distance: 18 },
  web: { charge: -140, distance: 55 },
};

/**
 * How far links bow away from a straight line, as a fraction of their length.
 *
 * Curves matter most in the hierarchy: a node with many neighbours in the next
 * column fans out into a bundle of near-parallel lines, and bowing them apart
 * makes each one traceable to its endpoint. The web view is already spread out,
 * so it only needs enough curve to separate reciprocal pairs.
 */
export const LINK_CURVATURE: Record<Layout, number> = {
  hierarchy: 0.22,
  web: 0.14,
};

/**
 * Point at the middle of a link, following the curve when there is one.
 *
 * force-graph stashes the quadratic bezier's control point on the link as
 * `__controlPoints` while it draws; evaluating B(0.5) puts the label on the
 * line instead of floating inside the arc.
 */
export function linkMidpoint(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  controlPoints: number[] | null | undefined,
): { x: number; y: number } {
  if (controlPoints && controlPoints.length === 2) {
    return {
      x: 0.25 * sx + 0.5 * controlPoints[0] + 0.25 * tx,
      y: 0.25 * sy + 0.5 * controlPoints[1] + 0.25 * ty,
    };
  }
  return { x: (sx + tx) / 2, y: (sy + ty) / 2 };
}
