import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { Prisma } from "../../generated/prisma/client";
import { freshSave } from "../../game/core/save";
import { db } from "../db";
import { economyJson, lockProgress } from "../economy";
import { UserError } from "../security";
import { requireRpgEnabled } from "./guard";

/** Only errors that guarantee the transaction aborted. Never retry unknown commits. */
export function isRpgSerializationFailure(error: unknown) {
  return (
    driverConflict(error) ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" ||
        (error.code === "P2010" &&
          (["40001", "40P01"].includes(String(error.meta?.code)) ||
            driverConflict(error.meta?.driverAdapterError)))))
  );
}

// Prisma 7 adapter-pg exposes commit failures directly, and raw query failures
// inside P2010.meta.driverAdapterError. Only exact PostgreSQL abort codes qualify.
function driverConflict(error: unknown): boolean {
  if (
    !error ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "DriverAdapterError" ||
    !("cause" in error)
  )
    return false;
  const cause = error.cause;
  return (
    !!cause &&
    typeof cause === "object" &&
    "kind" in cause &&
    cause.kind === "TransactionWriteConflict" &&
    "originalCode" in cause &&
    ["40001", "40P01"].includes(String(cause.originalCode))
  );
}

export async function rpgTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  requireRpgEnabled();
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().$transaction(operation, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (error) {
      if (!isRpgSerializationFailure(error)) throw error;
      if (attempt === 2)
        throw new UserError(
          "O perfil RPG está ocupado. Tente novamente com o mesmo pedido.",
        );
      await delay(10 * (attempt + 1));
      requireRpgEnabled();
    }
  }
}

/** Same lock order as account economy; no save writes or version increment. */
export async function lockRpgAccount(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.userProgress.createMany({
    data: [{ userId, data: economyJson(freshSave()) }],
    skipDuplicates: true,
  });
  return (await lockProgress(tx, userId)).save;
}
