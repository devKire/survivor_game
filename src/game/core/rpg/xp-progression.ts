import { attributesAtLevel, validateRpgAttributes } from "./attributes";
import { rpgLevelFromXp } from "./rules";
import { RPG_MAX_XP, type RpgAttributeState } from "./types";
import { RPG_EXPEDITION_V1 } from "../../content/rpg/reward-profiles";

/** Saturate explicitly at the XP cap; never duplicate available points. */
export function applyRpgRewardXp(
  state: RpgAttributeState & { xp: number },
  amount: number,
) {
  validateRpgAttributes(state);
  rpgLevelFromXp(state.xp);
  if (
    !Number.isInteger(amount) ||
    amount < 0 ||
    amount > RPG_EXPEDITION_V1.maxXp
  )
    throw new RangeError("XP de recompensa inválido.");
  if (amount === 0)
    return { ...state, attributes: { ...state.attributes }, xpGranted: 0 };
  const xp = Math.min(RPG_MAX_XP, state.xp + amount);
  // Preserve legacy Phase 1/2 characters whose level was provisioned independently
  // of XP. Never lower their level or invalidate distributed points.
  const level = Math.max(state.level, rpgLevelFromXp(xp));
  return { ...attributesAtLevel(state, level), xp, xpGranted: xp - state.xp };
}
