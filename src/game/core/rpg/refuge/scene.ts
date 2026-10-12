import type { RefugeDefinition, RefugePoint, RefugeTarget } from "./types";
export const REFUGE_SPEED = 190;
export const REFUGE_PLAYER_RADIUS = 13;
export function refugeObstacles(scene: RefugeDefinition) {
  return [...scene.structures, ...scene.npcs, ...scene.decorations];
}
export function refugePositionAllowed(
  scene: RefugeDefinition,
  point: RefugePoint,
) {
  const r = REFUGE_PLAYER_RADIUS;
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= r &&
    point.y >= r &&
    point.x <= scene.bounds.width - r &&
    point.y <= scene.bounds.height - r &&
    refugeObstacles(scene).every(
      (o) => Math.hypot(point.x - o.x, point.y - o.y) >= r + o.collisionRadius,
    )
  );
}
/** Local navigation only. No server authorization, combat, saves or rewards. */
export function moveInRefuge(
  scene: RefugeDefinition,
  point: RefugePoint,
  input: RefugePoint,
  delta: number,
): RefugePoint {
  if (![input.x, input.y, delta].every(Number.isFinite)) return point;
  const length = Math.max(1, Math.hypot(input.x, input.y));
  const distance = REFUGE_SPEED * Math.max(0, Math.min(delta, 0.05));
  const dx = (input.x / length) * distance,
    dy = (input.y / length) * distance;
  // Substeps keep even bounded high-delta movement from crossing small obstacles.
  const steps = Math.max(1, Math.ceil(distance / 4));
  let p = { ...point };
  for (let i = 0; i < steps; i++) {
    const x = { ...p, x: p.x + dx / steps };
    if (refugePositionAllowed(scene, x)) p = x;
    const y = { ...p, y: p.y + dy / steps };
    if (refugePositionAllowed(scene, y)) p = y;
  }
  return p;
}
export function refugeTarget(
  scene: RefugeDefinition,
  point: RefugePoint,
): RefugeTarget | undefined {
  return [...scene.structures, ...scene.npcs]
    .filter((t) => Math.hypot(t.x - point.x, t.y - point.y) <= t.radius)
    .sort(
      (a, b) =>
        Math.hypot(a.x - point.x, a.y - point.y) -
          Math.hypot(b.x - point.x, b.y - point.y) || a.id.localeCompare(b.id),
    )[0];
}
export function validateRefuge(scene: RefugeDefinition) {
  const objects = refugeObstacles(scene);
  if (
    scene.version < 1 ||
    new Set(objects.map((o) => o.id)).size !== objects.length ||
    !refugePositionAllowed(scene, scene.spawn)
  )
    throw new Error("Invalid refuge definition");
  for (const o of objects)
    if (
      ![o.x, o.y, o.collisionRadius].every(Number.isFinite) ||
      o.collisionRadius < 0 ||
      o.x < o.collisionRadius ||
      o.y < o.collisionRadius ||
      o.x + o.collisionRadius > scene.bounds.width ||
      o.y + o.collisionRadius > scene.bounds.height
    )
      throw new Error("Invalid refuge geometry");
}
