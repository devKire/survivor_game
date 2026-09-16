import "dotenv/config";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { WebSocket } from "ws";
import { db } from "../src/server/db";
import { issueTicket } from "../src/server/tickets";
import * as teams from "../src/server/teams";
import {
  serverMessage,
  type ServerMessage,
  type Snapshot,
  type ClientMessage,
} from "../src/game/network/protocol";
import { predictMove } from "../src/game/network/movement";
import type { Vec } from "../src/game/core/types";
const enabled = process.env.RUN_REALTIME_TESTS === "1",
  prefix = "net_" + randomUUID().slice(0, 8),
  ids: string[] = [],
  sockets: WebSocket[] = [];
let processServer: ChildProcess | undefined, teamId: string | undefined;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => boolean, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error("Condição de rede não observada a tempo.");
    await delay(25);
  }
}
class Peer {
  ws!: WebSocket;
  messages: ServerMessage[] = [];
  snapshot?: Snapshot;
  delayMs = 0;
  drop = false;
  dropped = 0;
  received = 0;
  resyncs = 0;
  seq = 0;
  prediction?: Vec;
  pending: { sequence: number; move: Vec }[] = [];
  corrections: number[] = [];
  heartbeat?: ReturnType<typeof setInterval>;
  constructor(
    readonly id: string,
    readonly sessionId: string,
  ) {}
  async connect() {
    this.ws = new WebSocket("ws://localhost:3002", {
      origin: "http://localhost:3000",
    });
    sockets.push(this.ws);
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => {
      const value = serverMessage.parse(JSON.parse(raw.toString()));
      setTimeout(() => this.receive(value), this.delayMs / 2);
    });
    this.send({ type: "HELLO", ticket: issueTicket(this.id, this.sessionId) });
    this.heartbeat = setInterval(
      () => this.send({ type: "PING", at: Date.now() }),
      2000,
    );
    await until(() => this.messages.some((m) => m.type === "ACCOUNT"));
  }
  receive(v: ServerMessage) {
    if (v.type === "SNAPSHOT") {
      this.received++;
      if (this.drop && !v.full && this.received % 10 === 0) {
        this.dropped++;
        return;
      }
      if (!v.full && v.base !== this.snapshot?.tick) {
        this.resyncs++;
        this.send({ type: "RESYNC" });
        return;
      }
      const own = v.players.find((p) => p.id === this.id)!;
      const prior = this.prediction;
      this.pending = this.pending.filter((i) => i.sequence > own.ack);
      this.prediction = { x: own.x, y: own.y };
      for (const input of this.pending)
        this.prediction = predictMove(
          this.prediction,
          input.move,
          own.speed * (own.inWater ? 0.88 : 1),
          0.04,
          v.structures,
        );
      if (prior)
        this.corrections.push(
          Math.hypot(prior.x - this.prediction.x, prior.y - this.prediction.y),
        );
      this.snapshot = v;
    } else {
      if (v.type === "ERROR") console.log("SERVER VALIDATION", v.message);
      this.messages.push(v);
    }
  }
  send(v: ClientMessage) {
    setTimeout(() => {
      if (this.ws.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify(v));
    }, this.delayMs / 2);
  }
  move(move: Vec) {
    const sequence = ++this.seq;
    this.pending.push({ sequence, move });
    const s = this.snapshot,
      p = s?.players.find((p) => p.id === this.id);
    if (p && s)
      this.prediction = predictMove(
        this.prediction || p,
        move,
        p.speed * (p.inWater ? 0.88 : 1),
        0.04,
        s.structures,
      );
    this.send({
      type: "INPUT",
      sequence,
      moveX: move.x,
      moveY: move.y,
      interact: false,
    });
  }
  close() {
    clearInterval(this.heartbeat);
    this.ws.close();
  }
}
describe.skipIf(!enabled)(
  "Real WebSocket authority: five clients, latency and reconnect",
  () => {
    beforeAll(async () => {
      processServer = spawn(
        process.execPath,
        ["--import", "tsx", "src/realtime/server.ts"],
        {
          env: {
            ...process.env,
            REALTIME_PORT: "3002",
            REALTIME_ORIGIN: "http://localhost:3000",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let ready = false;
      processServer.stdout?.on("data", (data) => {
        if (String(data).includes("LIMIAR realtime")) ready = true;
      });
      processServer.stderr?.on("data", (data) =>
        console.error(String(data).slice(0, 500)),
      );
      await until(() => ready);
    });
    afterAll(async () => {
      for (const ws of sockets) ws.close();
      processServer?.kill("SIGTERM");
      await delay(500);
      if (teamId) {
        await db().gameSession.deleteMany({ where: { teamId } });
        await db().team.deleteMany({ where: { id: teamId } });
      }
      await db().user.deleteMany({ where: { id: { in: ids } } });
      await db().$disconnect();
    });
    it("shares seed/enemies, validates inputs, denies sixth/mid-run, resyncs dropped deltas and reconnects", async () => {
      const peers: Peer[] = [];
      try {
        for (let i = 0; i < 6; i++) {
          const id = prefix + "_" + i;
          await db().user.create({
            data: { id, name: id, username: id, email: id + "@example.test" },
          });
          ids.push(id);
          await db().session.create({
            data: {
              id,
              token: randomUUID(),
              userId: id,
              expiresAt: new Date(Date.now() + 600000),
            },
          });
          if (i < 5) peers.push(new Peer(id, id));
        }
        const team = await teams.createTeam(ids[0]);
        teamId = team.id;
        for (const id of ids.slice(1, 5)) await teams.joinTeam(id, team.code);
        await expect(teams.joinTeam(ids[5], team.code)).rejects.toThrow();
        await Promise.all(peers.map((p) => p.connect()));
        for (const p of peers) p.send({ type: "READY", ready: true });
        await until(
          () =>
            peers.every((p) =>
              p.messages.some(
                (v) =>
                  v.type === "ACCOUNT" && v.team?.members.every((m) => m.ready),
              ),
            ),
          45000,
        );
        peers[0].send({ type: "START" });
        await until(() => peers.every((p) => p.snapshot));
        expect(new Set(peers.map((p) => p.snapshot!.seed)).size).toBe(1);
        expect(peers.every((p) => p.snapshot!.players.length === 5)).toBe(true);
        expect(
          peers.every((p) => p.snapshot!.room === peers[0].snapshot!.room),
        ).toBe(true);
        await expect(teams.joinTeam(ids[5], team.code)).rejects.toThrow();
        const lead = peers[0];
        lead.ws.send(
          JSON.stringify({
            type: "INPUT",
            sequence: 999,
            moveX: 999,
            moveY: 0,
            interact: false,
            x: 1e9,
            damage: 1e9,
          }),
        );
        await until(() => lead.messages.some((v) => v.type === "ERROR"));
        const metrics = [];
        for (const latency of [0, 50, 100, 150, 250]) {
          for (const peer of peers) {
            peer.delayMs = latency;
            peer.corrections = [];
          }
          const from = lead.snapshot!.time;
          for (let tick = 0; tick < 75; tick++) {
            for (const peer of peers)
              peer.move({ x: 0, y: tick < 38 ? 1 : -1 });
            await delay(40);
          }
          await delay(latency + 200);
          const corrections = peers
            .flatMap((p) => p.corrections)
            .sort((a, b) => a - b);
          metrics.push({
            simulatedRttMs: latency,
            serverSeconds: lead.snapshot!.time - from,
            correctionMeanPx:
              corrections.reduce((s, n) => s + n, 0) / corrections.length,
            correctionP95Px: corrections[Math.floor(corrections.length * 0.95)],
            snapshots: peers.map((p) => p.received),
          });
          expect(lead.snapshot!.time).toBeGreaterThan(from + 2);
          expect(
            lead.snapshot!.players.every(
              (p) => Math.abs(p.x) < 500 && Math.abs(p.y) < 800,
            ),
          ).toBe(true);
        }
        lead.drop = true;
        await delay(3000);
        expect(lead.dropped).toBeGreaterThan(0);
        expect(lead.resyncs).toBeGreaterThan(0);
        lead.drop = false;
        const before = lead.snapshot!.players.map((p) => p.id);
        lead.close();
        await delay(400);
        const rejoined = new Peer(ids[0], ids[0]);
        peers.push(rejoined);
        await rejoined.connect();
        await until(() => !!rejoined.snapshot);
        expect(rejoined.snapshot!.players.map((p) => p.id)).toEqual(before);
        expect(rejoined.snapshot!.full).toBe(true);
        const outsiders = new Peer(ids[5], ids[5]);
        peers.push(outsiders);
        await outsiders.connect();
        outsiders.send({
          type: "INPUT",
          sequence: 1,
          moveX: 1,
          moveY: 1,
          interact: false,
        });
        await delay(300);
        expect(outsiders.snapshot).toBeUndefined();
        writeFileSync(
          "docs/network-results.json",
          JSON.stringify(
            {
              clients: 5,
              metrics,
              droppedSnapshots: lead.dropped,
              resyncs: lead.resyncs,
              reconnect: true,
              noDuplicatePlayers: true,
              transport:
                "Real TCP/WebSocket; artificial delay both directions; application snapshot drops (TCP itself retransmits).",
            },
            null,
            2,
          ),
        );
      } finally {
        for (const p of peers) p.close();
      }
    }, 180000);
  },
);
