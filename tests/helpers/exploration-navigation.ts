import type { Structure } from "../../src/game/core/types";
/** Test navigator emits normal INPUT vectors; never writes authoritative positions. */
export function explorationPath(
  start: { x: number; y: number },
  target: { x: number; y: number },
  obstacles: readonly Structure[],
  radius = 45,
) {
  const step = 32,
    key = (x: number, y: number) => `${x},${y}`,
    sx = Math.round(start.x / step),
    sy = Math.round(start.y / step);
  const queue = [{ x: sx, y: sy }],
    seen = new Map<string, string | null>([[key(sx, sy), null]]);
  let end: string | undefined;
  for (let i = 0; i < queue.length && i < 5000; i++) {
    const p = queue[i];
    if (Math.hypot(p.x * step - target.x, p.y * step - target.y) < radius) {
      end = key(p.x, p.y);
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        y = p.y + dy,
        k = key(x, y);
      if (
        seen.has(k) ||
        x * step < -600 ||
        y * step < -600 ||
        x * step > 1240 ||
        y * step > 1240
      )
        continue;
      if (
        obstacles.some(
          (s) => Math.hypot(s.x - x * step, s.y - y * step) < s.r + 23,
        )
      )
        continue;
      seen.set(k, key(p.x, p.y));
      queue.push({ x, y });
    }
  }
  if (!end) throw new Error("No public navigation path");
  const path = [];
  let k: string | null = end;
  while (k) {
    const [x, y] = k.split(",").map(Number);
    path.push({ x: x * step, y: y * step });
    k = seen.get(k) ?? null;
  }
  return path.reverse();
}
