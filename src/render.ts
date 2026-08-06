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
