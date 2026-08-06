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
import { applyFilters, type Filters } from './filters';
import { decodeState, encodeState } from './url';
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

/**
 * The simulation is settled before the first paint instead of being animated
 * into place. Swapping to a focus subgraph restarts d3-force at full alpha, and
 * watching a few hundred ticks of nodes flying around on every click is more
 * distracting than useful. `warmupTicks` runs those ticks up front; the
 * hierarchy then holds still, while the web view keeps a short settle because
 * nothing pins it and it needs to relax into shape.
 */
const MOTION: Record<Layout, { warmup: number; cooldown: number }> = {
  hierarchy: { warmup: 260, cooldown: 0 },
  web: { warmup: 180, cooldown: 40 },
};

const data = dataset as Dataset;

/**
 * Built once at module scope rather than in a memo so the initial state can be
 * read straight out of the URL, which needs to resolve node ids to real nodes
 * before the first render.
 */
const FULL = buildGraph(data);
const NODES_BY_ID = new Map(FULL.nodes.map((n) => [n.id, n]));

const initial = decodeState(window.location.search, data);

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
  const [trail, setTrail] = useState<GraphNode[]>(() =>
    initial.trail.map((id) => NODES_BY_ID.get(id)).filter((n): n is GraphNode => !!n),
  );
  const [query, setQuery] = useState(initial.query);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [layout, setLayout] = useState<Layout>(initial.layout);
  const [showLinkLabels, setShowLinkLabels] = useState(initial.showLinkLabels);
  const [focusSelection, setFocusSelection] = useState(initial.focusSelection);

  const full = FULL;

  /** The trail is a drill-down path; its last entry is what's on screen now. */
  const selected = trail.length ? trail[trail.length - 1] : null;

  /**
   * Walking into a neighbour pushes onto the trail. Revisiting somewhere you
   * have already been rewinds to it instead of growing a loop, so stepping
   * back out through a parent leaves the path you actually took.
   */
  const focus = (node: GraphNode) => {
    setTrail((prev) => {
      const at = prev.findIndex((n) => n.id === node.id);
      return at === -1 ? [...prev, node] : prev.slice(0, at + 1);
    });
  };

  const clearTrail = () => setTrail([]);

  /**
   * Mirror the view into the query string.
   *
   * Moving through the graph pushes a history entry so Back walks the trail,
   * but nudging a filter only replaces it -- toggling a dozen checkboxes should
   * not bury the previous node under a dozen Back presses.
   */
  const trailKey = trail.map((n) => n.id).join(',');
  const lastTrailKey = useRef(trailKey);
  useEffect(() => {
    const search = encodeState({
      trail: trail.map((n) => n.id),
      filters,
      layout,
      focusSelection,
      showLinkLabels,
      query,
    });
    const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (url === window.location.pathname + window.location.search) return;

    if (trailKey === lastTrailKey.current) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    lastTrailKey.current = trailKey;
  }, [trail, trailKey, filters, layout, focusSelection, showLinkLabels, query]);

  // Back/forward hand us a URL, which is the only source of truth for the view.
  useEffect(() => {
    const onPop = () => {
      const next = decodeState(window.location.search, data);
      lastTrailKey.current = next.trail.join(',');
      setTrail(next.trail.map((id) => NODES_BY_ID.get(id)).filter((n): n is GraphNode => !!n));
      setFilters(next.filters);
      setLayout(next.layout);
      setFocusSelection(next.focusSelection);
      setShowLinkLabels(next.showLinkLabels);
      setQuery(next.query);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Escape steps back up one level, matching the breadcrumb, so drilling in
  // deep doesn't mean reaching for the mouse to get back out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement) return;
      setTrail((prev) => prev.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
   *
   * `layout` is read here purely to change this object's identity: force-graph
   * only runs its warmup ticks when graphData changes, so switching views has
   * to hand it a fresh object to settle against the new columns.
   */
  const graph = useMemo(() => {
    void layout;
    if (!selected || !focusSelection || !neighbors) return { ...filtered };
    return {
      nodes: filtered.nodes.filter((n) => neighbors.ids.has(n.id)),
      links: filtered.links.filter((l) => neighbors.linkIds.has(linkId(l))),
    };
  }, [filtered, selected, focusSelection, neighbors, layout]);

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
    // Positions are settled by the warmup, so this only needs to outlast paint.
    const t = setTimeout(() => fgRef.current?.zoomToFit(400, 60), 120);
    return () => clearTimeout(t);
  }, [full, layout, columns]);

  // A filter can hide something on the trail; drop those rather than stranding
  // the panel on a node that is no longer drawn.
  useEffect(() => {
    setTrail((prev) => {
      const visible = new Set(filtered.nodes.map((n) => n.id));
      const next = prev.filter((n) => visible.has(n.id));
      return next.length === prev.length ? prev : next;
    });
  }, [filtered]);

  /**
   * Frame the selection rather than zooming to a fixed level: a host with 18
   * picks needs a much wider view than an actor with one credit.
   */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const ids = neighbors?.ids;
    const t = setTimeout(() => {
      fg.zoomToFit(400, 70, (n: GraphNode) => !ids || ids.has(n.id));
    }, 120);
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

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the URL bar already holds the link.
    }
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

        <button className="share" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link to this view'}
        </button>

        {selected ? (
          <section className="detail">
            <button className="close" onClick={clearTrail}>
              ×
            </button>
            <nav className="trail" aria-label="Path">
              <button onClick={clearTrail}>All</button>
              {trail.map((n, i) => (
                <span key={n.id}>
                  <i className="sep">›</i>
                  {i === trail.length - 1 ? (
                    <strong>{n.label}</strong>
                  ) : (
                    <button onClick={() => focus(n)}>{n.label}</button>
                  )}
                </span>
              ))}
            </nav>
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
          warmupTicks={MOTION[layout].warmup}
          cooldownTicks={MOTION[layout].cooldown}
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
          onBackgroundClick={() => clearTrail()}
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

