"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "../auth";
import { limit, UserError } from "../security";
import {
  allocateAttributesInput,
  allocateRpgAttributes,
  selectCharacterInput,
  selectRpgCharacter,
} from "./mutations";
import { requireRpgEnabled } from "./guard";

export type RpgActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function formInput(form: FormData) {
  if (!(form instanceof FormData))
    throw new UserError("Formulário RPG inválido.");
  const input: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    // React's transport metadata is not application input.
    if (key.startsWith("$ACTION_")) continue;
    if (
      Object.hasOwn(input, key) ||
      typeof value !== "string" ||
      value.length > 100
    )
      throw new UserError("Formulário RPG inválido.");
    Object.defineProperty(input, key, {
      value,
      enumerable: true,
      writable: true,
    });
  }
  for (const key of ["expectedRevision", "amount"]) {
    if (key in input) {
      if (typeof input[key] !== "string" || !/^[1-9][0-9]*$/.test(input[key]))
        throw new UserError("Informe valores inteiros positivos.");
      input[key] = Number(input[key]);
    }
  }
  return input;
}

async function runAction(
  form: FormData,
  allocation: boolean,
): Promise<RpgActionState> {
  try {
    requireRpgEnabled();
    const user = await requireUser();
    const input = allocation
      ? allocateAttributesInput.parse(formInput(form))
      : selectCharacterInput.parse(formInput(form));
    await limit("rpg:" + user.id, 30);
    if (allocation) await allocateRpgAttributes(user.id, input);
    else await selectRpgCharacter(user.id, input);
    revalidatePath("/rpg", "layout");
    return {
      status: "success",
      message: allocation ? "Atributos salvos." : "Personagem selecionado.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof UserError
          ? error.message
          : error instanceof z.ZodError
            ? "Dados RPG inválidos. Confira os campos e tente novamente."
            : "Não foi possível concluir. Tente novamente com o mesmo pedido.",
    };
  }
}

export async function selectRpgCharacterAction(
  _previous: RpgActionState,
  form: FormData,
) {
  return runAction(form, false);
}

export async function allocateRpgAttributesAction(
  _previous: RpgActionState,
  form: FormData,
) {
  return runAction(form, true);
}
