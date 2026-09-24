import { describe, it, expect } from "vitest";
import { selectMatch, type QueueEntry } from "../src/game/core/matchmaking";
import { MATCHMAKING_CONFIG as CONFIG } from "../src/game/content/matchmaking";
import { PvpSimulation, type FighterSeed } from "../src/game/core/pvp";
import { WarSimulation } from "../src/game/core/war";
import { GameSimulation } from "../src/game/core/simulation";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import {
  MAP_DEFINITIONS,
  STRUCTURE_DEFINITIONS,
} from "../src/game/content/catalog";
import { arenaSnapshotSchema } from "../src/game/network/pvp";
import { applyStatus } from "../src/game/core/status";
import { Weapon } from "../src/game/core/entities";
import { PVP_RULES } from "../src/game/content/mode-rules";
export const entries = (count: number): QueueEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `human:${i}`,
    name: `Humano ${i}`,
    character: "nara",
    cosmetics: {},
    role: "SOLDADO",
    joined: 0,
    mode: "WAR_CASUAL",
    mmr: 1000 + i * 20,
    seasonId: null,
  }));
const duel: FighterSeed[] = entries(2).map((e, team) => ({ ...e, team }));
describe("V26 maps and shared competitive mechanics", () => {
  it.each(["ruins", "gardens"])(
    "%s runs solo, co-op, duel and war from the same map definition",
    (map) => {
      const solo = new GameSimulation(freshSave());
      solo.start("nara", "normal", map, "SMOKE");
      solo.update(0.04);
      const coop = new CoopSimulation(
        entries(2).map((e) => ({ ...e, progress: freshSave() })),
        "normal",
        map,
        "SMOKE",
      );
      coop.update(0.04);
      expect(solo.world.map).toBe(MAP_DEFINITIONS[map]);
      expect(coop.world.map).toBe(solo.world.map);
      expect(solo.world.createChunk(0, 0)).toEqual(
        coop.world.createChunk(0, 0),
      );
      for (const g of [
        new PvpSimulation(duel, map, "SMOKE"),
        new WarSimulation(selectMatch(entries(2), 45_000)!.seeds, map, "SMOKE"),
      ]) {
        expect(g.world.map).toBe(solo.world.map);
        expect(
          arenaSnapshotSchema.safeParse(g.snapshot(duel[0].id)).success,
        ).toBe(true);
        for (const f of g.fighters.values()) {
          expect(g.world.isWater(f.player.x, f.player.y)).toBe(false);
          expect(
            g.world.nearby.some(
              (s) =>
                (STRUCTURE_DEFINITIONS[s.type].hazard ||
                  STRUCTURE_DEFINITIONS[s.type].collidable) &&
                Math.hypot(s.x - f.player.x, s.y - f.player.y) < s.r + 40,
            ),
          ).toBe(false);
        }
        for (const s of g.world.nearby)
          expect(
            g.world.nearby.some(
              (o) =>
                o.type === s.type &&
                Math.abs(o.x - (g.width - s.x)) < 0.0001 &&
                o.y === s.y,
            ),
          ).toBe(true);
        for (let x = 100; x < g.width / 2; x += 73)
          for (let y = 100; y < g.height; y += 83)
            expect(g.world.isWater(x, y)).toBe(g.world.isWater(g.width - x, y));
        for (let i = 0; i < 90; i++) g.step();
        expect(g.ended).toBe(false);
        expect(
          [...g.combat.values()].every(
            (c) =>
              c.director.index === 0 && c.run.kills === 0 && c.run.gems === 0,
          ),
        ).toBe(true);
      }
    },
  );
  it("shared projectile deals tuned damage, friendly fire stays off and CC cannot chain", () => {
    const g = new PvpSimulation(duel);
    g.time = 4;
    const [a, b] = [...g.fighters.values()];
    a.player.x = 250;
    a.player.y = 300;
    b.player.x = 350;
    b.player.y = 300;
    a.input.aimX = 1;
    a.input.aimY = 0;
    a.input.ability = "basic";
    g.cast(a);
    for (let i = 0; i < 10; i++) g.combat.get(a.id)!.advance(0.04);
    expect(b.player.health).toBeCloseTo(
      100 - 21 * PVP_RULES.weapons.ember.damage,
    );
    g.damage(a, 50, a);
    expect(a.player.health).toBe(100);
    const frost = g.combat.get(a.id)!.player.weapons[2];
    applyStatus(b.body, "freeze", 9, 1, frost);
    expect(b.body.statuses.freeze.duration).toBe(PVP_RULES.freezeDuration);
    delete b.body.statuses.freeze;
    applyStatus(b.body, "freeze", 9, 1, frost);
    expect(b.body.statuses.freeze).toBeUndefined();
    const pve = new Weapon("frost");
    applyStatus(b.body, "slow", 6, 0.48, pve);
    expect(b.body.statuses.slow.duration).toBe(6);
  });
  it("hazards, urns and fountains use temporary tuned effects only", () => {
    const g = new PvpSimulation(duel, "ruins");
    g.time = 4.5;
    const f = [...g.fighters.values()][0];
    const hazard = g.world.nearby.find((s) => s.type === "rift");
    if (hazard) {
      f.player.x = hazard.x;
      f.player.y = hazard.y;
      g.environment(f, 0.04);
      expect(f.player.health).toBe(96);
    }
    const urn = g.world.nearby.find((s) => s.type === "urn")!;
    g.world.breakStructure(urn);
    expect(g.pickups).toHaveLength(1);
    f.player.health = 50;
    f.player.x = urn.x;
    f.player.y = urn.y;
    g.environment(f, 0.04);
    expect(f.player.health).toBe(56);
    const fountain = g.world.nearby.find((s) => s.type === "fountain")!;
    f.player.x = fountain.x;
    f.player.y = fountain.y;
    g.environment(f, 0.04);
    expect(f.player.health).toBe(66);
    g.environment(f, 0.04);
    expect(f.player.health).toBe(66);
  });
});
describe("V27 low population matchmaking", () => {
  it.each([10, 8, 7, 6, 4, 3, 2])(
    "%i humans form exactly five slots per side",
    (n) => {
      const result = selectMatch(entries(n), CONFIG.botFillAfterMs)!;
      expect(result.humans).toHaveLength(n);
      expect(result.seeds.filter((s) => s.isBot)).toHaveLength(10 - n);
      const counts = [0, 1].map(
        (t) => result.seeds.filter((s) => s.team === t && !s.isBot).length,
      );
      expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(1);
      for (const t of [0, 1]) {
        expect(result.seeds.filter((s) => s.team === t)).toHaveLength(5);
        expect(
          result.seeds.filter((s) => s.team === t && s.role === "COMANDANTE")
            .length,
        ).toBeLessThanOrEqual(1);
      }
      if (n === 10)
        expect(selectMatch(entries(n), 0)?.seeds.every((s) => !s.isBot)).toBe(
          true,
        );
      else
        expect(selectMatch(entries(n), CONFIG.botFillAfterMs - 1)).toBeNull();
    },
  );
  it("zero/one human never starts; ranked requires ten humans and original roles", () => {
    expect(selectMatch([], 99999)).toBeNull();
    expect(selectMatch(entries(1), 99999)).toBeNull();
    expect(
      selectMatch(
        entries(6).map((e) => ({ ...e, mode: "WAR_RANKED" })),
        99999,
      ),
    ).toBeNull();
    const ranked = entries(10).map((e, i) => ({
      ...e,
      mode: "WAR_RANKED",
      role: (i < 2
        ? "COMANDANTE"
        : i < 4
          ? "CONSTRUTOR"
          : "SOLDADO") as QueueEntry["role"],
    }));
    expect(
      selectMatch(ranked, 99999)?.seeds.filter((s) => s.isBot),
    ).toHaveLength(0);
  });
  it("TestV26_CasualSearchExpandsGraduallyAndBalancesMMR", () => {
    const expanding = entries(10).map((e, i) => ({
      ...e,
      mmr: i < 8 ? 1000 : 1300,
    }));
    expect(selectMatch(expanding, 29_999)).toBeNull();
    expect(selectMatch(expanding, 30_000)?.humans).toHaveLength(10);

    const laterBracket = [
      { ...entries(1)[0], id: "oldest", mmr: 900, joined: -1_000 },
      ...entries(10).map((e, i) => ({
        ...e,
        id: `later:${i}`,
        mmr: 1800 + i * 10,
      })),
    ];
    expect(
      selectMatch(laterBracket, CONFIG.botFillAfterMs)?.humans,
    ).toHaveLength(10);

    const rated = entries(10).map((e, i) => ({
      ...e,
      mmr: i < 4 ? 1000 : 1400,
    }));
    const balanced = selectMatch(rated, CONFIG.botFillAfterMs)!;
    const ratingById = new Map(rated.map((e) => [e.id, e.mmr]));
    const teamRatings = [0, 1].map((team) =>
      balanced.seeds
        .filter((seed) => seed.team === team && !seed.isBot)
        .reduce((sum, seed) => sum + ratingById.get(seed.id)!, 0),
    );
    expect(teamRatings[0]).toBe(teamRatings[1]);
  });
  it("parties remain atomic, incomplete parties wait, human commanders take precedence", () => {
    const humans = entries(6),
      ids = humans.slice(0, 3).map((e) => e.id);
    humans.slice(0, 3).forEach((e) => {
      e.partyId = "friends";
      e.partyMembers = ids;
    });
    humans[0].role = "COMANDANTE";
    const plan = selectMatch(humans, 45000)!;
    expect(
      new Set(plan.seeds.filter((s) => ids.includes(s.id)).map((s) => s.team))
        .size,
    ).toBe(1);
    expect(
      plan.seeds.filter(
        (s) =>
          s.team === plan.seeds.find((s) => s.id === ids[0])!.team &&
          s.role === "COMANDANTE",
      ),
    ).toHaveLength(1);
    expect(selectMatch(humans.slice(0, 2), 45000)).toBeNull();
  });
  it("disconnect transfers control after grace, reconnect restores the same slot and input authority", () => {
    const g = new WarSimulation(selectMatch(entries(2), 45000)!.seeds);
    const f = g.fighters.get("human:0")!,
      original = f.player;
    g.disconnect(f.id);
    g.time = 29;
    g.disconnectedStep(f);
    expect(f.botControlled).toBe(false);
    g.time = 31;
    g.step();
    expect(f.botControlled).toBe(true);
    expect(f.connected).toBe(false);
    const oldAck = f.ack;
    g.accept(f.id, { ...f.input, sequence: 999 });
    expect(f.ack).toBe(oldAck);
    expect(g.reconnect(f.id)).toBe(true);
    expect(f.botControlled).toBe(false);
    expect(f.player).toBe(original);
    expect(g.fighters.size).toBe(10);
    g.accept(f.id, { ...f.input, sequence: 1000 });
    expect(f.ack).toBe(1000);
    g.damage(
      f,
      1000,
      [...g.fighters.values()].find((p) => p.team !== f.team)!,
    );
    g.step();
    g.time = f.respawnAt;
    g.step();
    expect(f.player.health).toBe(f.player.maxHealth);
    expect(f.protectedUntil).toBeGreaterThan(g.time);
  });
  it("bots move within speed, cast under cooldown, spend energy and play the objective", () => {
    const g = new WarSimulation(selectMatch(entries(2), 45000)!.seeds);
    g.time = 4;
    const bot = [...g.fighters.values()].find((f) => f.isBot)!;
    const start = { x: bot.player.x, y: bot.player.y };
    g.step();
    expect(
      Math.hypot(bot.player.x - start.x, bot.player.y - start.y),
    ).toBeLessThanOrEqual(bot.player.speed * 0.04 + 0.001);
    for (let i = 0; i < 200; i++) g.step();
    expect(g.events.some((e) => e.type.startsWith("recruit:"))).toBe(true);
    expect(g.events.some((e) => e.type.startsWith("upgrade:"))).toBe(true);
    expect(
      Math.hypot(bot.player.x - start.x, bot.player.y - start.y),
    ).toBeGreaterThan(100);
  });
});
