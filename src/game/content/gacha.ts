import { z } from "zod";
import { RARITIES } from "./cosmetics";
export const ECHO_BANNER = {
  id: "echoes-permanent-v1",
  name: "Ecos do Limiar · Memórias do Obelisco",
  weights: [6000, 2500, 1000, 400, 100],
  gold: 100,
  gems: 1000,
  duplicateFragments: [5, 15, 40, 100, 250],
} as const;
export interface Pity {
  rare: number;
  epic: number;
  legendary: number;
}
export function pityFloor(p: Pity) {
  return p.legendary >= 99 ? 3 : p.epic >= 49 ? 2 : p.rare >= 9 ? 1 : 0;
}
export function effectiveOdds(p: Pity) {
  const odds: number[] = [...ECHO_BANNER.weights];
  const floor = pityFloor(p);
  for (let i = 0; i < floor; i++) {
    odds[floor] += odds[i];
    odds[i] = 0;
  }
  return odds.map((n) => n / 100);
}
export function rollEcho(sample: number, p: Pity) {
  if (!Number.isInteger(sample) || sample < 0 || sample >= 10000)
    throw new Error("RNG inválido");
  let index = 0,
    total = ECHO_BANNER.weights[0] as number;
  while (sample >= total && index < 4) total += ECHO_BANNER.weights[++index];
  const natural = index;
  index = Math.max(index, pityFloor(p));
  return {
    rarity: RARITIES[index],
    index,
    pityActivated: index > natural,
    pity: {
      rare: index >= 1 ? 0 : p.rare + 1,
      epic: index >= 2 ? 0 : p.epic + 1,
      legendary: index >= 3 ? 0 : p.legendary + 1,
    },
  };
}

export const echoResults = z.array(
  z.object({
    cosmeticId: z.string(),
    rarity: z.string(),
    duplicate: z.boolean(),
    fragments: z.number(),
    pityActivated: z.boolean(),
  }),
);
export type EchoResult = z.infer<typeof echoResults>[number];
