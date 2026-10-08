import { describe, expect, it } from "vitest";
import {
  CHARACTER_DEFINITIONS,
  SAVE_SCHEMA,
} from "../src/game/content/catalog";
import { ECONOMY_VERSION } from "../src/game/core/economy";
import { Player } from "../src/game/core/entities";
import { freshSave, migrateSave } from "../src/game/core/save";
import type { RunSnapshot, RunState } from "../src/game/core/types";
import { GameSimulation } from "../src/game/core/simulation";
import {
  allocateAttributePoints,
  initialRpgAttributes,
} from "../src/game/core/rpg";

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
    expect(Object.keys(CHARACTER_DEFINITIONS)).toEqual([
      "nara",
      "orin",
      "ivo",
      "sena",
    ]);
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

  it("preserves run inventory, seed, worldVersion, temporary XP and PvP stats across RPG allocation", () => {
    const game = new GameSimulation(freshSave());
    game.start("nara", "normal", "ruins", "RPG-COMPATIBILITY");
    game.run.worldVersion = 2;
    game.player.level = 7;
    game.player.xp = 42;
    const before = game.serializeRun();
    const pvp = new Player("nara", {}, "PVP");
    const stats = { ...pvp.stats };
    allocateAttributePoints(initialRpgAttributes(100), "power", 99);
    pvp.recalculate();
    expect(game.serializeRun()).toEqual(before);
    expect(before).toMatchObject({
      worldSeed: "RPG-COMPATIBILITY",
      worldVersion: 2,
      level: 7,
      xp: 42,
    });
    expect(before?.inventory).toHaveLength(4);
    expect(pvp.stats).toEqual(stats);
    expect(pvp.level).toBe(1);
    game.saveSnapshot(true);
    const restored = new GameSimulation(
      migrateSave(JSON.parse(JSON.stringify(game.save))),
    );
    restored.continueRun();
    expect(restored.run.worldVersion).toBe(2);
    expect(restored.world.createChunk(-3, 1)).toEqual(
      game.world.createChunk(-3, 1),
    );
  });
});
