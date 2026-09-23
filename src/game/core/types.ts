import type { Telemetry } from "./progression";
import type { Weapon } from "./entities";
export interface Vec {
  x: number;
  y: number;
}
export interface WeaponDefinition {
  name: string;
  icon: string;
  color: string;
  type: string;
  damage: number;
  cooldown: number;
  weight: number;
  passive: string;
  evolution: string;
  description: string;
  evolvedDescription: string;
}
export interface PassiveDefinition {
  name: string;
  icon: string;
  max: number;
  weight: number;
  text: string;
}
export interface CharacterDefinition {
  name: string;
  title: string;
  weapon: string;
  icon: string;
  color: string;
  bonus: string;
  condition: string;
}
export interface EnemyDefinition {
  name: string;
  hp: number;
  speed: number;
  damage: number;
  r: number;
  xp: number;
  color: string;
  shape: number;
  behavior: string;
  resist: number;
}
export interface WaveDefinition {
  start: number;
  end: number;
  rate: number;
  cap: number;
  enemies: [string, number][];
  elite: number;
  formation: string;
  name: string;
}
export interface BossEvent {
  at: number;
  name: string;
  pattern: string;
  eventIndex?: number | null;
  endless?: boolean;
}
export interface ModeDefinition {
  name: string;
  label: string;
  summary: string;
  hud: string;
  duration: number | null;
  endless: boolean;
  clockRate: number;
  savesProgress: boolean;
  xpMultiplier: number;
  hpMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
  spawnMultiplier: number;
  enemyCapMultiplier: number;
  eliteFrequency: number;
  eliteHpMultiplier: number;
  eliteDamageMultiplier: number;
  bossHpMultiplier: number;
  bossDamageMultiplier: number;
  bossAttackRate: number;
  formationSizeMultiplier: number;
  formationIntervalMultiplier: number;
  gemDropMultiplier: number;
  rewardMultiplier: number;
  completionBase: number;
  endlessStart: number;
  bossInterval: number;
  bossEscortAfter: number;
  doubleBossAfter: number;
  post30: Record<string, number>;
}
export interface ExpeditionProfile {
  duration: number;
  rewardMultiplier: number;
  completionBase: number;
  decisionSchedule: number[];
  bossSchedule: number[];
  pathTiming: number;
  evolutionTiming: number;
  waveCompression: number;
  finalPhase: number;
}
export interface MetaDefinition {
  name: string;
  text: string;
  base: number;
  perLevel: number;
  unit: "percent" | "flat" | "perSecond";
}
export interface ItemDefinition {
  id?: string;
  name: string;
  icon: string;
  rarity: string;
  maxStack: number;
  weight: number;
  text: string;
  use: string;
}
export interface StructureDefinition {
  name: string;
  kind: string;
  r: number;
  hp?: number;
  weight: number;
  destructible?: boolean;
  interactive?: boolean;
  collidable?: boolean;
  hazard?: boolean;
  rare?: boolean;
  color: string;
}
export interface MapDefinition {
  name: string;
  icon: string;
  unlocked: boolean;
  description: string;
  floor: string;
  water: boolean;
  structureDensity: number;
  terrainDensity: number;
  palette: Record<string, string>;
  structures: string[];
  enemyPool: string[];
  bosses: number[];
  hazards: string[];
  waveModifiers: { rate: number; hp: number; elite: number };
}
export interface PathDefinition {
  name: string;
  text: string;
  mods: Record<string, number>;
}
export interface StatusDefinition {
  maxStacks: number;
  color: string;
  tick?: number;
}
export interface AchievementContext {
  run: RunState;
  player: { level: number };
}
export interface AchievementDefinition {
  id: string;
  name: string;
  text: string;
  character?: string;
  modes?: string[];
  reward?: number;
  check: (g: AchievementContext) => boolean;
}
export interface Stats {
  damage: number;
  area: number;
  cooldown: number;
  duration: number;
  amount: number;
  pickupRange: number;
  growth: number;
  luck: number;
  critChance: number;
  recovery: number;
}
export interface WeaponValues {
  damage: number;
  cooldown: number;
  area: number;
  amount: number;
  duration: number;
  mods: Record<string, number>;
}
export interface Status {
  duration: number;
  magnitude: number;
  stacks: number;
  source: Weapon | null;
  tick: number;
}
export interface Enemy extends EnemyDefinition, Vec {
  lastHitWeapon?: string;
  lastHitOwner?: string;
  type: string;
  id: number;
  maxHp: number;
  pattern: string;
  bossEventIndex: number | null;
  dead: boolean;
  kx: number;
  ky: number;
  flash: number;
  attack: number;
  wind: number;
  charge: number;
  aimX: number;
  aimY: number;
  bossPhase: number;
  phase: number;
  statuses: Record<string, Status>;
  burrow: number;
  shield: number;
  buffAura: number;
  specialClock: number;
  riftSource?: string;
}
export interface Structure extends Vec {
  id: string;
  type: string;
  r: number;
  hp: number;
  maxHp: number;
  used: boolean;
  destroyed: boolean;
  opened: boolean;
  angle: number;
  variant: number;
}
export type StructureChange = Partial<
  Pick<Structure, "used" | "destroyed" | "opened" | "hp">
