import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { RPG_CHARACTERS } from "../../game/content/rpg";
import { canAccessRpgCharacter } from "../../game/core/rpg";
import { db } from "../db";
import { progress } from "../progress";
import { UserError } from "../security";
import { ensureRpgProfile } from "./profile";

export const selectCharacterInput = z
  .object({
    requestId: z.uuid(),
    expectedRevision: z.coerce.number().int().positive(),
    characterId: z.enum(Object.keys(RPG_CHARACTERS) as [keyof typeof RPG_CHARACTERS, ...(keyof typeof RPG_CHARACTERS)[]]),
  })
  .strict();

const resultSchema = z.object({ revision: z.number().int().positive(), characterId: z.string() }).strict();

export async function selectRpgCharacter(userId: string, input: unknown) {
  const value = selectCharacterInput.parse(input);
  const operation = "select-character";
  const payloadHash = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  await progress(userId);

  return db().$transaction(async (tx) => {
    const { save } = await ensureRpgProfile(tx, userId);
    const prior = await tx.rpgMutationReceipt.findUnique({
      where: { userId_requestId: { userId, requestId: value.requestId } },
    });
    if (prior) {
      if (prior.operation !== operation || prior.payloadHash !== payloadHash)
        throw new UserError("requestId já utilizado por outra mutação RPG.");
      return resultSchema.parse(prior.result);
    }

    await tx.$queryRaw(Prisma.sql`
      SELECT "userId" FROM "limiar"."RpgProfile"
      WHERE "userId" = ${userId} FOR UPDATE
    `);
    if (!canAccessRpgCharacter(value.characterId, save.unlocked))
      throw new UserError("Personagem ainda não desbloqueado.");
    const character = await tx.rpgCharacter.findUnique({
      where: { userId_characterId: { userId, characterId: value.characterId } },
    });
    if (!character) throw new UserError("Personagem RPG indisponível.");

    const updated = await tx.rpgProfile.updateMany({
      where: { userId, revision: value.expectedRevision },
      data: { activeCharacterId: character.id, revision: { increment: 1 } },
    });
    if (!updated.count)
      throw new UserError("O perfil RPG mudou em outra aba. Atualize a página.");

    const result = { revision: value.expectedRevision + 1, characterId: value.characterId };
    await tx.rpgMutationReceipt.create({
      data: {
        userId,
        requestId: value.requestId,
        operation,
        payloadHash,
        revision: result.revision,
        result,
      },
    });
    return result;
  }, { isolationLevel: "Serializable" });
}
