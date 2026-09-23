import "server-only";
import { randomInt } from "node:crypto";
import { db } from "./db";
import { progress } from "./progress";
import {
  economyTransaction,
  lockProgress,
  persistSave,
  spendCurrency,
  economyJson,
} from "./economy";
import { type Currency, balanceAfter } from "../game/core/economy";
import { COSMETICS } from "../game/content/cosmetics";
import { ECHO_BANNER, rollEcho } from "../game/content/gacha";
import { UserError } from "./security";
export async function echoProfile(userId: string) {
  await progress(userId);
  const [state, history] = await Promise.all([
    db().echoState.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
    db().echoPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return { state, history };
}
export async function pullEchoes(
  userId: string,
  requestId: string,
  currency: Currency,
  count: 1 | 11,
) {
  await progress(userId);
  return economyTransaction(async (tx) => {
    const { save } = await lockProgress(tx, userId);
    const existing = await tx.echoPurchase.findUnique({
      where: { userId_requestId: { userId, requestId } },
    });
    if (existing) {
      if (existing.currency !== currency || existing.count !== count)
        throw new UserError("Pedido já utilizado com outros parâmetros.");
      return existing;
    }
    const cost =
      (currency === "GOLD" ? ECHO_BANNER.gold : ECHO_BANNER.gems) *
      (count === 11 ? 10 : 1);
    await spendCurrency(tx, save, {
      userId,
      currency,
      amount: cost,
      source: "gacha",
      referenceId: `gacha:${requestId}`,
    });
    const state = await tx.echoState.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    let pity = {
        rare: state.rare,
        epic: state.epic,
        legendary: state.legendary,
      },
      fragments = state.fragments;
    const results = [];
    for (let index = 0; index < count; index++) {
      const before = { ...pity },
        roll = rollEcho(randomInt(10000), pity);
      pity = roll.pity;
      const pool = Object.values(COSMETICS).filter(
          (c) => c.rarity === roll.rarity,
        ),
        item = pool[randomInt(pool.length)];
      const owned = await tx.userCosmetic.findUnique({
        where: { userId_cosmeticId: { userId, cosmeticId: item.id } },
      });
      const duplicate = !!owned,
        earned = duplicate ? ECHO_BANNER.duplicateFragments[roll.index] : 0;
      if (duplicate) {
        fragments = balanceAfter(fragments, earned);
        await tx.echoFragmentTransaction.create({
          data: {
            userId,
            amount: earned,
            source: "duplicate",
            referenceId: `pull:${requestId}:${index}`,
          },
        });
      } else
        await tx.userCosmetic.create({
          data: { userId, cosmeticId: item.id, source: "gacha" },
        });
      results.push({
        index,
        cosmeticId: item.id,
        rarity: item.rarity,
        duplicate,
        fragments: earned,
        pityBefore: before,
        pityAfter: { ...pity },
        pityActivated: roll.pityActivated,
      });
    }
    await tx.echoState.update({
      where: { userId },
      data: { ...pity, fragments },
    });
    await persistSave(tx, userId, save);
    return tx.echoPurchase.create({
      data: {
        userId,
        requestId,
        banner: ECHO_BANNER.id,
        currency,
        cost,
        count,
        results: economyJson(results),
      },
    });
  });
}
export async function craftEcho(userId: string, id: string) {
  const item = COSMETICS[id];
  if (!item) throw new UserError("Cosmético inexistente.");
  await progress(userId);
  return economyTransaction(async (tx) => {
    await lockProgress(tx, userId);
    if (
      await tx.userCosmetic.findUnique({
        where: { userId_cosmeticId: { userId, cosmeticId: id } },
      })
    )
      return;
    const state = await tx.echoState.findUnique({ where: { userId } });
    if (!state || state.fragments < item.fragments)
      throw new UserError("Fragmentos insuficientes.");
    await tx.echoState.update({
      where: { userId },
      data: { fragments: { decrement: item.fragments } },
    });
    await tx.echoFragmentTransaction.create({
      data: {
        userId,
        amount: -item.fragments,
        referenceId: `craft:${id}`,
        source: "craft",
      },
    });
    await tx.userCosmetic.create({
      data: { userId, cosmeticId: id, source: "craft" },
    });
  });
}
