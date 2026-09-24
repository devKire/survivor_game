import { PVP_RULES } from "../content/mode-rules";
import { STATUS_DEFINITIONS } from "../content/catalog";
import { clamp } from "./math";
import type * as T from "./types";
export function applyStatus(
  e: T.Enemy,
  id: string,
  duration: number,
  magnitude = 1,
  source: T.Status["source"] = null,
  stacks = 1,
) {
  const def = STATUS_DEFINITIONS[id];
  if (!def || e.dead) return;
  if (source?.ruleset === "PVP" && (id === "slow" || id === "freeze")) {
    e.controlImmunity ??= {};
    if ((e.controlImmunity[id] || 0) > 0) return;
    duration = Math.min(
      duration,
      id === "freeze" ? PVP_RULES.freezeDuration : PVP_RULES.slowDuration,
    );
    if (id === "slow")
      magnitude = Math.max(PVP_RULES.slowSpeedFloor, magnitude);
    e.controlImmunity[id] = duration + PVP_RULES.controlImmunity;
  }
  const old = e.statuses[id] || {
    duration: 0,
    magnitude: 0,
    stacks: 0,
    source: null,
    tick: 0,
  };
  old.duration = Math.max(old.duration, duration);
  old.magnitude = Math.max(old.magnitude, magnitude);
  old.stacks = clamp(old.stacks + stacks, 1, def.maxStacks || 1);
  old.source = source || old.source;
  e.statuses[id] = old;
}

export function hasStatus(e: T.Enemy, id: string) {
  return !!e.statuses?.[id]?.duration;
}
