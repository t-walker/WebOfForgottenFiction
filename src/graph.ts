export type NodeType = 'host' | 'episode' | 'work' | 'person';

/* ------------------------------------------------------------------ *
 * Dataset — normalized, relational shape.
 *
 * Entity tables (hosts, people, works, episodes) each hold a row once,
 * keyed by `id`. Association tables (episodeWorks, credits) carry the
 * relationships by referencing those ids, so a person like Stephen King
 * exists exactly once no matter how many works they touch.
 * ------------------------------------------------------------------ */

export interface Host {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  name: string;
}

export interface Work {
  id: string;
  title: string;
  medium: string;
  year: number | null;
  notes: string | null;
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  date: string;
}

/** Which work was covered in which episode, and which host brought it. */
export interface EpisodeWork {
  episodeId: string;
  workId: string;
  pickedByHostId: string;
}

/** A person's involvement in a work. */
export interface Credit {
  personId: string;
  workId: string;
  role: string;
  kind: 'created' | 'appeared';
}

export interface Dataset {
  podcast: {
    title: string;
    publisher: string;
    appleUrl: string;
    feedUrl: string;
  };
  hosts: Host[];
  people: Person[];
  works: Work[];
  episodes: Episode[];
  episodeWorks: EpisodeWork[];
  credits: Credit[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  medium?: string;
  year?: number | null;
  notes?: string | null;
  episodeNumber?: number;
  date?: string;
  pickedBy?: string;
  roles?: string[];
  degree: number;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: 'picked' | 'featured' | 'created' | 'appeared';
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const nodeId = (type: NodeType, id: string) => `${type}:${id}`;

export function buildGraph(data: Dataset): GraphData {
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const put = (node: Omit<GraphNode, 'degree'>) => {
    const created: GraphNode = { ...node, degree: 0 };
    nodes.set(node.id, created);
    return created;
  };

  for (const host of data.hosts) {
    put({ id: nodeId('host', host.id), label: host.name, type: 'host' });
  }

  for (const person of data.people) {
    put({ id: nodeId('person', person.id), label: person.name, type: 'person', roles: [] });
  }

  for (const work of data.works) {
    put({
      id: nodeId('work', work.id),
      label: work.title,
      type: 'work',
      medium: work.medium,
      year: work.year,
      notes: work.notes,
    });
  }

  for (const ep of data.episodes) {
    put({
      id: nodeId('episode', ep.id),
      label: `Ep. ${ep.number}`,
      type: 'episode',
      notes: ep.title,
      episodeNumber: ep.number,
      date: ep.date,
    });
  }

  const hostsById = new Map(data.hosts.map((h) => [h.id, h]));
  const episodesById = new Map(data.episodes.map((e) => [e.id, e]));

  for (const row of data.episodeWorks) {
    const epNode = nodes.get(nodeId('episode', row.episodeId));
    const workNode = nodes.get(nodeId('work', row.workId));
    const hostNode = nodes.get(nodeId('host', row.pickedByHostId));
    if (!epNode || !workNode || !hostNode) continue;

    links.push({ source: epNode.id, target: workNode.id, kind: 'featured', label: 'featured in' });
    links.push({ source: hostNode.id, target: workNode.id, kind: 'picked', label: 'picked' });

    workNode.pickedBy = hostsById.get(row.pickedByHostId)?.name;
    workNode.episodeNumber = episodesById.get(row.episodeId)?.number;
  }

  for (const credit of data.credits) {
    const personNode = nodes.get(nodeId('person', credit.personId));
    const workNode = nodes.get(nodeId('work', credit.workId));
    if (!personNode || !workNode) continue;

    if (!personNode.roles!.includes(credit.role)) personNode.roles!.push(credit.role);
    links.push({
      source: personNode.id,
      target: workNode.id,
      kind: credit.kind,
      label: credit.role,
    });
  }

  for (const link of links) {
    const s = nodes.get(link.source as string);
    const t = nodes.get(link.target as string);
    if (s) s.degree += 1;
    if (t) t.degree += 1;
  }

  return { nodes: [...nodes.values()], links };
}

export const TYPE_COLORS: Record<NodeType, string> = {
  work: '#f2b134',
  person: '#7bd3f7',
  host: '#ff6b6b',
  episode: '#9d8df1',
};

export const MEDIUM_COLORS: Record<string, string> = {
  Film: '#f2b134',
  Book: '#5ddba2',
  TV: '#f7845d',
};

export function nodeColor(node: GraphNode): string {
  if (node.type === 'work' && node.medium && MEDIUM_COLORS[node.medium]) {
    return MEDIUM_COLORS[node.medium];
  }
  return TYPE_COLORS[node.type];
}
