import { describe, expect, it } from "vitest";
import { accessibleRpgCharacters, canAccessRpgCharacter, rpgLevelFromXp, xpForRpgLevel } from "../src/game/core/rpg";

describe("RPG pure rules", () => {
  it("derives access only from current Survivor unlocks", () => {
    expect(accessibleRpgCharacters(["nara", "unknown", "ivo"])).toEqual(["nara", "ivo"]);
    expect(canAccessRpgCharacter("ivo", ["nara"])).toBe(false);
    expect(canAccessRpgCharacter("ivo", ["nara", "ivo"])).toBe(true);
  });

  it("keeps persistent character progression separate and bounded", () => {
    expect(xpForRpgLevel(1)).toBe(100);
    expect(rpgLevelFromXp(0)).toBe(1);
    expect(rpgLevelFromXp(100)).toBe(2);
    expect(() => rpgLevelFromXp(-1)).toThrow("XP RPG");
    expect(() => xpForRpgLevel(101)).toThrow("Nível RPG");
  });
});
