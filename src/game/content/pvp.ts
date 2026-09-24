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
export type PvpAbility = "none" | "dash";
export type PvpWeaponBuild = {
  id: string;
  level: number;
  evolved?: boolean;
  path?: string;
  pathLevel?: number;
};
export type PvpCharacterBuild = {
  weapons: PvpWeaponBuild[];
  passives: Record<string, number>;
};

export const PVP_CHARACTER_BUILDS: Record<PvpCharacter, PvpCharacterBuild> = {
  nara: {
    weapons: [
      { id: "ember", level: 1, path: "combustion" },
      { id: "orbit", level: 1, path: "eclipse" },
      { id: "chain", level: 1, path: "conductor" },
    ],
    passives: { might: 1, speed: 1 },
  },
  orin: {
    weapons: [
      { id: "orbit", level: 1, path: "bastion" },
      { id: "well", level: 1, path: "gravity" },
      { id: "frost", level: 1, path: "rime" },
    ],
    passives: { area: 1, recovery: 1 },
  },
  ivo: {
    weapons: [
      { id: "spear", level: 1, path: "impalement" },
      { id: "disc", level: 1, path: "saw" },
      { id: "ember", level: 1, path: "shrapnel" },
    ],
    passives: { amount: 1, might: 1 },
  },
  sena: {
    weapons: [
      { id: "meteor", level: 1, path: "constellation" },
      { id: "chain", level: 1, path: "conductor" },
      { id: "frost", level: 1, path: "rupture" },
    ],
    passives: { might: 1, growth: 1 },
  },
} as const;
