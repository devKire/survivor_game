import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  generateVisualChunk,
  VisualChunkCache,
  corruptionPressure,
  groundCell,
  structureArt,
  propClearOfStructures,
  type VisualConfig,
} from "../src/game/core/world-visuals";
import { validTileMetadata } from "../src/game/content/tile-types";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { SnapshotStream } from "../src/realtime/snapshots";
const config: VisualConfig = {
  seed: "qa",
  mapId: "ruins",
  profile: "ruins",
  density: 0.48,
};
describe("deterministic visual world without gameplay authority", () => {
  it("reconstructs identical chunks without random, including negative coordinates", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw Error("nondeterministic");
    });
    try {
      for (const [x, y] of [
        [0, 0],
        [-2, 3],
        [10, -8],
      ])
        expect(generateVisualChunk(config, x, y)).toEqual(
          generateVisualChunk({ ...config }, x, y),
        );
      expect(generateVisualChunk(config, 2, 3)).not.toEqual(
        generateVisualChunk({ ...config, seed: "other" }, 2, 3),
      );
    } finally {
      random.mockRestore();
    }
  });
  it("shares border descriptors and retains only nearby chunks", () => {
    const a = generateVisualChunk(config, 0, 0),
      b = generateVisualChunk(config, 1, 0);
    expect(a.ground.filter((c) => c.x === 768)).toEqual(
      b.ground.filter((c) => c.x === 768),
    );
    const cache = new VisualChunkCache();
    cache.configure(config);
    for (let x = -20; x < 20; x++) cache.get(config, x, 0);
    cache.retain(-1, -1, 1, 1);
    expect(cache.chunks.size).toBe(3);
    cache.configure({ ...config, seed: "new" });
    expect(cache.chunks.size).toBe(0);
    expect(groundCell(config, -1, -1)).toEqual(groundCell(config, -1, -1));
  });
  it("clears spawn and smoothly warns of bosses without changing candidates", () => {
    expect(
      generateVisualChunk(config, 0, 0).props.every(
        (p) => Math.hypot(p.x, p.y) >= 210,
      ),
    ).toBe(true);
    expect(corruptionPressure(100, [240])).toBe(0);
    expect(corruptionPressure(220, [240])).toBeGreaterThan(
      corruptionPressure(200, [240]),
    );
    expect(corruptionPressure(240, [240])).toBe(1);
    expect(corruptionPressure(300, [240])).toBe(0);
  });
  it("preserves full snapshots, authoritative structures and saved changes", () => {
    const g = new CoopSimulation(
      [{ id: "p0", name: "QA", character: "nara", progress: freshSave() }],
      "normal",
      "ruins",
      "qa",
    );
    g.update(0.04);
    const member = g.members.get("p0")!;
    const before = new SnapshotStream().build(g, member, 1, true);
    const structures = JSON.stringify(g.world.nearby);
    for (const s of g.world.nearby) {
      structureArt(config, Object.freeze({ ...s }));
      propClearOfStructures({ x: 0, y: 0, height: 100 }, [s]);
    }
    for (let x = -2; x <= 2; x++) generateVisualChunk(config, x, 1);
    expect(JSON.stringify(g.world.nearby)).toBe(structures);
    expect(new SnapshotStream().build(g, member, 1, true)).toEqual(before);
    expect(JSON.stringify(before)).not.toMatch(
      /visualChunks|corruptionThreshold|sourceRect|trees_living/,
    );
  });
  it("validates every source hash, 64 rectangles and prop anchors", () => {
    const root = "src/game/assets/tiles/";
    const paths = readdirSync(root, { recursive: true })
      .map(String)
      .filter((p) => /source[^/]*\.png$/.test(p));
    expect(paths).toHaveLength(24);
    for (const path of paths) {
      const metadata = JSON.parse(
        readFileSync(root + path.replace(/\.png$/, ".json"), "utf8"),
      );
      expect(validTileMetadata(metadata), path).toBe(true);
      expect(
        createHash("sha256")
          .update(readFileSync(root + path))
          .digest("hex"),
      ).toBe(metadata.source.sha256);
      expect(
        new Set(metadata.slots.map((s: { index: number }) => s.index)).size,
      ).toBe(64);
      expect(
        validTileMetadata({
          ...metadata,
          detection: { confidence: undefined },
        }),
      ).toBe(false);
      expect(validTileMetadata({ ...metadata, slots: [] })).toBe(false);
    }
  });
});
