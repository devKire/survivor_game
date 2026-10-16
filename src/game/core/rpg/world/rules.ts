import type { Vec } from "../../types";
import type { WorldInput, WorldZoneDefinition } from "./types";

export function normalizedWorldMove(x: number, y: number): Vec {
  if (![x, y].every(Number.isFinite) || Math.abs(x) > 1 || Math.abs(y) > 1)
    throw new Error("Invalid movement input");
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}
export function acceptWorldInput(
  epoch: string,
  previous: number,
  input: WorldInput,
) {
  return (
    input.epoch === epoch &&
    Number.isSafeInteger(input.sequence) &&
    input.sequence > previous &&
    input.sequence <= 2147483647 &&
    [input.moveX, input.moveY].every(
      (v) => Number.isFinite(v) && Math.abs(v) <= 1,
    )
  );
}
export function clampWorldPosition(
  zone: WorldZoneDefinition,
  point: Vec,
  radius = 13,
): Vec {
  if (![point.x, point.y].every(Number.isFinite)) return { ...zone.spawn };
  return {
    x: Math.max(
      zone.bounds.minX + radius,
      Math.min(zone.bounds.maxX - radius, point.x),
    ),
    y: Math.max(
      zone.bounds.minY + radius,
      Math.min(zone.bounds.maxY - radius, point.y),
    ),
  };
}
export function worldPortal(zone: WorldZoneDefinition, point: Vec, id: string) {
  const portal = zone.portals.find((p) => p.id === id);
  if (
    !portal ||
    Math.hypot(point.x - portal.x, point.y - portal.y) > portal.radius
  )
    throw new Error("Aproxime-se da saída da região.");
  return portal;
}
export function withinWorldInteraction(
  point: Vec,
  target: Vec & { radius: number },
) {
  return (
    [point.x, point.y].every(Number.isFinite) &&
    Math.hypot(point.x - target.x, point.y - target.y) <= target.radius
  );
}
