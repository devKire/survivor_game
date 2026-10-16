import type { RpgCharacterId } from "../../../content/rpg/catalog";
import type { Vec } from "../../types";

export const WORLD_PROTOCOL = 2;
export const WORLD_ID = "limiar-open-world-v1";
export const WORLD_TICK_HZ = 25;
export const WORLD_SNAPSHOT_HZ = 10;
// Conservative rollout ceiling, independent of the five-member social group.
export const WORLD_ZONE_CAPACITY = 20;
export const WORLD_AOI_RADIUS = 720;
export const WORLD_AOI_CELL = 240;
export const WORLD_INPUT_TIMEOUT = 0.25;
export const WORLD_IDLE_MS = 15 * 60_000;
export type WorldZoneId = "obelisk-refuge" | "ruins-outskirts";
export interface WorldZoneIdentity {
  worldId: typeof WORLD_ID;
  zoneId: WorldZoneId;
  zoneVersion: number;
  instanceId: string;
}
export interface WorldPortal extends Vec {
  id: string;
  name: string;
  radius: number;
  destination: WorldZoneId;
}
export interface WorldZoneDefinition {
  id: WorldZoneId;
  version: 1 | 2;
  name: string;
  safe: boolean;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  spawn: Vec;
  portals: readonly WorldPortal[];
}
export interface WorldPublicPlayer extends Vec {
  id: string;
  name: string;
  character: RpgCharacterId;
  level: number;
  dx: number;
  dy: number;
  moving: boolean;
  attackSequence?: number;
  health: number;
  maxHealth: number;
  connected: boolean;
}
export interface WorldInput {
  epoch: string;
  sequence: number;
  moveX: number;
  moveY: number;
}
