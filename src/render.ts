/**
 * Rendering knobs for the force graph.
 *
 * This was once a layout module that pinned nodes into left-to-right tiers
 * (hosts, episodes, works, people). The columns read as a rigid org chart and
 * buried the thing worth seeing -- which works share people -- so the graph is
 * now free-floating and this file is only about how links are drawn.
 */

/** Force tuning. Loose enough that clusters separate without flying apart. */
export const FORCE_SETTINGS = { charge: -140, distance: 55 };

/**
 * How far links bow away from a straight line, as a fraction of their length.
 * Curved links stay traceable where a dozen of them leave the same node.
 */
export const LINK_CURVATURE = 0.14;

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

/** Where the camera should sit, and how far in. */
export interface Camera {
  x: number;
  y: number;
  k: number;
}

/**
 * Work out a single camera position that frames `nodes`.
 *
 * The library's own `zoomToFit` cannot be capped: it commits to a zoom level
 * and animates there, so capping afterwards means a second, contrary move --
 * the view lunges in and then falls back out. Computing the target up front
 * means one move, in one direction.
 *
 * Zoom is capped because a selection is often one or two nodes, and fitting
 * those to the canvas magnifies them into meaningless blobs.
 */
export function frame(
  nodes: { x?: number; y?: number }[],
  size: { width: number; height: number },
  opts: { padding: number; maxZoom: number; minZoom?: number; nodeRadius?: number },
): Camera | null {
  const placed = nodes.filter(
    (n): n is { x: number; y: number } => Number.isFinite(n.x) && Number.isFinite(n.y),
  );
  if (!placed.length || size.width <= 0 || size.height <= 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of placed) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  // Fitting the centre points alone clips the outermost nodes by their own
  // radius. Grow the box in graph units, which scale with the zoom exactly as
  // the circles do; the pixel padding is then free to cover the labels.
  const r = opts.nodeRadius ?? 0;
  minX -= r;
  maxX += r;
  minY -= r;
  maxY += r;

  const available = {
    width: Math.max(size.width - opts.padding * 2, 1),
    height: Math.max(size.height - opts.padding * 2, 1),
  };
  const span = { width: maxX - minX, height: maxY - minY };

  // A single node has no span, so nothing constrains the zoom but the cap.
  const fit = Math.min(
    span.width > 0 ? available.width / span.width : Infinity,
    span.height > 0 ? available.height / span.height : Infinity,
  );

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    k: Math.max(Math.min(fit, opts.maxZoom), opts.minZoom ?? 0.05),
  };
}
