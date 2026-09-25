"use server";
import { z } from "zod";
import { claimSeason,reportPlayer } from "./ranked";
import { craftEcho,pullEchoes } from "./echoes";
import { echoResults } from "../game/content/gacha";
import { requireUser } from "./auth";
import { buyCosmetic, equipCosmetic, equipPvpCosmetic, pvpCosmeticData } from "./collection";
import { COSMETIC_TYPES } from "../game/content/cosmetics";
import * as social from "./social";
import * as teams from "./teams";
import * as progress from "./progress";
import { issueTicket } from "./tickets";
import { session } from "./auth";
import { limit, UserError } from "./security";
const request = z.discriminatedUnion("type", [
  z.object({type:z.literal("shop-buy"),id:z.string().max(80),currency:z.enum(["GEMS","GOLD"])}),
  z.object({type:z.literal("equip"),id:z.string().max(80),equip:z.boolean()}),
  z.object({type:z.literal("pvp-cosmetic"),character:z.enum(["nara","orin","ivo","sena"]),slot:z.enum(COSMETIC_TYPES),id:z.string().max(80).nullable()}).strict(),
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
  z.object({ type: z.literal("buy"), id: z.string().max(30), expectedRank: z.number().int().min(0).max(4) }),
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
      case "shop-buy": await buyCosmetic(user.id,v.id,v.currency); break;
      case "equip": await equipCosmetic(user.id,v.id,v.equip); break;
      case "pvp-cosmetic": await equipPvpCosmetic(user.id,v.character,v.slot,v.id); break;
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
        await progress.buyMeta(user.id, v.id, v.expectedRank);
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

export async function echoAction(input:unknown) {
  try {
    const user=await requireUser(); await limit("echo:"+user.id,30);
    const v=z.discriminatedUnion("type",[
      z.object({type:z.literal("pull"),requestId:z.uuid(),currency:z.enum(["GEMS","GOLD"]),count:z.union([z.literal(1),z.literal(11)])}).strict(),
      z.object({type:z.literal("craft"),id:z.string().max(80)}).strict(),
    ]).parse(input);
    if(v.type==="craft"){await craftEcho(user.id,v.id);return {ok:true as const,results:[]};}
    const receipt=await pullEchoes(user.id,v.requestId,v.currency,v.count);
    return {ok:true as const,results:echoResults.parse(receipt.results)};
  }catch(e){return {ok:false as const,error:e instanceof UserError?e.message:"Não foi possível concluir. Repetir o mesmo pedido é seguro."};}
}

export async function competitiveAction(input:unknown){try{const user=await requireUser();await limit("competitive:"+user.id,20);const v=z.discriminatedUnion("type",[
 z.object({type:z.literal("season-claim"),seasonId:z.string().regex(/^\d{4}-\d{2}$/),mode:z.enum(["DUEL_RANKED","WAR_RANKED"])}).strict(),
 z.object({type:z.literal("report"),matchId:z.string().max(100),targetId:z.string().max(100),reason:z.enum(["cheat","abuse","afk","grief"])}).strict(),
]).parse(input);if(v.type==="report")await reportPlayer(user.id,v.targetId,v.matchId,v.reason);else await claimSeason(user.id,v.seasonId,v.mode);return {ok:true as const};}catch(e){return {ok:false as const,error:e instanceof UserError?e.message:"Operação indisponível."};}}

export async function pvpCustomizationAction() {
  try {
    const user = await requireUser();
    return { ok: true as const, data: await pvpCosmeticData(user.id) };
  } catch (e) {
    return { ok: false as const, error: e instanceof UserError ? e.message : "Cosméticos PvP indisponíveis." };
  }
}
