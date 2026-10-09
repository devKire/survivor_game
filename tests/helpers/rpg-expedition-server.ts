/** Test-only IPC accelerates actual engine ticks after public WS START.
 * Never creates sessions, terminals or grants. No production command imports it.
 */
import "dotenv/config";
import { setImmediate } from "node:timers/promises";
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
    const { sessionId } = z
      .object({ sessionId: z.string().min(1).max(100) })
      .strict()
      .parse(input);
    const room = rooms.get(sessionId);
    if (!room?.game.isRpgExpedition)
      throw new Error("Public RPG START required");
    const game = room.game;
    let steps = 0;
    while (!game.ended && steps < 15002) {
      // Survival and input fixtures only. Events still originate in the engine's
      // actual director, damage resolution and elapsed-duration completion.
      for (const m of game.members.values()) {
        m.player.invulnerable = 10;
        game.acceptInput(m.id, {
          sequence: m.input.sequence + 1,
          moveX: Math.sin(game.run.time / 3),
          moveY: Math.cos(game.run.time / 3),
          interact: false,
        });
      }
      for (const enemy of game.enemies)
        if (!enemy.dead) game.damageEnemy(enemy, 1e9, game.player.weapons[0]);
      game.update(0.04);
      room.tick++;
      steps++;
      if (steps % 50 === 0) await setImmediate();
    }
    process.send?.({ completed: sessionId, steps, ended: game.ended });
  } catch (error) {
    process.send?.({
      error: error instanceof Error ? error.message : "driver failure",
    });
  } finally {
    driving = false;
  }
});
