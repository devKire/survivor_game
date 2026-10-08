import { assetUrl } from "./character-art";
import { TILE_SOURCES } from "./tile-sources.generated";
import {
  validTileMetadata,
  type TileAtlasMetadata,
  type GroundFamily,
  type PropFamily,
} from "../content/tile-types";
export interface TileAtlas {
  url: string;
  metadata: TileAtlasMetadata;
  usableSlots: readonly number[];
}
const byId = new Map<string, TileAtlas>(),
  families = new Map<string, TileAtlas[]>();
for (const { image, metadata } of TILE_SOURCES) {
  if (!validTileMetadata(metadata)) {
    if (process.env.NODE_ENV === "development")
      console.warn("[tiles] Invalid metadata; legacy fallback", metadata.id);
    continue;
  }
  const atlas = {
    url: assetUrl(image),
    metadata,
    usableSlots: metadata.slots.filter((s) => s.weight > 0).map((s) => s.index),
  };
  if (!atlas.usableSlots.length) continue;
  byId.set(metadata.id, atlas);
  const key = `${metadata.kind}:${metadata.family}`;
  const group = families.get(key) ?? [];
  group.push(atlas);
  families.set(key, group);
}
export const TILE_ATLASES: readonly TileAtlas[] = [...byId.values()];
export const resolveTileAtlas = (id: string) => byId.get(id);
function resolve(kind: string, family: string, variant: number) {
  const all = families.get(`${kind}:${family}`);
  return all?.[Math.abs(variant >>> 0) % all.length];
}
export const resolveGroundAtlas = (family: GroundFamily, variant = 0) =>
  resolve("ground", family, variant);
export const resolvePropAtlas = (family: PropFamily, variant = 0) =>
  resolve("prop", family, variant);
export function resolveTileSlot(atlas: TileAtlas, index: number) {
  const slot = atlas.metadata.slots[index];
  if (!slot) return undefined;
  return slot.weight > 0
    ? slot
    : atlas.metadata.slots[atlas.usableSlots[index % atlas.usableSlots.length]];
}
