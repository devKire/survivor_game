"use server";

import { revalidatePath } from "next/cache";
import { isRpgEnabled } from "../env";
import { requireUser } from "../auth";
import { limit, UserError } from "../security";
import { selectRpgCharacter } from "./mutations";

export async function selectRpgCharacterAction(form: FormData) {
  if (!isRpgEnabled()) throw new UserError("RPG indisponível.");
  const user = await requireUser();
  await limit("rpg:" + user.id, 30);
  await selectRpgCharacter(user.id, {
    requestId: form.get("requestId"),
    expectedRevision: form.get("expectedRevision"),
    characterId: form.get("characterId"),
  });
  revalidatePath("/rpg", "layout");
}
