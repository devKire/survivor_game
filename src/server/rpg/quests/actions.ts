"use server";
import { z } from "zod";
import { requireUser } from "../../auth";
import { limit, UserError } from "../../security";
import { requireRpgQuestsEnabled } from "../guard";
import {
  mutateQuest,
  mutateDialogue,
  questCommandSchema,
  dialogueCommandSchema,
} from "./service";
import { rpgQuestJournal } from "./journal";
function safeError(error: unknown) {
  return {
    ok: false as const,
    error:
      error instanceof UserError
        ? error.message
        : error instanceof z.ZodError
          ? "Pedido inválido. Atualize o diário e tente novamente."
          : "Não foi possível confirmar o registro. Tente novamente com o mesmo pedido.",
  };
}
export async function questCommand(input: unknown) {
  try {
    requireRpgQuestsEnabled();
    const user = await requireUser();
    const command = questCommandSchema.parse(input);
    await limit("rpg-quests:" + user.id, 60);
    return { ok: true as const, ...(await mutateQuest(user.id, command)) };
  } catch (error) {
    return safeError(error);
  }
}
export async function dialogueCommand(input: unknown) {
  try {
    requireRpgQuestsEnabled();
    const user = await requireUser();
    const command = dialogueCommandSchema.parse(input);
    await limit("rpg-quests:" + user.id, 60);
    return { ok: true as const, ...(await mutateDialogue(user.id, command)) };
  } catch (error) {
    return safeError(error);
  }
}
export async function refreshQuestJournal(input: unknown) {
  try {
    requireRpgQuestsEnabled();
    const user = await requireUser();
    const value = z
      .object({ cursor: z.string().min(1).max(100).optional() })
      .strict()
      .parse(input);
    await limit("rpg-quest-read:" + user.id, 60);
    return {
      ok: true as const,
      journal: await rpgQuestJournal(user.id, value),
      message: "Diário atualizado.",
    };
  } catch (error) {
    return safeError(error);
  }
}
