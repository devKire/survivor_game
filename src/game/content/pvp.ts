import { CHARACTER_DEFINITIONS } from "./catalog";
export const PVP = {
  tickHz: 25,
  snapshotHz: 10,
  hp: 100,
  speed: 220,
  radius: 13,
  roundSeconds: 90,
  reconnectSeconds: 30,
  maxRewindTicks: 4,
  arena: { width: 1000, height: 600 },
  winRounds: 2,
} as const;
export const PVP_LOADOUTS = {
  nara: CHARACTER_DEFINITIONS.nara,
  orin: CHARACTER_DEFINITIONS.orin,
  ivo: CHARACTER_DEFINITIONS.ivo,
  sena: CHARACTER_DEFINITIONS.sena,
} as const;
export type PvpCharacter = keyof typeof PVP_LOADOUTS;
export type PvpAbility = "none" | "basic" | "skill" | "pulse" | "dash";
