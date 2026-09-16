import { z } from "zod";
import { db } from "./db";
import { freshSave, migrateSave, saveSchema } from "../game/core/save";
import { META_DEFINITIONS } from "../game/content/catalog";
import { Prisma } from "../generated/prisma/client";
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
export async function buyMeta(userId: string, id: string) {
  if (!Object.hasOwn(META_DEFINITIONS, id))
    throw new UserError("Melhoria inválida.");
  const row = await progress(userId),
    save = migrateSave(row.data),
    level = save.upgrades[id] || 0,
    cost = Math.ceil(META_DEFINITIONS[id].base * 1.7 ** level);
  if (level >= 5 || save.gold < cost)
    throw new UserError("Ouro insuficiente ou melhoria completa.");
  save.gold -= cost;
  save.upgrades[id] = level + 1;
  const r = await db().userProgress.updateMany({
    where: { userId, version: row.version },
    data: { data: json(save), version: { increment: 1 } },
  });
  if (!r.count)
    throw new UserError("Progresso atualizado em outra aba. Tente novamente.");
  return save;
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
