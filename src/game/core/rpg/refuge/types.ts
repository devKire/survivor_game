import type { PropFamily } from "../../../content/tile-types";
export const REFUGE_SERVICES = [
  "CHARACTER",
  "EQUIPMENT",
  "STORAGE",
  "EXPEDITIONS",
  "REWARDS",
  "EXPLORATION",
] as const;
export type RefugeService = (typeof REFUGE_SERVICES)[number];
export interface RefugePoint {
  readonly x: number;
  readonly y: number;
}
export interface RefugeTarget extends RefugePoint {
  readonly id: string;
  readonly name: string;
  readonly radius: number;
  readonly collisionRadius: number;
  readonly service?: RefugeService;
  readonly worldService?: "FORGE" | "REFINEMENT" | "TRADER";
  readonly dialogueId?: string;
  readonly visual:
    | "obelisk"
    | "arsenal"
    | "stash"
    | "board"
    | "portal"
    | "character"
    | "npc"
    | "forge"
    | "refinery";
}
export interface RefugeDialogue {
  readonly id: string;
  readonly lines: readonly string[];
  readonly services: readonly RefugeService[];
}
export interface RefugeDecoration extends RefugePoint {
  readonly id: string;
  readonly family: PropFamily;
  readonly slot: number;
  readonly height: number;
  readonly collisionRadius: number;
}
export interface RefugeDefinition {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly bounds: { readonly width: number; readonly height: number };
  readonly spawn: RefugePoint;
  readonly structures: readonly RefugeTarget[];
  readonly npcs: readonly RefugeTarget[];
  readonly decorations: readonly RefugeDecoration[];
}
