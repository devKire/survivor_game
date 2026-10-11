import "server-only";
import { createHash } from "node:crypto";
import {
  storageCommandInput,
  storageResultSchema,
  RPG_STASH_CAPACITY,
} from "../../game/core/rpg/storage";
import { requireRpgRefugeEnabled } from "./guard";
import { rpgTransaction, lockRpgAccount } from "./transaction";
import { ensureRpgProfile } from "./profile";
import { UserError } from "../security";
/** Internal service; the public action derives userId exclusively from the session. */
export async function transferRpgItem(userId: string, input: unknown) {
  requireRpgRefugeEnabled();
  const value = storageCommandInput.parse(input);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  return rpgTransaction(async (tx) => {
    requireRpgRefugeEnabled();
    const save = await lockRpgAccount(tx, userId);
    const prior = await tx.rpgMutationReceipt.findUnique({
      where: { userId_requestId: { userId, requestId: value.requestId } },
    });
    if (prior) {
      if (
        prior.operation !== value.operation ||
        prior.payloadHash !== payloadHash
      )
        throw new UserError("requestId já utilizado por outra mutação RPG.");
      return storageResultSchema.parse(prior.result);
    }
    await ensureRpgProfile(tx, userId, save);
    const profile = await tx.rpgProfile.findUniqueOrThrow({
      where: { userId },
    });
    if (profile.revision !== value.expectedRevision)
      throw new UserError(
        "O perfil RPG mudou em outra aba. Atualize a página antes de tentar novamente.",
      );
    const item = await tx.rpgItemInstance.findFirst({
      where: { id: value.instanceId, userId },
    });
    if (!item) throw new UserError("Equipamento indisponível nesta conta.");
    const deposit = value.operation === "DEPOSIT_ITEM";
    const from = deposit ? "INVENTORY" : "STASH",
      location = deposit ? "STASH" : "INVENTORY";
    if (item.location !== from)
      throw new UserError("A localização do item mudou. Atualize o perfil.");
    if (item.equippedCharacterId || item.equippedSlot)
      throw new UserError("Desequipe o item antes de guardar.");
    if (
      deposit &&
      (await tx.rpgItemInstance.count({
        where: { userId, location: "STASH" },
      })) >= RPG_STASH_CAPACITY
    )
      throw new UserError(
        "Depósito cheio: retire um item antes de guardar outro.",
      );
    const changed = await tx.rpgItemInstance.updateMany({
      where: {
        id: item.id,
        userId,
        location: from,
        equippedCharacterId: null,
        equippedSlot: null,
      },
      data: { location },
    });
    if (changed.count !== 1)
      throw new UserError("O item mudou. Atualize o perfil.");
    const updated = await tx.rpgProfile.updateMany({
      where: { userId, revision: value.expectedRevision },
      data: { revision: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new UserError("O perfil RPG mudou. Atualize a página.");
    const result = {
      revision: value.expectedRevision + 1,
      instanceId: item.id,
      location,
    };
    await tx.rpgMutationReceipt.create({
      data: {
        userId,
        requestId: value.requestId,
        operation: value.operation,
        payloadHash,
        revision: result.revision,
        result,
      },
    });
    return storageResultSchema.parse(result);
  });
}
