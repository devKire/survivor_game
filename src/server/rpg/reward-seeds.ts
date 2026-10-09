import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { RPG_REWARD_SOURCES } from "../../game/content/rpg/reward-profiles";
import type { RpgRewardSource } from "../../game/core/rpg/loot-types";

export function createRewardSeed() {
  return randomBytes(32).toString("hex");
}
/** Root seed never leaves server persistence. Unambiguous domain-separated HMAC. */
export function deriveRewardRollSeed(
  root: string,
  sessionId: string,
  userId: string,
  source: RpgRewardSource,
  eventId: string,
  rollIndex: number,
  tableVersion: number,
) {
  if (
    !/^[a-f0-9]{64}$/.test(root) ||
    !RPG_REWARD_SOURCES.includes(source) ||
    !Number.isInteger(rollIndex) ||
    rollIndex < 0 ||
    rollIndex > 3 ||
    tableVersion !== 1 ||
    [sessionId, userId, eventId].some((s) => !s || s.length > 160)
  )
    throw new RangeError("Contexto de seed inválido.");
  return createHmac("sha256", Buffer.from(root, "hex"))
    .update(
      JSON.stringify([
        "limiar-rpg-reward-v1",
        sessionId,
        userId,
        source,
        eventId,
        rollIndex,
        tableVersion,
      ]),
    )
    .digest("hex");
}
