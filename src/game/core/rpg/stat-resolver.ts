import { z } from "zod";
import {
  COMBAT_STAT_KEYS,
  type CombatModifier,
  type CombatStats,
  type CombatStatKey,
} from "./combat-types";

export const RPG_RULESET_VERSION = 1;
// Caps constrain only the RPG contribution. Existing Survivor bonuses are never nerfed.
export const RPG_STAT_CAPS: Readonly<
  Record<CombatStatKey, { ratio: number; extra: number; floor: number }>
> = {
  maxHealth: { ratio: 1.5, extra: 100, floor: 1 },
  speed: { ratio: 1.2, extra: 40, floor: 1 },
  armor: { ratio: Infinity, extra: 3, floor: 0 },
  damage: { ratio: 1.35, extra: Infinity, floor: 0.01 },
  area: { ratio: 1.25, extra: Infinity, floor: 0.01 },
  cooldown: { ratio: 1, extra: 0, floor: 0.3 },
  duration: { ratio: 1.25, extra: Infinity, floor: 0.01 },
  pickupRange: { ratio: 1.25, extra: 30, floor: 1 },
  luck: { ratio: 1.2, extra: Infinity, floor: 0.01 },
  critChance: { ratio: Infinity, extra: 0.1, floor: 0 },
  recovery: { ratio: Infinity, extra: 1, floor: 0 },
};
export const combatModifierSchema = z
  .object({
    sourceId: z.string().min(1).max(200),
    stat: z.enum(COMBAT_STAT_KEYS),
    operation: z.enum(["FLAT", "ADD_PERCENT", "MULTIPLY"]),
    value: z.number().finite(),
  })
  .strict()
  .refine(
    (m) =>
      m.operation === "FLAT"
        ? Math.abs(m.value) <= 100
        : m.operation === "ADD_PERCENT"
          ? Math.abs(m.value) <= 0.5
          : m.value >= 0.5 && m.value <= 1.5,
    "Modificador fora dos limites.",
  );
type Totals = Readonly<{ flat: number; percent: number; multiplier: number }>;
export type CompiledCombatModifiers = Readonly<
  Partial<Record<CombatStatKey, Totals>>
>;

/** Validate once at the loadout boundary; no JSON/schema parsing in the attack loop. */
export function compileCombatModifiers(
  input: readonly CombatModifier[],
): CompiledCombatModifiers {
  const values = z.array(combatModifierSchema).max(64).parse(input);
  values.sort((a, b) => {
    const aa = `${a.stat}:${a.operation}:${a.sourceId}`,
      bb = `${b.stat}:${b.operation}:${b.sourceId}`;
    return aa < bb ? -1 : aa > bb ? 1 : a.value - b.value;
  });
  const result: Partial<
    Record<CombatStatKey, { flat: number; percent: number; multiplier: number }>
  > = {};
  for (const modifier of values) {
    const total = (result[modifier.stat] ??= {
      flat: 0,
      percent: 0,
      multiplier: 1,
    });
    if (modifier.operation === "FLAT") total.flat += modifier.value;
    else if (modifier.operation === "ADD_PERCENT")
      total.percent += modifier.value;
    else total.multiplier *= modifier.value;
  }
  for (const total of Object.values(result)) Object.freeze(total);
  return Object.freeze(result);
}

export function resolveCompiledCombatStats(
  base: CombatStats,
  modifiers: CompiledCombatModifiers,
): CombatStats {
  for (const value of Object.values(base))
    if (!Number.isFinite(value) || Math.abs(value) > 1e9)
      throw new RangeError("Atributo base inválido.");
  if (base.maxHealth <= 0 || base.cooldown <= 0 || base.speed < 0)
    throw new RangeError("Atributo base inválido.");
  const result = { ...base };
  for (const key of COMBAT_STAT_KEYS) {
    const totals = modifiers[key];
    if (!totals) continue; // Exact parity, including preexisting values outside RPG caps.
    const b = base[key],
      cap = RPG_STAT_CAPS[key];
    let upper = Math.min(b * cap.ratio, b + cap.extra);
    if (key === "critChance") upper = Math.min(b + 0.1, Math.max(b, 0.5));
    // 0 * Infinity is NaN: zero-based armor/recovery use the additive cap only.
    if (cap.ratio === Infinity)
      upper = key === "critChance" ? upper : b + cap.extra;
    const lower =
      key === "cooldown"
        ? Math.max(b * 0.8, Math.min(b, cap.floor))
        : Math.min(b, cap.floor);
    const raw =
      (b + totals.flat) * Math.max(0, 1 + totals.percent) * totals.multiplier;
    if (!Number.isFinite(raw))
      throw new RangeError("Modificadores excedem os limites.");
    result[key] = Math.max(lower, Math.min(upper, raw));
    if (key === "maxHealth") result[key] = Math.round(result[key]);
  }
  return result;
}

export function resolveCombatStats(
  base: CombatStats,
  modifiers: readonly CombatModifier[],
  rulesetVersion = RPG_RULESET_VERSION,
) {
  if (rulesetVersion !== RPG_RULESET_VERSION)
    throw new RangeError("Versão de combate RPG indisponível.");
  return resolveCompiledCombatStats(base, compileCombatModifiers(modifiers));
}
