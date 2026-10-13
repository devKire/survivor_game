import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";
import { afterAll, describe, it, expect, vi } from "vitest";
import { db } from "../src/server/db";
import * as teams from "../src/server/teams";
import { issueTicket } from "../src/server/tickets";
import {
  serverMessage,
  type ServerMessage,
  type Snapshot,
} from "../src/game/network/protocol";
import { EXPLORATION_RUINS as region } from "../src/game/content/rpg/exploration-regions";
import { generateExploration } from "../src/game/core/rpg/exploration/generation";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { explorationPath } from "./helpers/exploration-navigation";
import { settleRpgExpedition } from "../src/server/rpg/rewards";
const users: string[] = [],
  teamIds: string[] = [],
  sockets: WebSocket[] = [];
let child: ChildProcess;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!f()) {
    if (Date.now() > end) throw Error("Exploration realtime timeout");
    await pause(25);
  }
}
async function connect(id: string) {
  const ws = new WebSocket("ws://127.0.0.1:3005", {
    origin: "http://localhost:3000",
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  ws.on("message", (raw) =>
    messages.push(serverMessage.parse(JSON.parse(raw.toString()))),
  );
  await once(ws, "open");
  const send = (v: unknown) => ws.send(JSON.stringify(v));
  send({ type: "HELLO", ticket: issueTicket(id, id) });
  await until(() => messages.some((m) => m.type === "ACCOUNT"));
  return {
    ws,
    messages,
    send,
    id,
    sequence: 0,
    snapshot: () =>
      messages.findLast((m): m is Snapshot => m.type === "SNAPSHOT"),
    state: () =>
      messages.findLast((m) => m.type === "EXPLORATION_STATE") as
        Extract<ServerMessage, { type: "EXPLORATION_STATE" }> | undefined,
  };
}
type Peer = Awaited<ReturnType<typeof connect>>;
const input = (p: Peer, x = 0, y = 0) =>
  p.send({
    type: "INPUT",
    sequence: ++p.sequence,
    moveX: x,
    moveY: y,
    interact: false,
  });
const publicWorld = new CoopSimulation(
  [{ id: "p", name: "p", character: "nara", progress: freshSave() }],
  "normal",
  region.mapId,
  region.seed,
).world;
const nodes = generateExploration(region, publicWorld),
  obstacles = Array.from(
    { length: 9 },
    (_, i) =>
      publicWorld.createChunk((i % 3) - 1, Math.floor(i / 3) - 1).structures,
  ).flat();
async function walk(peers: Peer[], target: { x: number; y: number }) {
  await Promise.all(
    peers.map(async (p) => {
      const own = () => p.snapshot()!.players.find((m) => m.id === p.id)!;
      const path = explorationPath(own(), target, obstacles);
      const end = Date.now() + 25000;
      for (const point of path)
        while (Math.hypot(own().x - point.x, own().y - point.y) > 12) {
          if (Date.now() > end)
            throw Error("Movement timeout " + JSON.stringify(own()));
          const dx = point.x - own().x,
            dy = point.y - own().y,
            d = Math.hypot(dx, dy);
          input(p, dx / d, dy / d);
          await pause(40);
        }
      input(p);
      await pause(350);
    }),
  );
}
describe.skipIf(process.env.RUN_REALTIME_TESTS !== "1")(
  "public exploration authority",
  () => {
    afterAll(async () => {
      for (const s of sockets) s.close();
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      const matches = await db().arenaParticipant.findMany({
        where: { userId: { in: users } },
        select: { matchId: true },
      });
      await db().arenaMatch.deleteMany({
        where: { id: { in: matches.map((m) => m.matchId) } },
      });
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().gameSession.deleteMany({ where: { teamId: { in: teamIds } } });
      await db().team.deleteMany({ where: { id: { in: teamIds } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("explores with 1/2/5 authenticated peers, validates movement and gathering, reconnects and persists personal claims", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "true");
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
            REALTIME_PORT: "3005",
            REALTIME_ORIGIN: "http://localhost:3000",
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
      for (const size of [1, 2, 5]) {
        const ids = [];
        for (let i = 0; i < size; i++) {
          const id = "expl_" + randomUUID().slice(0, 8);
          users.push(id);
          ids.push(id);
          await db().user.create({
            data: {
              id,
              name: id,
              username: id,
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
        }
        const team = await teams.createTeam(ids[0]);
        teamIds.push(team.id);
        for (const id of ids.slice(1)) await teams.joinTeam(id, team.code);
        const peers = await Promise.all(ids.map(connect)),
          lead = peers[0];
        lead.send({ type: "CONFIG", expeditionKind: "RPG_EXPLORATION" });
        await until(() =>
          lead.messages.some(
            (m) =>
              m.type === "ACCOUNT" &&
              m.team?.expeditionKind === "RPG_EXPLORATION",
          ),
        );
        for (const p of peers) p.send({ type: "READY", ready: true });
        await until(() =>
          lead.messages.some(
            (m) =>
              m.type === "ACCOUNT" && m.team?.members.every((p) => p.ready),
          ),
        );
        lead.send({ type: "START" });
        await until(() => peers.every((p) => p.snapshot() && p.state()));
        const sessionId = lead.snapshot()!.room;
        expect(lead.snapshot()!.players).toHaveLength(size);
        expect(lead.snapshot()!.upsert).toHaveLength(0);
        lead.send({
          type: "INPUT",
          sequence: 999,
          moveX: 1,
          moveY: 0,
          interact: false,
          x: 500,
        });
        await until(() => lead.messages.some((m) => m.type === "ERROR"));
        const rejectedAt = lead.messages.filter(
          (m) => m.type === "ERROR",
        ).length;
        lead.send({
          type: "GATHER_START",
          nodeId: nodes[0].id,
          requestId: randomUUID(),
          expectedRevision: 1,
          userId: ids.at(-1),
          quantity: 999,
        });
        lead.send({
          type: "GATHER_START",
          nodeId: "explore:v1:ruins-outskirts:99:99:weathered-vein:0",
          requestId: randomUUID(),
          expectedRevision: 1,
        });
        await until(
          () =>
            lead.messages.filter((m) => m.type === "ERROR").length >=
            rejectedAt + 2,
        );
        expect(JSON.stringify(lead.snapshot())).not.toMatch(
          /rollSeed|loadoutHash|RpgResourceClaim|depleted/,
        );
        const target = [...nodes]
          .filter((n) => n.kind === "RESOURCE")
          .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
        lead.send({
          type: "GATHER_START",
          nodeId: target.id,
          requestId: randomUUID(),
          expectedRevision: lead.state()!.revision,
        });
        await pause(200);
        expect(
          await db().rpgResourceClaim.count({ where: { sessionId } }),
        ).toBe(0);
        await walk(peers, target);
        const intentions = peers.map((p) => ({
          type: "GATHER_START",
          nodeId: target.id,
          requestId: randomUUID(),
          expectedRevision: p.state()!.revision,
        }));
        peers.forEach((p, i) => p.send(intentions[i]));
        await until(() =>
          peers.every((p) => p.state()?.depleted.includes(target.id)),
        );
        expect(
          await db().rpgResourceClaim.count({ where: { sessionId } }),
        ).toBe(size);
        lead.send(intentions[0]);
        await pause(250);
        expect(
          await db().rpgResourceClaim.count({ where: { sessionId } }),
        ).toBe(size);
        lead.ws.close();
        await pause(100);
        const reconnected = await connect(ids[0]);
        await until(
          () => reconnected.state()?.depleted.includes(target.id) === true,
        );
        expect(reconnected.snapshot()!.players).toHaveLength(size);
        peers[0] = reconnected;
        if (size === 1) {
          const poi = [...nodes]
            .filter((n) => n.kind === "POI")
            .sort(
              (a, b) =>
                Math.hypot(a.x - target.x, a.y - target.y) -
                Math.hypot(b.x - target.x, b.y - target.y),
            )[0];
          await walk(peers, poi);
          await until(
            () => reconnected.state()?.discovered.includes(poi.id) === true,
          );
          expect(
            await db().rpgDiscoveredPoi.count({ where: { userId: ids[0] } }),
          ).toBeGreaterThan(0);
        }
        if (size === 2) {
          const second = [...nodes]
            .filter((n) => n.kind === "RESOURCE" && n.id !== target.id)
            .sort(
              (a, b) =>
                Math.hypot(a.x - target.x, a.y - target.y) -
                Math.hypot(b.x - target.x, b.y - target.y),
            )[0];
          await walk([peers[0]], second);
          peers[0].send({
            type: "GATHER_START",
            nodeId: second.id,
            requestId: randomUUID(),
            expectedRevision: peers[0].state()!.revision,
          });
          await until(() => !!peers[0].state()?.gathering);
          peers[0].ws.close();
          await pause(200);
          peers[0] = await connect(ids[0]);
          await until(() => !!peers[0].state());
          await pause(2400);
          expect(peers[0].state()!.depleted).not.toContain(second.id);
          expect(
            await db().rpgResourceClaim.count({ where: { sessionId } }),
          ).toBe(size);
        }
        await expect(settleRpgExpedition(sessionId)).rejects.toThrow();
        for (const p of peers) p.send({ type: "EXPLORATION_LEAVE" });
        await until(() =>
          peers.every((p) => p.messages.some((m) => m.type === "RESULT")),
        );
        expect(
          (
            await db().rpgExplorationSession.findUniqueOrThrow({
              where: { sessionId },
            })
          ).status,
        ).toBe("COMPLETED");
        for (const id of ids) {
          expect(
            (
              await db().userProgress.findUniqueOrThrow({
                where: { userId: id },
              })
            ).version,
          ).toBe(1);
          expect(
            await db().rpgMaterialBalance.count({ where: { userId: id } }),
          ).toBe(1);
        }
        expect(
          await db().rpgRewardReceipt.count({ where: { sessionId } }),
        ).toBe(0);
        const errorCount = peers[0].messages.filter(
          (m) => m.type === "ERROR",
        ).length;
        peers[0].send(intentions[0]);
        await until(
          () =>
            peers[0].messages.filter((m) => m.type === "ERROR").length >
            errorCount,
        );
        expect(
          await db().rpgResourceClaim.count({ where: { sessionId } }),
        ).toBe(size);
        for (const p of peers) p.ws.close();
        await pause(150);
      }
      const arenaPeers = await Promise.all([
        connect(users[1]),
        connect(users[2]),
      ]);
      for (const p of arenaPeers)
        p.send({ type: "ARENA_QUEUE", character: "nara", mode: "DUEL_CASUAL" });
      await until(
        () =>
          arenaPeers.every((p) =>
            p.messages.some((m) => m.type === "ARENA_LOBBY_STATE"),
          ),
        45000,
      );
      for (const p of arenaPeers) p.send({ type: "ARENA_LOCK_SELECTION" });
      await until(
        () =>
          arenaPeers.every((p) =>
            p.messages.some((m) => m.type === "ARENA_STARTED"),
          ),
        45000,
      );
      const arenaErrors = arenaPeers[0].messages.filter(
        (m) => m.type === "ERROR",
      ).length;
      arenaPeers[0].send({
        type: "GATHER_START",
        nodeId: nodes[0].id,
        requestId: randomUUID(),
        expectedRevision: 1,
      });
      await until(
        () =>
          arenaPeers[0].messages.filter((m) => m.type === "ERROR").length >
          arenaErrors,
      );
      expect(
        arenaPeers[0].messages.findLast((m) => m.type === "ERROR"),
      ).toMatchObject({ message: "Exploração ativa necessária." });
      arenaPeers[0].send({ type: "ARENA_FORFEIT" });
      await pause(1000);
      for (const p of arenaPeers) p.ws.close();
      const survivor = await connect(users[0]);
      await teams.updateTeam(users[0], { expeditionKind: "SURVIVOR" });
      await teams.updateTeam(users[0], { ready: true });
      survivor.send({ type: "START" });
      await until(() => !!survivor.snapshot());
      const errorsBefore = survivor.messages.filter(
        (m) => m.type === "ERROR",
      ).length;
      survivor.send({
        type: "GATHER_START",
        nodeId: nodes[0].id,
        requestId: randomUUID(),
        expectedRevision: 1,
      });
      await until(
        () =>
          survivor.messages.filter((m) => m.type === "ERROR").length >
          errorsBefore,
      );
      expect(
        survivor.messages.findLast((m) => m.type === "ERROR"),
      ).toMatchObject({ message: "Exploração ativa necessária." });
      expect(
        await db().rpgResourceClaim.count({ where: { userId: users[0] } }),
      ).toBe(1);
    }, 180000);
  },
);
