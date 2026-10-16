import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { WebSocket } from "ws";
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { db } from "../src/server/db";
import { issueTicket } from "../src/server/tickets";
import {
  serverMessage,
  type ServerMessage,
} from "../src/game/network/protocol";
import { WORLD_PROTOCOL } from "../src/game/core/rpg/world/types";
import type { WorldSnapshot, WorldOperation } from "../src/game/network/world";
import { craftingResultSchema } from "../src/game/core/rpg/crafting/types";
import { WorldZone } from "../src/realtime/world/zone";
import { explorationPath } from "./helpers/exploration-navigation";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean | Promise<boolean>, ms = 20000) {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw Error("Forge realtime timeout");
    await pause(25);
  }
}
const users: string[] = [],
  sockets: WebSocket[] = [];
let child: ChildProcess | undefined;
async function boot() {
  child = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "src/realtime/server.ts"],
    {
      env: { ...process.env, REALTIME_PORT: "3012", REALTIME_DIAGNOSTICS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let ready = false,
    error = "";
  child.stdout?.on("data", (d) => {
    if (String(d).includes("LIMIAR realtime")) ready = true;
  });
  child.stderr?.on("data", (d) => (error += String(d)));
  await until(() => ready || child!.exitCode !== null);
  expect(ready, error).toBe(true);
}
async function stop(signal: NodeJS.Signals = "SIGTERM") {
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = once(child, "exit");
    child.kill(signal);
    await stopped;
  }
}
async function account(seedFixture = false) {
  const userId = "forge_ws_" + randomUUID();
  users.push(userId);
  await db().user.create({
    data: {
      id: userId,
      name: "Forja QA",
      email: userId + "@example.test",
      sessions: {
        create: {
          id: userId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      },
    },
  });
  const p = await peer(userId);
  if (seedFixture) {
    // Isolated economy/crash fixtures, never public grants or evidence of acquisition.
    await db().rpgMaterialBalance.createMany({
      data: ["weathered-ore", "ruins-fiber", "obelisk-dust"].map(
        (materialId) => ({ userId, materialId, amount: 100 }),
      ),
    });
    const row = await db().userProgress.findUniqueOrThrow({
      where: { userId },
    });
    await db().userProgress.update({
      where: { userId },
      data: { data: { ...(row.data as object), gold: 30 } },
    });
  }
  return p;
}
async function peer(id: string) {
  const ws = new WebSocket("ws://127.0.0.1:3012", {
    origin: "http://localhost:3000",
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  const peer = {
    id,
    ws,
    messages,
    sequence: 0,
    dropResult: "",
    dropped: false,
    send: (v: unknown) => ws.send(JSON.stringify(v)),
    snapshot: () =>
      messages.findLast(
        (m): m is WorldSnapshot => m.type === "WORLD_SNAPSHOT",
      )!,
  };
  ws.on("message", (raw) => {
    const m = serverMessage.parse(JSON.parse(raw.toString()));
    // Simulate a broken network after the server commits, without altering production code.
    if (m.type === "WORLD_RESULT" && m.requestId === peer.dropResult) {
      peer.dropped = true;
      ws.terminate();
      return;
    }
    messages.push(m);
  });
  await once(ws, "open");
  peer.send({ type: "HELLO", ticket: issueTicket(id, id) });
  await until(() => messages.some((m) => m.type === "ACCOUNT"));
  peer.send({ type: "WORLD_ENTER", protocol: WORLD_PROTOCOL });
  await until(() => messages.some((m) => m.type === "WORLD_SNAPSHOT"));
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN)
      peer.send({ type: "PING", at: Date.now() });
  }, 2000);
  ws.once("close", () => clearInterval(heartbeat));
  return peer;
}
type Peer = Awaited<ReturnType<typeof peer>>;
function own(p: Peer) {
  return p.snapshot().players.find((r) => r.id === p.snapshot().selfId)!;
}
async function walk(p: Peer, x: number, y: number) {
  const end = Date.now() + 25000;
  while (Math.hypot(own(p).x - x, own(p).y - y) > 12) {
    if (Date.now() > end) throw Error("Forge movement timeout");
    const dx = x - own(p).x,
      dy = y - own(p).y,
      d = Math.hypot(dx, dy);
    p.send({
      type: "WORLD_INPUT",
      epoch: p.snapshot().epoch,
      sequence: ++p.sequence,
      moveX: dx / d,
      moveY: dy / d,
    });
    await pause(40);
  }
  p.send({
    type: "WORLD_INPUT",
    epoch: p.snapshot().epoch,
    sequence: ++p.sequence,
    moveX: 0,
    moveY: 0,
  });
  await pause(200);
}
async function forge(p: Peer) {
  await walk(p, 600, 480);
  await walk(p, 280, 480);
}
function sendRpc(
  p: Peer,
  operation: WorldOperation,
  args: object,
  requestId = "requestId" in args ? String(args.requestId) : randomUUID(),
) {
  p.send({
    type: "WORLD_RPC",
    epoch: p.snapshot().epoch,
    operation,
    args,
    requestId,
  });
  return requestId;
}
async function rpc(p: Peer, operation: WorldOperation, args: object) {
  const from = p.messages.length,
    requestId = sendRpc(p, operation, args);
  await until(() =>
    p.messages
      .slice(from)
      .some((m) => m.type === "WORLD_RESULT" && m.requestId === requestId),
  );
  const result = p.messages
    .slice(from)
    .find(
      (m): m is Extract<ServerMessage, { type: "WORLD_RESULT" }> =>
        m.type === "WORLD_RESULT" && m.requestId === requestId,
    )!;
  if (
    result.ok &&
    result.data &&
    typeof result.data === "object" &&
    "revision" in result.data &&
    typeof result.data.revision === "number"
  ) {
    const revision = result.data.revision;
    await until(() => p.snapshot().self.revision >= revision);
  }
  return result;
}
function craft(p: Peer) {
  return {
    operation: "CRAFT_ITEM" as const,
    requestId: randomUUID(),
    expectedRevision: p.snapshot().self.revision,
    catalogVersion: 1,
    recipeId: "recipe:mantle-ash",
    recipeVersion: 1,
  };
}
describe.skipIf(process.env.RUN_REALTIME_TESTS !== "1")(
  "Forge authenticated world RPC",
  () => {
    beforeAll(() => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      vi.stubEnv("RPG_CRAFTING_ENABLED", "true");
    });
    afterAll(async () => {
      for (const s of sockets) s.close();
      await stop();
      await db().user.deleteMany({ where: { id: { in: users } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("gathers legitimate ingredients, crafts in place, replays once and blocks remote, stale and forged intents", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      vi.stubEnv("RPG_SHARED_WORLD_ENABLED", "true");
      vi.stubEnv("RPG_CRAFTING_ENABLED", "true");
      await boot();
      const p = await account();
      expect((await rpc(p, "CRAFT_ITEM", craft(p))).ok).toBe(false); // Spawn is far from forge.
      await walk(p, 380, 620);
      await walk(p, 380, 735);
      p.send({
        type: "WORLD_TRANSITION",
        epoch: p.snapshot().epoch,
        portalId: "refuge:exploration-portal",
        requestId: randomUUID(),
      });
      await until(() => p.snapshot().zoneId === "ruins-outskirts");
      const geometry = new WorldZone("ruins-outskirts", randomUUID()),
        obstacles = Array.from(
          { length: 9 },
          (_, i) =>
            geometry.world.createChunk((i % 3) - 1, Math.floor(i / 3) - 1)
              .structures,
        ).flat();
      const targets = [
        geometry.nodes.find((n) => n.definitionId === "weathered-vein")!,
        ...geometry.nodes
          .filter((n) => n.definitionId === "ruins-herb")
          .slice(0, 2),
      ];
      let claims = 0;
      for (const node of targets) {
        for (const point of explorationPath(own(p), node, obstacles, 35))
          await walk(p, point.x, point.y);
        const expectedClaims = ++claims;
        for (let attempt = 0; attempt < 4; attempt++) {
          p.send({
            type: "WORLD_GATHER",
            epoch: p.snapshot().epoch,
            nodeId: node.id,
            requestId: randomUUID(),
            expectedRevision: p.snapshot().self.revision,
          });
          const end = Date.now() + 6000;
          while (
            Date.now() < end &&
            (await db().rpgResourceClaim.count({ where: { userId: p.id } })) <
              expectedClaims
          )
            await pause(100);
          if (
            (await db().rpgResourceClaim.count({ where: { userId: p.id } })) ===
            expectedClaims
          )
            break;
        }
        expect(
          await db().rpgResourceClaim.count({ where: { userId: p.id } }),
        ).toBe(expectedClaims);
      }
      const remote = await rpc(p, "CRAFT_ITEM", craft(p));
      expect(remote.ok).toBe(false);
      expect(remote.message).toMatch(/Refúgio/);
      for (const point of explorationPath(
        own(p),
        { x: 0, y: 0 },
        obstacles,
        35,
      ))
        await walk(p, point.x, point.y);
      geometry.dispose();
      p.send({
        type: "WORLD_TRANSITION",
        epoch: p.snapshot().epoch,
        portalId: "world:ruins:refuge-return",
        requestId: randomUUID(),
      });
      await until(() => p.snapshot().zoneId === "obelisk-refuge");
      await forge(p);
      const epoch = p.snapshot().epoch;
      expect(
        (await rpc(p, "CRAFTING_CATALOG", { stationId: "refuge:forge" })).ok,
      ).toBe(true);
      const craftStarted = performance.now();
      const c = craft(p),
        committed = await rpc(p, "CRAFT_ITEM", c);
      const craftDurationMs = performance.now() - craftStarted;
      expect(committed.ok).toBe(true);
      const result = craftingResultSchema.parse(committed.data);
      expect(result.item?.itemId).toBe("mantle-ash");
      expect((await rpc(p, "CRAFT_ITEM", c)).data).toEqual(result);
      expect(
        await db().rpgCommerceRecord.count({
          where: { userId: p.id, operation: "CRAFT_ITEM" },
        }),
      ).toBe(1);
      expect(
        (
          await rpc(p, "CRAFT_ITEM", {
            ...c,
            recipeId: "recipe:blade-weathered",
          })
        ).ok,
      ).toBe(false);
      expect(
        (await rpc(p, "CRAFT_ITEM", { ...craft(p), seed: "client" })).ok,
      ).toBe(false);
      expect(p.snapshot().epoch).toBe(epoch);
      expect(
        (await rpc(p, "CRAFTING_HISTORY", { stationId: "refuge:forge" })).ok,
      ).toBe(true);
      await mkdir("docs/qa/crafting", { recursive: true });
      await writeFile("docs/qa/crafting/realtime-metrics.json", JSON.stringify({
        at: new Date().toISOString(), method: "Authenticated loopback WebSocket after real gathering, craft/replay and malformed/remote rejections; normal simulation with one player, no fixture resources in this scenario.",
        craftDurationMs, responseBytes: Buffer.byteLength(JSON.stringify(committed.data)),
        health: await fetch("http://127.0.0.1:3012/health").then((r) => r.json()),
      }, null, 2));
      await stop();
    }, 180000);
    it("keeps GOLD trade atomic and recovers interrupted or lost confirmations without duplicated items", async () => {
      await boot();
      let p = await account(true);
      await forge(p);
      const userId = p.id;
      const buy = {
        operation: "BUY_FROM_VENDOR",
        requestId: randomUUID(),
        expectedRevision: p.snapshot().self.revision,
        catalogVersion: 1,
        vendorId: "refuge:trader",
        stockItemId: "stock:blade",
      };
      expect((await rpc(p, "BUY_FROM_VENDOR", buy)).ok).toBe(false); // Physical merchant required.
      await walk(p, 600, 480);
      await walk(p, 900, 480);
      await walk(p, 900, 755);
      const bought = await rpc(p, "BUY_FROM_VENDOR", buy);
      expect(bought.ok).toBe(true);
      const item = craftingResultSchema.parse(bought.data).item!;
      const sold = await rpc(p, "SELL_TO_VENDOR", {
        operation: "SELL_TO_VENDOR",
        requestId: randomUUID(),
        expectedRevision: p.snapshot().self.revision,
        catalogVersion: 1,
        vendorId: "refuge:trader",
        instanceId: item.id,
      });
      expect(sold.ok).toBe(true);
      expect(await db().currencyTransaction.count({ where: { userId } })).toBe(
        2,
      );
      await walk(p, 900, 480);
      await forge(p);
      const pending = craft(p),
        before = await db().rpgMaterialBalance.findMany({
          where: { userId },
          orderBy: { materialId: "asc" },
        });
      await db().$executeRawUnsafe(
        "CREATE FUNCTION limiar.phase7_slow() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(6); RETURN NEW; END $$",
      );
      await db().$executeRawUnsafe(
        'CREATE TRIGGER phase7_slow BEFORE INSERT ON limiar."RpgCommerceRecord" FOR EACH ROW EXECUTE FUNCTION limiar.phase7_slow()',
      );
      try {
        sendRpc(p, "CRAFT_ITEM", pending);
        await until(
          async () =>
            (
              await db().$queryRaw<
                { count: bigint }[]
              >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'`
            )[0].count > 0n,
        );
        await stop("SIGKILL");
        await until(
          async () =>
            (
              await db().$queryRaw<
                { count: bigint }[]
              >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'`
            )[0].count === 0n,
          15000,
        );
      } finally {
        await db().$executeRawUnsafe(
          'DROP TRIGGER phase7_slow ON limiar."RpgCommerceRecord"',
        );
        await db().$executeRawUnsafe("DROP FUNCTION limiar.phase7_slow()");
      }
      expect(
        await db().rpgMutationReceipt.count({
          where: { userId, requestId: pending.requestId },
        }),
      ).toBe(0);
      expect(
        await db().rpgMaterialBalance.findMany({
          where: { userId },
          orderBy: { materialId: "asc" },
        }),
      ).toEqual(before);
      await boot();
      p = await peer(userId);
      await forge(p);
      expect((await rpc(p, "CRAFT_ITEM", pending)).ok).toBe(true);
      const lost = craft(p);
      p.dropResult = lost.requestId;
      sendRpc(p, "CRAFT_ITEM", lost);
      await until(() => p.dropped);
      const receipt = await db().rpgMutationReceipt.findUniqueOrThrow({
        where: { userId_requestId: { userId, requestId: lost.requestId } },
      });
      await stop("SIGKILL");
      await boot();
      p = await peer(userId);
      await forge(p);
      const recovered = await rpc(p, "CRAFT_ITEM", lost);
      expect(recovered.ok).toBe(true);
      expect(recovered.data).toEqual(receipt.result);
      expect(
        await db().rpgItemInstance.count({
          where: { userId, itemId: "mantle-ash" },
        }),
      ).toBe(2);
      expect(
        await db().rpgCommerceRecord.count({
          where: { userId, operation: "CRAFT_ITEM" },
        }),
      ).toBe(2);
      await stop();
    }, 180000);
  },
);
