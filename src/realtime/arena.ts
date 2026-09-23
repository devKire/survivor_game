import { WarSimulation } from "../game/core/war";
import { currentSeason, getRating, settleRating } from "../server/ranked";
import { queueRange } from "../game/content/ranked";
import { performance } from "node:perf_hooks";
import { PvpSimulation, type FighterSeed } from "../game/core/pvp";
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
interface Entry extends Omit<FighterSeed, "team"> {
  joined: number;
  mode: string;
  mmr: number;
  seasonId: string | null;
}
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
}
export class ArenaService {
  connected = new Set<string>();
  reserved = new Set<string>();
  queue = new Map<string, Entry>();
  matches = new Map<string, Match>();
  active = new Map<string, string>();
  matching = false;
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
    const membership = await db().teamMember.findUnique({
      where: { userId },
      include: { team: true },
    });
    if (membership?.team.status === "RUNNING")
      throw new UserError("Conclua a expedição antes de entrar na Arena.");
    const save = migrateSave((await progress(userId)).data);
    const rating = v.mode.endsWith("RANKED")
      ? await getRating(userId, v.mode)
      : null;
    if (!this.connected.has(userId)) return;
    if (this.queue.size >= 500 && !this.queue.has(userId))
      throw new UserError("Fila cheia. Tente novamente em instantes.");
    this.queue.set(userId, {
      id: userId,
      name,
      character: v.character,
      role: v.role,
      cosmetics: save.cosmetics,
      joined: Date.now(),
      mode: v.mode,
      mmr: rating?.rating.mmr || 1000,
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
        })),
        matchId: match.id,
        mode: match.mode,
      });
  }
  disconnect(userId: string) {
    this.connected.delete(userId);
    this.queue.delete(userId);
    this.matches.get(this.active.get(userId) || "")?.game.disconnect(userId);
  }
  async pair() {
    if (this.matching || this.matches.size >= 32) return;
    this.matching = true;
    try {
      for (const e of this.queue.values())
        this.send(e.id, {
          type: "ARENA_QUEUE_STATUS",
          waiting: true,
          seconds: Math.floor((Date.now() - e.joined) / 1000),
        });
      const entries = [...this.queue.values()];
      if (entries.length < 2) return;
      let pair: Entry[] = [];
      for (const first of entries) {
        const candidates = entries.filter(
          (e) =>
            e.mode === first.mode &&
            e.seasonId === first.seasonId &&
            (!first.mode.endsWith("RANKED") ||
              Math.abs(e.mmr - first.mmr) <=
                Math.min(
                  queueRange((Date.now() - first.joined) / 1000),
                  queueRange((Date.now() - e.joined) / 1000),
                )),
        );
        if (first.mode === "WAR_RANKED") {
          const commanders = candidates
              .filter((e) => e.role === "COMANDANTE")
              .slice(0, 2),
            builders = candidates
              .filter((e) => e.role === "CONSTRUTOR")
              .slice(0, 2),
            soldiers = candidates
              .filter((e) => e.role === "SOLDADO")
              .slice(0, 6);
          if (
            commanders.length === 2 &&
            builders.length === 2 &&
            soldiers.length === 6
          ) {
            pair = [...commanders, ...builders, ...soldiers];
            break;
          }
        } else if (first.mode === "WAR_CASUAL") {
          let commanders = 0;
          const eligible = candidates.filter(
            (e) => e.role !== "COMANDANTE" || ++commanders <= 2,
          );
          if (eligible.length >= 10) {
            pair = eligible
              .slice(0, 10)
              .sort(
                (a, b) =>
                  Number(b.role === "COMANDANTE") -
                  Number(a.role === "COMANDANTE"),
              );
            break;
          }
        } else if (candidates.length >= 2) {
          pair = candidates.slice(0, 2);
          break;
        }
      }
      if (!pair.length) return;
      if (pair[0].seasonId && (await currentSeason()).id !== pair[0].seasonId) {
        for (const p of pair) {
          this.queue.delete(p.id);
          this.send(p.id, {
            type: "ERROR",
            message: "Temporada mudou. Entre novamente na fila.",
          });
        }
        return;
      }
      for (const p of pair) {
        this.queue.delete(p.id);
        this.reserved.add(p.id);
      }
      const seeds: FighterSeed[] = [];
      const totals = [0, 0];
      // Assign each role pair across teams, placing its stronger player on the weaker team.
      for (let i = 0; i < pair.length; i += 2) {
        const two = [pair[i], pair[i + 1]].sort((a, b) => b.mmr - a.mmr),
          team = totals[0] <= totals[1] ? 0 : 1;
        seeds.push({ ...two[0], team }, { ...two[1], team: 1 - team });
        totals[team] += two[0].mmr;
        totals[1 - team] += two[1].mmr;
      }

      try {
        const match = await economyTransaction(async (tx) => {
          const memberships = await tx.teamMember.findMany({
            where: { userId: { in: seeds.map((p) => p.id) } },
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
          return tx.arenaMatch.create({
            data: {
              mode: pair[0].mode,
              seasonId: pair[0].seasonId,
              participants: {
                create: seeds.map((p) => ({
                  userId: p.id,
                  team: p.team,
                  character: p.character,
                  result: { role: p.role || "SOLDADO" },
                })),
              },
              seats: { create: seeds.map((p) => ({ userId: p.id })) },
            },
          });
        });
        const game = pair[0].mode.startsWith("WAR")
          ? new WarSimulation(seeds)
          : new PvpSimulation(seeds);
        for (const p of pair)
          game.log("queue-ms", p.id, undefined, Date.now() - p.joined);
        for (const p of seeds)
          if (!this.connected.has(p.id)) game.disconnect(p.id);
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
        });
        for (const p of seeds) {
          this.active.set(p.id, match.id);
          this.send(p.id, {
            type: "ARENA_STARTED",
            roster: [...game.fighters.values()].map((f) => ({
              id: f.id,
              name: f.name,
              team: f.team,
            })),
            matchId: match.id,
            mode: match.mode,
          });
        }
      } catch {
        for (const p of pair)
          this.send(p.id, {
            type: "ERROR",
            message: "Não foi possível criar a Arena. Entre novamente na fila.",
          });
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
          if (f.connected) {
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
      for (const f of [...g.fighters.values()].sort((a, b) =>
        a.id.localeCompare(b.id),
      )) {
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
          f.casts >= 10 &&
          earned < 6
        ) {
          await grantCurrency(tx, save, {
            userId: f.id,
            currency: "GEMS",
            amount: g.winner === f.team ? 20 : 10,
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
      if (m.seasonId) await settleRating(tx, m.id, m.seasonId, m.mode, g);
      await tx.arenaSeat.deleteMany({ where: { matchId: m.id } });
    });
  }
}
