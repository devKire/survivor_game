"use server";
import { z } from "zod";
import { requireUser } from "../auth";
import { limit, UserError } from "../security";
import { requireRpgEnabled } from "./guard";
import { rpgProfileData } from "./profile";
import { rpgPresentation } from "./presentation";
import { rpgCharacterIdSchema } from "../../game/core/rpg";

/** Read only. A client instance ID never replaces the authenticated owner. */
export async function compareRpgItemAction(input: unknown) {
  try {
    requireRpgEnabled();
    const user = await requireUser();
    const parsed = z
      .object({
        characterId: rpgCharacterIdSchema,
        instanceId: z.string().min(1).max(100),
      })
      .strict()
      .parse(input);
    await limit("rpg-preview:" + user.id, 60);
    const profile = await rpgProfileData(user.id);
    const result = rpgPresentation(profile, parsed).comparison;
    if (!result) throw new UserError("Personagem indisponível.");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof UserError
          ? error.message
          : "Não foi possível comparar o equipamento.",
    };
  }
}
