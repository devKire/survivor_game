import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { ExplorationSimulation } from "../src/game/core/rpg/exploration/simulation";
import { EXPLORATION_RUINS as region } from "../src/game/content/rpg/exploration-regions";
import {
  createRpgCombatLoadout,
  initialRpgAttributes,
} from "../src/game/core/rpg";
import { freshSave } from "../src/game/core/save";
import { clientMessage } from "../src/game/network/protocol";
const game = () =>
  new ExplorationSimulation(
    [{ id: "p", name: "P", character: "nara", progress: freshSave() }],
    "normal",
    "ruins",
    region.seed,
    900,
    {
      kind: "RPG_EXPLORATION",
      loadouts: {
        p: createRpgCombatLoadout({
          characterId: "nara",
          level: 1,
          attributes: initialRpgAttributes(1).attributes,
          equipment: [],
          profileRevision: 1,
        }),
      },
    },
  );
describe("exploration lifecycle and gathering clock", () => {
  it("requires both elapsed simulation and real server duration; cancels movement and disconnect", () => {
    const g = game(),
      n = g.nodes.find((n) => n.kind === "RESOURCE")!,
      p = g.members.get("p")!;
    p.player.x = n.x;
    p.player.y = n.y; // domain fixture only; realtime suite uses INPUT
    g.startGather(
      "p",
      { nodeId: n.id, requestId: randomUUID(), expectedRevision: 1 },
      100,
      Date.UTC(2026, 9, 12, 23, 59, 59),
    );
    for (let i = 0; i < 100; i++) g.update(0.04);
    expect(g.gatheringReady("p", 101)).toBeUndefined();
    expect(g.gatheringReady("p", 5000)).toBeDefined();
    const cycle = g.gathering.get("p")!.cycle;
    expect(cycle).toBe(Math.floor(Date.UTC(2026, 9, 12) / 86400000));
    g.acceptInput("p", { sequence: 1, moveX: 1, moveY: 0, interact: false });
    g.update(0.04);
    expect(g.gathering.size).toBe(0);
    p.player.x = n.x;
    p.player.y = n.y;
    g.startGather("p", {
      nodeId: n.id,
      requestId: randomUUID(),
      expectedRevision: 1,
    });
    g.disconnect("p");
    expect(g.gathering.size).toBe(0);
    expect(g.reconnect("p")).toBe(true);
    g.leave("p");
    expect(g.reconnect("p")).toBe(false);
  });
  it("does not run waves, use Survivor interactions, settle, or escape bounds", () => {
    const g = game(),
      p = g.members.get("p")!;
    p.player.x = 1270;
    for (let i = 1; i < 150; i++) {
      g.acceptInput("p", { sequence: i, moveX: 1, moveY: 1, interact: false });
      g.update(0.04);
    }
    expect(p.player.x).toBeLessThanOrEqual(1280 - p.player.r);
    expect(g.enemies).toHaveLength(0);
    expect(g.run.kills).toBe(0);
    expect(g.run.completed).toBe(false);
    expect(() => g.rpgTerminalResult()).toThrow();
    expect(
      clientMessage.safeParse({
        type: "GATHER_START",
        nodeId: g.nodes[0].id,
        requestId: randomUUID(),
        expectedRevision: 1,
        quantity: 999,
        userId: "other",
      }).success,
    ).toBe(false);
    expect(
      clientMessage.safeParse({
        type: "INPUT",
        sequence: 1,
        moveX: 3,
        moveY: 0,
        interact: false,
      }).success,
    ).toBe(false);
    g.disconnect("p");
    for (let i = 0; i < 1502; i++) g.update(0.04);
    expect(g.ended).toBe(true);
  });
});
