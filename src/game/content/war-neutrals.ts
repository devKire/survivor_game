import { WAR } from "./war";
export const WAR_NEUTRAL_CAMPS = [0, 1]
  .flatMap((side) =>
    [0, 1].map((row) => ({
      id: `camp:${side}:${row}`,
      x: side === 0 ? WAR.width * 0.3 : WAR.width * 0.7,
      y:
        row === 0
          ? (WAR.lanes[0] + WAR.lanes[1]) / 2
          : (WAR.lanes[1] + WAR.lanes[2]) / 2,
      enemyTypes: row === 0 ? ["husk", "husk", "dart"] : ["tank", "husk"],
      respawn: 45,
      leashRadius: 240,
      reward: { xp: 40, warGold: 20, energy: 0 },
      boss: false,
    })),
  )
  .concat(
    [0, 1].map((row) => ({
      id: `boss:${row}`,
      x: WAR.center.x,
      y:
        row === 0
          ? (WAR.lanes[0] + WAR.lanes[1]) / 2
          : (WAR.lanes[1] + WAR.lanes[2]) / 2,
      enemyTypes: ["boss"],
      respawn: 150,
      leashRadius: 300,
      reward: { xp: 220, warGold: 140, energy: 40 },
      boss: true,
    })),
  );
export interface WarNeutralView {
  id: number;
  campId: string;
  type: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  wind: number;
  charge: number;
  aimX: number;
  aimY: number;
  bossPhase: number;
}
