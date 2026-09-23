import { describe, it, expect, vi, afterEach } from "vitest";
import { freshSave, migrateSave, runSchema, saveSchema } from "../src/game/core/save";
import { GameSimulation } from "../src/game/core/simulation";
import { balanceAfter, achievementAmount, achievementCurrency, completionGold } from "../src/game/core/economy";
import { ACHIEVEMENTS } from "../src/game/content/catalog";

afterEach(() => vi.restoreAllMocks());
describe("V24/V25 economy migration and actual PvE sources", () => {
  it.each([1, 2, 3])("migrates save version %i once without losing upgrades or achievements", (version) => {
    const old = { ...freshSave(), economyVersion: 1, version, gold: 683, upgrades: { vitality: 2 }, achievements: ["boss"] };
    const migrated = migrateSave(old);
    expect(migrated).toMatchObject({ gems: 683, gold: 0, upgrades: { vitality: 2 }, achievements: ["boss"], legacyGoldConverted: 683, economyVersion: 2 });
    expect(migrateSave(migrated)).toEqual(migrated);
    expect(old.gold).toBe(683);
  });
  it("preserves a legacy pending chest and run currency", () => {
    const g = new GameSimulation(freshSave()); g.start(); g.saveSnapshot(true);
    const legacy = { ...g.save.activeRun, gems: undefined, gold: 80, completionGold: 70,
      pending: { state: "chest", choices: [{ kind: "bonus", id: "gold", weight: 1 }], pathSelection: false, pendingItem: null,
        chestReward: { kind: "reward", gold: 100, upgrade: null } } };
    expect(runSchema.parse(legacy)).toMatchObject({ gems: 80, completionGems: 70, pending: { choices: [{ kind: "bonus", id: "gems" }], chestReward: { gems: 100 } } });
    const save = migrateSave({ ...freshSave(), activeRun: legacy });
    const restored = new GameSimulation(save); restored.continueRun(); restored.claimChest();
    expect(restored.run.gems).toBe(180);
  });
  it("common enemies and elites drop gems, never gold, independently from XP", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    for (const type of ["husk", "elite"]) {
      const g = new GameSimulation(freshSave()); g.start();
      const e = g.spawnAt(type, 300, 300)!;
      g.damageEnemy(e, 1e8, null);
      expect(g.pickups.some(p => p.type === "gems")).toBe(true);
      expect(g.pickups.some(p => p.type === "gold")).toBe(false);
      expect(g.gems.length).toBeGreaterThan(0); // XP still drops separately.
      expect(g.save.gold).toBe(0);
      const before = g.run.kills;
      g.damageEnemy(e, 1e8, null);
      expect(g.run.kills).toBe(before);
    }
  });
  it("boss chest grants gems once and collection is not an XP multiplier", () => {
    const g = new GameSimulation(freshSave()); g.start();
    g.player.stats.growth = 20;
    const boss = g.spawnAt("boss", 300, 300)!;
    g.damageEnemy(boss, 1e8, null);
    const chest = g.pickups.find(p => p.type === "chest")!;
    expect(chest.value).toBe(100);
    g.openChest(chest); g.claimChest(); g.claimChest();
    expect(g.run.gems).toBe(100);
    expect(g.save.gold).toBe(0);
  });
  it("settles local run once, with gems primary and rare gold only on completion", () => {
    for (const completed of [false, true]) {
      const save = freshSave(); save.achievements = ACHIEVEMENTS.map(a => a.id);
      const g = new GameSimulation(save); g.start(); g.run.gems = 100;
      g.finish(completed);
      expect(save.gems).toBe(completed ? 350 : 100);
      expect(save.gold).toBe(completed ? 6 : 0);
      const before = structuredClone(save); g.finish(completed);
      expect(save).toEqual(before);
    }
  });
  it("does not repay existing achievements and distinguishes rare rewards", () => {
    const g = new GameSimulation(freshSave()); g.start(); g.run.bossKills = 1;
    g.checkAchievements(); g.checkAchievements();
    expect(g.save.gems).toBe(80); expect(g.save.gold).toBe(0);
    expect(achievementCurrency("complete")).toBe("GOLD");
    expect(achievementAmount("complete", 200)).toBe(20);
    expect([600, 900, 1800].map(d => completionGold(true, d))).toEqual([2, 3, 6]);
  });
  it.each([[600, 110, 2], [900, 175, 3], [1800, 250, 6]])("uses duration %i rewards after resume", (duration, gems, gold) => {
    const save = freshSave(); save.achievements = ACHIEVEMENTS.map(a => a.id);
    const g = new GameSimulation(save); g.start("nara", "normal", "ruins", "ECONOMY-RESUME", duration);
    g.saveSnapshot(true);
    const restored = new GameSimulation(migrateSave(JSON.parse(JSON.stringify(save))));
    restored.continueRun(); restored.finish(true);
    expect(restored.save.gems).toBe(gems); expect(restored.save.gold).toBe(gold);
  });
});
describe("V23 bounded currency", () => {
  it.each([NaN, Infinity, -1, 1.2, 1000000001])("rejects invalid balance %s", value => {
    expect(saveSchema.safeParse({ ...freshSave(), gems: value }).success).toBe(false);
    expect(() => balanceAfter(value, 0)).toThrow();
  });
  it("rejects underflow/overflow and preserves legitimate balances", () => {
    expect(() => balanceAfter(10, -11)).toThrow();
    expect(() => balanceAfter(1e9, 1)).toThrow();
    expect(balanceAfter(100, -40)).toBe(60);
  });
});
