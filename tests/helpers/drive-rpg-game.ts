import { setImmediate } from "node:timers/promises";
import type { CoopSimulation } from "../../src/game/core/coop";
/** Test driver only. Actual engine time, director, kills and completion. */
export async function driveRpgGame(
  room: { game: CoopSimulation; tick: number },
  inactiveUserId?: string,
) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test driver only");
  const game = room.game;
  let steps = 0;
  while (!game.ended && steps < 15002) {
    // Survival and input fixtures only. Events still originate in the engine's
    // actual director, damage resolution and elapsed-duration completion.
    for (const m of game.members.values()) {
      m.player.invulnerable = 10;
      if (m.id !== inactiveUserId)
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
  return { steps, ended: game.ended };
}
