import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import {
  accessibleRpgCharacters,
  rpgAttributesSchema,
  validateRpgAttributes,
} from "../../game/core/rpg";
import { saveSchema } from "../../game/core/save";
import type { SaveData } from "../../game/core/types";
import { db } from "../db";
import { UserError } from "../security";
import { requireRpgEnabled } from "./guard";
import { lockRpgAccount, rpgTransaction } from "./transaction";

/** Internal: caller holds UserProgress FOR UPDATE for this user in the same tx. */
export async function ensureRpgProfile(
  tx: Prisma.TransactionClient,
  userId: string,
  save: SaveData,
) {
  requireRpgEnabled();
  const unlocked = accessibleRpgCharacters(save.unlocked);
  if (!unlocked.length)
    throw new UserError("Nenhum personagem RPG disponível.");
  const prior = await tx.rpgProfile.findUnique({ where: { userId } });
  if (!prior) await tx.rpgProfile.create({ data: { userId } });
  const added = await tx.rpgCharacter.createMany({
    data: unlocked.map((characterId) => ({ userId, characterId })),
    skipDuplicates: true,
  });
  const characters = await tx.rpgCharacter.findMany({
    where: { userId, characterId: { in: unlocked } },
  });
  const active =
    characters.find((c) => c.id === prior?.activeCharacterId) ??
    characters.find((c) => c.characterId === unlocked[0])!;
  if (!prior || added.count || active.id !== prior.activeCharacterId) {
    await tx.rpgProfile.update({
      where: { userId },
      data: {
        activeCharacterId: active.id,
        ...(prior ? { revision: { increment: 1 } } : {}),
      },
    });
  }
}

async function readProfile(tx: Prisma.TransactionClient, userId: string) {
  const row = await tx.rpgProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { progress: { select: { data: true } } } },
      characters: { orderBy: [{ createdAt: "asc" }, { characterId: "asc" }] },
      items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      materials: { orderBy: { materialId: "asc" } },
    },
  });
  if (!row?.user.progress) return null;
  // Fail closed on corrupt account data; never fall back to a fresh unlock list.
  const unlocked = accessibleRpgCharacters(
    saveSchema.parse(row.user.progress.data).unlocked,
  );
  const characters = row.characters.filter((c) =>
    unlocked.includes(c.characterId as (typeof unlocked)[number]),
  );
  if (
    unlocked.some((id) => !characters.some((c) => c.characterId === id)) ||
    !characters.some((c) => c.id === row.activeCharacterId)
  )
    return null;
  return {
    userId: row.userId,
    revision: row.revision,
    activeCharacterId: row.activeCharacterId,
    unlocked,
    items: row.items,
    materials: row.materials,
    characters: characters.map((c) => {
      const attributes = rpgAttributesSchema.parse(c.attributes);
      validateRpgAttributes({ ...c, attributes });
      return { ...c, attributes };
    }),
  };
}

/** Internal server API: userId comes from requireUser/requirePageUser, never input. */
export async function rpgProfileData(userId: string) {
  requireRpgEnabled();
  // All component reads share one MVCC snapshot, without a write lock/upsert.
  const existing = await db().$transaction((tx) => readProfile(tx, userId), {
    isolationLevel: "RepeatableRead",
  });
  if (existing) return existing;
  return rpgTransaction(async (tx) => {
    const save = await lockRpgAccount(tx, userId);
    await ensureRpgProfile(tx, userId, save);
    const initialized = await readProfile(tx, userId);
    if (!initialized) throw new UserError("Perfil RPG indisponível.");
    return initialized;
  });
}
