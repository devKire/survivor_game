import { afterEach, describe, expect, it, vi } from "vitest";
import { Player } from "../src/game/core/entities";
import { GameSimulation } from "../src/game/core/simulation";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { CHARACTER_DEFINITIONS } from "../src/game/content/catalog";
import {
  allocateAttributePoints,
  createRpgCombatLoadout,
  initialRpgAttributes,
  previewRpgBuild,
  type CombatContext,
} from "../src/game/core/rpg";
import type { RpgCharacterId } from "../src/game/content/rpg/catalog";
import { SnapshotStream } from "../src/realtime/snapshots";
import { snapshotSchema, clientMessage } from "../src/game/network/protocol";
import { arenaCommand } from "../src/game/network/pvp";

const build = (
  characterId: RpgCharacterId = "nara",
  equipped = false,
  empty = false,
) =>
  createRpgCombatLoadout({
    characterId,
    level: 2,
    attributes: empty
      ? initialRpgAttributes(2).attributes
      : allocateAttributePoints(initialRpgAttributes(2), "power", 5).attributes,
    equipment: equipped
      ? [
          {
            id: "private-instance",
            itemId: "blade-weathered",
            rarity: "COMMON",
            level: 1,
            quantity: 1,
            contentVersion: 1,
            rollSeed: null,
            affixes: [],
          },
        ]
      : [],
    profileRevision: 1,
  });
const stats = (player: Player) => ({
  ...player.stats,
  maxHealth: player.maxHealth,
  speed: player.speed,
  armor: player.armor,
});
function combat(context?: CombatContext) {
  let seed = 17;
  vi.spyOn(Math, "random").mockImplementation(() => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return 0.2 + 0.8 * ((seed >>> 0) / 4294967296);
  });
  const game = new GameSimulation(freshSave());
  game.start("nara", "normal", "ruins", "RPG-COMBAT-FIXED", 600, context);
  const enemy = game.spawnAt("husk", 80, 0)!;
  enemy.hp = enemy.maxHp = 1000;
  enemy.speed = 0;
  game.grid.rebuild([enemy]);
  const weapon = game.player.weapons[0];
  weapon.timer = 0;
  weapon.update(game, 0.04); // Real ATTACKS.ember creates the engine projectile.
  for (let i = 0; i < 15; i++) game.updateBullets(0.04); // Actual collision/damage path.
  const result = {
    damage: 1000 - enemy.hp,
    hits: weapon.hits,
    shots: weapon.shots,
    weapon: weapon.id,
    radius: game.player.r,
  };
  vi.restoreAllMocks();
  return result;
}
afterEach(() => vi.restoreAllMocks());

