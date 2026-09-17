import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import argon2 from "argon2";
import { db } from "./db";
import { UserError } from "./security";
import { getBetterAuthSecret, getBetterAuthUrl } from "./env";
function createAuth() {
  return betterAuth({
    appName: "LIMIAR",
    baseURL: getBetterAuthUrl(),
    secret: getBetterAuthSecret(),
    database: prismaAdapter(db(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: (password) =>
          argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 1,
          }),
        verify: ({ hash, password }) => argon2.verify(hash, password),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/*": { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (
              !("username" in user) ||
              typeof user.username !== "string" ||
              !/^[a-zA-Z0-9_]{3,24}$/.test(user.username)
            )
              throw new APIError("BAD_REQUEST", {
                message: "Nome de usuário obrigatório (3–24 caracteres).",
              });
            return {
              data: { ...user, email: user.email.trim().toLowerCase() },
            };
          },
        },
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 24,
        usernameValidator: (s) => /^[a-zA-Z0-9_]{3,24}$/.test(s),
        usernameNormalization: (s) => s.trim().toLowerCase(),
        immutableUsername: true,
      }),
      nextCookies(),
    ],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function auth() {
  return (instance ??= createAuth());
}
export async function session() {
  return auth().api.getSession({ headers: await headers() });
}
export async function requireUser() {
  const s = await session();
  if (!s) throw new UserError("Entre na sua conta para continuar.");
  return s.user;
}
