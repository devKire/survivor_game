import { describe, it, expect } from "vitest";
import { ArenaLobby, ARENA_LOBBY_CONFIG } from "../src/game/core/arena-lobby";
import { WarSimulation } from "../src/game/core/war";
import { WAR } from "../src/game/content/war";
import { arenaCommand } from "../src/game/network/pvp";
import type { FighterSeed } from "../src/game/core/pvp";
const seeds: FighterSeed[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  name: `P${i}`,
  character: "nara",
  cosmetics: {},
  team: i < 5 ? 0 : 1,
  role: "SOLDADO",
  isBot: i > 1,
}));
describe("authoritative selection", () => {
  it("allows only valid selection before lock and starts on timeout with ready bots", () => {
    const lobby = new ArenaLobby("a", "WAR_CASUAL", seeds, 0);
    expect(lobby.select("p0", { character: "orin" }, 100)).toBe(true);
    expect(lobby.lock("p0", 100)).toBe(true);
    expect(lobby.select("p0", { character: "ivo" }, 200)).toBe(false);
    expect(lobby.select("p2", { character: "ivo" }, 200)).toBe(false);
    expect(lobby.advance(35000)).toBe(false);
    expect(lobby.advance(38000)).toBe(true);
    expect(lobby.seats[0].character).toBe("orin");
    expect(
      arenaCommand.safeParse({
        type: "ARENA_SELECT_CHARACTER",
        character: "orin",
        weapons: [],
      }).success,
    ).toBe(false);
  });
  it("keeps Casual roles open and normalizes the Ranked roster", () => {
    const lobby = new ArenaLobby("a", "WAR_CASUAL", seeds, 0);
    expect(lobby.select("p0", { role: "COMANDANTE" }, 1)).toBe(true);
    expect(lobby.select("p1", { role: "COMANDANTE" }, 1)).toBe(true);
    ARENA_LOBBY_CONFIG.allowDuplicateCharactersPerTeam = false;
    try {
      expect(lobby.select("p1", { character: "nara" }, 1)).toBe(false);
    } finally {
      ARENA_LOBBY_CONFIG.allowDuplicateCharactersPerTeam = true;
    }
    const ranked = new ArenaLobby("ranked", "WAR_RANKED", seeds, 0);
    expect(ranked.select("p0", { role: "COMANDANTE" }, 1)).toBe(true);
    expect(ranked.select("p1", { role: "CONSTRUTOR" }, 1)).toBe(true);
    expect(ranked.select("p0", { role: "CONSTRUTOR" }, 2)).toBe(false);
    expect(ranked.select("p0", { role: "SOLDADO" }, 2)).toBe(true);
    ranked.advance(ARENA_LOBBY_CONFIG.selectionSeconds * 1000);
    for (const team of [0, 1]) {
      const roles = ranked.seats.filter((seat) => seat.team === team);
      expect(roles.filter((seat) => seat.role === "COMANDANTE")).toHaveLength(
        1,
      );
      expect(roles.filter((seat) => seat.role === "CONSTRUTOR")).toHaveLength(
        1,
      );
    }
  });
});
describe("expanded War world", () => {
  it("shares geometry and caps declarative waves", () => {
    const g = new WarSimulation(seeds);
    expect(g.width).toBe(5400);
    expect(g.height).toBe(3000);
    expect(g.world.profile!.width).toBe(WAR.width);
    expect(g.structures[4].x - g.structures[0].x).toBe(5000);
    expect(
      g.structures.every(
        (s) => s.x >= 0 && s.x <= g.width && s.y >= 0 && s.y <= g.height,
      ),
    ).toBe(true);
    for (let i = 0; i < 4; i++) {
      g.time = 4 + i * WAR.waveSeconds;
      g.step();
    }
    expect(g.units.items.some((u) => u.kind === "SUPORTE")).toBe(true);
    expect(g.units.items.some((u) => u.kind === "TANQUE")).toBe(true);
    g.spawnWave(0, 0, 1000);
    g.spawnWave(1, 0, 1000);
    expect(g.units.items.length).toBe(WAR.minionCap);
    expect(
      arenaCommand.safeParse({
        type: "ARENA_BUILD",
        kind: "TORRE",
        x: 5100,
        y: 2900,
      }).success,
    ).toBe(true);
  });
  it("reuses boss AI, leashes, resets, respawns and grants match rewards once", () => {
    const g = new WarSimulation(seeds),
      n = g.neutrals,
      camp = n.camps.find((c) => c.config.boss)!,
      boss = camp.enemies[0],
      f = g.fighters.get("p0")!;
    expect(boss.pattern).toBe("charge");
    expect(boss.name).toBe("A Corça de Cobre");
    f.player.x = camp.config.x;
    f.player.y = camp.config.y;
    boss.x += camp.config.leashRadius + 1;
    boss.hp = 1;
    n.advance(0.04);
    expect(n.returning.has(boss.id)).toBe(true);
    for (let i = 0; i < 200; i++) n.advance(0.04);
    expect(boss.hp).toBe(boss.maxHp);
    const gold = g.progress.get(f.id)!.warGold;
    n.hit(boss, 100000, f);
    n.hit(boss, 100000, f);
    expect(g.progress.get(f.id)!.warGold - gold).toBe(
      camp.config.reward.warGold,
    );
    expect(n.run.gems).toBe(0);
    expect(n.director.index).toBe(0);
    g.time = camp.respawnAt;
    n.advance(0.04);
    expect(camp.enemies[0].dead).toBe(false);
    expect(camp.enemies[0].id).not.toBe(boss.id);
    expect(n.snapshot(0, 0)).toEqual([]);
  });
});