describe("explicit RPG integration in the existing engine", () => {
  it("keeps no-context and empty-loadout combat identical to classic Survivor", () => {
    const classic = combat();
    expect(classic.damage).toBeGreaterThan(0);
    expect(classic.weapon).toBe("ember");
    expect(classic.radius).toBe(13);
    expect(combat({ kind: "SURVIVOR" })).toEqual(classic);
    expect(
      combat({ kind: "RPG_EXPEDITION", loadout: build("nara", false, true) }),
    ).toEqual(classic);
  });
  it("produces modest reproducible differences in real projectile damage for attributes and equipment", () => {
    const a = combat(),
      b = combat({ kind: "RPG_EXPEDITION", loadout: build() }),
      c = combat({ kind: "RPG_EXPEDITION", loadout: build("nara", true) });
    expect(b.damage / a.damage).toBeCloseTo(1.01);
    expect(c.damage / a.damage).toBeCloseTo(1.05);
    expect(c.hits).toBe(a.hits);
    expect(
      combat({ kind: "RPG_EXPEDITION", loadout: build("nara", true) }),
    ).toEqual(c);
  });
  it.each(["nara", "orin", "ivo", "sena"] as const)(
    "preserves %s identity and matches the shared preview after levels/passives/evolution",
    (characterId) => {
      const save = { ...freshSave(), unlocked: [characterId] };
      const classic = new GameSimulation(structuredClone(save)),
        rpg = new GameSimulation(structuredClone(save));
      classic.start(characterId, "normal", "ruins", "same");
      const loadout = build(characterId, true);
      rpg.start(characterId, "normal", "ruins", "same", 600, {
        kind: "RPG_EXPEDITION",
        loadout,
      });
      for (const game of [classic, rpg]) {
        game.player.level = 20;
        game.applyUpgrade({ kind: "passive", id: "might", weight: 1 });
        game.applyUpgrade({ kind: "passive", id: "vitality", weight: 1 });
        game.player.weapons[0].level = 8;
        game.player.weapons[0].evolved = true;
        game.player.recalculate();
        expect(game.player.weapons[0].id).toBe(
          CHARACTER_DEFINITIONS[characterId].weapon,
        );
      }
      expect(stats(rpg.player)).toEqual(
        previewRpgBuild(stats(classic.player), loadout).effective,
      );
      const once = stats(rpg.player),
        weaponOnce = rpg.player.weapons[0].values(rpg.player);
      for (let i = 0; i < 10; i++) rpg.player.recalculate();
      expect(stats(rpg.player)).toEqual(once);
      expect(rpg.player.weapons[0].values(rpg.player)).toEqual(weaponOnce);
      expect(rpg.player.r).toBe(classic.player.r);
      expect(rpg.player.level).toBe(20);
    },
  );
  it("adjusts current health once, never heals by repeatedly recalculating", () => {
    const loadout = createRpgCombatLoadout({
      characterId: "nara",
      level: 2,
      profileRevision: 1,
      attributes: allocateAttributePoints(
        initialRpgAttributes(2),
        "vitality",
        5,
      ).attributes,
      equipment: [],
    });
    const p = new Player("nara", {}, "PVE", {
      kind: "RPG_EXPEDITION",
      loadout,
    });
    p.health = 60;
    const before = p.maxHealth;
    p.passives.vitality = 1;
    p.recalculate();
    expect(p.health).toBe(60 + p.maxHealth - before);
    const after = p.health;
    for (let i = 0; i < 5; i++) p.recalculate();
    expect(p.health).toBe(after);
  });
  it("does not serialize, save or settle RPG runs into Survivor and clears context on restart", () => {
    const save = freshSave(),
      persist = vi.fn(() => true),
      game = new GameSimulation(save, persist);
    const before = structuredClone(save);
    game.start("nara", "normal", "ruins", "same", 600, {
      kind: "RPG_EXPEDITION",
      loadout: build("nara", true),
    });
    expect(game.serializeRun()).toBeNull();
    expect(game.saveSnapshot(true)).toBe(false);
    game.run.kills = 9999;
    game.run.gems = 9999;
    game.finish(true);
    expect(save).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
    game.start("nara", "normal", "ruins", "same");
    expect(game.isRpgExpedition).toBe(false);
    expect(stats(game.player)).toEqual(stats(new Player("nara")));
    expect(game.serializeRun()).not.toBeNull();
    expect(
      () =>
        new Player("ivo", {}, "PVE", {
          kind: "RPG_EXPEDITION",
          loadout: build(),
        }),
    ).toThrow();
  });
  it("rejects RPG context in PvP and forged loadouts in public protocols", () => {
    expect(
      () =>
        new Player("nara", {}, "PVP", {
          kind: "RPG_EXPEDITION",
          loadout: build("nara", true),
        }),
    ).toThrow("PvP");
    expect(new Player("nara", {}, "PVP").stats).toEqual(
      new Player("nara", { might: 5 }, "PVP").stats,
    );
    expect(
      clientMessage.safeParse({ type: "START", loadout: build() }).success,
    ).toBe(false);
    expect(
      clientMessage.safeParse({
        type: "CONFIG",
        mode: "normal",
        combatContext: "RPG_EXPEDITION",
      }).success,
    ).toBe(false);
    expect(
      arenaCommand.safeParse({
        type: "ARENA_QUEUE",
        character: "nara",
        mode: "DUEL_RANKED",
        loadout: build(),
      }).success,
    ).toBe(false);
  });
  it("keeps per-member builds and reconnect state without transmitting equipment metadata", () => {
    const loadouts = { a: build("nara", true), b: build("ivo", false, true) };
    const players = [
      { id: "a", name: "A", character: "nara", progress: freshSave() },
      { id: "b", name: "B", character: "ivo", progress: freshSave() },
    ];
    const game = new CoopSimulation(players, "normal", "ruins", "same", 600, {
      kind: "RPG_EXPEDITION",
      loadouts,
    });
    const a = game.members.get("a")!,
      b = game.members.get("b")!;
    expect(a.player.stats.damage).toBe(1.05);
    expect(b.player.stats.damage).toBe(1);
    expect(b.player.stats.amount).toBe(1);
    const player = a.player;
    game.disconnect("a");
    expect(game.reconnect("a")).toBe(true);
    expect(game.members.get("a")!.player).toBe(player);
    for (const member of [a, b]) {
      const snapshot = new SnapshotStream().build(game, member, 1, true);
      expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(snapshot.own.stats).toEqual(member.player.stats);
      expect(JSON.stringify(snapshot)).not.toMatch(
        /private-instance|affixes|rollSeed|profileRevision/,
      );
    }
    expect(
      () =>
        new CoopSimulation(players, "normal", "ruins", "same", 600, {
          kind: "RPG_EXPEDITION",
          loadouts: { a: loadouts.a },
        }),
    ).toThrow();
    expect(
      () =>
        new CoopSimulation(players, "normal", "ruins", "same", 600, {
          kind: "RPG_EXPEDITION",
          loadouts: { a: loadouts.b, b: loadouts.a },
        }),
    ).toThrow();
  });
});
