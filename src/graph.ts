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
  /** true = a host's pick for an episode; false = only mentioned in discussion. */
  featured: boolean;
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  date: string;
}

/**
 * Which work came up in which episode. `role` separates the hosts' picks
 * from works that were only mentioned; `pickedByHostId` is null for the latter.
 */
export interface EpisodeWork {
  episodeId: string;
  workId: string;
  pickedByHostId: string | null;
  role: 'featured' | 'mentioned';
  /** Transcript timestamp where the work is named, when known. */
  evidence?: string;
}

/** A person's involvement in a work. */
export interface Credit {
  personId: string;
  workId: string;
  role: string;
  kind: 'created' | 'appeared';
  /** Transcript timestamp where the person is named, when known. */
  evidence?: string;
}

export const RELATION_KINDS = [
  'adapted-from',
  'inspired-by',
  'precursor',
  'successor',
  'similar',
] as const;

export type RelationKind = (typeof RELATION_KINDS)[number];

/** How one work connects to another, read as "<from> <relation> <to>". */
export interface WorkRelation {
  fromWorkId: string;
  toWorkId: string;
  relation: RelationKind;
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
  workRelations: WorkRelation[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  medium?: string;
  year?: number | null;
  notes?: string | null;
  featured?: boolean;
  episodeNumbers?: number[];
  date?: string;
  pickedBy?: string;
  roles?: string[];
  /** Raw ids kept for filtering, so the UI never has to match on labels. */
  hostIds?: string[];
  episodeIds?: string[];
  creditKinds?: ('created' | 'appeared')[];
  degree: number;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: 'picked' | 'featured' | 'mentioned' | 'created' | 'appeared' | RelationKind;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const nodeId = (type: NodeType, id: string) => `${type}:${id}`;

export const RELATION_LABELS: Record<RelationKind, string> = {
  'adapted-from': 'adapted from',
  'inspired-by': 'inspired by',
  precursor: 'precursor',
  successor: 'successor',
  similar: 'similar to',
};

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
    put({
      id: nodeId('person', person.id),
      label: person.name,
      type: 'person',
      roles: [],
      creditKinds: [],
    });
  }

  for (const work of data.works) {
    put({
      id: nodeId('work', work.id),
      label: work.title,
      type: 'work',
      medium: work.medium,
      year: work.year,
      notes: work.notes,
      featured: work.featured,
      episodeNumbers: [],
      episodeIds: [],
      hostIds: [],
    });
  }

  for (const ep of data.episodes) {
    put({
      id: nodeId('episode', ep.id),
      label: `Ep. ${ep.number}`,
      type: 'episode',
      notes: ep.title,
      episodeNumbers: [ep.number],
      episodeIds: [ep.id],
      date: ep.date,
    });
  }

  const hostsById = new Map(data.hosts.map((h) => [h.id, h]));
  const episodesById = new Map(data.episodes.map((e) => [e.id, e]));

  for (const row of data.episodeWorks) {
    const epNode = nodes.get(nodeId('episode', row.episodeId));
    const workNode = nodes.get(nodeId('work', row.workId));
    if (!epNode || !workNode) continue;

    links.push({
      source: epNode.id,
      target: workNode.id,
      kind: row.role,
      label: row.role === 'featured' ? 'featured in' : 'mentioned in',
    });

    const num = episodesById.get(row.episodeId)?.number;
    if (num != null && !workNode.episodeNumbers!.includes(num)) {
      workNode.episodeNumbers!.push(num);
    }
    if (!workNode.episodeIds!.includes(row.episodeId)) {
      workNode.episodeIds!.push(row.episodeId);
    }

    if (row.pickedByHostId) {
      const hostNode = nodes.get(nodeId('host', row.pickedByHostId));
      if (hostNode) {
        links.push({ source: hostNode.id, target: workNode.id, kind: 'picked', label: 'picked' });
        workNode.pickedBy = hostsById.get(row.pickedByHostId)?.name;
        if (!workNode.hostIds!.includes(row.pickedByHostId)) {
          workNode.hostIds!.push(row.pickedByHostId);
        }
      }
    }
  }

  for (const credit of data.credits) {
    const personNode = nodes.get(nodeId('person', credit.personId));
    const workNode = nodes.get(nodeId('work', credit.workId));
    if (!personNode || !workNode) continue;

    if (!personNode.roles!.includes(credit.role)) personNode.roles!.push(credit.role);
    if (!personNode.creditKinds!.includes(credit.kind)) personNode.creditKinds!.push(credit.kind);
    links.push({
      source: personNode.id,
      target: workNode.id,
      kind: credit.kind,
      label: credit.role,
    });
  }

  for (const rel of data.workRelations) {
    const from = nodes.get(nodeId('work', rel.fromWorkId));
    const to = nodes.get(nodeId('work', rel.toWorkId));
    if (!from || !to) continue;
    links.push({
      source: from.id,
      target: to.id,
      kind: rel.relation,
      label: RELATION_LABELS[rel.relation],
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

/** Works that were only mentioned share one muted color so picks stay dominant. */
export const MENTIONED_COLOR = '#6b6580';

export function nodeColor(node: GraphNode): string {
  if (node.type === 'work') {
    if (node.featured === false) return MENTIONED_COLOR;
    if (node.medium && MEDIUM_COLORS[node.medium]) return MEDIUM_COLORS[node.medium];
  }
  return TYPE_COLORS[node.type];
}

const RELATION_SET = new Set<string>(RELATION_KINDS);

export const isRelationLink = (kind: GraphLink['kind']) => RELATION_SET.has(kind);
