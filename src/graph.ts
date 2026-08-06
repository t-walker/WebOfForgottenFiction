export type NodeType = 'host' | 'episode' | 'work' | 'person';

export interface PersonRef {
  name: string;
  role: string;
}

export interface Work {
  id: string;
  title: string;
  medium: string;
  year?: number;
  pickedBy: string;
  creators: PersonRef[];
  people: PersonRef[];
  notes?: string;
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  date: string;
  works: Work[];
}

export interface Dataset {
  podcast: {
    title: string;
    publisher: string;
    hosts: string[];
    appleUrl: string;
    feedUrl: string;
  };
  episodes: Episode[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  medium?: string;
  year?: number;
  notes?: string;
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
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function buildGraph(data: Dataset): GraphData {
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const addNode = (node: Omit<GraphNode, 'degree'>) => {
    const existing = nodes.get(node.id);
    if (existing) return existing;
    const created: GraphNode = { ...node, degree: 0 };
    nodes.set(node.id, created);
    return created;
  };

  const addPerson = (name: string, role: string) => {
    const id = `person:${slug(name)}`;
    const node = addNode({ id, label: name, type: 'person', roles: [] });
    if (!node.roles!.includes(role)) node.roles!.push(role);
    return node;
  };

  for (const host of data.podcast.hosts) {
    addNode({ id: `host:${slug(host)}`, label: host, type: 'host' });
  }

  for (const ep of data.episodes) {
    const epId = `episode:${ep.id}`;
    addNode({
      id: epId,
      label: `Ep. ${ep.number}`,
      type: 'episode',
      notes: ep.title,
      episodeNumber: ep.number,
      date: ep.date,
    });

    for (const work of ep.works) {
      const workId = `work:${work.id}`;
      addNode({
        id: workId,
        label: work.title,
        type: 'work',
        medium: work.medium,
        year: work.year,
        notes: work.notes,
        pickedBy: work.pickedBy,
        episodeNumber: ep.number,
      });

      links.push({ source: epId, target: workId, kind: 'featured', label: 'featured' });

      const hostId = `host:${slug(work.pickedBy)}`;
      if (nodes.has(hostId)) {
        links.push({ source: hostId, target: workId, kind: 'picked', label: 'picked' });
      }

      for (const creator of work.creators) {
        const person = addPerson(creator.name, creator.role);
        links.push({ source: person.id, target: workId, kind: 'created', label: creator.role });
      }

      for (const person of work.people) {
        const p = addPerson(person.name, person.role);
        links.push({ source: p.id, target: workId, kind: 'appeared', label: person.role });
      }
    }
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
