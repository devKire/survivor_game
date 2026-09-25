import { CHARACTER_DEFINITIONS, WEAPON_PATHS } from "./catalog";
import { COSMETICS } from "./cosmetics";
import type { SaveData } from "../core/types";
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

const DUEL_BUILDS: Record<PvpCharacter, PvpCharacterBuild> = {
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

const warProfile = (
  starterWeapon: string,
  weapons: string[],
  passives: string[],
) => ({
  starterWeapon,
  weapons,
  passives,
  paths: Object.fromEntries(
    weapons.map((id) => [id, Object.keys(WEAPON_PATHS[id] || {})]),
  ),
});

/** Server-owned competitive profiles. Duel is fixed; War grows from one signature weapon. */
export const PVP_CHARACTER_PROFILES = {
  nara: {
    duel: DUEL_BUILDS.nara,
    war: warProfile("ember", ["ember", "orbit", "chain", "spear"], ["might", "speed", "vitality", "haste", "area", "duration", "amount", "growth", "recovery"]),
  },
  orin: {
    duel: DUEL_BUILDS.orin,
    war: warProfile("orbit", ["orbit", "well", "frost", "disc"], ["area", "recovery", "vitality", "haste", "might", "speed", "duration", "amount", "growth"]),
  },
  ivo: {
    duel: DUEL_BUILDS.ivo,
    war: warProfile("spear", ["spear", "disc", "ember", "chain"], ["amount", "might", "vitality", "haste", "speed", "area", "duration", "growth", "recovery"]),
  },
  sena: {
    duel: DUEL_BUILDS.sena,
    war: warProfile("meteor", ["meteor", "chain", "frost", "well"], ["might", "growth", "vitality", "haste", "area", "duration", "amount", "speed", "recovery"]),
  },
} satisfies Record<PvpCharacter, { duel: PvpCharacterBuild; war: ReturnType<typeof warProfile> }>;

export const PVP_BOT_BUILD_PREFERENCES: Record<PvpCharacter, string[]> = {
  nara: ["passive:might", "weapon-level:ember", "passive:haste", "weapon:orbit"],
  orin: ["passive:area", "weapon-level:orbit", "passive:recovery", "weapon:well"],
  ivo: ["passive:amount", "weapon-level:spear", "passive:might", "weapon:disc"],
  sena: ["passive:growth", "weapon-level:meteor", "passive:might", "weapon:chain"],
};

/** Compatibility export for existing duel presentation/rendering; War never consumes it. */
export const PVP_CHARACTER_BUILDS = Object.fromEntries(
  Object.entries(PVP_CHARACTER_PROFILES).map(([character, profile]) => [character, profile.duel]),
) as Record<PvpCharacter, PvpCharacterBuild>;

/** Resolves only this character's owned, slot-compatible appearance; queue payloads never provide it. */
export function resolvePvpCosmetics(
  save: Pick<SaveData, "pvpCosmetics">,
  character: PvpCharacter,
  owned: ReadonlySet<string>,
) {
  return Object.fromEntries(
    Object.entries(save.pvpCosmetics[character]).filter(([slot, id]) => {
      const cosmetic = COSMETICS[id];
      return owned.has(id) && cosmetic?.type === slot && (!cosmetic.character || cosmetic.character === character);
    }),
  );
}
