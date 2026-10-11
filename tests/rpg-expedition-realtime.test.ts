import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import * as teams from "../src/server/teams";
import { issueTicket } from "../src/server/tickets";
import {
  serverMessage,
  type ServerMessage,
} from "../src/game/network/protocol";
import { settleRpgExpedition } from "../src/server/rpg/rewards";
import { rpgProfileData } from "../src/server/rpg/profile";
import { allocateRpgAttributes } from "../src/server/rpg/mutations";
import { initialRpgAttributes } from "../src/game/core/rpg";
import { CoopSimulation } from "../src/game/core/coop";
import { freshSave } from "../src/game/core/save";
import { settleAuthorizedRpgSimulation } from "../src/realtime/rpg-expeditions";

const users: string[] = [],
  teamIds: string[] = [],
  sockets: WebSocket[] = [];
let child: ChildProcess | undefined;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => boolean, timeout = 60000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("RPG realtime timeout");
    await delay(20);
  }
}
async function connect(id: string) {
  const ws = new WebSocket("ws://127.0.0.1:3004", {
    origin: "http://localhost:3000",
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [],
    raw: string[] = [];
  ws.on("message", (data) => {
    raw.push(data.toString());
    messages.push(serverMessage.parse(JSON.parse(data.toString())));
  });
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "HELLO", ticket: issueTicket(id, id) }));
  await until(() => messages.some((m) => m.type === "ACCOUNT"));
  return {
    ws,
    messages,
    raw,
    send: (value: unknown) => ws.send(JSON.stringify(value)),
  };
}

