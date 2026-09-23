import "server-only";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { migrateSave, saveSchema } from "../game/core/save";
import { balanceAfter, validAmount, type Currency } from "../game/core/economy";
import type { SaveData } from "../game/core/types";
import { UserError } from "./security";

export const economyJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** All writers of account currency serialize on the same row, before reading it. */
export async function lockProgress(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$queryRaw`SELECT "userId" FROM limiar."UserProgress" WHERE "userId"=${userId} FOR UPDATE`;
  const row = await tx.userProgress.findUniqueOrThrow({ where: { userId } });
  const parsed = saveSchema.parse(row.data); // Financial state fails closed, never silently reset.
  if (parsed.economyVersion !== 2)
    throw new UserError("Migração econômica pendente.");
  return { row, save: migrateSave(parsed) };
}

export async function economyTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db().$transaction(fn, {
    isolationLevel: "ReadCommitted",
    maxWait: 10000,
    timeout: 20000,
  });
}

export function getBalance(save: SaveData, currency: Currency) {
  return validAmount(currency === "GEMS" ? save.gems : save.gold);
}
type Operation = {
  userId: string;
  currency: Currency;
  amount: number;
  source: string;
  referenceId: string;
};

async function recordTransaction(
  tx: Prisma.TransactionClient,
  save: SaveData,
  op: Operation,
  spending: boolean,
) {
  validAmount(op.amount);
  if (!op.amount) return false;
  const delta = spending ? -op.amount : op.amount;
  const existing = await tx.currencyTransaction.findUnique({
    where: {
      userId_currency_referenceId: {
        userId: op.userId,
        currency: op.currency,
        referenceId: op.referenceId,
      },
    },
  });
  if (existing) {
    if (existing.amount !== delta || existing.source !== op.source)
      throw new UserError(
        "Referência econômica já utilizada para outra operação.",
      );
    return false;
  }
  let next: number;
  try {
    next = balanceAfter(getBalance(save, op.currency), delta);
  } catch {
    throw new UserError("Saldo insuficiente ou limite da carteira atingido.");
  }
  await tx.currencyTransaction.create({
    data: {
      ...op,
      amount: delta,
      type: spending ? "SPEND" : "GRANT",
      balanceAfter: next,
    },
  });
  if (op.currency === "GEMS") save.gems = next;
  else save.gold = next;
  return true;
}
/** Call only inside economyTransaction, after lockProgress; persistSave in same tx. */
export const grantCurrency = (
  tx: Prisma.TransactionClient,
  save: SaveData,
  op: Operation,
) => recordTransaction(tx, save, op, false);
export const spendCurrency = (
  tx: Prisma.TransactionClient,
  save: SaveData,
  op: Operation,
) => recordTransaction(tx, save, op, true);
export async function persistSave(
  tx: Prisma.TransactionClient,
  userId: string,
  save: SaveData,
) {
  saveSchema.parse(save);
  return tx.userProgress.update({
    where: { userId },
    data: { data: economyJson(save), version: { increment: 1 } },
  });
}