>;
export interface Chunk {
  cx: number;
  cy: number;
  key: string;
  structures: Structure[];
}
export interface Bullet extends Vec {
  id?: number;
  hitIds: Set<number>;
  px: number;
  py: number;
  vx: number;
  vy: number;
  originX: number;
  originY: number;
  r: number;
  life: number;
  age: number;
  damage: number;
  pierce: number;
  source: Weapon | null;
  enemy: boolean;
  color: string;
  kind: string;
  returned: boolean;
  knock: number;
  blast: number;
}
export interface Particle extends Vec {
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
}
export interface FloatText extends Vec {
  text: string;
  color: string;
  size: number;
  life: number;
}
export interface Line extends Vec {
  kind: string;
  r?: number;
  tx?: number;
  ty?: number;
  color: string;
  life: number;
  max: number;
}
export interface Area extends Vec {
  r: number;
  damage: number;
  w: Weapon | null;
  life: number;
  delay: number;
  kind: string;
  tick: number;
  armed: boolean;
  enemy: boolean;
}
export interface Pickup extends Vec {
  ownerId?: string;
  id?: number;
  type: string;
  value: number;
  life: number;
  itemId?: string;
  worldReward?: boolean;
}
export interface Gem extends Vec {
  value: number;
  key: string;
  magnet: boolean;
}
export interface InventorySlot {
  id: string;
  qty: number;
}
export interface Upgrade {
  kind: "weapon" | "passive" | "path" | "bonus";
  id: string;
  weaponId?: string;
  weight: number;
  name?: string;
}
export type ChestReward =
  | { kind: "evolution"; id: string; gems: number; upgrade?: never }
  | { kind: "reward"; upgrade: Upgrade | null; gems: number; id?: never };
export interface Settings {
  volume: number;
  sounds: boolean;
  mute: boolean;
  shake: boolean;
  numbers: boolean;
  particles: "auto" | "low" | "high" | "off";
}
export interface SaveData {
  version: number;
  gameVersion: string;
  economyVersion: number;
  gold: number;
  gems: number;
  legacyGoldConverted?: number;
  cosmetics: Record<string,string>;
  upgrades: Record<string, number>;
  unlocked: string[];
  achievements: string[];
  discovered: Record<string, string[]>;
  selected: string;
  selectedMap: string;
  selectedExpeditionLength: number;
  tutorial: boolean;
  highScore: number;
  bestTime: number;
  bestKills: number;
  runs: number;
  completed: number;
  activeRun: RunSnapshot | null;
  settings: Settings;
}
export interface RunState {
  telemetry?: Telemetry;
  manualDecisions?: number;
  lastDecisionAt?: number;
  restUntil?: number;
  schemaVersion: number;
  gameVersion: string;
  time: number;
  simTime: number;
  kills: number;
  gems: number;
  totalDamage: number;
  bossKills: number;
  evolutions: number;
  completed: boolean;
  settled: boolean;
  completionGems: number | null;
  mapId: string;
  expeditionLength: number;
  worldSeed: string;
  worldVersion?: number;
  worldChanges: Record<string, StructureChange>;
  inventory: (InventorySlot | null)[];
  rerolls: number;
  banishments: number;
  skips: number;
  banned: string[];
  structuresBroken: number;
  urnsBroken: number;
  structuresUsed: number;
  itemsUsed: number;
  synergies: string[];
  usedExchange: boolean;
  phase3BossKills: number;
  event: string | null;
  eventTime: number;
  silenceTime: number;
  surgeTime: number;
  endlessAnnounced: boolean;
  autosave: number;
  bossHistory: number[];
  nextMapEvent?: number;
  silenceAfter?: number;
  riftPending?: { id: string; count: number; x: number; y: number } | null;
  abandoned?: boolean;
  bonus?: number;
  difficultyBonus?: number;
  score?: number;
}
export interface WeaponSnapshot {
  id: string;
  level: number;
  evolved: boolean;
  path: string | null;
  pathLevel: number;
  damageDealt: number;
  kills: number;
  shots: number;
  hits: number;
  timer: number;
}
export interface DirectorState {
  index: number;
  spawnClock: number;
  eliteClock: number;
  formationClock: number;
  eventIndex: number;
  nextEndlessBossAt: number;
  endlessBossIndex: number;
}
export type EnemySnapshot = Partial<Omit<Enemy, "statuses">> & {
  statuses?: Record<
    string,
    Omit<Status, "source"> & { sourceId: string | null }
  >;
};
export interface RunSnapshot
  extends Omit<RunState, "settled" | "autosave">, Vec {
  mode: string;
  character: string;
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  weapons: WeaponSnapshot[];
  passives: Record<string, number>;
  pending?: {
    state: string;
    choices: Upgrade[];
    pathSelection: boolean;
    chestReward: ChestReward | null;
    pendingItem: InventorySlot | null;
  };
  director: DirectorState;
  enemies: EnemySnapshot[];
  pickups: Pickup[];
}
export interface GameInput {
  moveX: number;
  moveY: number;
  sequence: number;
  interact: boolean;
}
export interface InputPort {
  clear(): void;
  vector(): Vec;
  touch: {
    active: boolean;
    id: number | null;
    x: number;
    y: number;
    dx: number;
    dy: number;
  };
}
export interface SoundPort {
  play(type: string): void;
  unlock(): void;
}
export interface UiPort {
  main(): void;
  hide(): void;
  hud(visible: boolean): void;
  updateHUD(): void;
  pause(): void;
  toast(title: string, sub: string): void;
  itemOverflow(): void;
  structureInteraction(s: Structure): void;
  levelup(): void;
  goal(): void;
  chest(): void;
  result(): void;
}
