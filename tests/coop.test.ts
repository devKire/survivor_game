import { describe, it, expect } from "vitest";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { SnapshotStream } from "../src/realtime/snapshots";
import { clientMessage, snapshotSchema } from "../src/game/network/protocol";
import { Weapon } from "../src/game/core/entities";
const create = (n: number) =>
  new CoopSimulation(
    Array.from({ length: n }, (_, i) => ({
      id: "p" + i,
      name: "Player" + i,
      character: "nara",
      progress: freshSave(),
    })),
    "normal",
    "ruins",
    "COOP-TEST",
  );
describe("V5/V7 shared authoritative simulation", () => {
  for (const n of [1, 2, 3, 4, 5])
    it(`${n} players share world, move with input and produce valid deltas`, () => {
      const g = create(n);
      for (let i = 0; i < n; i++)
        g.acceptInput("p" + i, {
          sequence: 1,
          moveX: 1,
          moveY: 1,
          interact: false,
        });
      for (let i = 0; i < 4; i++) g.update(1 / 25);
      expect(g.members.size).toBe(n);
      expect(g.members.get("p0")!.player.x).toBeGreaterThan(15);
      expect(g.run.time).toBeCloseTo(0.16);
      expect(g.world.chunks.size).toBeGreaterThan(0);
      const stream = new SnapshotStream(),
        m = g.members.get("p0")!,
        one = stream.build(g, m, 4, true),
        two = stream.build(g, m, 5);
      expect(snapshotSchema.safeParse(one).success).toBe(true);
      expect(two.upsert.length).toBeLessThanOrEqual(one.upsert.length);
      expect(two.base).toBe(4);
    });
  it("rejects client damage/position, oversized and invalid inputs", () => {
    expect(
      clientMessage.safeParse({
        type: "INPUT",
        moveX: 999,
        moveY: 0,
        sequence: 1,
        interact: false,
      }).success,
    ).toBe(false);
    expect(
      clientMessage.safeParse({
        type: "INPUT",
        moveX: 1,
        moveY: 0,
        sequence: 1,
        interact: false,
        damage: 999,
        x: 100,
      }).success,
    ).toBe(false);
  });
  it("provides shared XP without 5x progression", () => {
    const g = create(5);
    g.run.time = 35;
    for (const m of g.members.values()) {
      m.player.x = 0;
      m.player.y = 0;
    }
    g.dropXP(0, 0, 100);
    g.update(0.04);
    expect(
      new Set([...g.members.values()].map((m) => m.player.level)).size,
    ).toBe(1);
    expect(g.teamXp).toBeLessThan(100);
    expect(g.members.get("p0")!.pending).toBe(1);
    const m = g.members.get("p0")!;
    g.choose(m.id, m.decision, 0, "pick");
    expect(m.pending).toBe(0);
    expect(g.members.get("p1")!.pending).toBe(1);
    expect(g.state).toBe("playing");
  });
  it("revives a downed teammate; a single death does not end the run", () => {
    const g = create(2),
      a = g.members.get("p0")!,
      b = g.members.get("p1")!;
    g.hurtPlayer(9999, b.player);
    expect(b.downed).toBe(true);
    expect(g.ended).toBe(false);
    for (let i = 0; i < 90; i++) {
      g.acceptInput(a.id, {
        sequence: i + 1,
        moveX: 0,
        moveY: 0,
        interact: true,
      });
      g.update(0.04);
    }
    expect(b.downed).toBe(false);
    expect(b.player.health).toBeGreaterThan(0);
    expect(g.run.telemetry!.revives).toBe(1);
  });
  it("reconnects the existing player without changing party scaling", () => {
    const g = create(5),
      p = g.members.get("p0")!.player;
    g.disconnect("p0");
    g.update(0.04);
    expect(g.reconnect("p0")).toBe(true);
    expect(g.members.size).toBe(5);
    expect(g.members.get("p0")!.player).toBe(p);
    expect(g.partySizeAtStart).toBe(5);
    expect(g.reconnect("outsider")).toBe(false);
  });
  it("does not damage teammates with player attacks and preserves weapon ownership", () => {
    const g = create(2),
      a = g.members.get("p0")!,
      b = g.members.get("p1")!;
    a.player.weapons = [Object.assign(new Weapon("ember"), { ownerId: a.id })];
    g.spawnAt("tank", 300, 0);
    for (let i = 0; i < 25; i++) g.update(0.04);
    expect(b.player.health).toBe(b.player.maxHealth);
    expect(g.run.totalDamage).toBeGreaterThan(0);
  });
  it("interest management omits distant normal enemies but includes global bosses", () => {
    const g = create(2);
    g.spawnAt("husk", 10000, 10000);
    g.spawnAt("boss", 10000, 10000);
    const snap = new SnapshotStream().build(g, g.members.get("p0")!, 1, true);
    expect(
      snap.upsert.filter((e) => e.kind === "enemy").map((e) => e.type),
    ).toEqual(["boss"]);
  });
});

