import { z } from "zod";
export const explorationNodeId = z
  .string()
  .min(1)
  .max(160)
  .regex(
    /^explore:v[1-9][0-9]*:[a-z0-9-]+:-?[0-9]+:-?[0-9]+:[a-z0-9-]+:[0-9]+$/,
  );
export const gatheringIntent = z
  .object({
    nodeId: explorationNodeId,
    requestId: z.uuid(),
    expectedRevision: z.number().int().min(1).max(2147483646),
  })
  .strict();
/** UTC day fixed when the server accepts the gathering start. */
export function gatheringCycle(serverTime: number) {
  if (!Number.isSafeInteger(serverTime) || serverTime < 0)
    throw new Error("Relógio inválido.");
  return Math.floor(serverTime / 86_400_000);
}
export function gatheringQuantity(quantity: number, balance: number) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 2 ||
    !Number.isInteger(balance) ||
    balance < 0 ||
    balance > 1_000_000_000
  )
    throw new Error("Saldo inválido.");
  return Math.min(quantity, 1_000_000_000 - balance);
}
