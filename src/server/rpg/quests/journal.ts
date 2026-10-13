import "server-only";
import { z } from "zod";
import { requireRpgQuestsEnabled } from "../guard";
import { rpgTransaction, lockRpgAccount } from "../transaction";
import { ensureRpgProfile } from "../profile";
import { readQuestState, reconcileQuestState, projectJournal } from "./state";
export async function rpgQuestJournal(userId: string, input: unknown = {}) {
  requireRpgQuestsEnabled();
  const { cursor } = z
    .object({ cursor: z.string().min(1).max(100).optional() })
    .strict()
    .parse(input);
  return rpgTransaction(async (tx) => {
    requireRpgQuestsEnabled();
    const save = await lockRpgAccount(tx, userId);
    await ensureRpgProfile(tx, userId, save);
    const state = await readQuestState(tx, userId);
    if (await reconcileQuestState(tx, userId, state))
      await tx.rpgProfile.update({
        where: { userId },
        data: { revision: { increment: 1 } },
      });
    return projectJournal(await readQuestState(tx, userId), cursor);
  });
}
