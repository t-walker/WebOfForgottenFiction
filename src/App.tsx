import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import dataset from './data/forgotten-fiction.json';
import {
  buildGraph,
  isRelationLink,
  nodeColor,
  MENTIONED_COLOR,
  type Dataset,
  type GraphLink,
  type GraphNode,
  type NodeType,
} from './graph';
import FilterPanel from './FilterPanel';
import { applyFilters, defaultFilters, type Filters } from './filters';
import {
  applyLayout,
  FORCE_SETTINGS,
  LINK_CURVATURE,
  linkMidpoint,
  TIER_LABELS,
  TIER_ORDER,
  tierColumns,
  type Layout,
} from './layout';
import './App.css';

const data = dataset as Dataset;

const TYPE_LABELS: Record<NodeType, string> = {
  work: 'Works',
  person: 'People',
  host: 'Hosts',
  episode: 'Episodes',
};

const LEGEND: { color: string; label: string }[] = [
  { color: '#f2b134', label: 'Film' },
  { color: '#5ddba2', label: 'Book' },
  { color: '#f7845d', label: 'TV' },
  { color: MENTIONED_COLOR, label: 'Mentioned' },
  { color: '#7bd3f7', label: 'Person' },
  { color: '#ff6b6b', label: 'Host' },
  { color: '#9d8df1', label: 'Episode' },
];

const endId = (v: string | GraphNode) => (typeof v === 'object' ? v.id : v);
const linkId = (l: GraphLink) => `${endId(l.source)}->${endId(l.target)}`;

/** Mentioned-only works render smaller so the hosts' picks stay dominant. */
const nodeRadius = (n: GraphNode) => {
  const base = 3 + Math.min(n.degree, 12) * 0.7;
  return n.featured === false ? base * 0.6 : base;
};

