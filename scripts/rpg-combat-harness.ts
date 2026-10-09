import "dotenv/config";
import { createDevelopmentRpgSession } from "../src/server/rpg/development-session";
import { db } from "../src/server/db";
import { SnapshotStream } from "../src/realtime/snapshots";

// Usage: RPG_ENABLED=true RPG_DEVELOPMENT_HARNESS=1 node --conditions=react-server --import tsx scripts/rpg-combat-harness.ts userId:nara [userId:ivo]
const participants = process.argv.slice(2).map((arg) => {
  const [userId, characterId, extra] = arg.split(":");
  if (!userId || !characterId || extra)
    throw new Error("Use userId:characterId para cada participante existente.");
  return { userId, characterId };
});
try {
  const game = await createDevelopmentRpgSession(
    participants,
    "RPG-DEVELOPMENT-V1",
  );
  for (let tick = 0; tick < 25; tick++) game.update(0.04);
  console.log(
    JSON.stringify(
      {
        context: "RPG_EXPEDITION",
        rewards: false,
        players: [...game.members.values()].map((m) => ({
          character: m.player.character,
          maxHealth: m.player.maxHealth,
          stats: new SnapshotStream().build(game, m, 25, true).own.stats,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await db().$disconnect();
}
