export const RANKS = [
  { name: "FERRO", min: 0 },
  { name: "BRONZE", min: 800 },
  { name: "PRATA", min: 1000 },
  { name: "OURO", min: 1200 },
  { name: "PLATINA", min: 1400 },
  { name: "DIAMANTE", min: 1600 },
  { name: "OBELISCO", min: 1800 },
  { name: "LIMIAR", min: 2000 },
] as const;
export function rankOf(mmr: number) {
  return [...RANKS].reverse().find((r) => mmr >= r.min) || RANKS[0];
}
export function eloChange(own: number, opponent: number, result: number) {
  return Math.round(32 * (result - 1 / (1 + 10 ** ((opponent - own) / 400))));
}
export function queueRange(seconds: number) {
  return Math.min(500, 100 + Math.floor(seconds / 30) * 50);
}
