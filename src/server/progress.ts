import { z } from "zod";
import { db } from "./db";
import { freshSave, migrateSave, saveSchema } from "../game/core/save";
import { META_DEFINITIONS } from "../game/content/catalog";
import { nodeCost, nodeBlocked } from "../game/content/obelisk";
import { Prisma } from "../generated/prisma/client";
import { economyTransaction, lockProgress, persistSave, spendCurrency } from "./economy";
import { limit, UserError } from "./security";
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function progress(userId: string) {
  return db().userProgress.upsert({
    where: { userId },
    create: { userId, data: json(freshSave()) },
    update: {},
  });
}
export async function importLocal(userId: string, input: unknown) {
  await limit("import:" + userId, 5);
  const parsed = saveSchema.parse(input);
  const local = migrateSave(parsed);
  if (JSON.stringify(local).length > 2_000_000)
    throw new UserError("Save muito grande.");
  const row = await progress(userId);
  if (row.importResolved)
    throw new UserError("A escolha de importação já foi realizada.");
  const account = migrateSave(row.data);
  account.settings = local.settings;
  // Offline data is preserved as an archive; only server-issued runs grant online economy/achievements.
  return db().userProgress.updateMany({
    where: { userId, importResolved: false, version: row.version },
    data: {
      data: json(account),
      localArchive: json(local),
      importResolved: true,
      version: { increment: 1 },
    },
  });
}
export async function useAccount(userId: string) {
  await progress(userId);
  await db().userProgress.update({
    where: { userId },
    data: { importResolved: true },
  });
}
export async function buyMeta(userId: string, id: string, expectedRank: number) {
  if (!Object.hasOwn(META_DEFINITIONS, id) || !Number.isInteger(expectedRank) || expectedRank < 0 || expectedRank >= 5)
    throw new UserError("Melhoria inválida.");
  await progress(userId);
  return economyTransaction(async (tx) => {
    const { save } = await lockProgress(tx, userId);
    const level = save.upgrades[id] || 0;
    const referenceId = `meta:${id}:${expectedRank + 1}`;
    if (await tx.currencyTransaction.findUnique({ where: {
      userId_currency_referenceId: { userId, currency: "GEMS", referenceId },
    } })) return save;
    if (level !== expectedRank) throw new UserError("Nível alterado. Atualize a tela antes de comprar.");
    const blocked = nodeBlocked(id, save.upgrades, save.unlocked);
    if (blocked) throw new UserError(blocked);
    await spendCurrency(tx, save, { userId, currency: "GEMS",
      amount: nodeCost(id, level), source: "meta", referenceId });
    save.upgrades[id] = level + 1;
    await persistSave(tx, userId, save);
    return save;
  });
}

const soloInput = z
  .object({ version: z.number().int().positive(), save: saveSchema })
  .strict();
export async function syncSolo(userId: string, input: unknown) {
  const v = soloInput.parse(input);
  await limit("solo:" + userId, 60);
  const data = migrateSave(v.save);
  const updated = await db().userProgress.updateMany({
    where: { userId, version: v.version },
    data: { localArchive: json(data), version: { increment: 1 } },
  });
  if (!updated.count)
    throw new UserError(
      "O progresso mudou em outra aba. Exporte esta expedição antes de recarregar.",
    );
  return { version: v.version + 1 };
}

export async function updateSettings(userId: string, input: unknown) {
  const settings = saveSchema.shape.settings.parse(input),
    row = await progress(userId),
    save = migrateSave(row.data);
  save.settings = settings;
  const r = await db().userProgress.updateMany({
    where: { userId, version: row.version },
    data: { data: json(save), version: { increment: 1 } },
  });
  if (!r.count)
    throw new UserError("Progresso alterado em outra aba. Tente novamente.");
}
