import type { Vec, Structure } from "../core/types";
import { STRUCTURE_DEFINITIONS } from "../content/catalog";
export function predictMove(
  position: Vec,
  move: Vec,
  speed: number,
  dt: number,
  structures: Structure[],
): Vec {
  const magnitude = Math.max(1, Math.hypot(move.x, move.y));
  let x = position.x + (move.x / magnitude) * speed * dt,
    y = position.y + (move.y / magnitude) * speed * dt;
  for (const s of structures) {
    if (s.destroyed || !STRUCTURE_DEFINITIONS[s.type]?.collidable) continue;
    const dx = x - s.x,
      dy = y - s.y,
      d = Math.hypot(dx, dy) || 0.001,
      min = 13 + s.r;
    if (d < min) {
      x = s.x + (dx / d) * min;
      y = s.y + (dy / d) * min;
    }
  }
  return { x, y };
}
export const lerp = (a: number, b: number, t: number) =>
  a + (b - a) * Math.max(0, Math.min(1, t));
