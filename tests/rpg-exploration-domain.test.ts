import { describe, it, expect } from "vitest";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import {
  EXPLORATION_RUINS as region,
  explorationRegion,
} from "../src/game/content/rpg/exploration-regions";
import {
  EXPLORATION_RESOURCES,
  explorationResource,
} from "../src/game/content/rpg/exploration-resources";
import { RPG_MATERIALS } from "../src/game/content/rpg";
import {
  generateExploration,
  validateRegion,
  regionContains,
  inDiscoveryRange,
} from "../src/game/core/rpg/exploration/generation";
import {
  gatheringCycle,
  gatheringIntent,
  gatheringQuantity,
} from "../src/game/core/rpg/exploration/gathering";
const game = () =>
  new CoopSimulation(
    [{ id: "p", name: "Eco", character: "nara", progress: freshSave() }],
    "normal",
    region.mapId,
    region.seed,
  );
describe("Exploration content v1", () => {
  it("validates finite regions and explicit versions", () => {
    expect(() => validateRegion(region)).not.toThrow();
    expect(() => explorationRegion(region.id, 2)).toThrow();
    expect(() => explorationRegion("fabricated", 1)).toThrow();
    for (const patch of [
      { maxSeconds: Infinity },
      { claimsPerSession: 999 },
      { claimsPerCycle: 0 },
      { seed: "" },
      {
        bounds: {
          minChunkX: 1e20,
          maxChunkX: 1e20,
          minChunkY: 0,
          maxChunkY: 0,
        },
      },
    ])
      expect(() => validateRegion({ ...region, ...patch })).toThrow();
    expect(() =>
      validateRegion({
        ...region,
        bounds: { ...region.bounds, maxChunkX: 999 },
      }),
    ).toThrow();
    expect(() =>
      validateRegion({ ...region, spawn: { x: -1000, y: 0 } }),
    ).toThrow();
  });
  it("reproduces descriptors and leaves Survivor geometry byte-identical", () => {
    const g = game(),
      before = JSON.stringify(g.world.createChunk(0, 0));
    const a = generateExploration(region, g.world),
      b = generateExploration(region, g.world);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    expect(a.length).toBeLessThanOrEqual(36);
    expect(new Set(a.map((n) => n.id)).size).toBe(a.length);
    expect(JSON.stringify(g.world.createChunk(0, 0))).toBe(before);
    expect(
      a.every(
        (n) =>
          n.id.startsWith("explore:v1:") &&
          regionContains(region, n.x, n.y, 70),
      ),
    ).toBe(true);
    expect(a.every((n) => Math.hypot(n.x, n.y) >= 150)).toBe(true);
    for (const n of a) {
      const structures = g.world.createChunk(
        Math.floor(n.x / 640),
        Math.floor(n.y / 640),
      ).structures;
      expect(
        structures.every((s) => Math.hypot(s.x - n.x, s.y - n.y) >= s.r + 75),
      ).toBe(true);
    }
    expect(
      generateExploration({ ...region, version: 2 }, g.world).map((n) => n.id),
    ).not.toEqual(a.map((n) => n.id));
    expect(
      new Set(
        a
          .filter((n) => n.kind === "RESOURCE")
          .map((n) => explorationResource(n.definitionId).category),
      ).size,
    ).toBe(3);
  });
  it("bounds gathering supply and validates server time, balance and strict intentions", () => {
    for (const r of EXPLORATION_RESOURCES) {
      expect(RPG_MATERIALS).toHaveProperty(r.materialId);
      expect(r.durationMs).toBeGreaterThanOrEqual(1200);
    }
    expect(() => explorationResource("invented")).toThrow();
    expect(gatheringCycle(Date.UTC(2026, 9, 12, 23, 59, 59))).toBe(
      gatheringCycle(Date.UTC(2026, 9, 12)),
    );
    expect(gatheringCycle(Date.UTC(2026, 9, 13))).toBe(
      gatheringCycle(Date.UTC(2026, 9, 12)) + 1,
    );
    expect(gatheringQuantity(2, 999999999)).toBe(1);
    expect(gatheringQuantity(2, 1000000000)).toBe(0);
    expect(() => gatheringQuantity(999, 0)).toThrow();
    expect(() => gatheringCycle(NaN)).toThrow();
    expect(
      gatheringIntent.safeParse({
        nodeId: "fake",
        quantity: 999,
        userId: "other",
      }).success,
    ).toBe(false);
    expect(region.claimsPerSession * 2).toBe(24);
    expect(region.claimsPerCycle * 2).toBe(36);
  });
  it("discovers only known POIs inside their own radius", () => {
    const nodes = generateExploration(region, game().world),
      p = nodes.find((n) => n.kind === "POI")!;
    expect(inDiscoveryRange(p, p)).toBe(true);
    expect(inDiscoveryRange(p, { x: p.x + p.radius + 1, y: p.y })).toBe(false);
    expect(
      inDiscoveryRange(
        nodes.find((n) => n.kind === "RESOURCE")!,
        p,
      ),
    ).toBe(false);
  });
});
