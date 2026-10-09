/** Test-only IPC harness around the actual authenticated WebSocket server.
 * No new network command or public RPG session mode is registered. */
import "dotenv/config";
import { z } from "zod";
import { db } from "../../src/server/db";
import { createDevelopmentRpgSession } from "../../src/server/rpg/development-session";
if (
  process.env.NODE_ENV !== "test" ||
  process.env.RPG_DEVELOPMENT_HARNESS !== "1" ||
  process.env.RPG_ENABLED !== "true" ||
  !process.send
)
  throw new Error("Test harness requires explicit test environment and IPC.");
const { rooms } = await import("../../src/realtime/server");
process.on("message", async (message) => {
  try {
    const { sessionId } = z
      .object({ sessionId: z.string().min(1).max(100) })
      .strict()
      .parse(message);
    const session = await db().gameSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { members: true },
    });
    if (session.status !== "RUNNING") throw new Error("Session is not running");
    const game = await createDevelopmentRpgSession(
      session.members.map((m) => ({
        userId: m.userId,
        characterId: m.character,
      })),
      session.seed,
    );
    rooms.set(session.id, {
      id: session.id,
      teamId: session.teamId,
      game,
      tick: 0,
      accumulator: 0,
      snapshotClock: 0,
      settling: true,
    });
    // settling=true makes this reward-free harness ineligible for normal settlement.
    process.send?.({ ready: session.id });
  } catch {
    process.send?.({ error: "RPG test session rejected" });
  }
});
