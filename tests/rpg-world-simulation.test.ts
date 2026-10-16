import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { WorldZone } from "../src/realtime/world/zone";
import { createRpgCombatLoadout } from "../src/game/core/rpg/loadout";
import { worldCommand, worldSnapshot } from "../src/game/network/world";

function add(zone: WorldZone, id: string) {
  const loadout = createRpgCombatLoadout({
    characterId: "nara",
    level: 1,
    attributes: { vitality: 0, power: 0, agility: 0, focus: 0, will: 0 },
    equipment: [],
    profileRevision: 1,
  });
  const avatar = zone.createAvatar({
    userId: id,
    publicId: randomUUID(),
    visitId: randomUUID(),
    epoch: randomUUID(),
    name: id,
    loadout,
    xp: 0,
    revision: 1,
  });
  zone.add(avatar);
  return avatar;
}
describe("Authoritative shared region", () => {
  it("supports six independent users and never ends when a member leaves", () => {
    const zone = new WorldZone("obelisk-refuge", randomUUID());
    const avatars = Array.from({ length: 6 }, (_, i) => add(zone, `u${i}`));
    const snapshot = worldSnapshot.parse(zone.snapshot(avatars[0]));
    expect(snapshot.players).toHaveLength(6);
    expect(snapshot.players.map((p) => p.id)).not.toContain("u0");
    expect(JSON.stringify(snapshot)).not.toMatch(
      /userId|email|loadout|seed|visitId/,
    );
    zone.remove("u1");
    expect(zone.snapshot(avatars[0]).players).toHaveLength(5);
    for (let i = 0; i < 23000; i++) zone.update(0.04);
    expect(zone.state).toBe("playing");
    expect(zone.run.time).toBeGreaterThan(900);
    expect(zone.enemies).toEqual([]);
    expect(zone.run.kills).toBe(0);
  });
  it("normalizes diagonal motion, expires input and rejects replay/teleports", () => {
    const zone = new WorldZone("obelisk-refuge", randomUUID()),
      a = add(zone, "u");
    const initial = { x: a.player.x, y: a.player.y };
    for (let i = 1; i <= 100; i++)
      expect(
        zone.acceptMovement("u", {
          epoch: a.epoch,
          sequence: i,
          moveX: -1,
          moveY: -1,
        }),
      ).toBe(true);
    zone.update(0.04);
    expect(
      Math.hypot(a.player.x - initial.x, a.player.y - initial.y),
    ).toBeCloseTo(190 * 0.04);
    expect(
      zone.acceptMovement("u", {
        epoch: a.epoch,
        sequence: 100,
        moveX: 1,
        moveY: 0,
      }),
    ).toBe(false);
    expect(
      zone.acceptMovement("u", {
        epoch: randomUUID(),
        sequence: 101,
        moveX: 1,
        moveY: 0,
      }),
    ).toBe(false);
    for (let i = 0; i < 10; i++) zone.update(0.04);
    const stopped = { x: a.player.x, y: a.player.y };
    zone.update(0.04);
    expect(a.player.x).toBe(stopped.x);
    expect(a.player.y).toBe(stopped.y);
    expect(() =>
      worldCommand.parse({
        type: "WORLD_INPUT",
        epoch: a.epoch,
        sequence: 101,
        moveX: 0,
        moveY: 0,
        x: 900,
      }),
    ).toThrow();
    expect(() =>
      worldCommand.parse({ type: "WORLD_ENTER", protocol: 0 }),
    ).toThrow();
  });
  it("removes distant entities from AOI and clears all spatial state on disposal", () => {
    const zone = new WorldZone("ruins-outskirts", randomUUID()),
      a = add(zone, "u"),
      b = add(zone, "v");
    b.player.x = 1100;
    b.player.y = 1100;
    zone.update(0.04);
    expect(zone.snapshot(a).players).toHaveLength(1);
    b.player.x = 20;
    b.player.y = 0;
    zone.update(0.04);
    expect(zone.snapshot(a).players).toHaveLength(2);
    zone.remove("v");
    expect(zone.snapshot(a).players).toHaveLength(1);
    zone.dispose();
    expect(zone.interest.size).toBe(0);
    expect(zone.world.chunks.size).toBe(0);
  });
});

it("runs field weapons, produces server evidence, respawns and keeps Refuge safe", () => {
  const zone = new WorldZone("ruins-outskirts", randomUUID()),
    a = add(zone, "fighter");
  Object.assign(a.player, { x: 260, y: 160 });
  for (let i = 0; i < 1000 && !zone.field!.pending.length; i++)
    zone.update(0.04);
  expect(zone.field!.pending.length).toBeGreaterThan(0);
  const event = zone.field!.pending[0];
  expect(event.proof.participants.map((p) => p.userId)).toEqual(["fighter"]);
  expect(event.proof.kind).toBe("FIELD_ENEMY_DEFEAT");
  expect(a.player.level).toBe(1);
  expect(a.xp).toBe(0);
  expect(zone.gems).toHaveLength(0);
  expect(
    worldSnapshot
      .parse(zone.snapshot(a))
      .entities.some((e) => e.kind === "enemy"),
  ).toBe(true);
  a.player.invulnerable = 0;
  zone.hurtPlayer(10000, a.player);
  expect(a.player.health).toBe(0);
  for (let i = 0; i < 130; i++) zone.update(0.04);
  expect(a.player.health).toBe(a.player.maxHealth);
  expect(Math.hypot(a.player.x, a.player.y)).toBe(0);
  const refuge = new WorldZone("obelisk-refuge", randomUUID()),
    b = add(refuge, "safe");
  refuge.hurtPlayer(10000, b.player);
  expect(b.player.health).toBe(b.player.maxHealth);
  expect(refuge.field).toBeUndefined();
  zone.dispose();
  refuge.dispose();
});
