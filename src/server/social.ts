import { z } from "zod";
import { db } from "./db";
import { limit, pair, UserError } from "./security";
export const publicUser = {
  id: true,
  username: true,
  displayUsername: true,
} as const;
export async function friends(userId: string) {
  return db().friendship.findMany({
    where: { OR: [{ fromId: userId }, { toId: userId }] },
    include: { from: { select: publicUser }, to: { select: publicUser } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
export async function searchUsers(userId: string, query: unknown) {
  const q = z.string().trim().min(3).max(24).parse(query).toLowerCase();
  await limit("search:" + userId, 30);
  return db().user.findMany({
    where: { username: { startsWith: q }, id: { not: userId } },
    select: publicUser,
    take: 15,
  });
}
export async function requestFriend(userId: string, target: unknown) {
  const toId = z.string().max(100).parse(target);
  if (toId === userId)
    throw new UserError("Você não pode adicionar a si mesmo.");
  await limit("friend:" + userId, 20);
  if (!(await db().user.findUnique({ where: { id: toId } })))
    throw new UserError("Usuário não encontrado.");
  return db().friendship.upsert({
    where: { pair: pair(userId, toId) },
    create: { pair: pair(userId, toId), fromId: userId, toId },
    update: {},
  });
}
export async function updateFriend(
  userId: string,
  id: string,
  action: "accept" | "reject" | "remove",
) {
  const row = await db().friendship.findUnique({ where: { id } });
  if (!row || ![row.fromId, row.toId].includes(userId))
    throw new UserError("Solicitação não encontrada.");
  if (action === "accept") {
    if (row.toId !== userId || row.status !== "PENDING")
      throw new UserError("Solicitação não disponível.");
    await db().friendship.updateMany({
      where: { id, toId: userId, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
  } else {
    if (
      action === "reject" &&
      (row.toId !== userId || row.status !== "PENDING")
    )
      throw new UserError("Solicitação não disponível.");
    await db().friendship.deleteMany({
      where: { id, OR: [{ fromId: userId }, { toId: userId }] },
    });
  }
}
export const chatInput = z
  .object({
    scope: z.enum(["dm", "team"]),
    target: z.string().min(1).max(100),
    text: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine(
        (t) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(t),
      ),
  })
  .strict();
export async function authorizeChat(
  userId: string,
  scope: "dm" | "team",
  target: string,
) {
  if (scope === "dm") {
    if (
      !(await db().friendship.findFirst({
        where: { pair: pair(userId, target), status: "ACCEPTED" },
      }))
    )
      throw new UserError("Conversa disponível apenas entre amigos.");
  } else if (
    !(await db().teamMember.findFirst({ where: { teamId: target, userId } }))
  )
    throw new UserError("Você não pertence à equipe.");
}
export async function sendChat(userId: string, input: unknown) {
  const v = chatInput.parse(input);
  await limit("chat:" + userId, 20, 10);
  await authorizeChat(userId, v.scope, v.target);
  return db().chatMessage.create({
    data: {
      senderId: userId,
      text: v.text,
      ...(v.scope === "dm" ? { recipientId: v.target } : { teamId: v.target }),
    },
    include: { sender: { select: publicUser } },
  });
}
export async function chatHistory(
  userId: string,
  scope: "dm" | "team",
  target: string,
  cursor?: string,
) {
  await authorizeChat(userId, scope, target);
  await limit("history:" + userId, 60);
  return db().chatMessage.findMany({
    where:
      scope === "dm"
        ? {
            OR: [
              { senderId: userId, recipientId: target },
              { senderId: target, recipientId: userId },
            ],
          }
        : { teamId: target },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { sender: { select: publicUser } },
  });
}
