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
import { arenaCommand, arenaSnapshotSchema } from "../src/game/network/pvp";
import { applyStatus } from "../src/game/core/status";
import { Player, Weapon } from "../src/game/core/entities";
import { PVP_RULES } from "../src/game/content/mode-rules";
import { PVP_CHARACTER_BUILDS, resolvePvpCosmetics } from "../src/game/content/pvp";
import { COSMETICS } from "../src/game/content/cosmetics";
import { WAR, WAR_ITEM_DEFINITIONS, warXpNeed } from "../src/game/content/war";
import { VirtualJoystick } from "../src/game/client/virtual-joystick";
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
  it("virtual joystick applies deadzone, clamps, owns one pointer and clears on cancellation", () => {
    const joystick = new VirtualJoystick();
    expect(joystick.begin(1, 51, 50, 50, 50, 100)).toEqual({ x: 0, y: 0 });
    expect(joystick.move(1, 200, 50, 50, 50, 100)).toEqual({ x: 1, y: 0 });
    expect(joystick.begin(2, 50, 150, 50, 50, 100)).toBeNull();
    expect(joystick.pointerId).toBe(1);
    expect(joystick.release(2)).toBe(false);
    expect(joystick.release(1)).toBe(true);
    expect(joystick.axis).toEqual({ x: 0, y: 0 });

    joystick.begin(3, 150, 50, 50, 50, 100);
    joystick.clear(); // Same reset path used by pointercancel/death.
    expect(joystick.pointerId).toBeNull();
    expect(joystick.axis).toEqual({ x: 0, y: 0 });
  });

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
  it("dead War fighters stop creating attacks while launched projectiles expire and respawn restores fire", () => {
    const seeds = entries(10).map((entry, index) =>
      index === 0 ? { ...entry, character: "orin" as const } : entry,
    );
    const g = new WarSimulation(selectMatch(seeds, 0)!.seeds);
    g.time = 4;
    const f = g.fighters.get("human:0")!;
    const combat = g.combat.get(f.id)!;
    const weapon = combat.player.weapons[0];
    expect(weapon.id).toBe("orbit");
    weapon.timer = 0;
    const shotsBeforeDeath = weapon.shots;
    const launched = combat.projectile(weapon, f.player.x, f.player.y, 10, 0, { life: 0.5 })!;
    f.player.health = 0;

    g.step(0.04);
    expect(weapon.shots).toBe(shotsBeforeDeath + 1); // only the projectile created above
    expect(launched.life).toBeCloseTo(0.46);
    for (let i = 0; i < 5; i++) g.step(0.04);
    expect(weapon.shots).toBe(shotsBeforeDeath + 1);
    expect(launched.life).toBeCloseTo(0.26);

    g.time = f.respawnAt;
    g.step(0.04);
    expect(f.player.health).toBe(f.player.maxHealth);
    const shotsAtRespawn = weapon.shots;
    for (let i = 0; i < 8; i++) g.step(0.04);
    expect(weapon.shots).toBeGreaterThan(shotsAtRespawn);
  });
  it("server bot enters DEAD without attacks and resumes its same weapon after respawn", () => {
    const g = new WarSimulation(selectMatch(entries(2), 45000)!.seeds);
    g.time = 4;
    const bot = [...g.fighters.values()].find((fighter) => fighter.isBot)!;
    const combat = g.combat.get(bot.id)!;
    const orbit = new Weapon("orbit");
    orbit.ruleset = "PVP";
    orbit.ownerId = bot.id;
    orbit.timer = 0;
    combat.player.weapons = [orbit];
    bot.player.health = 0;
    g.step(0.04);
    expect(orbit.shots).toBe(0);
    expect(g.botBrains.get(bot.id)?.state).toBe("DEAD");
    g.time = bot.respawnAt;
    g.step(0.04);
    expect(bot.player.health).toBe(bot.player.maxHealth);
    expect(g.botBrains.get(bot.id)?.state).not.toBe("DEAD");
    for (let i = 0; i < 8; i++) g.step(0.04);
    expect(orbit.shots).toBeGreaterThan(0);
  });
  it("configured weapons fire automatically on server ticks, respect cooldown and exclude allies", () => {
    const seeds = [
      { ...duel[0], id: "nara", team: 0 },
      { ...duel[1], id: "enemy", team: 1 },
      { ...duel[0], id: "ally", team: 0 },
    ];
    const g = new PvpSimulation(seeds);
    g.time = 4;
    const [a, b, ally] = [...g.fighters.values()];
    a.player.x = 250;
    a.player.y = 300;
    b.player.x = 350;
    b.player.y = 300;
    ally.player.x = 300;
    ally.player.y = 300;
    b.player.weapons = [];
    ally.player.weapons = [];
    a.player.stats.critChance = 0;
    for (const fighter of [a, b, ally]) fighter.lastInputAt = 100;
    const weapon = g.combat.get(a.id)!.player.weapons[0];
    for (let i = 0; i < 6; i++) g.step(0.04);
    expect(weapon.shots).toBe(0);
    g.step(0.04);
    expect(weapon.shots).toBe(1);
    for (let i = 0; i < 10; i++) g.step(0.04);
    expect(b.player.health).toBeLessThan(100);
    expect(ally.player.health).toBe(100);
    const shotsAtCooldown = weapon.shots;
    for (let i = 0; i < 5; i++) g.step(0.04);
    expect(weapon.shots).toBe(shotsAtCooldown);

    const frost = new Weapon("frost");
    frost.ruleset = "PVP";
    applyStatus(b.body, "freeze", 9, 1, frost);
    expect(b.body.statuses.freeze.duration).toBe(PVP_RULES.freezeDuration);
    delete b.body.statuses.freeze;
    applyStatus(b.body, "freeze", 9, 1, frost);
    expect(b.body.statuses.freeze).toBeUndefined();
    const pve = new Weapon("frost");
    applyStatus(b.body, "slow", 6, 0.48, pve);
    expect(b.body.statuses.slow.duration).toBe(6);
  });
  it("uses the configured signature build and keeps native character traits without account meta", () => {
    const expected = {
      nara: "ember",
      orin: "orbit",
      ivo: "spear",
      sena: "meteor",
    } as const;
    for (const [character, weapon] of Object.entries(expected)) {
      const seed = { ...duel[0], character: character as FighterSeed["character"] };
      const g = new PvpSimulation([seed, duel[1]]);
      const fighter = g.fighters.get(seed.id)!;
      expect(g.loadout(fighter).weapons[0].id).toBe(weapon);
      expect(g.combat.get(seed.id)!.player.weapons).toHaveLength(3);
      expect(PVP_CHARACTER_BUILDS[character as keyof typeof PVP_CHARACTER_BUILDS].weapons[0].id).toBe(weapon);
    }
    const nara = new Player("nara", {}, "PVP");
    const naraWithMeta = new Player("nara", { might: 5, speed: 5 }, "PVP");
    expect(naraWithMeta.stats).toEqual(nara.stats);
    const trait = (character: FighterSeed["character"]) =>
      new PvpSimulation([{ ...duel[0], character }, duel[1]]).fighters.get(duel[0].id)!;
    expect(trait("nara").player.speed).toBeGreaterThan(220);
    expect(trait("orin").player.stats.area).toBeGreaterThan(1);
    expect(trait("orin").player.stats.recovery).toBeGreaterThan(0);
    expect(trait("ivo").player.maxHealth).toBe(85);
    expect(trait("ivo").player.stats.amount).toBe(2);
    expect(trait("sena").player.stats.damage).toBeGreaterThan(1);
    expect(trait("sena").player.stats.growth).toBeGreaterThan(1);
    const war = new WarSimulation(selectMatch(entries(10), CONFIG.botFillAfterMs)!.seeds);
    expect([...war.fighters.values()].every((fighter) => war.combat.get(fighter.id)!.player.weapons.length === 1)).toBe(true);
    expect(new PvpSimulation(duel).combat.get(duel[0].id)!.player.weapons).toHaveLength(3);
  });
  it("War minion XP is shared only with nearby living allies and creates a server-owned level decision", () => {
    const g = new WarSimulation(selectMatch(entries(10), 0)!.seeds);
    const fighters = [...g.fighters.values()];
    const killer = fighters[0];
    const nearby = fighters.find((f) => f.team === killer.team && f.id !== killer.id)!;
    const far = fighters.find((f) => f.team === killer.team && f.id !== killer.id && f !== nearby)!;
    nearby.player.x = killer.player.x + 50;
    nearby.player.y = killer.player.y;
    far.player.x = killer.player.x + 1500;
    far.player.y = killer.player.y;
    const minion = { id: 99999, team: 1 - killer.team, lane: 1, kind: "SOLDADO" as const, x: killer.player.x, y: killer.player.y, hp: 1, maxHp: 1, speed: 0, damage: 0, cooldown: 0 };
    g.hitMinion(minion, 10, killer);
    expect(g.progress.get(killer.id)!.xp).toBe(WAR.xp.minion);
    expect(g.progress.get(nearby.id)!.xp).toBe(WAR.xp.minion);
    expect(g.progress.get(far.id)!.xp).toBe(0);

    g.grantWarXp(killer.id, warXpNeed(1));
    const decision = g.progress.get(killer.id)!;
    expect(decision.level).toBe(2);
    expect(decision.pendingUpgrades).toBe(1);
    expect(decision.choices).toHaveLength(3);
  });
  it("War build choices are server validated, add PVP weapons and preserve duel presets", () => {
    const g = new WarSimulation(selectMatch(entries(10), 0)!.seeds);
    const f = g.fighters.get("human:0")!;
    const progress = g.progress.get(f.id)!;
    g.grantWarXp(f.id, warXpNeed(1));
    const choice = progress.choices.find((candidate) => candidate.kind === "weapon")!;
    expect(g.chooseUpgrade(f.id, progress.decision, "weapon:frost")).toBe(false);
    expect(g.chooseUpgrade(f.id, progress.decision, choice.id)).toBe(true);
    const weapons = g.combat.get(f.id)!.player.weapons;
    expect(weapons).toHaveLength(2);
    expect(weapons[1].ruleset).toBe("PVP");
    expect(progress.buildRevision).toBe(1);
    const snapshot = arenaSnapshotSchema.parse(g.snapshot(f.id));
    expect(snapshot.players.find((player) => player.id === f.id)?.weapons).toHaveLength(2);
    expect(snapshot.war?.weapons).toHaveLength(2);
    expect(snapshot.war?.pendingUpgrades).toBe(0);
    while (weapons.length < WAR.maxWeapons) {
      g.grantWarXp(f.id, progress.xpToNextLevel - progress.xp);
      const nextWeapon = progress.choices.find((candidate) => candidate.kind === "weapon" && candidate.currentLevel === 0)!;
      expect(g.chooseUpgrade(f.id, progress.decision, nextWeapon.id)).toBe(true);
    }
    g.grantWarXp(f.id, progress.xpToNextLevel - progress.xp);
    expect(progress.choices.some((candidate) => candidate.kind === "weapon" && candidate.currentLevel === 0)).toBe(false);
    expect(weapons).toHaveLength(WAR.maxWeapons);
  });
  it("War items spend only temporary WarGold, apply stats and require a base or death", () => {
    const g = new WarSimulation(selectMatch(entries(10), 0)!.seeds);
    const f = g.fighters.get("human:0")!;
    const progress = g.progress.get(f.id)!;
    const item = Object.values(WAR_ITEM_DEFINITIONS)[0];
    const oldDamage = f.player.stats.damage;
    expect(g.buyItem(f.id, item.id)).toBe(false);
    progress.warGold = item.cost;
    f.player.x = 1300;
    expect(g.buyItem(f.id, item.id)).toBe(false);
    f.player.x = f.team === 0 ? 230 : 2370;
    expect(g.buyItem(f.id, item.id)).toBe(true);
    expect(progress.warGold).toBe(0);
    expect(progress.items.map((slot) => slot.id)).toContain(item.id);
    expect(f.player.stats.damage).not.toBe(oldDamage);
  });
  it.each([
    ["nara", "ember"],
    ["orin", "orbit"],
    ["ivo", "spear"],
    ["sena", "meteor"],
  ] as const)("%s advances its real %s weapon without an attack input", (character, weaponId) => {
    const seeds: FighterSeed[] = [
      { ...duel[0], character },
      { ...duel[1], character: "nara" },
    ];
    const g = new PvpSimulation(seeds);
    g.time = 4;
    const [attacker, target] = [...g.fighters.values()];
    attacker.player.x = 250;
    attacker.player.y = 300;
    attacker.player.dx = 1;
    target.player.x = 350;
    target.player.y = 300;
    target.player.weapons = [];
    attacker.lastInputAt = target.lastInputAt = 100;
    attacker.input.ability = "none";
    for (let i = 0; i < 8; i++) g.step(0.04);
    expect(g.combat.get(attacker.id)!.player.weapons[0].id).toBe(weaponId);
    expect(g.combat.get(attacker.id)!.player.weapons[0].shots).toBeGreaterThan(0);
  });
  it("rejects client-provided damage and preserves PvE weapon tuning", () => {
    expect(arenaCommand.safeParse({
      type: "ARENA_INPUT",
      sequence: 1,
      moveX: 0,
      moveY: 0,
      aimX: 1,
      aimY: 0,
      ability: "none",
      seenTick: 0,
      damage: 999,
    }).success).toBe(false);
    const pve = new Player("nara");
    const weapon = new Weapon("ember");
    weapon.ruleset = "PVE";
    expect(weapon.values(pve).damage).toBe(21);
    weapon.ruleset = "PVP";
    expect(weapon.values(pve).damage).toBe(21 * PVP_RULES.weapons.ember.damage);
  });
  it("resolves only the selected character's owned PvP cosmetics and rejects queue cosmetics", () => {
    const save = freshSave();
    const skin = Object.values(COSMETICS).find((item) => item.type === "CHARACTER_SKIN")!;
    save.pvpCosmetics.nara.CHARACTER_SKIN = skin.id;
    save.pvpCosmetics.orin.CHARACTER_SKIN = "character_skin_1";
    expect(resolvePvpCosmetics(save, "nara", new Set([skin.id, "character_skin_1"]))).toEqual({ CHARACTER_SKIN: skin.id });
    expect(resolvePvpCosmetics(save, "orin", new Set([skin.id, "character_skin_1"]))).toEqual({ CHARACTER_SKIN: "character_skin_1" });
    expect(resolvePvpCosmetics(save, "nara", new Set())).toEqual({});
    expect(arenaCommand.safeParse({ type: "ARENA_QUEUE", character: "nara", mode: "WAR_CASUAL", role: "SOLDADO", cosmetics: { CHARACTER_SKIN: skin.id }, weapons: ["ember"] }).success).toBe(false);
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
    g.grantWarXp(bot.id, warXpNeed(1));
    bot.player.health = bot.player.maxHealth;
    g.botNextDecision.set(bot.id, g.time);
    g.step();
    expect(g.events.some((e) => e.type === "war-build" && e.actor === bot.id)).toBe(true);
    expect(
      Math.hypot(bot.player.x - start.x, bot.player.y - start.y),
    ).toBeGreaterThan(100);
  });
});
