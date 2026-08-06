import { useState } from 'react';
import type { Dataset, GraphData, NodeType } from './graph';
import { MEDIUM_COLORS, MENTIONED_COLOR, TYPE_COLORS } from './graph';
import { defaultFilters, isDefaultFilters, mediaKinds, type Filters } from './filters';

const TYPE_LABELS: Record<NodeType, string> = {
  work: 'Works',
  person: 'People',
  host: 'Hosts',
  episode: 'Episodes',
};

const TYPE_ORDER: NodeType[] = ['work', 'person', 'host', 'episode'];

interface Props {
  data: Dataset;
  filters: Filters;
  setFilters: (next: Filters) => void;
  visible: GraphData;
  total: GraphData;
}

function Group({
  title,
  count,
  children,
  onAll,
  onNone,
  defaultOpen = true,
}: {
  title: string;
  count?: string;
  children: React.ReactNode;
  onAll?: () => void;
  onNone?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`fgroup${open ? '' : ' closed'}`}>
      <h3>
        <button className="ghead" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="caret">{open ? '▾' : '▸'}</span>
          {title}
          {count && <em>{count}</em>}
        </button>
      </h3>
      {open && (
        <>
          <div className="gbody">{children}</div>
          {(onAll || onNone) && (
            <div className="gactions">
              <button onClick={onAll}>All</button>
              <button onClick={onNone}>None</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Check({
  checked,
  onChange,
  color,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
  label: string;
  hint?: string | number;
}) {
  return (
    <label className="fcheck">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {color && <i className="swatch" style={{ background: color }} />}
      <span className="ftext">{label}</span>
      {hint != null && <em>{hint}</em>}
    </label>
  );
}

export default function FilterPanel({ data, filters, setFilters, visible, total }: Props) {
  const patch = (next: Partial<Filters>) => setFilters({ ...filters, ...next });

  const countBy = (graph: GraphData, type: NodeType) =>
    graph.nodes.filter((n) => n.type === type).length;

  const media = mediaKinds(data);

  const setAll = <K extends keyof Filters>(key: K, value: boolean) => {
    const group = filters[key] as Record<string, boolean>;
    patch({
      [key]: Object.fromEntries(Object.keys(group).map((k) => [k, value])),
    } as unknown as Partial<Filters>);
  };

  // Per-episode work counts give the episode list some weight to sort by eye.
  const worksPerEpisode = new Map<string, number>();
  for (const row of data.episodeWorks) {
    worksPerEpisode.set(row.episodeId, (worksPerEpisode.get(row.episodeId) ?? 0) + 1);
  }

  const dirty = !isDefaultFilters(filters);

  return (
    <aside className="filters">
      <header>
        <h2>Filters</h2>
        {dirty && (
          <button className="reset" onClick={() => setFilters(defaultFilters(data))}>
            Reset
          </button>
        )}
      </header>

      <p className="fsummary">
        Showing <strong>{visible.nodes.length}</strong> of {total.nodes.length} nodes
        {' · '}
        <strong>{visible.links.length}</strong> of {total.links.length} links
      </p>

      <Group
        title="Entities"
        onAll={() => setAll('types', true)}
        onNone={() => setAll('types', false)}
      >
        {TYPE_ORDER.map((t) => (
          <Check
            key={t}
            checked={filters.types[t]}
            onChange={(v) => patch({ types: { ...filters.types, [t]: v } })}
            color={TYPE_COLORS[t]}
            label={TYPE_LABELS[t]}
            hint={`${countBy(visible, t)}/${countBy(total, t)}`}
          />
        ))}
      </Group>

      <Group
        title="Works · medium"
        count={`${countBy(visible, 'work')}/${countBy(total, 'work')}`}
        onAll={() => setAll('media', true)}
        onNone={() => setAll('media', false)}
      >
        {media.map((m) => (
          <Check
            key={m}
            checked={filters.media[m] !== false}
            onChange={(v) => patch({ media: { ...filters.media, [m]: v } })}
            color={MEDIUM_COLORS[m] ?? TYPE_COLORS.work}
            label={m}
            hint={data.works.filter((w) => w.medium === m).length}
          />
        ))}
      </Group>

      <Group title="Works · how they came up">
        <Check
          checked={filters.status.featured}
          onChange={(v) => patch({ status: { ...filters.status, featured: v } })}
          color={TYPE_COLORS.work}
          label="Host picks"
          hint={data.works.filter((w) => w.featured).length}
        />
        <Check
          checked={filters.status.mentioned}
          onChange={(v) => patch({ status: { ...filters.status, mentioned: v } })}
          color={MENTIONED_COLOR}
          label="Mentioned only"
          hint={data.works.filter((w) => !w.featured).length}
        />
      </Group>

      <Group
        title="People · role"
        count={`${countBy(visible, 'person')}/${countBy(total, 'person')}`}
      >
        <Check
          checked={filters.personKinds.created}
          onChange={(v) => patch({ personKinds: { ...filters.personKinds, created: v } })}
          color={TYPE_COLORS.person}
          label="Creators"
          hint={new Set(data.credits.filter((c) => c.kind === 'created').map((c) => c.personId)).size}
        />
        <Check
          checked={filters.personKinds.appeared}
          onChange={(v) => patch({ personKinds: { ...filters.personKinds, appeared: v } })}
          color={TYPE_COLORS.person}
          label="Cast"
          hint={
            new Set(data.credits.filter((c) => c.kind === 'appeared').map((c) => c.personId)).size
          }
        />
      </Group>

      <Group
        title="Hosts · whose pick"
        onAll={() => setAll('hosts', true)}
        onNone={() => setAll('hosts', false)}
      >
        {data.hosts.map((h) => (
          <Check
            key={h.id}
            checked={filters.hosts[h.id]}
            onChange={(v) => patch({ hosts: { ...filters.hosts, [h.id]: v } })}
            color={TYPE_COLORS.host}
            label={h.name}
            hint={data.episodeWorks.filter((e) => e.pickedByHostId === h.id).length}
          />
        ))}
      </Group>

      <Group
        title="Episodes"
        count={`${countBy(visible, 'episode')}/${countBy(total, 'episode')}`}
        defaultOpen={false}
        onAll={() => setAll('episodes', true)}
        onNone={() => setAll('episodes', false)}
      >
        <div className="eplist">
          {data.episodes.map((e) => (
            <Check
              key={e.id}
              checked={filters.episodes[e.id]}
              onChange={(v) => patch({ episodes: { ...filters.episodes, [e.id]: v } })}
              color={TYPE_COLORS.episode}
              label={`${e.number}. ${e.title}`}
              hint={worksPerEpisode.get(e.id) ?? 0}
            />
          ))}
        </div>
      </Group>
    </aside>
  );
}
