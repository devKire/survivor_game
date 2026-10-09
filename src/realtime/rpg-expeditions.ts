import "server-only";
import { CoopSimulation } from "../game/core/coop";
import { migrateSave } from "../game/core/save";
import { validateCombatLoadout, type RpgCombatLoadout } from "../game/core/rpg";
import { db } from "../server/db";
import { rewardHash } from "../server/rpg/reward-integrity";
import { persistRpgTerminal } from "../server/rpg/expedition-terminal";
import { settleRpgExpedition } from "../server/rpg/rewards";
import { requireRpgExpeditionsEnabled } from "../server/rpg/guard";

// Only this factory binds a real persisted START to the live simulation.
// Phase 2 development games and arbitrary Coop instances never have this capability.
const authority = new WeakMap<CoopSimulation, string>();
export async function createAuthorizedRpgSimulation(sessionId: string) {
  requireRpgExpeditionsEnabled();
  const row = await db().rpgExpeditionSession.findUniqueOrThrow({
    where: { sessionId },
    include: {
      session: {
        include: {
          members: { include: { user: { include: { progress: true } } } },
        },
      },
      participants: true,
    },
  });
  if (
    row.status !== "RUNNING" ||
    row.session.status !== "RUNNING" ||
    row.participants.length !== row.session.partySize ||
    row.session.members.length !== row.session.partySize
  )
    throw new Error("RPG authority unavailable");
  const loadouts: Record<string, RpgCombatLoadout> = {};
  for (const p of row.participants) {
    const loadout = validateCombatLoadout(
      p.loadout as unknown as RpgCombatLoadout,
    );
    if (
      rewardHash(loadout) !== p.loadoutHash ||
      loadout.characterId !== p.characterId ||
      loadout.level !== p.entryLevel ||
      loadout.profileRevision !== p.entryRevision
    )
      throw new Error("RPG build integrity failure");
    loadouts[p.userId] = loadout;
  }
  const players = row.session.members.map((m) => ({
    id: m.userId,
    character: m.character,
    name: m.user.displayUsername || m.user.username || "Eco",
    progress: migrateSave(m.user.progress?.data),
  }));
  const game = new CoopSimulation(
    players,
    row.session.mode,
    row.session.mapId,
    row.session.seed,
    row.session.duration,
    { kind: "RPG_EXPEDITION", loadouts },
  );
  authority.set(game, sessionId);
  return game;
}

export async function settleAuthorizedRpgSimulation(
  sessionId: string,
  game: CoopSimulation,
): Promise<"PENDING" | "CONFIRMED"> {
  if (authority.get(game) !== sessionId || !game.ended)
    throw new Error("Unauthorized RPG simulation");
  await persistRpgTerminal(sessionId, game.rpgTerminalResult());
  try {
    await settleRpgExpedition(sessionId);
    return "CONFIRMED";
  } catch {
    return "PENDING";
  } // Evidence is durable. Background recovery handles payout retries.
}
