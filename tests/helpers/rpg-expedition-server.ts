/** Test-only IPC accelerates actual engine ticks after public WS START.
 * Never creates sessions, terminals or grants. No production command imports it.
 */
import "dotenv/config";
import { driveRpgGame } from "./drive-rpg-game";
import { z } from "zod";
if (
  process.env.NODE_ENV !== "test" ||
  process.env.RPG_EXPEDITION_TEST_DRIVER !== "1" ||
  !process.send
)
  throw new Error("Test IPC only");
const { rooms } = await import("../../src/realtime/server");
let driving = false;
process.on("message", async (input) => {
  if (driving) return;
  driving = true;
  try {
    const { sessionId, inactiveUserId } = z
      .object({
        sessionId: z.string().min(1).max(100),
        inactiveUserId: z.string().max(100).optional(),
      })
      .strict()
      .parse(input);
    const room = rooms.get(sessionId);
    if (!room?.game.isRpgExpedition)
      throw new Error("Public RPG START required");
    const { steps, ended } = await driveRpgGame(room, inactiveUserId);
    process.send?.({ completed: sessionId, steps, ended });
  } catch (error) {
    process.send?.({
      error: error instanceof Error ? error.message : "driver failure",
    });
  } finally {
    driving = false;
  }
});
