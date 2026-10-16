import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "../../../generated/prisma/client";
import { UserError } from "../../security";
import { requireRpgSharedWorldEnabled } from "../guard";

/** Server-owned capability, created only by the authenticated live coordinator. */
export interface WorldServicePermit {
  userId: string;
  visitId: string;
  assertLive: () => void;
}
const permits = new AsyncLocalStorage<WorldServicePermit>();
export function withWorldServicePermit<T>(
  permit: WorldServicePermit,
  operation: () => Promise<T>,
) {
  requireRpgSharedWorldEnabled();
  permit.assertLive();
  return permits.run(permit, operation);
}
/** Call under the existing account lock. Legacy actions cannot mutate an online build remotely. */
export async function assertWorldMutationAllowed(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const visit = await tx.rpgWorldVisit.findUnique({
    where: { activeUserId: userId },
  });
  if (!visit) return;
  const permit = permits.getStore();
  if (!permit || permit.userId !== userId || permit.visitId !== visit.id)
    throw new UserError(
      "Use os serviços dentro do mundo ou saia dele antes de alterar o personagem.",
    );
  requireRpgSharedWorldEnabled();
  permit.assertLive();
}
export function recheckWorldServicePermit() {
  const permit = permits.getStore();
  if (permit) {
    requireRpgSharedWorldEnabled();
    permit.assertLive();
  }
}
export function hasWorldServicePermit() {
  return !!permits.getStore();
}
