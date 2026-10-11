import "server-only";
import { db } from "../db";
import { isRpgExpeditionsEnabled } from "../env";
import { settleRpgExpedition } from "./rewards";

/** Startup of the single authoritative realtime process only, never a web request.
 * Lost RUNNING simulations cannot be reconstructed from client saves/snapshots.
 * TERMINAL rows survive and retain their seats until the atomic payout succeeds.
 */
export async function interruptLostRpgExpeditions() {
  const lost = await db().rpgExpeditionSession.findMany({
    where: { status: "RUNNING" },
    select: { sessionId: true, session: { select: { teamId: true } } },
  });
  for (const row of lost)
    await db().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${row.session.teamId} FOR UPDATE`;
      const changed = await tx.rpgExpeditionSession.updateMany({
        where: { sessionId: row.sessionId, status: "RUNNING" },
        data: { status: "INTERRUPTED" },
      });
      if (!changed.count) return;
      await tx.rpgExpeditionParticipant.updateMany({
        where: { sessionId: row.sessionId },
        data: { activeUserId: null },
      });
      await tx.gameSession.update({
        where: { id: row.sessionId },
        data: { status: "INTERRUPTED", endedAt: new Date() },
      });
      await tx.team.update({
        where: { id: row.session.teamId },
        data: { status: "LOBBY" },
      });
      await tx.teamMember.updateMany({
        where: { teamId: row.session.teamId },
        data: { ready: false },
      });
    });
}

/** Bounded background retry, outside simulation ticks. Each room failure is isolated. */
export async function recoverRpgRewards(
  onFailure: (sessionId: string) => void = () => {},
) {
  if (!isRpgExpeditionsEnabled()) return;
  const pending = await db().rpgExpeditionSession.findMany({
    where: { status: "TERMINAL" },
    orderBy: { terminalAt: "asc" },
    take: 32,
    select: { sessionId: true },
  });
  for (const row of pending) {
    try {
      await settleRpgExpedition(row.sessionId);
    } catch {
      onFailure(row.sessionId);
    }
  }
}
