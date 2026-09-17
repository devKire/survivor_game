import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { limit, UserError } from "./security";
import { publicUser } from "./social";
import { Prisma } from "../generated/prisma/client";
import { EXPEDITION_LENGTHS } from "../game/content/catalog";
export const MAX_PARTY = 5;
const include = {
  members: {
    include: { user: { select: publicUser } },
    orderBy: { slot: "asc" as const },
  },
};
export async function currentTeam(userId: string) {
  const member = await db().teamMember.findUnique({ where: { userId } });
  return member
    ? db().team.findUnique({ where: { id: member.teamId }, include })
    : null;
}
async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db().$transaction(fn, {
        isolationLevel: "ReadCommitted",
        maxWait: 10000,
        timeout: 15000,
      });
    } catch (e) {
      if (
        i < 3 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034"
      )
        continue;
      throw e;
    }
  }
}
export async function createTeam(userId: string) {
  await limit("team-create:" + userId, 6);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(
    { length: 8 },
    () => alphabet[randomInt(alphabet.length)],
  ).join("");
  if (await currentTeam(userId))
    throw new UserError("Você já está em uma equipe.");
  return db().team.create({
    data: {
      code,
      leaderId: userId,
      expiresAt: new Date(Date.now() + 3600000),
      members: { create: { userId, slot: 0 } },
    },
    include,
  });
}
export async function joinTeam(userId: string, input: unknown) {
  const code = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{8}$/)
    .parse(input);
  await limit("team-join:" + userId, 10);
  return transaction(async (tx) => {
    const teams = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM limiar."Team" WHERE code=${code} FOR UPDATE`;
    const team =
      teams[0] &&
      (await tx.team.findUnique({ where: { id: teams[0].id }, include }));
    if (
      !team ||
      team.status !== "LOBBY" ||
      team.expiresAt.getTime() < Date.now()
    )
      throw new UserError("Código inválido, expirado ou expedição iniciada.");
    if (team.members.length >= MAX_PARTY)
      throw new UserError("Equipe cheia (5/5).");
    if (await tx.teamMember.findUnique({ where: { userId } }))
      throw new UserError("Você já está em uma equipe.");
    const slot = Array.from({ length: MAX_PARTY }, (_, i) => i).find(
      (n) => !team.members.some((m) => m.slot === n),
    )!;
    await tx.teamMember.create({ data: { teamId: team.id, userId, slot } });
    await tx.teamMember.updateMany({
      where: { teamId: team.id },
      data: { ready: false },
    });
    return tx.team.findUniqueOrThrow({ where: { id: team.id }, include });
  });
}
export async function leaveTeam(userId: string, kickId?: string) {
  return transaction(async (tx) => {
    const member = await tx.teamMember.findUnique({ where: { userId } });
    if (!member) return null;
    await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${member.teamId} FOR UPDATE`;
    const team = await tx.team.findUniqueOrThrow({
      where: { id: member.teamId },
      include,
    });
    if (team.status === "RUNNING")
      throw new UserError(
        "A expedição continua. Desconecte para sair; você pode reconectar por 60 segundos.",
      );
    const target = kickId || userId;
    if (kickId && (team.leaderId !== userId || target === userId))
      throw new UserError("Apenas o líder pode remover outro membro.");
    await tx.teamMember.deleteMany({
      where: { teamId: team.id, userId: target },
    });
    const remaining = team.members.filter((m) => m.userId !== target);
    if (!remaining.length) {
      await tx.team.update({
        where: { id: team.id },
        data: { status: "CLOSED" },
      });
      return null;
    }
    await tx.team.update({
      where: { id: team.id },
      data: {
        leaderId:
          team.leaderId === target ? remaining[0].userId : team.leaderId,
      },
    });
    await tx.teamMember.updateMany({
      where: { teamId: team.id },
      data: { ready: false },
    });
    return tx.team.findUniqueOrThrow({ where: { id: team.id }, include });
  });
}
export const lobbyChoice = z
  .object({
    ready: z.boolean().optional(),
    character: z.enum(["nara", "orin", "ivo", "sena"]).optional(),
    mapId: z.enum(["ruins", "gardens"]).optional(),
    mode: z.enum(["normal", "nightmare", "endless"]).optional(),
    duration: z.number().int().refine((v) => Object.hasOwn(EXPEDITION_LENGTHS, v)).optional(),
  })
  .strict();
export async function updateTeam(userId: string, input: unknown) {
  const v = lobbyChoice.parse(input);
  return transaction(async (tx) => {
    const member = await tx.teamMember.findUnique({ where: { userId } });
    if (!member) throw new UserError("Equipe não encontrada.");
    await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${member.teamId} FOR UPDATE`;
    const team = await tx.team.findUniqueOrThrow({
      where: { id: member.teamId },
    });
    if (team.status !== "LOBBY") throw new UserError("Expedição já iniciada.");
    if (v.mapId || v.mode || v.duration) {
      if (team.leaderId !== userId)
        throw new UserError("Somente o líder escolhe mapa e modo.");
      await tx.team.update({
        where: { id: team.id },
        data: { mapId: v.mapId, mode: v.mode, duration: v.duration },
      });
      await tx.teamMember.updateMany({
        where: { teamId: team.id },
        data: { ready: false },
      });
    }
    if (v.character) {
      const p = await tx.userProgress.findUnique({ where: { userId } });
      const progress = p?.data as { unlocked?: string[] } | undefined;
      if (v.character !== "nara" && !progress?.unlocked?.includes(v.character))
        throw new UserError("Personagem ainda não desbloqueado.");
    }
    await tx.teamMember.update({
      where: { id: member.id },
      data: { ready: v.character ? false : v.ready, character: v.character },
    });
    return tx.team.findUniqueOrThrow({ where: { id: team.id }, include });
  });
}
export async function startTeam(userId: string) {
  return transaction(async (tx) => {
    const member = await tx.teamMember.findUnique({ where: { userId } });
    if (!member) throw new UserError("Equipe não encontrada.");
    await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${member.teamId} FOR UPDATE`;
    const team = await tx.team.findUniqueOrThrow({
      where: { id: member.teamId },
      include,
    });
    if (
      team.leaderId !== userId ||
      team.status !== "LOBBY" ||
      !team.members.every((m) => m.ready)
    )
      throw new UserError(
        "Somente o líder inicia; todos precisam estar prontos.",
      );
    await tx.team.update({
      where: { id: team.id },
      data: { status: "RUNNING" },
    });
    return tx.gameSession.create({
      data: {
        teamId: team.id,
        seed: crypto.randomUUID(),
        mapId: team.mapId,
        mode: team.mode,
        duration: team.duration,
        partySize: team.members.length,
        members: {
          create: team.members.map((m) => ({
            userId: m.userId,
            character: m.character,
          })),
        },
      },
      include: { members: { include: { user: { select: publicUser } } } },
    });
  });
}

export async function transferOfflineLeader(
  userId: string,
  onlineIds: string[],
) {
  return transaction(async (tx) => {
    const membership = await tx.teamMember.findUnique({ where: { userId } });
    if (!membership) return null;
    await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${membership.teamId} FOR UPDATE`;
    const team = await tx.team.findUniqueOrThrow({
      where: { id: membership.teamId },
      include,
    });
    if (team.leaderId !== userId || team.status !== "LOBBY") return null;
    const next = team.members.find(
      (m) => m.userId !== userId && onlineIds.includes(m.userId),
    );
    if (!next) return null;
    await tx.teamMember.update({ where: { userId }, data: { ready: false } });
    return tx.team.update({
      where: { id: team.id },
      data: { leaderId: next.userId },
      include,
    });
  });
}
