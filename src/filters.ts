import type { Dataset, GraphData, GraphLink, GraphNode, NodeType } from './graph';

/**
 * Filter state, grouped by entity type. Each group is a plain lookup of
 * id -> visible so the panel can render checkboxes straight from it.
 */
export interface Filters {
  types: Record<NodeType, boolean>;
  media: Record<string, boolean>;
  status: { featured: boolean; mentioned: boolean };
  hosts: Record<string, boolean>;
  personKinds: { created: boolean; appeared: boolean };
  episodes: Record<string, boolean>;
}

const all = <T extends string>(keys: T[], value = true) =>
  Object.fromEntries(keys.map((k) => [k, value])) as Record<T, boolean>;

export function mediaKinds(data: Dataset): string[] {
  return [...new Set(data.works.map((w) => w.medium))].sort();
}

export function defaultFilters(data: Dataset): Filters {
  return {
    types: { work: true, person: true, host: true, episode: true },
    media: all(mediaKinds(data)),
    status: { featured: true, mentioned: true },
    hosts: all(data.hosts.map((h) => h.id)),
    personKinds: { created: true, appeared: true },
    episodes: all(data.episodes.map((e) => e.id)),
  };
}

const every = (record: Record<string, boolean>) => Object.values(record).every(Boolean);

/** True when nothing is being filtered out, used to show/hide the reset button. */
export function isDefaultFilters(f: Filters): boolean {
  return (
    every(f.types) &&
    every(f.media) &&
    f.status.featured &&
    f.status.mentioned &&
    every(f.hosts) &&
    f.personKinds.created &&
    f.personKinds.appeared &&
    every(f.episodes)
  );
}

const endId = (v: string | GraphNode) => (typeof v === 'object' ? v.id : v);

/**
 * Applies the filters to the full graph.
 *
 * Works are the primary entity, so they are kept even when isolated. People,
 * hosts and episodes only mean something through their connections, so any that
 * end up with no remaining links are dropped rather than left floating.
 */
export function applyFilters(full: GraphData, f: Filters): GraphData {
  const someEpisode = !every(f.episodes);
  const someHost = !every(f.hosts);

  const visible = (n: GraphNode): boolean => {
    if (!f.types[n.type]) return false;

    switch (n.type) {
      case 'work': {
        // Unknown media stay visible rather than silently disappearing.
        if (n.medium && f.media[n.medium] === false) return false;
        if (!(n.featured === false ? f.status.mentioned : f.status.featured)) return false;
        if (someEpisode && !(n.episodeIds ?? []).some((id) => f.episodes[id])) return false;
        // Only constrain by host when the work was actually somebody's pick.
        if (someHost && n.hostIds?.length && !n.hostIds.some((id) => f.hosts[id])) return false;
        return true;
      }
      case 'person':
        return (n.creditKinds ?? []).some((k) => f.personKinds[k]);
      case 'host':
        return f.hosts[n.id.replace(/^host:/, '')] !== false;
      case 'episode':
        return (n.episodeIds ?? []).some((id) => f.episodes[id]);
      default:
        return true;
    }
  };

  const kept = new Map<string, GraphNode>();
  for (const n of full.nodes) if (visible(n)) kept.set(n.id, n);

  const links: GraphLink[] = full.links.filter(
    (l) => kept.has(endId(l.source)) && kept.has(endId(l.target)),
  );

  const connected = new Set<string>();
  for (const l of links) {
    connected.add(endId(l.source));
    connected.add(endId(l.target));
  }

  const nodes = [...kept.values()].filter((n) => n.type === 'work' || connected.has(n.id));

  if (nodes.length === kept.size) return { nodes, links };

  // Pruning orphans can strand links whose other end just went away.
  const survivors = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    links: links.filter((l) => survivors.has(endId(l.source)) && survivors.has(endId(l.target))),
  };
}
