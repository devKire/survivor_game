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
import { introduce, questIntent } from "./helpers/quest-intents";
import { rpgQuestJournal } from "../src/server/rpg/quests/journal";
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
  const ws = new WebSocket("ws://127.0.0.1:3006", {
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
  "quest reconciliation from real multiplayer exploration",
  () => {
    afterAll(async () => {
      for (const socket of sockets) socket.close();
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().gameSession.deleteMany({ where: { teamId: { in: teamIds } } });
      await db().team.deleteMany({ where: { id: { in: teamIds } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("keeps 1/2/5 participants isolated, discovers through INPUT, reconciles late and does not create absent quests", async () => {
      for (const flag of [
        "RPG_ENABLED",
        "RPG_QUESTS_ENABLED",
        "RPG_EXPLORATION_ENABLED",
      ])
        vi.stubEnv(flag, "true");
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
            REALTIME_PORT: "3006",
            REALTIME_ORIGIN: "http://localhost:3000",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let started = false,
        errors = "";
      child.stdout?.on("data", (d) => {
        if (String(d).includes("LIMIAR realtime")) started = true;
      });
      child.stderr?.on("data", (d) => (errors += String(d)));
      await until(() => started || child.exitCode !== null);
      expect(started, errors).toBe(true);
      for (const size of [1, 2, 5]) {
        const ids: string[] = [];
        for (let i = 0; i < size; i++) {
          const id = "quest_ws_" + randomUUID();
          ids.push(id);
          users.push(id);
          await db().user.create({
            data: {
              id,
              name: id,
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
          if (i !== 4) {
            await introduce(id);
            await questIntent(id, "ACCEPT", "main:ruins-remnants");
          }
        }
        const team = await teams.createTeam(ids[0]);
        teamIds.push(team.id);
        for (const id of ids.slice(1)) await teams.joinTeam(id, team.code);
        await teams.updateTeam(ids[0], { expeditionKind: "RPG_EXPLORATION" });
        for (const id of ids) await teams.updateTeam(id, { ready: true });
        const peers = await Promise.all(ids.map(connect));
        peers[0].send({ type: "START" });
        await until(() => peers.every((p) => p.snapshot() && p.state()));
        const target = nodes
          .filter((n) => n.kind === "POI")
          .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
        await walk(peers, target);
        await until(() =>
          peers.every((p) => p.state()?.discovered.includes(target.id)),
        );
        // No quest callback in the realtime write: recovery deliberately occurs later.
        for (const [i, id] of ids.entries()) {
          const before = await db().rpgQuestObjectiveProof.count({
            where: { userId: id, sourceKind: "DISCOVER_POI" },
          });
          expect(before).toBe(0);
          const journal = await rpgQuestJournal(id);
          const quest = journal.quests.find(
            (q) => q.id === "main:ruins-remnants",
          )!;
          expect(quest.objectives[0].current).toBe(i === 4 ? 0 : 1);
          const count = await db().rpgQuestObjectiveProof.count({
            where: { userId: id, sourceKind: "DISCOVER_POI" },
          });
          expect(count).toBe(i === 4 ? 0 : 1);
          await rpgQuestJournal(id);
          expect(
            await db().rpgQuestObjectiveProof.count({
              where: { userId: id, sourceKind: "DISCOVER_POI" },
            }),
          ).toBe(count);
          expect(
            (
              await db().userProgress.findUniqueOrThrow({
                where: { userId: id },
              })
            ).version,
          ).toBe(1);
        }
        peers[0].ws.close();
        await pause(100);
        peers[0] = await connect(ids[0]);
        await until(() => !!peers[0].state());
        expect(
          (await rpgQuestJournal(ids[0])).quests.find(
            (q) => q.id === "main:ruins-remnants",
          )!.objectives[0].current,
        ).toBe(1);
        for (const peer of peers) peer.send({ type: "EXPLORATION_LEAVE" });
        await until(() =>
          peers.every((p) => p.messages.some((m) => m.type === "RESULT")),
        );
        for (const peer of peers) peer.ws.close();
        await pause(100);
      }
    }, 180000);
  },
);
