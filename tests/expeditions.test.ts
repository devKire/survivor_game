import { describe, expect, it } from "vitest";
import { CHARACTER_DEFINITIONS, EXPEDITION_LENGTHS, META_DEFINITIONS } from "../src/game/content/catalog";

describe("expedition profiles and data driven balance", () => {
  it("keeps duration curves complete and ordered", () => {
    expect(Object.keys(EXPEDITION_LENGTHS).map(Number)).toEqual([600, 900, 1800]);
    expect(EXPEDITION_LENGTHS[600].rewardMultiplier).toBeLessThan(EXPEDITION_LENGTHS[900].rewardMultiplier);
    expect(EXPEDITION_LENGTHS[900].rewardMultiplier).toBeLessThan(EXPEDITION_LENGTHS[1800].rewardMultiplier);
    for (const profile of Object.values(EXPEDITION_LENGTHS)) {
      expect(profile.bossSchedule.at(-1)).toBeLessThan(profile.duration);
      expect(profile.evolutionTiming).toBeLessThan(profile.finalPhase);
    }
  });
  it("uses audited existing starter weapons without changing character bonuses", () => {
    expect(CHARACTER_DEFINITIONS.orin.weapon).toBe("well");
    expect(CHARACTER_DEFINITIONS.ivo.weapon).toBe("disc");
    expect(CHARACTER_DEFINITIONS.sena.weapon).toBe("chain");
    expect(META_DEFINITIONS.armor.unit).toBe("flat");
    expect(META_DEFINITIONS.recovery.unit).toBe("perSecond");
  });
});
