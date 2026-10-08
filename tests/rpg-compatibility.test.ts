import { describe, expect, it } from "vitest";
import { CHARACTER_DEFINITIONS, SAVE_SCHEMA } from "../src/game/content/catalog";
import { ECONOMY_VERSION } from "../src/game/core/economy";
import { Player } from "../src/game/core/entities";
import { freshSave, migrateSave } from "../src/game/core/save";
import type { RunSnapshot, RunState } from "../src/game/core/types";

describe("RPG additive compatibility baseline", () => {
  it("pins the Survivor save and economy contracts", () => {
    const save = freshSave();
    expect(SAVE_SCHEMA).toBe(3);
    expect(ECONOMY_VERSION).toBe(2);
    expect(save.version).toBe(3);
    expect(save.economyVersion).toBe(2);
    expect(save.gold).toBe(0);
    expect(save.gems).toBe(0);
    expect(save.unlocked).toEqual(["nara"]);
    expect(migrateSave(save)).toEqual(save);
  });

  it("keeps character unlocks authoritative for RPG access", () => {
    expect(Object.keys(CHARACTER_DEFINITIONS)).toEqual(["nara", "orin", "ivo", "sena"]);
    expect(freshSave().unlocked).toEqual(["nara"]);
  });

  it("does not add persistent RPG fields to Survivor runtime contracts", () => {
    const playerKeys = Object.keys(new Player("nara")).sort();
    expect(playerKeys).not.toContain("rpgLevel");
    expect(playerKeys).not.toContain("equipment");
    expect(playerKeys).not.toContain("materials");

    const runtimeOnly: Array<keyof RunState | keyof RunSnapshot> = [
      "level",
      "inventory",
      "worldVersion",
    ];
    expect(runtimeOnly).toEqual(["level", "inventory", "worldVersion"]);
  });
});
