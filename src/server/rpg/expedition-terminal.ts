import "server-only";
import { db } from "../db";
import { economyJson } from "../economy";
import { validateTerminalResult } from "../../game/core/rpg/reward-policy";
import { rewardHash } from "./reward-integrity";

/** Internal authority boundary. Never import from actions/routes or accept network payloads.
 * Realtime verifies the live simulation capability before calling this writer.
 * Deliberately works with rollout flags off: preserve earned terminal evidence.
 */
export async function persistRpgTerminal(sessionId: string, input: unknown) {
  const terminal = validateTerminalResult(input),
    terminalHash = rewardHash(terminal);
  const row = await db().rpgExpeditionSession.findUniqueOrThrow({
    where: { sessionId },
    include: { participants: true, session: true },
  });
  if (row.terminalHash) {
    if (row.terminalHash !== terminalHash)
      throw new Error("Divergent RPG terminal replay");
    return;
  }
  if (
    row.status !== "RUNNING" ||
    row.session.status !== "RUNNING" ||
    row.session.partySize !== row.participants.length ||
    terminal.participants.length !== row.participants.length ||
    terminal.participants.some(
      (p) =>
        !row.participants.some(
          (s) =>
            s.userId === p.userId &&
            s.characterId === p.characterId &&
            s.entryLevel === p.entryLevel,
        ),
    )
  )
    throw new Error("RPG terminal authority mismatch");
  const changed = await db().rpgExpeditionSession.updateMany({
    where: { sessionId, status: "RUNNING", terminalHash: null },
    data: {
      status: "TERMINAL",
      terminal: economyJson(terminal),
      terminalHash,
      terminalAt: new Date(),
    },
  });
  if (!changed.count) {
    const prior = await db().rpgExpeditionSession.findUniqueOrThrow({
      where: { sessionId },
    });
    if (prior.terminalHash !== terminalHash)
      throw new Error("RPG terminal conflict");
  }
}