describe("Co-op regression boundaries", () => {
  it("isolates banishment and personal counters", () => {
    const g = create(2),
      a = g.members.get("p0")!,
      b = g.members.get("p1")!;
    a.choices = [{ kind: "weapon", id: "ember", weight: 1 }];
    a.decision = 1;
    a.pending = 1;
    g.choose(a.id, 1, 0, "banish");
    expect(a.personal.banned).toContain("weapon:ember");
    expect(b.personal.banned).toEqual([]);
    g.activate(b);
    expect(g.candidates().some((c) => c.id === "ember")).toBe(true);
  });
  it("allows a distant teammate to vote, but only a nearby member can initiate", () => {
    const g = create(3),
      a = g.members.get("p0")!,
      b = g.members.get("p1")!;
    const s = {
      id: "vote",
      type: "silence",
      x: 0,
      y: 0,
      r: 20,
      hp: 0,
      maxHp: 0,
      used: false,
      destroyed: false,
      opened: false,
      angle: 0,
      variant: 0,
    };
    g.world.nearby.push(s);
    b.player.x = 10000;
    g.interactOnline(b.id, s.id, true);
    expect(g.votes.size).toBe(0);
    g.interactOnline(a.id, s.id, true);
    expect(g.votes.size).toBe(1);
    g.interactOnline(b.id, s.id, true);
    expect(g.run.silenceTime).toBe(20);
    expect(g.votes.size).toBe(0);
  });
  it("does not recurse on Ember/Orbit mark explosions or count a kill twice", () => {
    const g = create(2),
      m = g.members.get("p0")!;
    g.activate(m);
    m.synergies.push("ember_orbit");
    const w = new Weapon("ember");
    w.ownerId = m.id;
    const e = g.spawnAt("tank", 100, 0)!;
    e.statuses.mark = {
      duration: 5,
      magnitude: 1,
      stacks: 1,
      tick: 0,
      source: w,
    };
    g.grid.rebuild(g.enemies);
    expect(() => g.damageEnemy(e, 20, w)).not.toThrow();
    e.hp = 28;
    g.damageEnemy(e, 24, w, 0, false);
    expect(g.run.kills).toBe(1);
    g.damageEnemy(e, 1e6, w);
    expect(g.run.kills).toBe(1);
  });
  it("shares world gold without dividing it and preserves pickup lifetime", () => {
    const g = create(5);
    g.pickups.push(
      { type: "gold", x: 0, y: 0, value: 50, life: 20 },
      { type: "heal", x: 900, y: 900, value: 10, life: 20 },
    );
    g.update(0.04);
    expect([...g.members.values()].map((m) => m.gold)).toEqual([
      50, 50, 50, 50, 50,
    ]);
    expect(g.pickups[0].life).toBeCloseTo(19.96);
  });
  it("delivers individual boss rewards and limits automatic level conversion", () => {
    const g = create(5);
    g.openChest({ value: 100 });
    expect([...g.members.values()].every((m) => m.gold === 100)).toBe(true);
    g.manual = 26;
    g.teamXp = 1e6;
    g.run.time = 1750;
    g.run.lastDecisionAt = 1750;
    for (let i = 0; i < 25; i++) g.update(0.04);
    expect(g.teamLevel).toBe(1);
    g.run.time = 1771;
    g.update(0.04);
    expect(g.teamLevel).toBe(2);
  });
  it("terminates on a team wipe and rejects late reconnection", () => {
    const g = create(2);
    g.disconnect("p0");
    g.run.time = 61;
    expect(g.reconnect("p0")).toBe(false);
    for (const m of g.members.values()) g.hurtPlayer(9999, m.player);
    g.update(0.04);
    expect(g.ended).toBe(true);
    expect(g.run.telemetry!.teamWipes).toBe(1);
  });
  it("transmits only changed entity fields between snapshots", () => {
    const g = create(1),
      m = g.members.get("p0")!,
      e = g.spawnAt("tank", 100, 0)!,
      stream = new SnapshotStream();
    stream.build(g, m, 1, true);
    e.x++;
    const s = stream.build(g, m, 2);
    expect(s.upsert).toHaveLength(0);
    expect(s.patch).toEqual([{ id: "e" + e.id, x: 101 }]);
    expect(snapshotSchema.safeParse(s).success).toBe(true);
  });
});

it("V8 pooled projectiles receive a new network identity on reuse", () => {
  const g = create(1),
    m = g.members.get("p0")!,
    stream = new SnapshotStream();
  g.projectile(m.player.weapons[0], 0, 0, 100, 0);
  const a = stream
    .build(g, m, 1, true)
    .upsert.find((e) => e.kind === "bullet")!;
  g.bullets.clear();
  g.projectile(m.player.weapons[0], 100, 0, 0, 100);
  const b = stream.build(g, m, 2);
  expect(b.remove).toContain(a.id);
  expect(b.upsert.find((e) => e.kind === "bullet")!.id).not.toBe(a.id);
});
