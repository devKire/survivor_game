/** Source coordinates only. These types never grant collision or hazard authority. */
export const GROUND_FAMILIES = [
  "forest",
  "dead",
  "corrupted",
  "rock",
  "sand",
  "swamp",
  "lava",
  "cave",
  "ruins",
] as const;
export const PROP_FAMILIES = [
  "trees_living",
  "trees_dead",
  "trees_petrified",
  "rocks",
  "minerals",
  "crystals",
  "ruins",
  "corruption",
  "beast_damage",
  "swamp",
  "volcano",
  "mines",
  "cave",
] as const;
export type GroundFamily = (typeof GROUND_FAMILIES)[number];
export type PropFamily = (typeof PROP_FAMILIES)[number];
export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TileSlotMetadata {
  id: string;
  index: number;
  row: number;
  column: number;
  rect: TileRect;
  alphaBounds?: TileRect;
  anchor?: { x: number; y: number };
  normalizedAnchor?: { x: number; y: number };
  weight: number;
  tags: string[];
  occlusion: "ground" | "low" | "tall";
  collisionHint: "none";
}
export interface TileAtlasMetadata {
  schemaVersion: 1;
  id: string;
  kind: "ground" | "prop";
  family: string;
  image: string;
  source: { width: number; height: number; sha256: string; hasAlpha: boolean };
  grid: { columns: 8; rows: 8; slots: 64 };
  detection: {
    confidence: number;
    measuredConfidence: number;
    review: string | null;
  };
  slots: TileSlotMetadata[];
  warnings: string[];
}
/** Called once at catalog creation, never in the draw loop. Fail closed to legacy. */
export function validTileMetadata(value: unknown): value is TileAtlasMetadata {
  if (!value || typeof value !== "object") return false;
  const m = value as TileAtlasMetadata;
  if (
    m.schemaVersion !== 1 ||
    !["ground", "prop"].includes(m.kind) ||
    !m.source ||
    !m.grid ||
    m.grid.columns !== 8 ||
    m.grid.rows !== 8 ||
    m.grid.slots !== 64 ||
    !m.detection ||
    !Number.isFinite(m.detection.confidence) ||
    m.detection.confidence < 0.8 ||
    !Array.isArray(m.slots) ||
    m.slots.length !== 64
  )
    return false;
  if (
    !Number.isInteger(m.source.width) ||
    m.source.width < 8 ||
    !Number.isInteger(m.source.height) ||
    m.source.height < 8
  )
    return false;
  const ids = new Set<string>();
  return m.slots.every((s, i) => {
    if (
      !s ||
      s.index !== i ||
      s.row !== Math.floor(i / 8) ||
      s.column !== i % 8 ||
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      !Number.isFinite(s.weight) ||
      s.weight < 0
    )
      return false;
    ids.add(s.id);
    const r = s.rect;
    if (
      !r ||
      ![r.x, r.y, r.width, r.height].every(Number.isInteger) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width <= 0 ||
      r.height <= 0 ||
      r.x + r.width > m.source.width ||
      r.y + r.height > m.source.height
    )
      return false;
    return (
      m.kind === "ground" ||
      !!(
        s.anchor &&
        Number.isFinite(s.anchor.x) &&
        Number.isFinite(s.anchor.y) &&
        s.anchor.x >= 0 &&
        s.anchor.x < r.width &&
        s.anchor.y >= 0 &&
        s.anchor.y < r.height
      )
    );
  });
}
