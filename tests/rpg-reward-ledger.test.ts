import { describe, expect, it } from "vitest";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import {
  createRpgCombatLoadout,
  initialRpgAttributes,
} from "../src/game/core/rpg";
import { RpgRewardLedger } from "../src/game/core/rpg/reward-ledger";
import type { Structure } from "../src/game/core/types";

function game() {
  const loadout = createRpgCombatLoadout({
    characterId: "nara",
    level: 1,
    attributes: initialRpgAttributes().attributes,
    equipment: [],
    profileRevision: 1,
  });
  return new CoopSimulation(
    [{ id: "u", name: "U", character: "nara", progress: freshSave() }],
    "normal",
    "ruins",
    "ledger",
    600,
    { kind: "RPG_EXPEDITION", loadouts: { u: loadout } },
  );
}
function defeat(g: CoopSimulation) {
  for (const m of g.members.values()) m.downed = true;
  g.finish(false);
  return g.rpgTerminalResult();
}
describe("bounded authoritative reward ledger", () => {
  it("counts a real defeated boss/elite once, excludes common enemies and ignores duplicate damage", () => {
    const g = game();
    g.update(0.04);
    const boss = g.spawnAt("boss", 100, 0)!;
    boss.bossEventIndex = 0;
    const elite = g.spawnAt("elite", 100, 0)!;
    const common = g.spawnAt("husk", 100, 0)!;
    for (const enemy of [boss, boss, elite, common])
      g.damageEnemy(enemy, 1e9, g.player.weapons[0]);
    expect(defeat(g).events.map((e) => e.source)).toEqual([
      "BOSS_DEFEAT",
      "ELITE_DEFEAT",
    ]);
  });
  it("records a personal chest only after a valid key-consuming interaction, never on replay or out of range", () => {
    const g = game();
    g.update(0.04);
    const chest: Structure = {
      id: "chest-fixture",
      type: "chest",
      x: g.player.x,
      y: g.player.y,
      r: 24,
      hp: 100,
      maxHp: 100,
      used: false,
      destroyed: false,
      opened: false,
      angle: 0,
      variant: 0,
    };
    g.world.nearby.push(chest);
    g.interactOnline("u", chest.id, true); // No key.
    expect(g.members.get("u")!.personalStructures.has(chest.id)).toBe(false);
    g.members.get("u")!.inventory[0] = { id: "basalt_key", qty: 2 };
    chest.x += 1000;
    g.interactOnline("u", chest.id, true);
    chest.x -= 1000;
    g.interactOnline("u", chest.id, true);
    g.interactOnline("u", chest.id, true);
    const result = defeat(g);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      source: "CHEST_OPENED",
      userId: "u",
    });
    expect(g.members.get("u")!.inventory[0]?.qty).toBe(1);
  });
  it("caps recorded events and derives eligibility counters from simulation time and movement", () => {
    const ledger = new RpgRewardLedger([
      { userId: "u", characterId: "nara", entryLevel: 1 },
    ]);
    for (let i = 0; i < 15000; i++) {
      ledger.step(0.04);
      ledger.participation("u", 0.04, true, i < 1000);
      ledger.event("ELITE_DEFEAT", `e${i}`, "elite");
    }
    const terminal = ledger.terminal(true);
    expect(terminal.events).toHaveLength(6);
    expect(terminal.participants[0]).toMatchObject({
      connectedTicks: 15000,
      activeTicks: 1000,
      absentTicks: 0,
    });
  });
  it("does not award a terminal from an unfinished game or an early goal", () => {
    const g = game();
    g.update(0.04);
    g.finish(true);
    expect(g.ended).toBe(false);
    expect(() => g.rpgTerminalResult()).toThrow("terminou");
    const terminal = defeat(g);
    expect(terminal.participants[0].activeTicks).toBe(0);
    g.interactOnline("u", "anything", true);
    expect(g.rpgTerminalResult()).toEqual(terminal);
  });
});
