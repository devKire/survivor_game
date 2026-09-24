import { WarSimulation } from "../game/core/war";
import { currentSeason, getRating, settleRating } from "../server/ranked";
import { selectMatch, type QueueEntry } from "../game/core/matchmaking";
import { MATCHMAKING_CONFIG } from "../game/content/matchmaking";
import { randomUUID, randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PvpSimulation, PVP_MAP_POOL } from "../game/core/pvp";
import type { ArenaCommand } from "../game/network/pvp";
import { db } from "../server/db";
import { progress } from "../server/progress";
import { migrateSave } from "../game/core/save";
import {
  economyTransaction,
  lockProgress,
  grantCurrency,
  persistSave,
  economyJson,
} from "../server/economy";
import { UserError, limit } from "../server/security";
type Entry = QueueEntry;
interface Match {
  id: string;
  mode: string;
  seasonId: string | null;
  game: PvpSimulation;
  settling: boolean;
  retryAfter: number;
  tickMs: number[];
  bytes: number;
  peakEntities: number;
  matchmakingReason: string;
}
export class ArenaService {
  connected = new Set<string>();
  reserved = new Set<string>();
  queue = new Map<string, Entry>();
  matches = new Map<string, Match>();
  active = new Map<string, string>();
  matching = false;
  queueVersion = new Map<string, number>();
  accumulator = 0;
  last = performance.now();
  snapshotClock = 0;
  constructor(readonly send: (userId: string, message: unknown) => void) {}
  async initialize() {
    await economyTransaction(async (tx) => {
      await tx.arenaMatch.updateMany({
        where: { status: "RUNNING" },
        data: { status: "INTERRUPTED", endedAt: new Date() },
      });
      await tx.arenaSeat.deleteMany({
        where: { match: { status: "INTERRUPTED" } },
      });
    });
  }
  async handle(userId: string, name: string, v: ArenaCommand) {
    const match = this.matches.get(this.active.get(userId) || "");
    if (v.type === "ARENA_INPUT") {
      match?.game.accept(userId, v);
      return;
    }
    if (v.type === "ARENA_FORFEIT") {
      match?.game.forfeit(userId);
      return;
    }
    if (v.type === "ARENA_CANCEL") {
      this.queueVersion.set(userId, (this.queueVersion.get(userId) || 0) + 1);
      this.queue.delete(userId);
      this.send(userId, {
        type: "ARENA_QUEUE_STATUS",
        waiting: false,
        seconds: 0,
      });
      return;
    }
    if (v.type === "ARENA_CHAT_SEND") {
      const f = match?.game.fighters.get(userId);
      if (!match || !f || !f.connected || match.game.ended)
        throw new UserError("Partida indisponível.");
      await limit("arena-chat:" + userId, 20, 10);
      const message = await db().chatMessage.create({
        data: { senderId: userId, arenaMatchId: match.id, text: v.text },
      });
      for (const ally of match.game.fighters.values())
        if (ally.team === f.team)
          this.send(ally.id, {
            type: "ARENA_CHAT",
            id: message.id,
            senderId: userId,
            name: f.name,
            text: message.text,
          });
      return;
    }
    if (v.type !== "ARENA_QUEUE") {
      const game = match?.game;
      if (!(game instanceof WarSimulation))
        throw new UserError("Comando exclusivo da Guerra.");
      const controller = game.fighters.get(userId);
      if (
        !controller?.connected ||
        controller.botControlled ||
        game.forfeited.has(userId)
      )
        throw new UserError("Você não controla este slot.");
      const ok =
        v.type === "ARENA_BUILD"
          ? game.build(userId, v.kind, v.x, v.y)
          : v.type === "ARENA_REPAIR"
            ? game.repair(userId, v.targetId)
            : v.type === "ARENA_ORDER"
              ? game.order(userId, v.lane, v.order)
              : v.type === "ARENA_RECRUIT"
                ? game.recruit(userId, v.lane, v.kind, v.count, v.formation)
                : game.upgrade(userId, v.kind);
      if (!ok)
        throw new UserError(
          "Ação indisponível: confira Energia, classe, alcance, limites e recarga.",
        );
      return;
    }
    if (this.reserved.has(userId)) throw new UserError("Partida sendo criada.");
    if (match) throw new UserError("Você já está em uma partida.");
    const version = (this.queueVersion.get(userId) || 0) + 1;
    this.queueVersion.set(userId, version);
    const membership = await db().teamMember.findUnique({
      where: { userId },
      include: { team: { include: { members: true } } },
    });
    if (membership?.team.status === "RUNNING")
      throw new UserError("Conclua a expedição antes de entrar na Arena.");
    const save = migrateSave((await progress(userId)).data);
    const ranked = v.mode.endsWith("RANKED");
    const rating = ranked ? await getRating(userId, v.mode) : null;
    const casualSeason = ranked ? null : await currentSeason();
    const casualRating = casualSeason
      ? await db().rankedRating.findUnique({
          where: {
            userId_seasonId_mode: {
              userId,
              seasonId: casualSeason.id,
              mode: v.mode.replace("_CASUAL", "_RANKED"),
            },
          },
          select: { mmr: true },
        })
      : null;
    if (
      !this.connected.has(userId) ||
      this.queueVersion.get(userId) !== version ||
      this.reserved.has(userId) ||
      this.active.has(userId)
    )
      return;
    if (this.queue.size >= 500 && !this.queue.has(userId))
      throw new UserError("Fila cheia. Tente novamente em instantes.");
    this.queue.set(userId, {
      id: userId,
      name,
      character: v.character,
      role: v.role,
      cosmetics: save.cosmetics,
      joined: this.queue.get(userId)?.joined || Date.now(),
      partyId: v.mode.startsWith("WAR") ? membership?.teamId : undefined,
      partyMembers: v.mode.startsWith("WAR")
        ? membership?.team.members.map((m) => m.userId).sort()
        : undefined,
      mode: v.mode,
      mmr: rating?.rating.mmr ?? casualRating?.mmr ?? 1000,
      seasonId: rating?.season.id || null,
    });
    this.send(userId, {
      type: "ARENA_QUEUE_STATUS",
      waiting: true,
      seconds: 0,
    });
  }
  reconnect(userId: string) {
    this.connected.add(userId);
    const match = this.matches.get(this.active.get(userId) || "");
    if (match?.game.reconnect(userId))
      this.send(userId, {
        type: "ARENA_STARTED",
        roster: [...match.game.fighters.values()].map((f) => ({
          id: f.id,
          name: f.name,
          team: f.team,
          isBot: f.isBot,
        })),
        matchId: match.id,
        mode: match.mode,
      });
  }
  disconnect(userId: string) {
    this.queueVersion.set(userId, (this.queueVersion.get(userId) || 0) + 1);
    this.connected.delete(userId);
    this.queue.delete(userId);
    this.matches.get(this.active.get(userId) || "")?.game.disconnect(userId);
  }
  async pair() {
    if (this.matching || this.matches.size >= 32) return;
    this.matching = true;
    try {
      const now = Date.now();
      for (const e of this.queue.values()) {
        const timeout = e.mode.endsWith("RANKED")
          ? MATCHMAKING_CONFIG.rankedMaxQueueTimeMs
          : MATCHMAKING_CONFIG.maxQueueTimeMs;
        if (!this.connected.has(e.id) || now - e.joined >= timeout) {
          this.queue.delete(e.id);
          this.send(e.id, {
            type: "ARENA_QUEUE_STATUS",
            waiting: false,
            seconds: 0,
          });
          this.send(e.id, {
            type: "ERROR",
            message:
              "Busca encerrada sem adversários suficientes. Tente novamente.",
          });
          continue;
        }
        this.send(e.id, {
          type: "ARENA_QUEUE_STATUS",
          waiting: true,
          seconds: Math.floor((now - e.joined) / 1000),
          found: Math.min(
            e.mode.startsWith("WAR") ? 10 : 2,
            [...this.queue.values()].filter(
              (p) => p.mode === e.mode && p.seasonId === e.seasonId,
            ).length,
          ),
          target: e.mode.startsWith("WAR") ? 10 : 2,
          filling:
            e.mode === "WAR_CASUAL" &&
            now - e.joined >= MATCHMAKING_CONFIG.botFillAfterMs,
        });
      }
      const plan = selectMatch([...this.queue.values()], now);
      if (!plan) return;
      const pair = plan.humans,
        seeds = plan.seeds;
      // Consume synchronously before the first await; a second tick cannot reuse seats.
      const versions = new Map(
        pair.map((p) => [p.id, this.queueVersion.get(p.id)]),
      );
      for (const p of pair) {
        this.queue.delete(p.id);
        this.reserved.add(p.id);
      }
      const valid = () =>
        pair.every(
          (p) =>
            this.connected.has(p.id) &&
            this.queueVersion.get(p.id) === versions.get(p.id) &&
            !this.active.has(p.id),
        );
      const mapId = PVP_MAP_POOL[randomInt(PVP_MAP_POOL.length)],
        worldSeed = randomUUID();

      try {
        if (pair[0].seasonId && (await currentSeason()).id !== pair[0].seasonId)
          throw new UserError("Temporada mudou.");
        const match = await economyTransaction(async (tx) => {
          const memberships = await tx.teamMember.findMany({
            where: { userId: { in: pair.map((p) => p.id) } },
          });
          for (const teamId of [
            ...new Set(memberships.map((m) => m.teamId)),
          ].sort()) {
            await tx.$queryRaw`SELECT id FROM limiar."Team" WHERE id=${teamId} FOR UPDATE`;
            if (
              (await tx.team.findUnique({ where: { id: teamId } }))?.status ===
              "RUNNING"
            )
              throw new UserError("Expedição iniciada.");
          }
          for (const p of pair) {
            const membership = memberships.find((m) => m.userId === p.id);
            if (p.mode.startsWith("WAR") && membership?.teamId !== p.partyId)
              throw new UserError("Equipe mudou durante a busca.");
            if (p.partyId) {
              const members = await tx.teamMember.findMany({
                where: { teamId: p.partyId },
              });
              if (
                members
                  .map((m) => m.userId)
                  .sort()
                  .join() !== p.partyMembers?.join()
              )
                throw new UserError("Equipe mudou durante a busca.");
            }
          }
          if (!valid()) throw new UserError("Busca cancelada.");
          return tx.arenaMatch.create({
            data: {
              mode: pair[0].mode,
              seasonId: pair[0].seasonId,
              result: economyJson({
                mapId,
                seed: worldSeed,
                humanCount: pair.length,
                botCount: seeds.length - pair.length,
                matchmakingReason: plan.reason,
              }),
              participants: {
                create: seeds
                  .filter((p) => !p.isBot)
                  .map((p) => ({
                    userId: p.id,
                    team: p.team,
                    character: p.character,
                    result: { role: p.role || "SOLDADO" },
                  })),
              },
              seats: {
                create: seeds
                  .filter((p) => !p.isBot)
                  .map((p) => ({ userId: p.id })),
              },
            },
          });
        });
        if (!valid()) {
          await economyTransaction(async (tx) => {
            await tx.arenaMatch.update({
              where: { id: match.id },
              data: { status: "INTERRUPTED", endedAt: new Date() },
            });
            await tx.arenaSeat.deleteMany({ where: { matchId: match.id } });
          });
          throw new UserError("Busca cancelada durante a criação.");
        }
        const game = pair[0].mode.startsWith("WAR")
          ? new WarSimulation(seeds, mapId, worldSeed)
          : new PvpSimulation(seeds, mapId, worldSeed);
        for (const p of pair)
          game.log("queue-ms", p.id, undefined, Date.now() - p.joined);
        for (const p of seeds)
          if (!p.isBot && !this.connected.has(p.id)) game.disconnect(p.id);
        this.matches.set(match.id, {
          id: match.id,
          mode: match.mode,
          seasonId: match.seasonId,
          game,
          settling: false,
          retryAfter: 0,
          tickMs: [],
          bytes: 0,
          peakEntities: seeds.length,
          matchmakingReason: plan.reason,
        });
        for (const p of seeds.filter((p) => !p.isBot)) {
          this.active.set(p.id, match.id);
          this.send(p.id, {
            type: "ARENA_STARTED",
            roster: [...game.fighters.values()].map((f) => ({
              id: f.id,
              name: f.name,
              team: f.team,
              isBot: f.isBot,
            })),
            matchId: match.id,
            mode: match.mode,
          });
        }
      } catch {
        for (const p of pair) {
          this.send(p.id, {
            type: "ARENA_QUEUE_STATUS",
            waiting: false,
            seconds: 0,
          });
          this.send(p.id, {
            type: "ERROR",
            message: "Não foi possível criar a Arena. Entre novamente na fila.",
          });
        }
      } finally {
        for (const p of pair) this.reserved.delete(p.id);
      }
    } finally {
      this.matching = false;
    }
  }
  update() {
    const now = performance.now(),
      elapsed = (now - this.last) / 1000;
    this.accumulator = Math.min(0.2, this.accumulator + elapsed);
    this.last = now;
    while (this.accumulator >= 0.04) {
      this.accumulator -= 0.04;
      for (const m of this.matches.values()) {
        if (m.game.ended) continue;
        const t = performance.now();
        m.game.step();
        m.peakEntities = Math.max(
          m.peakEntities,
          m.game.fighters.size +
            m.game.bullets.length +
            (m.game instanceof WarSimulation
              ? m.game.units.items.length + m.game.structures.length
              : 0),
        );
        m.tickMs.push(performance.now() - t);
        if (m.tickMs.length > 2000) m.tickMs.shift();
      }
    }
    this.snapshotClock += elapsed;
    if (this.snapshotClock >= 0.1) {
      this.snapshotClock %= 0.1;
      for (const m of this.matches.values())
        for (const f of m.game.fighters.values())
          if (f.connected && !f.isBot) {
            const message = {
              type: "ARENA_SNAPSHOT",
              matchId: m.id,
              snapshot: m.game.snapshot(f.id),
            };
            m.bytes += Buffer.byteLength(JSON.stringify(message));
            this.send(f.id, message);
          }
    }
    for (const m of this.matches.values())
      if (m.game.ended && !m.settling && Date.now() >= m.retryAfter) {
        m.settling = true;
        void this.settle(m)
          .then(() => {
            for (const f of m.game.fighters.values()) {
              this.send(f.id, {
                type: "ARENA_RESULT",
                matchId: m.id,
                winner: m.game.winner,
                reason: m.game.reason,
              });
              this.active.delete(f.id);
            }
            this.matches.delete(m.id);
          })
          .catch(() => {
            m.settling = false;
            m.retryAfter = Date.now() + 5000;
          });
      }
  }
  async settle(m: Match) {
    const g = m.game;
    await economyTransaction(async (tx) => {
      const claimed = await tx.arenaMatch.updateMany({
        where: { id: m.id, status: "RUNNING" },
        data: {
          status: "COMPLETED",
          endedAt: new Date(),
          winner: g.winner,
          result: economyJson({
            mapId: g.world.mapId,
            seed: g.world.seed,
            humanCount: g.humanCount,
            botCount: g.botCount,
            teamHumanCount: [0, 1].map(
              (t) =>
                [...g.fighters.values()].filter((f) => f.team === t && !f.isBot)
                  .length,
            ),
            botDifficulty: MATCHMAKING_CONFIG.botDifficulty,
            matchmakingReason: m.matchmakingReason,
            parties: g.partyComposition,
            takeoverCount: [...g.fighters.values()].filter(
              (f) => !f.isBot && f.botEverControlled,
            ).length,
            score: g.score,
            duration: g.time,
            reason: g.reason,
            meanTickMs:
              m.tickMs.reduce((a, b) => a + b, 0) /
              Math.max(1, m.tickMs.length),
            snapshotBytes: m.bytes,
            peakEntities: m.peakEntities,
            p95TickMs:
              [...m.tickMs].sort((a, b) => a - b)[
                Math.floor(m.tickMs.length * 0.95)
              ] || 0,
            minionCap: g instanceof WarSimulation ? 180 : 0,
          }),
          events: economyJson(g.events),
        },
      });
      if (!claimed.count) return;
      for (const f of [...g.fighters.values()]
        .filter((f) => !f.isBot)
        .sort((a, b) => a.id.localeCompare(b.id))) {
        const { save } = await lockProgress(tx, f.id);
        const earned = await tx.currencyTransaction.count({
          where: {
            userId: f.id,
            source: "pvp",
            currency: "GEMS",
            createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
          },
        });
        if (
          !g.forfeited.has(f.id) &&
          g.time >= 30 &&
          f.humanCasts >= 10 &&
          earned < 6
        ) {
          await grantCurrency(tx, save, {
            userId: f.id,
            currency: "GEMS",
            amount: Math.floor(
              (g.winner === f.team ? 20 : 10) *
                (0.5 + (0.5 * g.humanCount) / g.fighters.size),
            ),
            source: "pvp",
            referenceId: `pvp:${m.id}`,
          });
          if (g.winner === f.team)
            await grantCurrency(tx, save, {
              userId: f.id,
              currency: "GOLD",
              amount: 1,
              source: "pvp",
              referenceId: `pvp:${m.id}`,
            });
        }
        await persistSave(tx, f.id, save);
        await tx.arenaParticipant.update({
          where: { matchId_userId: { matchId: m.id, userId: f.id } },
          data: {
            result: economyJson({
              role: g instanceof WarSimulation ? g.roles.get(f.id) : null,
              forfeited: g.forfeited.has(f.id),
              kills: f.kills,
              deaths: f.deaths,
              damage: f.damage,
              casts: f.casts,
              hits: f.hits,
              disconnected: !f.connected,
            }),
          },
        });
      }
      if (m.seasonId && g.botCount === 0)
        await settleRating(tx, m.id, m.seasonId, m.mode, g);
      await tx.arenaSeat.deleteMany({ where: { matchId: m.id } });
    });
  }
}
