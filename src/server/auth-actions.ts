"use server";
import { safeCallback } from "../app/hub/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "./auth";
import { limit } from "./security";
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(12).max(128),
});
export async function authenticate(
  previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const input = credentials.safeParse(Object.fromEntries(form));
  if (!input.success)
    return { error: "Informe e-mail válido e senha de 12–128 caracteres." };
  const h = await headers();
  try {
    await limit("auth-global", 1000);
    await limit("login:" + input.data.email, 10);
    await auth().api.signInEmail({ body: input.data, headers: h });
  } catch {
    return {
      error:
        "E-mail ou senha inválidos, ou muitas tentativas. Tente novamente mais tarde.",
    };
  }
  redirect(safeCallback(form.get("callbackUrl")));
}
export async function register(
  previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const parsed = credentials
    .extend({
      username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm)
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error:
        "Revise os campos. Usuário: 3–24 letras, números ou _. Senha: 12–128 caracteres; confirmação idêntica.",
    };
  try {
    await limit("register-global", 50);
    await limit("register:" + parsed.data.email, 5);
    await auth().api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.username,
        username: parsed.data.username,
      },
      headers: await headers(),
    });
  } catch {
    return {
      error:
        "Não foi possível criar a conta. Verifique se e-mail e nome de usuário estão disponíveis e tente mais tarde.",
    };
  }
  redirect(safeCallback(form.get("callbackUrl")));
}
export async function logout() {
  await auth().api.signOut({ headers: await headers() });
  revalidatePath("/", "layout");
  redirect("/");
}
