/** Explicit Playwright-only authority driver. No HTTP/WS testing commands. */
import "dotenv/config";
import { driveRpgGame } from "./drive-rpg-game";
if (
  process.env.NODE_ENV !== "test" ||
  process.env.RPG_EXPEDITION_BROWSER_DRIVER !== "1"
)
  throw new Error("Browser driver requires explicit test environment");
const { rooms } = await import("../../src/realtime/server");
const driven = new WeakSet<object>();
let driving = false;
const timer = setInterval(() => {
  if (driving) return;
  const room = [...rooms.values()].find(
    (r) => r.game.activityKind === "RPG_EXPEDITION" && !driven.has(r) && !r.game.ended,
  );
  if (!room) return;
  driven.add(room);
  driving = true;
  void driveRpgGame(room)
    .catch(() => console.error("Browser RPG driver failed"))
    .finally(() => {
      driving = false;
    });
}, 2000);
process.on("SIGTERM", () => clearInterval(timer));
process.on("SIGINT", () => clearInterval(timer));
