import type { CombatStats, RpgCombatLoadout } from "./combat-types";
import { attributeModifiers, validateCombatLoadout } from "./loadout";
import { resolveCombatStats } from "./stat-resolver";

/** UI and authoritative combat use this same resolver, never React formulas. */
export function previewRpgBuild(base: CombatStats, input: RpgCombatLoadout) {
  const loadout = validateCombatLoadout(input);
  return {
    base: { ...base },
    attributesOnly: resolveCombatStats(
      base,
      attributeModifiers(loadout.attributes),
    ),
    effective: resolveCombatStats(
      base,
      loadout.modifiers,
      loadout.rulesetVersion,
    ),
  };
}
