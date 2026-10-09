import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/server/db";
import * as teams from "../src/server/teams";
import { issueTicket } from "../src/server/tickets";
import { rpgProfileData } from "../src/server/rpg/profile";
import { mutateRpgEquipment } from "../src/server/rpg/mutations";
import { serverMessage, type Snapshot } from "../src/game/network/protocol";
import {
  initialRpgAttributes,
  allocateAttributePoints,
} from "../src/game/core/rpg";

const ids: string[] = [],
  sockets: WebSocket[] = [];
let child: ChildProcess | undefined, teamId: string | undefined;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  const deadline = Date.now() + 20000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("WebSocket condition timed out");
    await wait(20);
  }
}
async function connect(id: string) {
  const socket = new WebSocket("ws://127.0.0.1:3003", {
    origin: "http://localhost:3000",
  });
  sockets.push(socket);
  const peer: { socket: WebSocket; snapshot?: Snapshot; errors: string[] } = {
    socket,
    errors: [],
  };
  socket.on("message", (raw) => {
    const value = serverMessage.parse(JSON.parse(raw.toString()));
    if (value.type === "SNAPSHOT") peer.snapshot = value;
    if (value.type === "ERROR") peer.errors.push(value.message);
  });
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "HELLO", ticket: issueTicket(id, id) }));
  await until(() => !!peer.snapshot);
  return peer;
}
describe.skipIf(process.env.RUN_REALTIME_TESTS !== "1")(
  "RPG builds through real authenticated WebSockets",
  () => {
    afterAll(async () => {
      for (const socket of sockets) socket.close();
      if (child && child.exitCode === null) {
        const stopped = once(child, "exit");
        if (child.connected) child.disconnect();
        child.kill("SIGTERM");
        const timeout = setTimeout(() => child?.kill("SIGKILL"), 5000);
        await stopped;
        clearTimeout(timeout);
      }
      if (teamId) {
        await db().gameSession.deleteMany({ where: { teamId } });
        await db().team.delete({ where: { id: teamId } });
      }
      await db().user.deleteMany({ where: { id: { in: ids } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });
    it("keeps individual authoritative stats and frozen builds across hub changes and reconnect without leaking inventory", async () => {
      vi.stubEnv("RPG_ENABLED", "true");
      child = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "tests/helpers/rpg-realtime-server.ts",
        ],
        {
          env: {
            ...process.env,
            NODE_ENV: "test",
            RPG_ENABLED: "true",
            RPG_DEVELOPMENT_HARNESS: "1",
            REALTIME_PORT: "3003",
            REALTIME_ORIGIN: "http://localhost:3000",
          },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        },
      );
      let ready = false;
      child.stdout?.on("data", (data) => {
        if (String(data).includes("LIMIAR realtime")) ready = true;
      });
      await until(() => ready);
      for (let i = 0; i < 2; i++) {
        const id = "rpgnet_" + randomUUID().slice(0, 8);
        ids.push(id);
        await db().user.create({
          data: { id, name: id, username: id, email: id + "@example.test" },
        });
        await db().session.create({
          data: {
            id,
            token: randomUUID(),
            userId: id,
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        await rpgProfileData(id);
      }
      await db().rpgCharacter.update({
        where: { userId_characterId: { userId: ids[0], characterId: "nara" } },
        data: allocateAttributePoints(initialRpgAttributes(2), "power", 5),
      });
      const item = await db().rpgItemInstance.create({
        data: { userId: ids[0], itemId: "blade-weathered", rarity: "COMMON" },
      });
      await mutateRpgEquipment(ids[0], {
        requestId: randomUUID(),
        expectedRevision: 1,
        characterId: "nara",
        instanceId: item.id,
        slot: "WEAPON",
        operation: "EQUIP_ITEM",
      });
      const team = await teams.createTeam(ids[0]);
      teamId = team.id;
      await teams.joinTeam(ids[1], team.code);
      await teams.updateTeam(ids[0], { ready: true });
      await teams.updateTeam(ids[1], { ready: true });
      const session = await teams.startTeam(ids[0]);
      const message = once(child, "message");
      child.send?.({ sessionId: session.id });
      expect((await message)[0]).toEqual({ ready: session.id });
      const a = await connect(ids[0]),
        b = await connect(ids[1]);
      expect(a.snapshot!.own.stats.damage).toBe(1.05);
      expect(b.snapshot!.own.stats.damage).toBe(1);
      expect(a.snapshot!.seed).toBe(b.snapshot!.seed);
      expect(JSON.stringify(b.snapshot)).not.toContain(item.id);
      expect(JSON.stringify(a.snapshot)).not.toMatch(
        /affixes|rollSeed|contentVersion|profileRevision/,
      );
      a.socket.send(
        JSON.stringify({
          type: "INPUT",
          sequence: 1,
          moveX: 1,
          moveY: 0,
          interact: false,
          modifiers: [{ stat: "damage", value: 1000 }],
        }),
      );
      await until(() => a.errors.length > 0);
      expect(a.snapshot!.own.stats.damage).toBe(1.05);
      await mutateRpgEquipment(ids[0], {
        requestId: randomUUID(),
        expectedRevision: 2,
        characterId: "nara",
        instanceId: item.id,
        slot: "WEAPON",
        operation: "UNEQUIP_ITEM",
      });
      const closed = once(a.socket, "close");
      a.socket.close();
      await closed;
      const reconnected = await connect(ids[0]);
      expect(reconnected.snapshot!.own.stats.damage).toBe(1.05);
      expect(reconnected.snapshot!.full).toBe(true);
      expect(
        await db().currencyTransaction.count({
          where: { userId: { in: ids } },
        }),
      ).toBe(0);
    }, 60000);
  },
);
