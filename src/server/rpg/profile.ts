import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { accessibleRpgCharacters } from "../../game/core/rpg";
import { migrateSave } from "../../game/core/save";
import { db } from "../db";
import { progress } from "../progress";
import { UserError } from "../security";

type Tx = Prisma.TransactionClient;

async function lockProgress(tx: Tx, userId: string) {
  const locked = await tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
    SELECT "userId" FROM "limiar"."UserProgress"
    WHERE "userId" = ${userId} FOR UPDATE
  `);
  if (!locked.length) throw new UserError("Progresso da conta indisponível.");
  const row = await tx.userProgress.findUniqueOrThrow({ where: { userId } });
  return migrateSave(row.data);
}

export async function ensureRpgProfile(tx: Tx, userId: string) {
  const save = await lockProgress(tx, userId);
  const unlocked = accessibleRpgCharacters(save.unlocked);
  if (!unlocked.length) throw new UserError("Nenhum personagem RPG disponível.");

  await tx.rpgProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  await tx.rpgCharacter.createMany({
    data: unlocked.map((characterId) => ({ userId, characterId })),
    skipDuplicates: true,
  });

  const profile = await tx.rpgProfile.findUniqueOrThrow({ where: { userId } });
  if (!profile.activeCharacterId) {
    const first = await tx.rpgCharacter.findUniqueOrThrow({
      where: { userId_characterId: { userId, characterId: unlocked[0] } },
    });
    await tx.rpgProfile.update({
      where: { userId },
      data: { activeCharacterId: first.id },
    });
  }
  return { save, unlocked };
}

export async function rpgProfileData(userId: string) {
  await progress(userId);
  return db().$transaction(async (tx) => {
    const { unlocked } = await ensureRpgProfile(tx, userId);
    const profile = await tx.rpgProfile.findUniqueOrThrow({
      where: { userId },
      include: {
        characters: { orderBy: { createdAt: "asc" } },
        items: { orderBy: { createdAt: "asc" } },
        materials: { orderBy: { materialId: "asc" } },
      },
    });
    return { ...profile, unlocked };
  });
}
