import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import dataset from './data/forgotten-fiction.json';
import {
  buildGraph,
  nodeColor,
  type Dataset,
  type GraphLink,
  type GraphNode,
  type NodeType,
} from './graph';
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
  { color: '#7bd3f7', label: 'Person' },
  { color: '#ff6b6b', label: 'Host' },
  { color: '#9d8df1', label: 'Episode' },
];

const endId = (v: string | GraphNode) => (typeof v === 'object' ? v.id : v);
const linkId = (l: GraphLink) => `${endId(l.source)}->${endId(l.target)}`;

export default function App() {
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState('');
  const [showEpisodes, setShowEpisodes] = useState(true);

  const full = useMemo(() => buildGraph(data), []);

  const graph = useMemo(() => {
    if (showEpisodes) return full;
    const nodes = full.nodes.filter((n) => n.type !== 'episode');
    const keep = new Set(nodes.map((n) => n.id));
    const links = full.links.filter(
      (l) => keep.has(endId(l.source)) && keep.has(endId(l.target)),
    );
    return { nodes, links };
  }, [full, showEpisodes]);

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
    (fg.d3Force('charge') as { strength: (n: number) => void } | undefined)?.strength(-140);
    (fg.d3Force('link') as { distance: (n: number) => void } | undefined)?.distance(55);
  }, [graph]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [query, graph]);

  const neighbors = useMemo(() => {
    if (!selected) return null;
    const ids = new Set<string>([selected.id]);
    const linkIds = new Set<string>();
    for (const l of graph.links) {
      const s = endId(l.source);
      const t = endId(l.target);
      if (s === selected.id || t === selected.id) {
        ids.add(s);
        ids.add(t);
        linkIds.add(linkId(l));
      }
    }
    return { ids, linkIds };
  }, [selected, graph]);

  const connections = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const out: { node: GraphNode; label: string }[] = [];
    for (const l of graph.links) {
      const s = endId(l.source);
      const t = endId(l.target);
      const otherId = s === selected.id ? t : t === selected.id ? s : null;
      if (!otherId) continue;
      const node = byId.get(otherId);
      if (node) out.push({ node, label: l.label ?? l.kind });
    }
    return out;
  }, [selected, graph]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of full.nodes) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [full]);

  const focus = (node: GraphNode) => {
    setSelected(node);
    const fg = fgRef.current;
    if (fg && node.x != null && node.y != null) {
      fg.centerAt(node.x, node.y, 600);
      fg.zoom(3, 600);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>{data.podcast.title}</h1>
          <p className="sub">Every work covered by {data.podcast.hosts.join(' & ')}, as a graph.</p>
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

        <label className="toggle">
          <input
            type="checkbox"
            checked={showEpisodes}
            onChange={(e) => setShowEpisodes(e.target.checked)}
          />
          Show episode nodes
        </label>

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
                ? [selected.medium, selected.year].filter(Boolean).join(' · ')
                : selected.type === 'episode'
                  ? selected.date
                  : selected.roles?.join(', ')}
            </p>
            {selected.notes && <p className="notes">{selected.notes}</p>}
            {selected.pickedBy && (
              <p className="picked">
                Picked by <strong>{selected.pickedBy}</strong>
              </p>
            )}
            <h3>Connections ({connections.length})</h3>
            <ul className="conns">
              {connections.map(({ node, label }) => (
                <li key={node.id + label}>
                  <button onClick={() => focus(node)}>
                    <span className="dot" style={{ background: nodeColor(node) }} />
                    {node.label}
                  </button>
                  <em>{label}</em>
                </li>
              ))}
            </ul>
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
          nodeRelSize={4}
          nodeLabel={(n: GraphNode) => n.label}
          linkColor={(l: GraphLink) =>
            neighbors
              ? neighbors.linkIds.has(linkId(l))
                ? 'rgba(255,255,255,0.55)'
                : 'rgba(255,255,255,0.05)'
              : 'rgba(255,255,255,0.16)'
          }
          linkWidth={(l: GraphLink) => (neighbors && neighbors.linkIds.has(linkId(l)) ? 1.8 : 0.6)}
          onNodeClick={(n: GraphNode) => focus(n)}
          onBackgroundClick={() => setSelected(null)}
          nodeCanvasObject={(n: GraphNode, ctx, scale) => {
            const r = 3 + Math.min(n.degree, 12) * 0.7;
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

            const showLabel = scale > 1.4 || n.type === 'host' || n.degree > 4;
            if (showLabel && !dimmed) {
              const fontSize = Math.max(10 / scale, 2.5);
              ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = 'rgba(255,255,255,0.85)';
              ctx.fillText(n.label, n.x!, n.y! + r + 1);
            }
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(n: GraphNode, color, ctx) => {
            const r = 3 + Math.min(n.degree, 12) * 0.7;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      </div>
    </div>
  );
}
