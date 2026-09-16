"use server";
import { z } from "zod";
import { requireUser } from "./auth";
import * as social from "./social";
import * as teams from "./teams";
import * as progress from "./progress";
import { issueTicket } from "./tickets";
import { session } from "./auth";
import { limit, UserError } from "./security";
const request = z.discriminatedUnion("type", [
  z.object({ type: z.literal("settings"), settings: z.unknown() }),
  z.object({ type: z.literal("search"), query: z.string().max(24) }),
  z.object({ type: z.literal("friend"), target: z.string().max(100) }),
  z.object({
    type: z.literal("friend-update"),
    id: z.string().max(100),
    action: z.enum(["accept", "reject", "remove"]),
  }),
  z.object({ type: z.literal("create-team") }),
  z.object({ type: z.literal("join-team"), code: z.string().max(20) }),
  z.object({ type: z.literal("leave-team") }),
  z.object({ type: z.literal("import"), save: z.unknown() }),
  z.object({ type: z.literal("use-account") }),
  z.object({ type: z.literal("buy"), id: z.string().max(30) }),
  z.object({
    type: z.literal("history"),
    scope: z.enum(["dm", "team"]),
    target: z.string().max(100),
    cursor: z.string().max(100).optional(),
  }),
]);
export async function accountAction(input: unknown) {
  try {
    const user = await requireUser(),
      v = request.parse(input);
    await limit("action:" + user.id, 120);
    switch (v.type) {
      case "settings":
        await progress.updateSettings(user.id, v.settings);
        break;
      case "search":
        return {
          ok: true as const,
          data: await social.searchUsers(user.id, v.query),
        };
      case "friend":
        await social.requestFriend(user.id, v.target);
        break;
      case "friend-update":
        await social.updateFriend(user.id, v.id, v.action);
        break;
      case "create-team":
        await teams.createTeam(user.id);
        break;
      case "join-team":
        await teams.joinTeam(user.id, v.code);
        break;
      case "leave-team":
        await teams.leaveTeam(user.id);
        break;
      case "import":
        await progress.importLocal(user.id, v.save);
        break;
      case "use-account":
        await progress.useAccount(user.id);
        break;
      case "buy":
        await progress.buyMeta(user.id, v.id);
        break;
      case "history":
        return {
          ok: true as const,
          data: await social.chatHistory(user.id, v.scope, v.target, v.cursor),
        };
    }
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof UserError
          ? e.message
          : "Operação inválida ou serviço indisponível.",
    };
  }
}
export async function realtimeTicket() {
  const s = await session();
  if (!s) throw new Error("Autenticação necessária.");
  await limit("ticket:" + s.user.id, 20);
  return issueTicket(s.user.id, s.session.id);
}

export async function saveSolo(input: unknown) {
  try {
    const user = await requireUser();
    return { ok: true as const, ...(await progress.syncSolo(user.id, input)) };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof UserError
          ? e.message
          : "Não foi possível sincronizar. Seu cache solo permanece neste navegador.",
    };
  }
}
