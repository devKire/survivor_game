import "server-only";
import { CoopSimulation } from "../../game/core/coop";
import { freshSave } from "../../game/core/save";
import { buildRpgCombatLoadout } from "./loadout";
import { requireRpgEnabled } from "./guard";
import { UserError } from "../security";

/** No HTTP/WS entry point, no fixtures or grants. Developer CLI/tests only. */
export async function createDevelopmentRpgSession(
  participants: readonly { userId: string; characterId: string }[],
  seed: string,
) {
  requireRpgEnabled();
  if (
    process.env.NODE_ENV === "production" ||
    process.env.RPG_DEVELOPMENT_HARNESS !== "1"
  )
    throw new UserError("Harness RPG de desenvolvimento desabilitado.");
  if (
    participants.length < 1 ||
    participants.length > 5 ||
    new Set(participants.map((p) => p.userId)).size !== participants.length
  )
    throw new UserError("Participantes inválidos.");
  const loadouts = Object.fromEntries(
    await Promise.all(
      participants.map(
        async (p) =>
          [
            p.userId,
            await buildRpgCombatLoadout(p.userId, p.characterId),
          ] as const,
      ),
    ),
  );
  // Detached, nonpersistent Survivor state: this harness has no settlement path.
  return new CoopSimulation(
    participants.map((p) => ({
      id: p.userId,
      name: p.characterId,
      character: p.characterId,
      progress: { ...freshSave(), unlocked: [p.characterId] },
    })),
    "normal",
    "ruins",
    seed,
    600,
    { kind: "RPG_EXPEDITION", loadouts },
  );
}
