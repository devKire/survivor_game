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
} as const;
export type WarRole = "SOLDADO" | "CONSTRUTOR" | "COMANDANTE";
export type TroopType = "SOLDADO" | "TANQUE" | "SUPORTE";
export type GroupOrder =
  "ATACAR" | "DEFENDER" | "RECUAR" | "FOCAR_TORRE" | "FOCAR_BASE";
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
export interface WarView {
  cores: number[];
  energy: number;
  role: WarRole;
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
