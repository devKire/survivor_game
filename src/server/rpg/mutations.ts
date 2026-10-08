import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { RPG_CHARACTERS } from "../../game/content/rpg";
import {
  allocateAttributePoints,
  canAccessRpgCharacter,
  RPG_ATTRIBUTE_KEYS,
  RPG_ATTRIBUTE_MAX,
  rpgAttributesSchema,
} from "../../game/core/rpg";
import { UserError } from "../security";
import { ensureRpgProfile } from "./profile";
import { requireRpgEnabled } from "./guard";
import { lockRpgAccount, rpgTransaction } from "./transaction";

const characterId = z.enum(
  Object.keys(RPG_CHARACTERS) as [
    keyof typeof RPG_CHARACTERS,
    ...(keyof typeof RPG_CHARACTERS)[],
  ],
);
const common = {
  requestId: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2_147_483_646),
  characterId,
};
export const selectCharacterInput = z.object(common).strict();
export const allocateAttributesInput = z
  .object({
    ...common,
    attribute: z.enum(RPG_ATTRIBUTE_KEYS),
    amount: z.number().int().min(1).max(RPG_ATTRIBUTE_MAX),
  })
  .strict();
const resultSchema = z
  .object({ revision: z.number().int().positive(), characterId })
  .strict();
type Command =
  | z.infer<typeof selectCharacterInput>
  | z.infer<typeof allocateAttributesInput>;

async function mutate(
  userId: string,
  operation: "select-character" | "allocate-attributes",
  value: Command,
) {
  // Parsed schemas canonically order fields; preserve Phase 1 selection fingerprints.
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  return rpgTransaction(async (tx) => {
    const save = await lockRpgAccount(tx, userId);
    const prior = await tx.rpgMutationReceipt.findUnique({
      where: { userId_requestId: { userId, requestId: value.requestId } },
    });
    if (prior) {
      if (prior.operation !== operation || prior.payloadHash !== payloadHash)
        throw new UserError("requestId já utilizado por outra mutação RPG.");
      return resultSchema.parse(prior.result);
    }
    if (!canAccessRpgCharacter(value.characterId, save.unlocked))
      throw new UserError("Personagem ainda não desbloqueado.");
    await ensureRpgProfile(tx, userId, save);
    const profile = await tx.rpgProfile.findUniqueOrThrow({
      where: { userId },
    });
    if (profile.revision !== value.expectedRevision)
      throw new UserError(
        "O perfil RPG mudou em outra aba. Atualize a página antes de tentar novamente.",
      );
    const character = await tx.rpgCharacter.findUniqueOrThrow({
      where: { userId_characterId: { userId, characterId: value.characterId } },
    });
    if (operation === "allocate-attributes" && "attribute" in value) {
      const attributes = rpgAttributesSchema.parse(character.attributes);
      let allocation;
      try {
        allocation = allocateAttributePoints(
          { ...character, attributes },
          value.attribute,
          value.amount,
        );
      } catch (error) {
        if (error instanceof RangeError) throw new UserError(error.message);
        throw error;
      }
      await tx.rpgCharacter.update({
        where: {
          userId_characterId: { userId, characterId: value.characterId },
        },
        data: {
          attributes: allocation.attributes,
          attributePoints: allocation.attributePoints,
        },
      });
    }
    const updated = await tx.rpgProfile.updateMany({
      where: { userId, revision: value.expectedRevision },
      data: {
        ...(operation === "select-character"
          ? { activeCharacterId: character.id }
          : {}),
        revision: { increment: 1 },
      },
    });
    if (!updated.count)
      throw new UserError(
        "O perfil RPG mudou em outra aba. Atualize a página.",
      );
    const result = {
      revision: value.expectedRevision + 1,
      characterId: value.characterId,
    };
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
  });
}

/** Trusted server calls only; Server Actions derive userId from the session. */
export async function selectRpgCharacter(userId: string, input: unknown) {
  requireRpgEnabled();
  return mutate(userId, "select-character", selectCharacterInput.parse(input));
}

export async function allocateRpgAttributes(userId: string, input: unknown) {
  requireRpgEnabled();
  return mutate(
    userId,
    "allocate-attributes",
    allocateAttributesInput.parse(input),
  );
}
