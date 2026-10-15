import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";
import { describe, it, expect, afterAll, vi } from "vitest";
import { db } from "../src/server/db";
import { issueTicket } from "../src/server/tickets";
import {
  serverMessage,
  type ServerMessage,
} from "../src/game/network/protocol";
import type { WorldSnapshot } from "../src/game/network/world";
import { WorldZone } from "../src/realtime/world/zone";
import { explorationPath } from "./helpers/exploration-navigation";
import { mutateRpgEquipment } from "../src/server/rpg/mutations";

const users: string[] = [],
  sockets: WebSocket[] = [];
let child: ChildProcess;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 15000) {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw Error("World realtime timeout");
    await pause(25);
  }
}
async function peer(id: string) {
  const ws = new WebSocket("ws://127.0.0.1:3010", {
    origin: "http://localhost:3000",
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  ws.on("message", (raw) =>
    messages.push(serverMessage.parse(JSON.parse(raw.toString()))),
  );
  await once(ws, "open");
  const send = (value: unknown) => ws.send(JSON.stringify(value));
  send({ type: "HELLO", ticket: issueTicket(id, id) });
  await until(() => messages.some((m) => m.type === "ACCOUNT"));
  send({ type: "WORLD_ENTER", protocol: 1 });
  await until(() => messages.some((m) => m.type === "WORLD_SNAPSHOT"));
  const heartbeat = setInterval(
    () => send({ type: "PING", at: Date.now() }),
    2000,
  );
  ws.once("close", () => clearInterval(heartbeat));
  return {
    ws,
    id,
    messages,
    send,
    sequence: 0,
    snapshot: () =>
      messages.findLast(
        (m): m is WorldSnapshot => m.type === "WORLD_SNAPSHOT",
      )!,
  };
}
type Peer = Awaited<ReturnType<typeof peer>>;
function input(p: Peer, x = 0, y = 0) {
  p.send({
    type: "WORLD_INPUT",
    epoch: p.snapshot().epoch,
    sequence: ++p.sequence,
    moveX: x,
    moveY: y,
  });
}
function own(p: Peer) {
  return p.snapshot().players.find((a) => a.id === p.snapshot().selfId)!;
}
async function walk(p: Peer, x: number, y: number) {
  const deadline = Date.now() + 20000;
  while (Math.hypot(own(p).x - x, own(p).y - y) > 12) {
    if (Date.now() > deadline)
      throw Error("Movement timeout " + JSON.stringify(own(p)));
    const dx = x - own(p).x,
      dy = y - own(p).y,
      d = Math.hypot(dx, dy);
    input(p, dx / d, dy / d);
    await pause(40);
  }
  input(p);
  await pause(300);
}
describe.skipIf(process.env.RUN_REALTIME_TESTS !== "1")(
  "Shared world real websocket",
  () => {
    afterAll(async () => {
      for (const ws of sockets) ws.close();
      if (child?.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("shares a zone across six accounts without teams, transfers and reconnects without ghosts", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      child = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "src/realtime/server.ts",
        ],
        {
          env: { ...process.env, REALTIME_PORT: "3010" },
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
      const peers: Peer[] = [];
      for (let i = 0; i < 6; i++) {
        const id = "world_" + randomUUID();
        users.push(id);
        await db().user.create({
          data: {
            id,
            name: `Eco ${i}`,
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
        peers.push(await peer(id));
      }
      await until(() => peers.every((p) => p.snapshot().players.length === 6));
      expect(new Set(peers.map((p) => p.snapshot().instanceId)).size).toBe(1);
      expect(
        await db().teamMember.count({ where: { userId: { in: users } } }),
      ).toBe(0);
      expect(
        await db().gameSessionMember.count({
          where: { userId: { in: users } },
        }),
      ).toBe(0);
      const p = peers[0],
        oldEpoch = p.snapshot().epoch,
        publicId = p.snapshot().selfId;
      const version = (
        await db().userProgress.findUniqueOrThrow({ where: { userId: p.id } })
      ).version;
      const requestId = randomUUID();
      p.send({
        type: "WORLD_TRANSITION",
        epoch: oldEpoch,
        portalId: "refuge:exploration-portal",
        requestId,
      });
      await until(() =>
        p.messages.some(
          (m) =>
            m.type === "WORLD_RESULT" && m.requestId === requestId && !m.ok,
        ),
      );
      await expect(
        mutateRpgEquipment(p.id, {
          operation: "EQUIP_ITEM",
          characterId: "nara",
          instanceId: "foreign",
          slot: "WEAPON",
          expectedRevision: p.snapshot().self.revision,
          requestId: randomUUID(),
        }),
      ).rejects.toThrow(/dentro do mundo/);
      const invalidProfile = randomUUID();
      p.send({
        type: "WORLD_RPC",
        epoch: p.snapshot().epoch,
        requestId: invalidProfile,
        operation: "PROFILE",
        args: { userId: peers[1].id },
      });
      await until(() =>
        p.messages.some(
          (m) =>
            m.type === "WORLD_RESULT" &&
            m.requestId === invalidProfile &&
            !m.ok,
        ),
      );
      p.send({
        type: "WORLD_INTERACT",
        epoch: p.snapshot().epoch,
        targetId: "refuge:guardian",
      });
      await until(() =>
        p.messages.some(
          (m) =>
            m.type === "WORLD_INTERACTION" && m.targetId === "refuge:guardian",
        ),
      );
      const farStorage = randomUUID();
      p.send({
        type: "WORLD_RPC",
        epoch: p.snapshot().epoch,
        requestId: farStorage,
        operation: "STORAGE",
        args: {},
      });
      await until(() =>
        p.messages.some(
          (m) =>
            m.type === "WORLD_RESULT" &&
            m.requestId === farStorage &&
            !m.ok &&
            m.message.includes("Depósito"),
        ),
      );
      await walk(p, 380, 620);
      await walk(p, 380, 735);
      await until(() =>
        peers[1].snapshot().players.some((a) => a.id === publicId && a.x < 400),
      );
      const transition = randomUUID();
      p.send({
        type: "WORLD_TRANSITION",
        epoch: p.snapshot().epoch,
        portalId: "refuge:exploration-portal",
        requestId: transition,
      });
      await until(() => p.snapshot().zoneId === "ruins-outskirts");
      await until(
        () => !peers[1].snapshot().players.some((a) => a.id === publicId),
      );
      expect(p.snapshot().epoch).not.toBe(oldEpoch);
      const start = { x: own(p).x, y: own(p).y };
      p.send({
        type: "WORLD_INPUT",
        epoch: oldEpoch,
        sequence: 200,
        moveX: 1,
        moveY: 0,
      });
      await pause(300);
      expect(own(p).x).toBe(start.x);
      expect(own(p).y).toBe(start.y);
      p.send({
        type: "WORLD_TRANSITION",
        epoch: oldEpoch,
        portalId: "refuge:exploration-portal",
        requestId: transition,
      });
      await pause(200);
      expect(p.snapshot().zoneId).toBe("ruins-outskirts");
      const q = peers[1];
      await walk(q, 380, 620);
      await walk(q, 380, 735);
      q.send({
        type: "WORLD_TRANSITION",
        epoch: q.snapshot().epoch,
        portalId: "refuge:exploration-portal",
        requestId: randomUUID(),
      });
      await until(
        () =>
          q.snapshot().zoneId === "ruins-outskirts" &&
          p.snapshot().players.length === 2,
      );
      // Public geometry is used only to navigate with normal input packets.
      const geometry = new WorldZone("ruins-outskirts", "test-navigation");
      const target = [...geometry.nodes]
        .filter((n) => n.kind === "RESOURCE")
        .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
      const obstacles = Array.from(
        { length: 9 },
        (_, i) =>
          geometry.world.createChunk((i % 3) - 1, Math.floor(i / 3) - 1)
            .structures,
      ).flat();
      for (const point of explorationPath(own(p), target, obstacles))
        await walk(p, point.x, point.y);
      const gather = {
        type: "WORLD_GATHER",
        epoch: p.snapshot().epoch,
        nodeId: target.id,
        requestId: randomUUID(),
        expectedRevision: p.snapshot().self.revision,
      };
      p.send(gather);
      await until(() =>
        p.messages.some(
          (m) =>
            m.type === "WORLD_RESULT" &&
            m.requestId === gather.requestId &&
            m.ok,
        ),
      );
      const claim = await db().rpgResourceClaim.findUniqueOrThrow({
        where: {
          userId_requestId: { userId: p.id, requestId: gather.requestId },
        },
      });
      expect(claim.worldVisitId).toBeTruthy();
      expect(claim.sessionId).toBeNull();
      const balance = await db().rpgMaterialBalance.findMany({
        where: { userId: p.id },
      });
      const beforeReplay = p.messages.length;
      p.send(gather);
      await until(() =>
        p.messages
          .slice(beforeReplay)
          .some(
            (m) =>
              m.type === "WORLD_RESULT" &&
              m.requestId === gather.requestId &&
              m.ok,
          ),
      );
      expect(
        await db().rpgMaterialBalance.findMany({ where: { userId: p.id } }),
      ).toEqual(balance);
      expect(
        await db().rpgResourceClaim.count({ where: { userId: p.id } }),
      ).toBe(1);
      geometry.dispose();
      p.ws.close();
      await until(() => q.snapshot().players.length === 1);
      const reconnect = await peer(p.id);
      expect(reconnect.snapshot().zoneId).toBe("ruins-outskirts");
      await until(() => q.snapshot().players.length === 2);
      expect(q.snapshot().players.map((a) => a.id)).not.toContain(publicId);
      reconnect.send({
        type: "WORLD_TRANSITION",
        epoch: reconnect.snapshot().epoch,
        portalId: "world:ruins:refuge-return",
        requestId: randomUUID(),
      });
      await until(() => reconnect.snapshot().zoneId === "obelisk-refuge");
      await until(() => peers[2].snapshot().players.length === 5);
      expect(
        (await db().userProgress.findUniqueOrThrow({ where: { userId: p.id } }))
          .version,
      ).toBe(version);
      expect(
        await db().rpgWorldVisit.count({ where: { activeUserId: p.id } }),
      ).toBe(1);
      const health = await fetch("http://127.0.0.1:3010/health").then((r) =>
        r.json(),
      );
      expect(health.sharedWorld.protocol).toBe(1);
      expect(health.sharedWorld.zones).toHaveLength(2);
      for (const a of [reconnect, ...peers.slice(1)])
        a.send({ type: "WORLD_LEAVE", epoch: a.snapshot().epoch });
      await until(() =>
        reconnect.messages.some((m) => m.type === "WORLD_LEFT"),
      );
    }, 150000);
  },
);
