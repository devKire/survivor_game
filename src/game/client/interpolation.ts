import type { Vec } from "../core/types";

/**
 * Remote actors are deliberately rendered a little behind authority. Keeping a
 * short visual buffer absorbs normal WebSocket cadence variation without
 * delaying the locally predicted player.
 */
export const MIN_INTERPOLATION_DELAY_MS = 120;
export const MAX_INTERPOLATION_DELAY_MS = 200;
export const MAX_EXTRAPOLATION_MS = 100;

export type SnapshotTiming = {
  receivedAt: number;
  interval: number;
  jitter: number;
  delay: number;
};

export type Motion = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  receivedAt: number;
  duration: number;
  extrapolated: boolean;
};

export type MotionSample = Vec & { extrapolating: boolean };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function nextSnapshotTiming(
  timing: SnapshotTiming | undefined,
  receivedAt: number,
): SnapshotTiming {
  if (!timing) {
    return {
      receivedAt,
      interval: 100,
      jitter: 0,
      delay: MIN_INTERPOLATION_DELAY_MS,
    };
  }

  const sample = clamp(receivedAt - timing.receivedAt, 1, 1000);
  const interval = timing.interval * 0.8 + sample * 0.2;
  const jitter = timing.jitter * 0.8 + Math.abs(sample - interval) * 0.2;

  return {
    receivedAt,
    interval,
    jitter,
    delay: clamp(
      interval + Math.max(20, jitter * 2),
      MIN_INTERPOLATION_DELAY_MS,
      MAX_INTERPOLATION_DELAY_MS,
    ),
  };
}

export function beginMotion(
  current: Vec,
  target: Vec,
  authoritativeBefore: Vec | undefined,
  elapsedMs: number,
  receivedAt: number,
  duration: number,
): Motion {
  const safeElapsed = Math.max(1, elapsedMs);
  return {
    x: current.x,
    y: current.y,
    targetX: target.x,
    targetY: target.y,
    velocityX: authoritativeBefore
      ? (target.x - authoritativeBefore.x) / safeElapsed
      : 0,
    velocityY: authoritativeBefore
      ? (target.y - authoritativeBefore.y) / safeElapsed
      : 0,
    receivedAt,
    duration,
    extrapolated: false,
  };
}

export function sampleMotion(
  motion: Motion,
  now: number,
  output: MotionSample = { x: 0, y: 0, extrapolating: false },
): MotionSample {
  const elapsed = Math.max(0, now - motion.receivedAt);
  const progress = clamp(elapsed / motion.duration, 0, 1);
  let x = motion.x + (motion.targetX - motion.x) * progress;
  let y = motion.y + (motion.targetY - motion.y) * progress;
  const extra = clamp(elapsed - motion.duration, 0, MAX_EXTRAPOLATION_MS);

  if (extra > 0) {
    x = motion.targetX + motion.velocityX * extra;
    y = motion.targetY + motion.velocityY * extra;
  }

  output.x = x;
  output.y = y;
  output.extrapolating = extra > 0 && (motion.velocityX !== 0 || motion.velocityY !== 0);
  return output;
}
