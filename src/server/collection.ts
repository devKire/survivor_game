import "server-only";
import { COSMETICS, type CosmeticType } from "../game/content/cosmetics";
import { db } from "./db";
import { progress } from "./progress";
import {
  economyTransaction,
  lockProgress,
  persistSave,
  spendCurrency,
} from "./economy";
import type { Currency } from "../game/core/economy";
import { UserError } from "./security";
import { migrateSave } from "../game/core/save";
export async function collection(userId: string) {
  const [row, owned] = await Promise.all([
    progress(userId),
    db().userCosmetic.findMany({ where: { userId } }),
  ]);
  return { progress: row, owned: owned.map((x) => x.cosmeticId) };
}
export async function buyCosmetic(
  userId: string,
  id: string,
  currency: Currency,
) {
  const cosmetic = COSMETICS[id];
  if (!cosmetic) throw new UserError("Cosmético inexistente.");
  const amount = currency === "GEMS" ? cosmetic.gems : cosmetic.gold;
  if (!amount) throw new UserError("Esta oferta não aceita essa moeda.");
  await progress(userId);
  return economyTransaction(async (tx) => {
    const { save } = await lockProgress(tx, userId);
    if (
      await tx.userCosmetic.findUnique({
        where: { userId_cosmeticId: { userId, cosmeticId: id } },
      })
    )
      return;
    await spendCurrency(tx, save, {
      userId,
      currency,
      amount,
      source: "shop",
      referenceId: `shop:${id}`,
    });
    await tx.userCosmetic.create({
      data: { userId, cosmeticId: id, source: "shop" },
    });
    await persistSave(tx, userId, save);
  });
}
export async function equipCosmetic(
  userId: string,
  id: string,
  equip: boolean,
) {
  const cosmetic = COSMETICS[id];
  if (!cosmetic) throw new UserError("Cosmético inexistente.");
  return economyTransaction(async (tx) => {
    const { save } = await lockProgress(tx, userId);
    if (
      !(await tx.userCosmetic.findUnique({
        where: { userId_cosmeticId: { userId, cosmeticId: id } },
      }))
    )
      throw new UserError("Cosmético não pertence à conta.");
    if (equip) save.cosmetics[cosmetic.type] = id;
    else if (save.cosmetics[cosmetic.type] === id)
      delete save.cosmetics[cosmetic.type];
    await persistSave(tx, userId, save);
  });
}

export async function equipPvpCosmetic(
  userId: string,
  character: "nara" | "orin" | "ivo" | "sena",
  slot: CosmeticType,
  id: string | null,
) {
  const cosmetic = id ? COSMETICS[id] : null;
  if (id && (!cosmetic || cosmetic.type !== slot || (cosmetic.character && cosmetic.character !== character)))
    throw new UserError("Cosmético incompatível com este personagem ou espaço.");
  return economyTransaction(async (tx) => {
    const { save } = await lockProgress(tx, userId);
    if (cosmetic && !(await tx.userCosmetic.findUnique({
      where: { userId_cosmeticId: { userId, cosmeticId: cosmetic.id } },
    }))) throw new UserError("Cosmético não pertence à conta.");
    if (cosmetic) save.pvpCosmetics[character][slot] = cosmetic.id;
    else delete save.pvpCosmetics[character][slot];
    await persistSave(tx, userId, save);
  });
}

export async function pvpCosmeticData(userId: string) {
  const result = await collection(userId);
  return {
    profiles: migrateSave(result.progress.data).pvpCosmetics,
    owned: result.owned.map((id) => COSMETICS[id]).filter(Boolean),
  };
}
