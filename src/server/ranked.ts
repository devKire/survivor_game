import "server-only";
import { db } from "./db";
import type { Prisma } from "../generated/prisma/client";
import { UserError } from "./security";
import {
  economyTransaction,
  lockProgress,
  persistSave,
  grantCurrency,
} from "./economy";
import { eloChange, RANKS, rankOf } from "../game/content/ranked";
import type { PvpSimulation } from "../game/core/pvp";
export async function currentSeason() {
  const now = new Date(),
    y = now.getUTCFullYear(),
    m = now.getUTCMonth(),
    id = `${y}-${String(m + 1).padStart(2, "0")}`;
  return db().season.upsert({
    where: { id },
    create: {
      id,
      name: `Ecos · ${id}`,
      startsAt: new Date(Date.UTC(y, m, 1)),
      endsAt: new Date(Date.UTC(y, m + 1, 1)),
    },
    update: {},
  });
}
export async function getRating(userId: string, mode: string) {
  const season = await currentSeason();
  const old = await db().rankedRating.findFirst({
    where: { userId, mode, seasonId: { not: season.id } },
    orderBy: { updatedAt: "desc" },
  });
  const initial = old ? Math.round(1000 + (old.mmr - 1000) * 0.75) : 1000;
  const rating = await db().rankedRating.upsert({
    where: { userId_seasonId_mode: { userId, seasonId: season.id, mode } },
    create: { userId, seasonId: season.id, mode, mmr: initial, peak: initial },
    update: {},
  });
  return { season, rating };
}
export async function settleRating(
  tx: Prisma.TransactionClient,
  matchId: string,
  seasonId: string,
  mode: string,
  g: PvpSimulation,
) {
  const rows = await tx.rankedRating.findMany({
    where: { seasonId, mode, userId: { in: [...g.fighters.keys()] } },
  });
  if (rows.length !== g.fighters.size)
    throw new Error("Rating participants missing");
  const average = (team: number) => {
    const r = rows.filter((r) => g.fighters.get(r.userId)!.team === team);
    return r.reduce((sum, r) => sum + r.mmr, 0) / r.length;
  };
  const avg = [average(0), average(1)];
  // Ranked starts human-only. Replacement AI never earns positive competitive progression.
  const assisted = [...g.fighters.values()].some((f) => f.botEverControlled);
  for (const row of rows) {
    const team = g.fighters.get(row.userId)!.team,
      result = g.forfeited.has(row.userId)
        ? 0
        : g.winner === null
          ? 0.5
          : g.winner === team
            ? 1
            : 0,
      delta = assisted
        ? Math.min(0, eloChange(avg[team], avg[1 - team], result))
        : eloChange(avg[team], avg[1 - team], result),
      mmr = Math.max(0, row.mmr + delta);
    await tx.rankedRating.update({
      where: { id: row.id },
      data: {
        mmr,
        peak: Math.max(row.peak, mmr),
        games: { increment: 1 },
        wins: { increment: Number(result === 1) },
        losses: { increment: Number(result === 0) },
      },
    });
    const p = await tx.arenaParticipant.findUniqueOrThrow({
      where: { matchId_userId: { matchId, userId: row.userId } },
    });
    const stats =
      p.result && typeof p.result === "object" && !Array.isArray(p.result)
        ? p.result
        : {};
    await tx.arenaParticipant.update({
      where: { id: p.id },
      data: {
        result: {
          ...stats,
          mmrBefore: row.mmr,
          mmrAfter: mmr,
          mmrDelta: mmr - row.mmr,
        },
      },
    });
  }
}
export async function claimSeason(
  userId: string,
  seasonId: string,
  mode: string,
) {
  return economyTransaction(async (tx) => {
    const { save } = await lockProgress(tx, userId),
      season = await tx.season.findUnique({ where: { id: seasonId } });
    if (!season || Date.now() < season.endsAt.getTime() + 3600000)
      throw new UserError(
        "Recompensas abrem uma hora após encerrar a temporada.",
      );
    const key = { userId, seasonId, mode };
    if (
      await tx.seasonReward.findUnique({ where: { userId_seasonId_mode: key } })
    )
      return;
    const rating = await tx.rankedRating.findUnique({
      where: { userId_seasonId_mode: key },
    });
    if (!rating || rating.games < 10)
      throw new UserError("Jogue ao menos dez partidas na temporada.");
    const tier = RANKS.findIndex((r) => r.name === rankOf(rating.peak).name);
    await grantCurrency(tx, save, {
      userId,
      currency: "GOLD",
      amount: 10 + tier * 10,
      source: "season",
      referenceId: `season:${seasonId}:${mode}`,
    });
    await grantCurrency(tx, save, {
      userId,
      currency: "GEMS",
      amount: 100 + tier * 100,
      source: "season",
      referenceId: `season:${seasonId}:${mode}`,
    });
    await tx.userCosmetic.upsert({
      where: {
        userId_cosmeticId: {
          userId,
          cosmeticId: `profile_frame_${Math.min(4, Math.floor(tier / 2))}`,
        },
      },
      create: {
        userId,
        cosmeticId: `profile_frame_${Math.min(4, Math.floor(tier / 2))}`,
        source: "season",
      },
      update: {},
    });
    await tx.seasonReward.create({ data: key });
    await persistSave(tx, userId, save);
  });
}
export async function reportPlayer(
  userId: string,
  targetId: string,
  matchId: string,
  reason: string,
) {
  if (userId === targetId) throw new UserError("Alvo inválido.");
  const participants = await db().arenaParticipant.count({
    where: { matchId, userId: { in: [userId, targetId] } },
  });
  if (participants !== 2)
    throw new UserError(
      "Report disponível apenas para participantes da mesma partida.",
    );
  return db().arenaReport.upsert({
    where: { userId_targetId_matchId: { userId, targetId, matchId } },
    create: { userId, targetId, matchId, reason },
    update: {},
  });
}

export function closedSeasonCutoff() {
  return new Date(Date.now() - 3600000);
}
