export const WAR = {
  width: 2600,
  height: 1400,
  lanes: [250, 700, 1150],
  minionCap: 180,
  waveSeconds: 12,
  coreHp: 2400,
  towerHp: 500,
  interestX: 650,
  interestY: 430,
  maxEnergy: 500,
  maxLevel: 18,
  xpBase: 90,
  xpLinear: 28,
  xpQuadratic: 3,
  xpShareRadius: 420,
  maxWeapons: 3,
  maxWeaponLevel: 5,
  maxPassives: 3,
  maxPassiveLevel: 5,
  pathUnlockWeaponLevel: 3,
  itemSlots: 6,
  shopRadius: 190,
  assistWindow: 12,
  xp: { minion: 24, kill: 180, assist: 90, tower: 110, structure: 65, objective: 100 },
  economy: {
    maxGold: 9999,
    passiveInterval: 10,
    passiveGold: 4,
    minionLastHit: 8,
    kill: 140,
    assist: 65,
    tower: 100,
    structure: 45,
    objective: 85,
    sellRefund: 0.6,
  },
  respawnBaseSeconds: 8,
  respawnStepSeconds: 2,
  respawnScaleSeconds: 120,
} as const;

export function warXpNeed(level: number) {
  return Math.floor(WAR.xpBase + level * WAR.xpLinear + level * level * WAR.xpQuadratic);
}

export type WarRole = "SOLDADO" | "CONSTRUTOR" | "COMANDANTE";
export type TroopType = "SOLDADO" | "TANQUE" | "SUPORTE";
export type GroupOrder =
  | "ATACAR"
  | "DEFENDER"
  | "RECUAR"
  | "FOCAR_TORRE"
  | "FOCAR_BASE";

export interface WarStructure {
  id: string;
  team: number;
  kind: "CORE" | "TORRE" | "BARRICADA";
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  ownerId?: string;
  cooldown: number;
}

export interface WarMinion {
  id: number;
  team: number;
  lane: number;
  kind: TroopType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  cooldown: number;
}

export interface WarItemDefinition {
  id: string;
  name: string;
  description: string;
  glyph: string;
  cost: number;
  stats: {
    damage?: number;
    cooldown?: number;
    maxHealth?: number;
    speed?: number;
    area?: number;
    duration?: number;
    recovery?: number;
  };
}

/** Items exist only in a WarSimulation and are bought with match WarGold. */
export const WAR_ITEM_DEFINITIONS: Record<string, WarItemDefinition> = {
  glass_sigil: { id: "glass_sigil", name: "Selo de Vidro", description: "+8% de dano", glyph: "◆", cost: 220, stats: { damage: 0.08 } },
  broken_hourglass: { id: "broken_hourglass", name: "Ampulheta Rachada", description: "−6% de intervalo entre ataques", glyph: "⌛", cost: 250, stats: { cooldown: -0.06 } },
  living_seed: { id: "living_seed", name: "Semente Viva", description: "+12% de vida máxima", glyph: "♥", cost: 240, stats: { maxHealth: 0.12 } },
  feather_thread: { id: "feather_thread", name: "Fio de Pluma", description: "+5% de movimento", glyph: "»", cost: 190, stats: { speed: 0.05 } },
  moon_compass: { id: "moon_compass", name: "Compasso Lunar", description: "+10% de área", glyph: "◎", cost: 230, stats: { area: 0.1 } },
  amber_moss: { id: "amber_moss", name: "Musgo de Âmbar", description: "+0,35 de recuperação por segundo", glyph: "✚", cost: 210, stats: { recovery: 0.35 } },
  dusk_ribbon: { id: "dusk_ribbon", name: "Fita do Crepúsculo", description: "+12% de duração", glyph: "∞", cost: 200, stats: { duration: 0.12 } },
};

export type WarChoiceKind = "weapon" | "passive" | "path";
export interface WarUpgradeChoice {
  id: string;
  kind: WarChoiceKind;
  name: string;
  description: string;
  weaponId?: string;
  currentLevel?: number;
  nextLevel?: number;
}
export interface WarItemSlot {
  id: string;
}
export interface WarFighterProgress {
  level: number;
  xp: number;
  xpToNextLevel: number;
  pendingUpgrades: number;
  decision: number;
  choices: WarUpgradeChoice[];
  items: WarItemSlot[];
  warGold: number;
  buildRevision: number;
  assists: number;
}

export interface WarView {
  cores: number[];
  energy: number;
  warGold: number;
  role: WarRole;
  level: number;
  xp: number;
  xpToNextLevel: number;
  pendingUpgrades: number;
  decision: number;
  choices: WarUpgradeChoice[];
  weapons: { id: string; level: number; evolved: boolean; path: string | null; pathLevel: number }[];
  passives: Record<string, number>;
  items: WarItemSlot[];
  shopAvailable: boolean;
  respawnIn: number;
  kills: number;
  deaths: number;
  assists: number;
  minions: Pick<
    WarMinion,
    "id" | "team" | "kind" | "x" | "y" | "hp" | "maxHp"
  >[];
  structures: WarStructure[];
  orders: GroupOrder[];
  troops: TroopType[];
  upgrades: number;
  entityCount: number;
  objective: { owner: number | null; capture: number; nextReward: number };
}
