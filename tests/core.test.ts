import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { GameSimulation } from "../src/game/core/simulation";
import { freshSave, migrateSave } from "../src/game/core/save";
import { World } from "../src/game/core/world";
import * as C from "../src/game/content/catalog";
describe("V1 baseline preservation", () => {
  it("retains original bytes", () => {
    expect(
      createHash("sha256")
        .update(readFileSync("baseline/v1.3.0/game.js"))
        .digest("hex"),
    ).toBe("9b941168cbe3fa740f88a10523a1fee80cc8f125074cedd990a5bcfe8216e991");
  });
  it("preserves the complete content catalog", () => {
    expect(Object.keys(C.WEAPON_DEFINITIONS)).toHaveLength(8);
    expect(Object.keys(C.CHARACTER_DEFINITIONS)).toHaveLength(4);
    expect(Object.values(C.WEAPON_PATHS).flatMap(Object.keys)).toHaveLength(24);
    expect(C.ACHIEVEMENTS).toHaveLength(13);
    expect(Object.keys(C.MAP_DEFINITIONS)).toEqual(["ruins", "gardens"]);
  });
  it("migrates a legacy save without losing progress", () => {
    const old = {
      ...freshSave(),
      version: 1,
      gold: 560,
      upgrades: { might: 3 },
      unlocked: ["nara", "orin"],
    };
    expect(migrateSave(old)).toMatchObject({
      version: 3,
      gold: 560,
      upgrades: { might: 3 },
      unlocked: ["nara", "orin"],
    });
  });
});
describe("V2 shared headless core", () => {
  it("runs without browser globals and moves at the original speed", () => {
    expect(typeof window).toBe("undefined");
    const g = new GameSimulation(freshSave());
    g.start("nara", "normal", "ruins", "CORE-TEST");
    g.input.vector = () => ({ x: 1, y: 0 });
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    expect(g.player.x).toBeCloseTo(214.5, 1);
    expect(g.run.time).toBeCloseTo(1);
  });
  it("generates identical chunks independent of load order", () => {
    const g = new GameSimulation(freshSave());
    g.start("nara", "normal", "gardens", "TEST-SEED");
    const a = new World(g, "gardens", "TEST-SEED");
    const b = new World(g, "gardens", "TEST-SEED");
    a.createChunk(20, 50);
    expect(a.createChunk(-1, 3)).toEqual(b.createChunk(-1, 3));
  });
  it("keeps all weapon strategies usable", () => {
    for (const character of Object.keys(C.CHARACTER_DEFINITIONS)) {
      const save = freshSave();
      save.unlocked = Object.keys(C.CHARACTER_DEFINITIONS);
      const g = new GameSimulation(save);
      g.start(character, "normal", "ruins", "ATTACK-TEST");
      g.debug.god = true;
      g.spawnAt("tank", 100, 0);
      for (let i = 0; i < 180; i++) g.update(1 / 60);
      expect(g.run.totalDamage).toBeGreaterThan(0);
    }
  });
});
describe("V15 resume preserves decisions and weapon status sources", () => {
  it("restores the pending choices after saving on level up", () => {
    const save = freshSave(),
      g = new GameSimulation(save);
    g.start("nara", "normal", "ruins", "PENDING-TEST");
    g.run.time = 40;
    g.player.xp = 999;
    g.maybeLevelUp();
    expect(g.state).toBe("levelup");
    g.saveSnapshot(true);
    const restored = new GameSimulation(
      migrateSave(JSON.parse(JSON.stringify(save))),
    );
    restored.continueRun();
    expect(restored.state).toBe("levelup");
    expect(restored.choices).toEqual(g.choices);
    expect(restored.player.level).toBe(g.player.level);
  });
  it("rehydrates status source as a real weapon", async () => {
    const { applyStatus } = await import("../src/game/core/status");
    const save = freshSave(),
      g = new GameSimulation(save);
    g.start("nara", "normal", "ruins", "STATUS-TEST");
    const enemy = g.spawnAt("tank", 400, 0)!;
    applyStatus(enemy, "burn", 3, 1, g.player.weapons[0]);
    g.saveSnapshot(true);
    const h = new GameSimulation(migrateSave(JSON.parse(JSON.stringify(save))));
    h.continueRun();
    expect(typeof h.enemies[0].statuses.burn.source?.values).toBe("function");
  });
});

describe("Save and progression regressions", () => {
  it("keeps fractional weapon damage and legacy progress when a run is invalid", () => {
    const save = freshSave(),
      g = new GameSimulation(save);
    g.start("nara", "normal", "ruins", "SAVE-DAMAGE");
    g.player.weapons[0].damageDealt = 12.75;
    g.saveSnapshot(true);
    const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
    expect(loaded.activeRun?.weapons[0].damageDealt).toBe(12.75);
    const partial = migrateSave({
      ...save,
      gold: 120,
      activeRun: { corrupt: true },
    });
    expect(partial.gold).toBe(120);
    expect(partial.activeRun).toBeNull();
  });
  it("enforces path/evolution windows and three ordinary options", () => {
    const g = new GameSimulation(freshSave());
    g.start();
    g.player.weapons[0].level = 8;
    g.player.passives.might = 2;
    g.run.time = 359;
    expect(g.candidates().some((c) => c.kind === "path")).toBe(false);
    expect(g.eligibleEvolution()).toBeUndefined();
    g.run.time = 405;
    expect(g.rollChoices()).toHaveLength(3);
    expect(g.rollChoices().some((c) => c.kind === "path")).toBe(true);
  });
  it("preserves every weapon strategy and the three boss phases", async () => {
    const { Weapon } = await import("../src/game/core/entities");
    for (const id of Object.keys(C.WEAPON_DEFINITIONS)) {
      const g = new GameSimulation(freshSave());
      g.start();
      g.player.weapons = [new Weapon(id)];
      g.player.invulnerable = 20;
      g.spawnAt("tank", 80, 0);
      for (let i = 0; i < 100; i++) g.update(0.04);
      expect(g.run.totalDamage, id).toBeGreaterThan(0);
    }
    const g = new GameSimulation(freshSave());
    g.start();
    const boss = g.spawnAt("boss", 400, 0)!;
    boss.hp = boss.maxHp * 0.59;
    g.updateBossPhase(boss);
    expect(boss.bossPhase).toBe(2);
    boss.hp = boss.maxHp * 0.29;
    g.updateBossPhase(boss);
    expect(boss.bossPhase).toBe(3);
  });
});

it("V1 legacy world keeps original deterministic chunk layouts across another save", () => {
  const expected = JSON.parse(readFileSync("tests/legacy-chunks.json", "utf8"));
  const g = new GameSimulation(freshSave());
  g.start("nara", "normal", "ruins", "LEGACY-WORLD");
  g.run.worldVersion = 2;
  expect(
    Array.from({ length: 6 }, (_, i) => g.world.createChunk(i - 3, 1)),
  ).toEqual(expected);
  g.saveSnapshot(true);
  const restored = new GameSimulation(
    migrateSave(JSON.parse(JSON.stringify(g.save))),
  );
  restored.continueRun();
  expect(restored.run.worldVersion).toBe(2);
  expect(restored.world.createChunk(-3, 1)).toEqual(expected[0]);
});
