import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { WebSocket } from "ws";
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../src/server/db";
import { issueTicket } from "../src/server/tickets";
import { serverMessage } from "../src/game/network/protocol";
import type { WorldSnapshot } from "../src/game/network/world";
const users: string[] = [],
  sockets: WebSocket[] = [];
let child: ChildProcess;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean) {
  const end = Date.now() + 20000;
  while (!f()) {
    if (Date.now() > end) throw Error("Capacity timeout");
    await pause(20);
  }
}
const percentile = (v: number[], p: number) =>
  [...v].sort((a, b) => a - b)[Math.floor(v.length * p)] ?? 0;
describe.skipIf(process.env.RUN_REALTIME_TESTS !== "1")(
  "World capacity over actual sockets",
  () => {
    afterAll(async () => {
      for (const ws of sockets) ws.close();
      if (child?.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
    });
    it("holds fifty authenticated connections, bounds one zone at twenty and measures RTT/traffic", async () => {
      child = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/realtime/server.ts",
        ],
        {
          env: {
            ...process.env,
            REALTIME_PORT: "3011",
            RPG_ENABLED: "true",
            RPG_SHARED_WORLD_ENABLED: "true",
            REALTIME_DIAGNOSTICS: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let ready = false,
        errors = "";
      child.stdout?.on("data", (d) => {
        if (String(d).includes("LIMIAR realtime")) ready = true;
      });
      child.stderr?.on("data", (d) => (errors += String(d)));
      await until(() => ready || child.exitCode !== null);
      expect(ready, errors).toBe(true);
      const peers: {
          snapshot?: WorldSnapshot;
          entryMs: number;
          rejected: boolean;
          rtt: number[];
          messages: number;
          bytes: number;
        }[] = [],
        samples = [];
      for (let i = 0; i < 50; i++) {
        // Preserve the existing 30 upgrades/minute/IP policy; do not bypass it for QA.
        if (i === 25) await pause(61000);
        const id = "capacity_" + randomUUID();
        users.push(id);
        await db().user.create({
          data: {
            id,
            name: "Capacity " + i,
            email: id + "@example.test",
            sessions: {
              create: {
                id,
                token: randomUUID(),
                expiresAt: new Date(Date.now() + 3600000),
              },
            },
          },
        });
        const ws = new WebSocket("ws://127.0.0.1:3011", {
          origin: "http://localhost:3000",
        });
        sockets.push(ws);
        const p = {
          snapshot: undefined as WorldSnapshot | undefined,
          entryMs: 0,
          rejected: false,
          rtt: [] as number[],
          messages: 0,
          bytes: 0,
        };
        peers.push(p);
        let account = false,
          entered = 0;
        ws.on("message", (raw) => {
          p.messages++;
          p.bytes += Buffer.byteLength(raw.toString());
          const m = serverMessage.parse(JSON.parse(raw.toString()));
          if (m.type === "ACCOUNT") account = true;
          if (m.type === "WORLD_SNAPSHOT") {
            if (!p.snapshot) p.entryMs = performance.now() - entered;
            p.snapshot = m;
          }
          if (m.type === "ERROR" && m.message.includes("cheia"))
            p.rejected = true;
          if (m.type === "PONG") p.rtt.push(Date.now() - m.at);
        });
        await once(ws, "open");
        ws.send(JSON.stringify({ type: "HELLO", ticket: issueTicket(id, id) }));
        await until(() => account);
        entered = performance.now();
        ws.send(JSON.stringify({ type: "WORLD_ENTER", protocol: 1 }));
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "PING", at: Date.now() }));
        }, 1000);
        ws.once("close", () => clearInterval(heartbeat));
        await until(() => !!p.snapshot || p.rejected);
        if ([1, 2, 5, 10, 20, 50].includes(i + 1)) {
          const bytesBefore = peers.reduce((s, p) => s + p.bytes, 0),
            messagesBefore = peers.reduce((s, p) => s + p.messages, 0),
            start = performance.now();
          await pause(1500);
          const seconds = (performance.now() - start) / 1000;
          const health = await fetch("http://127.0.0.1:3011/health").then((r) =>
            r.json(),
          );
          samples.push({
            connections: i + 1,
            admitted: peers.filter((p) => p.snapshot).length,
            rejected: peers.filter((p) => p.rejected).length,
            entryP95: percentile(
              peers.filter((p) => p.snapshot).map((p) => p.entryMs),
              0.95,
            ),
            rttP95: percentile(
              peers.flatMap((p) => p.rtt),
              0.95,
            ),
            messagesPerSecond:
              (peers.reduce((s, p) => s + p.messages, 0) - messagesBefore) /
              seconds,
            bytesPerSecond:
              (peers.reduce((s, p) => s + p.bytes, 0) - bytesBefore) / seconds,
            health,
          });
        }
      }
      expect(peers.filter((p) => p.snapshot)).toHaveLength(20);
      expect(peers.filter((p) => p.rejected)).toHaveLength(30);
      expect(sockets.every((s) => s.readyState === WebSocket.OPEN)).toBe(true);
      expect(
        peers.slice(0, 20).every((p) => p.snapshot?.players.length === 20),
      ).toBe(true);
      expect(
        await db().rpgWorldVisit.count({
          where: { activeUserId: { in: users } },
        }),
      ).toBe(20);
      expect(
        await db().gameSessionMember.count({
          where: { userId: { in: users } },
        }),
      ).toBe(0);
      await mkdir("docs/qa/world", { recursive: true });
      await writeFile(
        "docs/qa/world/socket-capacity.json",
        JSON.stringify(
          {
            at: new Date().toISOString(),
            node: process.version,
            cpu: cpus()[0].model,
            logicalCpus: cpus().length,
            totalMemoryBytes: totalmem(),
            method:
              "Loopback real authenticated WebSockets in safe Refuge. Fifty connections include thirty capacity rejections, not fifty simultaneous avatars. Existing IP limits preserved. Samples include maintenance and PostgreSQL authentication/entry; not WAN latency.",
            samples,
          },
          null,
          2,
        ),
      );
    }, 120000);
  },
);
