/** Manual choices require both earned XP and room to experience the last upgrade. */
export const DECISION_TIMES = [
  30, 65, 105, 150, 200, 250, 300, 350, 405, 465, 530, 600, 675, 750, 830, 915,
  1000, 1090, 1180, 1270, 1360, 1440, 1520, 1600, 1675, 1745,
];
export const PROGRESSION = {
  pathAfter: 360,
  evolutionAfter: 600,
  decisionGap: 30,
  bossRest: 14,
  maxManual: 26,
};
export function xpNeed(level: number) {
  return 20 + level * 5 + Math.floor(level ** 1.55);
}
export interface Telemetry {
  levelUps: number[];
  levels: Record<string, number>;
  firstPath: number | null;
  firstEvolution: number | null;
  bossKills: number[];
  menuSeconds: number;
  structures: number;
  chests: number;
  partySize: number;
  revives: number;
  disconnects: number;
  teamWipes: number;
  networkRtt: number[];
}
export function telemetry(partySize = 1): Telemetry {
  return {
    levelUps: [],
    levels: {},
    firstPath: null,
    firstEvolution: null,
    bossKills: [],
    menuSeconds: 0,
    structures: 0,
    chests: 0,
    partySize,
    revives: 0,
    disconnects: 0,
    teamWipes: 0,
    networkRtt: [],
  };
}