export default function App() {
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(data));
  const [layout, setLayout] = useState<Layout>('hierarchy');
  const [showLinkLabels, setShowLinkLabels] = useState(true);
  const [focusSelection, setFocusSelection] = useState(true);

  const full = useMemo(() => buildGraph(data), []);

  const filtered = useMemo(() => applyFilters(full, filters), [full, filters]);

  const neighbors = useMemo(() => {
    if (!selected) return null;
    const ids = new Set<string>([selected.id]);
    const linkIds = new Set<string>();
    for (const l of filtered.links) {
      const s = endId(l.source);
      const t = endId(l.target);
      if (s === selected.id || t === selected.id) {
        ids.add(s);
        ids.add(t);
        linkIds.add(linkId(l));
      }
    }
    return { ids, linkIds };
  }, [selected, filtered]);

  /**
   * With focus on, selecting a node collapses the canvas to just that node and
   * what it touches. Dimming alone left 150 nodes on screen and the neighbours
   * spread far enough apart to be unreadable.
   */
  const graph = useMemo(() => {
    if (!selected || !focusSelection || !neighbors) return filtered;
    return {
      nodes: filtered.nodes.filter((n) => neighbors.ids.has(n.id)),
      links: filtered.links.filter((l) => neighbors.linkIds.has(linkId(l))),
    };
  }, [filtered, selected, focusSelection, neighbors]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const { charge, distance } = FORCE_SETTINGS[layout];
    (fg.d3Force('charge') as { strength: (n: number) => void } | undefined)?.strength(charge);
    (fg.d3Force('link') as { distance: (n: number) => void } | undefined)?.distance(distance);
  }, [graph, layout]);

  // Columns come from what survives filtering, not the selection, so clicking
  // around doesn't shuffle the whole layout underneath you.
  const columns = useMemo(
    () => tierColumns(filtered.nodes.map((n) => n.type)),
    [filtered],
  );

  // Pinning happens on the shared node objects, so re-apply whenever they change.
  useEffect(() => {
    applyLayout(full.nodes, layout, columns);
    fgRef.current?.d3ReheatSimulation();
    // Switching layout moves everything; frame it once the simulation settles.
    const t = setTimeout(() => fgRef.current?.zoomToFit(700, 60), 1200);
    return () => clearTimeout(t);
  }, [full, layout, columns]);

  // A filter can hide whatever is currently selected; don't strand the panel.
  useEffect(() => {
    if (selected && !filtered.nodes.some((n) => n.id === selected.id)) setSelected(null);
  }, [filtered, selected]);

  /**
   * Frame the selection rather than zooming to a fixed level: a host with 18
   * picks needs a much wider view than an actor with one credit.
   */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const ids = neighbors?.ids;
    const settle = selected && focusSelection ? 550 : 250;
    const t = setTimeout(() => {
      fg.zoomToFit(600, 70, (n: GraphNode) => !ids || ids.has(n.id));
    }, settle);
    return () => clearTimeout(t);
  }, [selected, focusSelection, neighbors]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [query, graph]);

  const connections = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(filtered.nodes.map((n) => [n.id, n]));
    const out: { node: GraphNode; label: string }[] = [];
    for (const l of filtered.links) {
      const s = endId(l.source);
      const t = endId(l.target);
      const otherId = s === selected.id ? t : t === selected.id ? s : null;
      if (!otherId) continue;
      const node = byId.get(otherId);
      if (node) out.push({ node, label: l.label });
    }
    return out;
  }, [selected, filtered]);

  const groupedConnections = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    for (const { node, label } of connections) {
      const bucket = groups.get(label);
      if (bucket) bucket.push(node);
      else groups.set(label, [node]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [connections]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of full.nodes) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [full]);

  const focus = (node: GraphNode) => {
    setSelected(node);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>{data.podcast.title}</h1>
          <p className="sub">
            Every work covered by {data.hosts.map((h) => h.name).join(' & ')}, as a graph.
          </p>
        </header>

        <input
          className="search"
          placeholder="Search works, people, hosts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {query.trim() && (
          <ul className="results">
            {graph.nodes
              .filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))
              .slice(0, 12)
              .map((n) => (
                <li key={n.id}>
                  <button onClick={() => focus(n)}>
                    <span className="dot" style={{ background: nodeColor(n) }} />
                    {n.label}
                    <em>{TYPE_LABELS[n.type].replace(/s$/, '')}</em>
                  </button>
                </li>
              ))}
          </ul>
        )}

        <div className="legend">
          {LEGEND.map((l) => (
            <span key={l.label}>
              <i style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>

        {selected ? (
          <section className="detail">
            <button className="close" onClick={() => setSelected(null)}>
              ×
            </button>
            <h2>{selected.label}</h2>
            <p className="kind">
              {selected.type === 'work'
                ? [
                    selected.medium,
                    selected.year,
                    selected.featured === false ? 'mentioned only' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : selected.type === 'episode'
                  ? selected.date
                  : selected.roles?.join(', ')}
            </p>
            {selected.notes && <p className="notes">{selected.notes}</p>}
            {selected.pickedBy ? (
              <p className="picked">
                Picked by <strong>{selected.pickedBy}</strong>
              </p>
            ) : (
              selected.type === 'work' &&
              selected.episodeNumbers?.length ? (
                <p className="picked">
                  Discussed in{' '}
                  <strong>
                    {selected.episodeNumbers.map((n) => `Ep. ${n}`).join(', ')}
                  </strong>
                </p>
              ) : null
            )}
            <h3>Connections ({connections.length})</h3>
            {groupedConnections.map(([label, nodes]) => (
              <div className="cgroup" key={label}>
                <h4>
                  {label}
                  <em>{nodes.length}</em>
                </h4>
                <ul className="conns">
                  {nodes.map((node) => (
                    <li key={node.id}>
                      <button onClick={() => focus(node)}>
                        <span className="dot" style={{ background: nodeColor(node) }} />
                        {node.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : (
          <section className="stats">
            {(Object.keys(TYPE_LABELS) as NodeType[]).map((t) => (
              <div key={t}>
                <strong>{counts[t] ?? 0}</strong>
                <span>{TYPE_LABELS[t]}</span>
              </div>
            ))}
          </section>
        )}

        <footer>
          <a href={data.podcast.appleUrl} target="_blank" rel="noreferrer">
            Listen on Apple Podcasts →
          </a>
        </footer>
      </aside>

      <div className="canvas" ref={wrapRef}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor="#0e0d14"
          cooldownTicks={200}
          onRenderFramePre={(ctx, scale) => {
            if (layout !== 'hierarchy') return;
            const fg = fgRef.current;
            if (!fg) return;

            // Anchor the column headings to the top of the viewport so they
            // stay visible while scrolling down a long column.
            const topLeft = fg.screen2GraphCoords(0, 0);
            const bottomRight = fg.screen2GraphCoords(size.width, size.height);
            const fontSize = Math.max(11 / scale, 2);

            ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.lineWidth = 0.5 / scale;

            for (const tier of TIER_ORDER) {
              const x = columns[tier];
              if (x == null) continue;
              if (x < topLeft.x - 120 || x > bottomRight.x + 120) continue;

              ctx.strokeStyle = 'rgba(255,255,255,0.05)';
              ctx.beginPath();
              ctx.moveTo(x, topLeft.y);
              ctx.lineTo(x, bottomRight.y);
              ctx.stroke();

              ctx.fillStyle = 'rgba(255,255,255,0.22)';
              ctx.fillText(TIER_LABELS[tier].toUpperCase(), x, topLeft.y + 10 / scale);
            }
          }}
          nodeRelSize={4}
          nodeLabel={(n: GraphNode) => n.label}
          linkColor={(l: GraphLink) =>
            neighbors
              ? neighbors.linkIds.has(linkId(l))
                ? 'rgba(255,255,255,0.55)'
                : 'rgba(255,255,255,0.05)'
              : isRelationLink(l.kind)
                ? 'rgba(242,177,52,0.32)'
                : 'rgba(255,255,255,0.16)'
          }
          linkLineDash={(l: GraphLink) => (isRelationLink(l.kind) ? [3, 2] : null)}
          linkWidth={(l: GraphLink) => (neighbors && neighbors.linkIds.has(linkId(l)) ? 1.8 : 0.6)}
          linkCurvature={LINK_CURVATURE[layout]}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(l: GraphLink, ctx, scale) => {
            if (!showLinkLabels) return;
            const highlighted = !!neighbors && neighbors.linkIds.has(linkId(l));
            // Every label at once is unreadable, so show them on demand:
            // always for the selected node, otherwise only when zoomed in.
            if (!highlighted && (scale < 2.2 || !!neighbors)) return;

            const s = l.source as GraphNode;
            const t = l.target as GraphNode;
            if (s.x == null || t.x == null || s.y == null || t.y == null) return;

            const fontSize = Math.max(9 / scale, 1.5);
            ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
            // A few credits carry long parentheticals; the detail panel has the full text.
            const text = l.label.length > 24 ? `${l.label.slice(0, 23)}…` : l.label;
            const width = ctx.measureText(text).width;
            const { x, y } = linkMidpoint(
              s.x,
              s.y,
              t.x,
              t.y,
              (l as { __controlPoints?: number[] | null }).__controlPoints,
            );

            ctx.fillStyle = 'rgba(14,13,20,0.78)';
            ctx.fillRect(x - width / 2 - 1, y - fontSize * 0.65, width + 2, fontSize * 1.3);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = highlighted ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)';
            ctx.fillText(text, x, y);
          }}
          onNodeClick={(n: GraphNode) => focus(n)}
          onBackgroundClick={() => setSelected(null)}
          nodeCanvasObject={(n: GraphNode, ctx, scale) => {
            const r = nodeRadius(n);
            const dimmed =
              (!!neighbors && !neighbors.ids.has(n.id)) || (!!matches && !matches.has(n.id));

            ctx.globalAlpha = dimmed ? 0.15 : 1;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
            ctx.fillStyle = nodeColor(n);
            ctx.fill();

            if (selected?.id === n.id) {
              ctx.lineWidth = 2 / scale;
              ctx.strokeStyle = '#fff';
              ctx.stroke();
            }

            const showLabel =
              scale > 1.4 || n.type === 'host' || (n.featured !== false && n.degree > 4);
            if (showLabel && !dimmed) {
              const fontSize = Math.max(10 / scale, 2.5);
              ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
              ctx.fillStyle =
                n.featured === false ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)';

              if (layout === 'hierarchy') {
                // Columns stack vertically, so a label underneath would land on
                // the next node down; put it beside instead.
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(n.label, n.x! + r + 2 / scale, n.y!);
              } else {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(n.label, n.x!, n.y! + r + 1);
              }
            }
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(n: GraphNode, color, ctx) => {
            const r = nodeRadius(n);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      </div>

      <FilterPanel
        data={data}
        filters={filters}
        setFilters={setFilters}
        visible={graph}
        total={full}
        layout={layout}
        setLayout={setLayout}
        showLinkLabels={showLinkLabels}
        setShowLinkLabels={setShowLinkLabels}
        focusSelection={focusSelection}
        setFocusSelection={setFocusSelection}
      />
    </div>
  );
}