describe.skipIf(process.env.RUN_REALTIME_TESTS !== "1")(
  "public authoritative RPG expeditions",
  () => {
    afterAll(async () => {
      for (const socket of sockets) socket.close();
      if (child && child.exitCode === null) {
        const stopped = once(child, "exit");
        if (child.connected) child.disconnect();
        child.kill("SIGTERM");
        const timer = setTimeout(() => child?.kill("SIGKILL"), 5000);
        await stopped;
        clearTimeout(timer);
      }
      await db().gameSession.deleteMany({ where: { teamId: { in: teamIds } } });
      await db().team.deleteMany({ where: { id: { in: teamIds } } });
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("runs public CONFIG/READY/START for 1, 2 and 5 peers through real combat completion and persisted receipts", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_EXPEDITIONS_ENABLED", "true");
      child = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "tests/helpers/rpg-expedition-server.ts",
        ],
        {
          env: {
            ...process.env,
            NODE_ENV: "test",
            RPG_EXPEDITION_TEST_DRIVER: "1",
            REALTIME_PORT: "3004",
            REALTIME_ORIGIN: "http://localhost:3000",
          },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        },
      );
      let ready = false,
        stderr = "";
      child.stdout?.on("data", (data) => {
        if (String(data).includes("LIMIAR realtime")) ready = true;
      });
      child.stderr?.on("data", (data) => {
        stderr += String(data);
      });
      await until(() => ready || child?.exitCode !== null);
      expect(ready, stderr).toBe(true);
      for (const size of [1, 2, 5]) {
        const ids: string[] = [];
        for (let i = 0; i < size; i++) {
          const id = "exp_" + randomUUID().slice(0, 8);
          ids.push(id);
          users.push(id);
          await db().user.create({
            data: {
              id,
              name: id,
              username: id,
              email: `${id}@example.test`,
              sessions: {
                create: {
                  id,
                  token: randomUUID(),
                  expiresAt: new Date(Date.now() + 600000),
                },
              },
            },
          });
        }
        if (size === 2) {
          await rpgProfileData(ids[0]);
          await db().rpgCharacter.update({
            where: {
              userId_characterId: { userId: ids[0], characterId: "nara" },
            },
            data: { ...initialRpgAttributes(2), xp: 100 },
          });
          await allocateRpgAttributes(ids[0], {
            requestId: randomUUID(),
            expectedRevision: 1,
            characterId: "nara",
            attribute: "power",
            amount: 1,
          });
        }
        const team = await teams.createTeam(ids[0]);
        teamIds.push(team.id);
        for (const id of ids.slice(1)) await teams.joinTeam(id, team.code);
        const peers = await Promise.all(ids.map(connect));
        const heartbeat = setInterval(
          () => peers.forEach((p) => p.send({ type: "PING", at: Date.now() })),
          2000,
        );
        try {
          peers[0].send({ type: "CONFIG", expeditionKind: "RPG_EXPEDITION" });
          await until(() =>
            peers.every((p) =>
              p.messages.some(
                (m) =>
                  m.type === "ACCOUNT" &&
                  m.team?.expeditionKind === "RPG_EXPEDITION",
              ),
            ),
          );
          peers.forEach((p) => p.send({ type: "READY", ready: true }));
          await until(() =>
            peers[0].messages.some(
              (m) =>
                m.type === "ACCOUNT" &&
                m.team?.members.every((member) => member.ready),
            ),
          );
          peers[0].send({ type: "START" });
          await until(
            () =>
              peers.every((p) =>
                p.messages.some((m) => m.type === "STARTED"),
              ) ||
              peers.some((p) => p.messages.some((m) => m.type === "ERROR")),
          );
          expect(
            peers.flatMap((p) => p.messages.filter((m) => m.type === "ERROR")),
            `START size=${size}`,
          ).toEqual([]);
          const started = peers[0].messages.find((m) => m.type === "STARTED")!;
          if (started.type !== "STARTED") throw new Error("Missing start");
          const sessionId = started.room;
          expect(started.expeditionKind).toBe("RPG_EXPEDITION");
          if (size === 2) {
            await until(() =>
              peers.every((p) => p.messages.some((m) => m.type === "SNAPSHOT")),
            );
            const original = peers[0].messages.find(
              (m) => m.type === "SNAPSHOT",
            );
            if (original?.type !== "SNAPSHOT")
              throw new Error("snapshot missing");
            expect(original.own.stats.damage).toBe(1.002);
            await allocateRpgAttributes(ids[0], {
              requestId: randomUUID(),
              expectedRevision: 2,
              characterId: "nara",
              attribute: "power",
              amount: 4,
            });
            const closed = once(peers[0].ws, "close");
            peers[0].ws.close();
            await closed;
            peers[0] = await connect(ids[0]);
            await until(() =>
              peers[0].messages.some((m) => m.type === "SNAPSHOT"),
            );
            const restored = peers[0].messages.find(
              (m) => m.type === "SNAPSHOT",
            );
            if (restored?.type !== "SNAPSHOT")
              throw new Error("snapshot missing");
            expect(restored.own.stats.damage).toBe(original.own.stats.damage);
          }
          const before = await db().userProgress.findMany({
            where: { userId: { in: ids } },
            orderBy: { userId: "asc" },
          });
          peers[0].send({ type: "GRANT_RPG", xp: 999999, userId: ids[0] });
          await until(() => peers[0].messages.some((m) => m.type === "ERROR"));
          const driven = once(child, "message");
          child.send?.({
            sessionId,
            ...(size === 5 ? { inactiveUserId: ids[4] } : {}),
          });
          expect((await driven)[0]).toMatchObject({
            completed: sessionId,
            ended: true,
          });
          await until(() =>
            peers.every((p) =>
              p.messages.some(
                (m) => m.type === "RESULT" && m.sessionId === sessionId,
              ),
            ),
          );
          const receipts = await db().rpgRewardReceipt.findMany({
            where: { sessionId },
          });
          expect(receipts).toHaveLength(size);
          expect(
            receipts
              .filter((r) => size !== 5 || r.userId !== ids[4])
              .every((r) => r.xpGranted >= 100),
          ).toBe(true);
          if (size === 5)
            expect(receipts.find((r) => r.userId === ids[4])?.xpGranted).toBe(
              0,
            );
          const expedition = await db().rpgExpeditionSession.findUniqueOrThrow({
            where: { sessionId },
          });
          expect(expedition.status).toBe("SETTLED");
          expect(JSON.stringify(expedition.terminal)).toContain("BOSS_DEFEAT");
          expect(
            await db().userProgress.findMany({
              where: { userId: { in: ids } },
              orderBy: { userId: "asc" },
            }),
          ).toEqual(before);
          expect(await settleRpgExpedition(sessionId)).toHaveLength(size);
          for (const peer of peers) {
            expect(peer.raw.join("")).not.toMatch(
              /rewardSeed|rollSeed|loadoutHash/,
            );
            expect(
              peer.messages.find((m) => m.type === "RESULT"),
            ).toMatchObject({ rewardStatus: "CONFIRMED" });
          }
        } finally {
          clearInterval(heartbeat);
          peers.forEach((p) => p.ws.close());
        }
      }
      const forged = new CoopSimulation(
        [
          {
            id: "foreign",
            name: "foreign",
            character: "nara",
            progress: freshSave(),
          },
        ],
        "normal",
        "ruins",
        "fake",
        600,
      );
      forged.finish(true);
      await expect(
        settleAuthorizedRpgSimulation("fake", forged),
      ).rejects.toThrow("Unauthorized");
    }, 180000);
  },
);
