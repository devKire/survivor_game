"use server";
import { z } from "zod";
import { requireUser } from "../../auth";
import { limit, UserError } from "../../security";
import { requireRpgExplorationEnabled } from "../guard";
import { rpgProfileData } from "../profile";
import { currentTeam, createTeam, updateTeam } from "../../teams";
export async function prepareExploration(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    requireRpgExplorationEnabled();
    const user = await requireUser();
    z.object({ regionId: z.literal("ruins-outskirts") })
      .strict()
      .parse(input);
    await limit("exploration-prepare:" + user.id, 10);
    const profile = await rpgProfileData(user.id),
      active = profile.characters.find(
        (c) => c.id === profile.activeCharacterId,
      )!;
    const team = (await currentTeam(user.id)) ?? (await createTeam(user.id));
    if (team.status === "RUNNING")
      throw new UserError(
        "Sua equipe já está em uma atividade. Retorne ao lobby para reconectar.",
      );
    await updateTeam(user.id, {
      character: active.characterId,
      ...(team.leaderId === user.id
        ? { expeditionKind: "RPG_EXPLORATION" }
        : {}),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof UserError
          ? error.message
          : "Não foi possível preparar a exploração. Tente novamente.",
    };
  }
}
