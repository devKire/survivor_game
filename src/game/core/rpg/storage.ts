import { z } from "zod";
/** Capacity counts instances, not units. Entire stacks move without splitting. */
export const RPG_STASH_CAPACITY = 100;
export const storageCommandInput = z
  .object({
    requestId: z.uuid(),
    expectedRevision: z.number().int().min(1).max(2_147_483_646),
    instanceId: z.string().min(1).max(100),
    operation: z.enum(["DEPOSIT_ITEM", "WITHDRAW_ITEM"]),
  })
  .strict();
export const storageResultSchema = z
  .object({
    revision: z.number().int().positive(),
    instanceId: z.string(),
    location: z.enum(["INVENTORY", "STASH"]),
  })
  .strict();
