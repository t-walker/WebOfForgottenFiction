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
export const TIER_X: Record<NodeType, number> = {
  host: -560,
  episode: -190,
  work: 190,
  person: 620,
};

export const TIER_ORDER: NodeType[] = ['host', 'episode', 'work', 'person'];

export const TIER_LABELS: Record<NodeType, string> = {
  host: 'Hosts',
  episode: 'Episodes',
  work: 'Works',
  person: 'People',
};

/**
 * Pins nodes to their column, or releases them for the free-floating web view.
 *
 * y is deliberately left to the simulation so connected nodes drift level with
 * each other; only the horizontal axis carries meaning.
 */
export function applyLayout(nodes: GraphNode[], layout: Layout): void {
  for (const node of nodes) {
    if (layout === 'hierarchy') {
      node.fx = TIER_X[node.type];
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
