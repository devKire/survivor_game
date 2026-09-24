import { describe, expect, it } from "vitest";
import {
  MAX_EXTRAPOLATION_MS,
  beginMotion,
  nextSnapshotTiming,
  sampleMotion,
} from "../src/game/client/interpolation";

describe("remote snapshot interpolation", () => {
  it("keeps a temporal buffer when snapshots arrive at the nominal 10 Hz rate", () => {
    const timing = nextSnapshotTiming(undefined, 0);
    const motion = beginMotion(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      100,
      100,
      timing.delay,
    );

    expect(timing.delay).toBeGreaterThan(100);
    expect(sampleMotion(motion, 200).x).toBeLessThan(100);
  });

  it("uses a bounded extrapolation instead of freezing during one delayed snapshot", () => {
    const motion = beginMotion(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      100,
      0,
      120,
    );

    const delayed = sampleMotion(motion, 170);
    const capped = sampleMotion(motion, 120 + MAX_EXTRAPOLATION_MS + 300);

    expect(delayed.extrapolating).toBe(true);
    expect(delayed.x).toBeGreaterThan(100);
    expect(capped.x).toBe(200);
  });

  it("widens the delay only when observed cadence becomes irregular", () => {
    const stable = nextSnapshotTiming(nextSnapshotTiming(undefined, 0), 100);
    const jittered = nextSnapshotTiming(stable, 250);

    expect(jittered.jitter).toBeGreaterThan(stable.jitter);
    expect(jittered.delay).toBeGreaterThanOrEqual(stable.delay);
  });
});
