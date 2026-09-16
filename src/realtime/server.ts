import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { clientMessage, TICK_HZ, SNAPSHOT_HZ } from "../game/network/protocol";
import { verifyTicket } from "../server/tickets";
import { db } from "../server/db";
import * as teams from "../server/teams";
import * as social from "../server/social";
import { progress } from "../server/progress";
import { migrateSave } from "../game/core/save";
import { CoopSimulation } from "../game/core/coop";
import { SnapshotStream } from "./snapshots";
import { settle } from "./settlement";
import { UserError } from "../server/security";
interface Connection {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  username: string;
  room?: string;
  stream: SnapshotStream;
  friends: Set<string>;
  related: Set<string>;
  teamId?: string;
  commandWindow: number;
  commands: number;
  bucket: number;
  window: number;
  queued: number;
  operation: Promise<void>;
  syncGeneration: number;
  lastSeen: number;
  full: boolean;
}
interface Room {
  id: string;
  teamId: string;
  game: CoopSimulation;
  tick: number;
  accumulator: number;
  snapshotClock: number;
  settling: boolean;
  retryAfter?: number;
  endedAt?: number;
}
const connections = new Set<Connection>(),
  rooms = new Map<string, Room>(),
  nonces = new Map<string, number>(),
  ips = new Map<string, { n: number; at: number }>();
const origin = process.env.REALTIME_ORIGIN || "http://localhost:3000";
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        connections: connections.size,
        tickRate: TICK_HZ,
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 16384,
  perMessageDeflate: false,
});
function send(c: Connection, message: unknown) {
  if (c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 1_000_000)
    c.ws.send(JSON.stringify(message));
  else if (c.ws.bufferedAmount >= 1_000_000)
    c.ws.close(1013, "Conexão lenta; reconecte.");
}
const online = (id: string) => [...connections].filter((c) => c.userId === id);
function presence(id: string) {
  const c = online(id)[0];
  return !c
    ? "OFFLINE"
    : c.room
      ? "EM PARTIDA"
      : c.teamId
        ? "EM EQUIPE"
        : "NO MENU";
}
async function sync(c: Connection) {
  const generation = ++c.syncGeneration;
  const [team, friends, p] = await Promise.all([
    teams.currentTeam(c.userId),
    social.friends(c.userId),
    progress(c.userId),
  ]);
  if (generation !== c.syncGeneration || c.ws.readyState !== WebSocket.OPEN)
    return;
  c.teamId = team?.id;
  c.related = new Set(
    friends.map((f) => (f.fromId === c.userId ? f.toId : f.fromId)),
  );
  c.friends = new Set(
    friends
      .filter((f) => f.status === "ACCEPTED")
      .map((f) => (f.fromId === c.userId ? f.toId : f.fromId)),
  );
  send(c, {
    type: "ACCOUNT",
    userId: c.userId,
    team,
    friends: friends.map((f) => ({
      ...f,
      presence: presence(f.fromId === c.userId ? f.toId : f.fromId),
    })),
    progress: p,
  });
  if (team?.status === "RUNNING") {
    const room = [...rooms.values()].find((r) => r.teamId === team.id);
    if (room && room.game.reconnect(c.userId)) {
      c.room = room.id;
      c.full = true;
      send(c, { type: "STARTED", room: room.id });
    }
  }
  for (const peer of connections)
    if (peer.friends.has(c.userId))
      send(peer, {
        type: "PRESENCE",
        id: c.userId,
        state: c.room ? "EM PARTIDA" : team ? "EM EQUIPE" : "NO MENU",
      });
}
async function refreshTeam(teamId: string) {
  const members = await db().teamMember.findMany({ where: { teamId } });
  await Promise.all(
    [...connections]
      .filter((c) => members.some((m) => m.userId === c.userId))
      .map(sync),
  );
}
async function hello(c: Connection, ticket: string) {
  const data = verifyTicket(ticket);
  if (nonces.has(data.nonce)) throw new UserError("Ticket já utilizado.");
  nonces.set(data.nonce, data.expiresAt);
  const s = await db().session.findUnique({
    where: { id: data.sessionId },
    include: { user: true },
  });
  if (!s || s.userId !== data.userId || s.expiresAt.getTime() < Date.now())
    throw new UserError("Sessão expirada.");
  for (const old of online(s.userId))
    if (old !== c) old.ws.close(4001, "Conectado em outra aba.");
  if (c.ws.readyState !== WebSocket.OPEN) return;
  c.userId = s.userId;
  c.sessionId = s.id;
  c.username = s.user.displayUsername || s.user.username || s.user.name;
  await db().user.update({
    where: { id: c.userId },
    data: { lastSeenAt: new Date() },
  });
  await sync(c);
}
wss.on("connection", (ws) => {
  const c: Connection = {
    ws,
    userId: "",
    sessionId: "",
    username: "",
    stream: new SnapshotStream(),
    friends: new Set(),
    related: new Set(),
    commandWindow: Date.now(),
    commands: 0,
    bucket: 0,
    window: Date.now(),
    queued: 0,
    operation: Promise.resolve(),
    syncGeneration: 0,
    lastSeen: Date.now(),
    full: true,
  };
  connections.add(c);
  const authTimer = setTimeout(() => {
    if (!c.userId) ws.close(4401, "Autenticação necessária.");
  }, 5000);
  ws.on("message", async (raw) => {
    const now = Date.now();
    if (now - c.window >= 1000) {
      c.window = now;
      c.bucket = 0;
    }
    if (++c.bucket > 70) {
      ws.close(4429, "Limite de mensagens.");
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw.toString());
    } catch {
      ws.close(4400, "JSON inválido.");
      return;
    }
    const parsed = clientMessage.safeParse(value);
    if (!parsed.success) {
      send(c, { type: "ERROR", message: "Mensagem inválida." });
      return;
    }
    const v = parsed.data;
    c.lastSeen = now;
    if (v.type === "PING") {
      send(c, { type: "PONG", at: v.at });
      if (c.room && v.rtt !== undefined) {
        const values = rooms.get(c.room)?.game.run.telemetry?.networkRtt;
        if (values && values.length < 1000) values.push(v.rtt);
      }
      return;
    }
    if (!c.userId && v.type !== "HELLO") {
      ws.close(4401, "Autenticação necessária.");
      return;
    }
    const room = c.room ? rooms.get(c.room) : undefined;
    if (v.type === "INPUT") {
      room?.game.acceptInput(c.userId, v);
      return;
    }
    if (v.type === "RESYNC") {
      c.full = true;
      return;
    }
    if (
      ["HELLO", "SYNC", "READY", "CONFIG", "START", "KICK", "CHAT"].includes(
        v.type,
      )
    ) {
      if (now - c.commandWindow >= 60000) {
        c.commandWindow = now;
        c.commands = 0;
      }
      if (++c.commands > 80) {
        send(c, {
          type: "ERROR",
          message: "Muitas operações. Aguarde um minuto.",
        });
        return;
      }
    }
    if (c.queued >= 8) {
      send(c, { type: "ERROR", message: "Muitas operações pendentes." });
      return;
    }
    c.queued++;
    const previous = c.operation;
    let unlock!: () => void;
    c.operation = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    if (c.ws.readyState !== WebSocket.OPEN) {
      c.queued--;
      unlock();
      return;
    }
    try {
      if (v.type === "HELLO") {
        if (c.userId) throw new UserError("Conexão já autenticada.");
        await hello(c, v.ticket);
      }
      if (v.type === "SYNC") {
        const old = c.teamId,
          related = new Set(c.related);
        await sync(c);
        if (old) await refreshTeam(old);
        if (c.teamId && c.teamId !== old) await refreshTeam(c.teamId);
        for (const id of c.related) related.add(id);
        for (const peer of connections)
          if (peer !== c && related.has(peer.userId)) await sync(peer);
      }
      if (v.type === "READY" || v.type === "CONFIG") {
        const team = await teams.updateTeam(
          c.userId,
          v.type === "READY"
            ? { ready: v.ready }
            : { character: v.character, mapId: v.mapId, mode: v.mode },
        );
        await refreshTeam(team.id);
      }
      if (v.type === "KICK") {
        const team = await teams.leaveTeam(c.userId, v.target);
        for (const kicked of online(v.target)) await sync(kicked);
        if (team) await refreshTeam(team.id);
      }
      if (v.type === "START") {
        if (rooms.size >= 32)
          throw new UserError("Servidor cheio. Tente mais tarde.");
        const session = await teams.startTeam(c.userId);
        const players = await Promise.all(
          session.members.map(async (m) => ({
            id: m.userId,
            name: m.user.displayUsername || m.user.username || "Eco",
            character: m.character,
            progress: migrateSave((await progress(m.userId)).data),
          })),
        );
        const game = new CoopSimulation(
          players,
          session.mode,
          session.mapId,
          session.seed,
        );
        const r: Room = {
          id: session.id,
          teamId: session.teamId,
          game,
          tick: 0,
          accumulator: 0,
          snapshotClock: 0,
          settling: false,
        };
        rooms.set(r.id, r);
        for (const member of players) {
          const sockets = online(member.id);
          if (!sockets.length) game.disconnect(member.id);
          for (const peer of sockets) {
            peer.room = r.id;
            peer.full = true;
            peer.stream = new SnapshotStream();
            send(peer, { type: "STARTED", room: r.id });
            for (const friend of connections)
              if (friend.friends.has(peer.userId))
                send(friend, {
                  type: "PRESENCE",
                  id: peer.userId,
                  state: "EM PARTIDA",
                });
          }
        }
      }
      if (v.type === "CHAT") {
        const message = await social.sendChat(c.userId, {
          scope: v.scope,
          target: v.target,
          text: v.text,
        });
        if (v.scope === "dm") {
          for (const peer of connections)
            if ([c.userId, v.target].includes(peer.userId))
              send(peer, { type: "CHAT", message });
        } else {
          const members = await db().teamMember.findMany({
            where: { teamId: v.target },
          });
          for (const peer of connections)
            if (members.some((m) => m.userId === peer.userId))
              send(peer, { type: "CHAT", message });
        }
      }
      if (v.type === "USE_ITEM") room?.game.use(c.userId, v.slot);
      if (v.type === "UPGRADE")
        room?.game.choose(c.userId, v.decision, v.choice, v.action);
      if (v.type === "INTERACT")
        room?.game.interactOnline(c.userId, v.structure, v.accept);
    } catch (e) {
      send(c, {
        type: "ERROR",
        message:
          e instanceof UserError
            ? e.message
            : "Operação não disponível. Tente novamente.",
      });
    } finally {
      c.queued--;
      unlock();
    }
  });
  ws.on("close", () => {
    clearTimeout(authTimer);
    connections.delete(c);
    if (c.userId && !online(c.userId).length) {
      if (c.room) rooms.get(c.room)?.game.disconnect(c.userId);
      for (const peer of connections)
        if (peer.friends.has(c.userId))
          send(peer, { type: "PRESENCE", id: c.userId, state: "OFFLINE" });
      if (c.teamId)
        setTimeout(() => {
          if (!online(c.userId).length)
            void teams
              .transferOfflineLeader(
                c.userId,
                [...connections].map((peer) => peer.userId),
              )
              .then((team) => (team ? refreshTeam(team.id) : undefined))
              .catch(() => {});
        }, 15000).unref();
      void db()
        .user.update({
          where: { id: c.userId },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => {});
    }
  });
  ws.on("error", () => ws.close());
});
server.on("upgrade", (req, socket, head) => {
  const ip = req.socket.remoteAddress || "unknown",
    now = Date.now();
  let rate = ips.get(ip);
  if (!rate || now - rate.at > 60000) {
    rate = { n: 0, at: now };
    ips.set(ip, rate);
  }
  if (
    req.headers.origin !== origin ||
    ++rate.n > 30 ||
    connections.size > 500
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
let previous = performance.now();
const interval = setInterval(() => {
  const now = performance.now(),
    elapsed = Math.min(0.2, (now - previous) / 1000);
  previous = now;
  for (const room of rooms.values()) {
    room.accumulator += elapsed;
    while (room.accumulator >= 1 / TICK_HZ && !room.game.ended) {
      room.game.update(1 / TICK_HZ);
      room.accumulator -= 1 / TICK_HZ;
      room.tick++;
    }
    room.snapshotClock += elapsed;
    if (room.snapshotClock >= 1 / SNAPSHOT_HZ) {
      room.snapshotClock -= 1 / SNAPSHOT_HZ;
      for (const c of connections)
        if (c.room === room.id) {
          const member = room.game.members.get(c.userId);
          if (member) {
            const snapshot = c.stream.build(
              room.game,
              member,
              room.tick,
              c.full,
            );
            snapshot.room = room.id;
            send(c, snapshot);
            c.full = false;
          }
        }
    }
    if (
      room.game.ended &&
      !room.settling &&
      Date.now() > (room.retryAfter || 0)
    ) {
      room.settling = true;
      void settle(room.id, room.game)
        .then(() => {
          room.endedAt = Date.now();
          void refreshTeam(room.teamId).catch(() => {});
          for (const c of connections)
            if (c.room === room.id) {
              send(c, {
                type: "RESULT",
                completed: room.game.run.completed,
                kills: room.game.run.kills,
                time: room.game.run.time,
              });
              c.room = undefined;
              void sync(c).catch(() => {});
            }
        })
        .catch(() => {
          room.settling = false;
          room.retryAfter = Date.now() + 5000;
        });
    }
    if (room.endedAt && Date.now() - room.endedAt > 60000)
      rooms.delete(room.id);
  }
}, 1000 / TICK_HZ);
let maintaining = false;
const maintenance = setInterval(async () => {
  if (maintaining) return;
  maintaining = true;
  try {
    const now = Date.now();
    for (const [k, v] of nonces) if (v < now) nonces.delete(k);
    for (const [k, v] of ips) if (now - v.at > 60000) ips.delete(k);
    for (const c of connections) {
      if (now - c.lastSeen > 15000) {
        c.ws.close(4000, "Conexão inativa.");
        continue;
      }
      if (c.sessionId) {
        const s = await db().session.findUnique({ where: { id: c.sessionId } });
        if (!s || s.expiresAt.getTime() < now)
          c.ws.close(4401, "Sessão expirada.");
      }
    }
  } catch {
    for (const c of connections)
      c.ws.close(1013, "Sessão temporariamente indisponível.");
  } finally {
    maintaining = false;
  }
}, 10000);
await db().gameSession.updateMany({
  where: { status: "RUNNING" },
  data: { status: "INTERRUPTED", endedAt: new Date() },
});
await db().team.updateMany({
  where: { status: "RUNNING" },
  data: { status: "LOBBY" },
});
server.listen(Number(process.env.REALTIME_PORT || 3001), "0.0.0.0", () =>
  console.log(`LIMIAR realtime · ${TICK_HZ} Hz · snapshots ${SNAPSHOT_HZ} Hz`),
);
function close() {
  clearInterval(interval);
  clearInterval(maintenance);
  for (const c of connections) c.ws.close(1012, "Servidor reiniciando.");
  wss.close();
  server.close();
  void db().$disconnect();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
