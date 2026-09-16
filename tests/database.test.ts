import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import * as teams from "../src/server/teams";
import * as social from "../src/server/social";
import { progress, importLocal, syncSolo } from "../src/server/progress";
import { freshSave } from "../src/game/core/save";
import { CoopSimulation } from "../src/game/core/coop";
import { settle } from "../src/realtime/settlement";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
const suffix = randomUUID().slice(0, 8),
  created: string[] = [],
  teamIds: string[] = [];
const endpoint = (path: string, body: object, cookie?: string) =>
  auth().handler(
    new Request("http://localhost:3000/api/auth/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
describe.skipIf(!enabled)(
  "Neon integration: auth, social, teams, results",
  () => {
    afterAll(async () => {
      await db().gameSession.deleteMany({ where: { teamId: { in: teamIds } } });
      await db().team.deleteMany({ where: { id: { in: teamIds } } });
      await db().user.deleteMany({ where: { id: { in: created } } });
      await db().$disconnect();
    });
    it("register/login/hash/wrong password/logout/expired session/uniqueness", async () => {
      const email = `qa_${suffix}@example.test`,
        username = `qa_${suffix}`,
        password = "Test-Only-Secure-Pass-2026";
      expect(
        (
          await endpoint("sign-up/email", {
            email: "missing_" + email,
            name: "MissingUsername",
            password,
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
      const signup = await endpoint("sign-up/email", {
        email,
        username,
        name: username,
        password,
      });
      expect(signup.status).toBe(200);
      const user = await db().user.findUniqueOrThrow({ where: { email } });
      created.push(user.id);
      expect(
        (await db().account.findFirstOrThrow({ where: { userId: user.id } }))
          .password,
      ).toMatch(/^\$argon2id\$/);
      const duplicate = await endpoint("sign-up/email", {
        email,
        username,
        name: username,
        password,
      });
      expect(duplicate.status).toBeGreaterThanOrEqual(400);
      const duplicateName = await endpoint("sign-up/email", {
        email: `other_${suffix}@example.test`,
        username,
        name: username,
        password,
      });
      expect(duplicateName.status).toBeGreaterThanOrEqual(400);
      expect(
        (
          await endpoint("sign-in/email", {
            email,
            password: "Wrong-Password-123",
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
      const login = await endpoint("sign-in/email", { email, password });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie") || "";
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      const tokenCookie = cookie.split(";")[0];
      const session = await auth().api.getSession({
        headers: new Headers({ cookie: tokenCookie }),
      });
      expect(session?.user.id).toBe(user.id);
      await db().session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(0) },
      });
      expect(
        await auth().api.getSession({
          headers: new Headers({ cookie: tokenCookie }),
        }),
      ).toBeNull();
      const again = await endpoint("sign-in/email", { email, password });
      const logout = await endpoint(
        "sign-out",
        {},
        (again.headers.get("set-cookie") || "").split(";")[0],
      );
      expect(logout.status).toBe(200);
      expect(
        await auth().api.getSession({ headers: new Headers() }),
      ).toBeNull();
    });
    it("friends accept/duplicate/remove/self, safe DM and pagination", async () => {
      const a = await fixture(10),
        b = await fixture(11);
      const request = await social.requestFriend(a, b);
      await social.requestFriend(a, b);
      expect(
        await db().friendship.count({ where: { fromId: a, toId: b } }),
      ).toBe(1);
      await expect(social.requestFriend(a, a)).rejects.toThrow();
      await expect(social.requestFriend(a, "nonexistent")).rejects.toThrow();
      await social.updateFriend(b, request.id, "accept");
      expect((await social.friends(a))[0].status).toBe("ACCEPTED");
      expect((await social.friends(b))[0].status).toBe("ACCEPTED");
      await expect(
        social.sendChat(a, { scope: "dm", target: b, text: "" }),
      ).rejects.toThrow();
      await expect(
        social.sendChat(a, { scope: "dm", target: b, text: "a".repeat(501) }),
      ).rejects.toThrow();
      const text = "<script>alert(1)</script>";
      const message = await social.sendChat(a, {
        scope: "dm",
        target: b,
        text,
      });
      expect(message.text).toBe(text);
      expect(await social.chatHistory(b, "dm", a)).toHaveLength(1);
      expect(await social.chatHistory(b, "dm", a, message.id)).toHaveLength(0);
      await db().chatMessage.createMany({
        data: Array.from({ length: 35 }, (_, i) => ({
          senderId: a,
          recipientId: b,
          text: "history " + i,
        })),
      });
      const page = await social.chatHistory(b, "dm", a);
      expect(page).toHaveLength(30);
      expect(
        await social.chatHistory(b, "dm", a, page.at(-1)!.id),
      ).toHaveLength(6);
      await expect(
        social.updateFriend(created[0], request.id, "remove"),
      ).rejects.toThrow();
      const burst = await Promise.allSettled(
        Array.from({ length: 25 }, (_, i) =>
          social.sendChat(a, { scope: "dm", target: b, text: "burst " + i }),
        ),
      );
      expect(
        burst.filter((r) => r.status === "rejected").length,
      ).toBeGreaterThan(0);
      expect(
        burst.filter((r) => r.status === "fulfilled").length,
      ).toBeLessThanOrEqual(20);
      await social.updateFriend(a, request.id, "remove");
      expect(await social.friends(b)).toHaveLength(0);
      await expect(
        social.sendChat(a, { scope: "dm", target: b, text: "denied" }),
      ).rejects.toThrow();
    });
    it("atomic fifth slot, leader transfer, readiness, no mid-run join and idempotent rewards", async () => {
      const ids = await Promise.all(
        Array.from({ length: 6 }, (_, i) => fixture(i)),
      );
      const team = await teams.createTeam(ids[0]);
      teamIds.push(team.id);
      for (let i = 1; i < 4; i++)
        await teams.joinTeam(ids[i], team.code.toLowerCase());
      const race = await Promise.allSettled([
        teams.joinTeam(ids[4], team.code),
        teams.joinTeam(ids[5], team.code),
      ]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await teams.currentTeam(ids[0]))!.members).toHaveLength(5);
      await teams.leaveTeam(ids[0]);
      const transfer = await teams.currentTeam(ids[1]);
      expect(transfer!.leaderId).toBe(ids[1]);
      await expect(teams.startTeam(ids[1])).rejects.toThrow();
      for (const m of transfer!.members)
        await teams.updateTeam(m.userId, { ready: true });
      const session = await teams.startTeam(ids[1]);
      expect(session.partySize).toBe(4);
      await expect(teams.joinTeam(ids[0], team.code)).rejects.toThrow();
      const players = await Promise.all(
        session.members.map(async (m) => {
          await progress(m.userId);
          return {
            id: m.userId,
            name: "QA",
            character: "nara",
            progress: freshSave(),
          };
        }),
      );
      const game = new CoopSimulation(players, "normal", "ruins", "DB-TEST");
      game.run.time = 1800;
      game.finish(true);
      expect(await settle(session.id, game)).toBe(true);
      const before = await progress(ids[1]);
      expect(await settle(session.id, game)).toBe(false);
      expect((await progress(ids[1])).data).toEqual(before.data);
    });
    it("preserves local archive without granting forged online gold", async () => {
      const id = await fixture(20);
      await importLocal(id, { ...freshSave(), gold: 99999999 });
      const p = await progress(id);
      expect((p.data as { gold: number }).gold).toBe(0);
      expect((p.localArchive as { gold: number }).gold).toBe(99999999);
      await expect(importLocal(id, freshSave())).rejects.toThrow();
      const synced = await syncSolo(id, {
        version: p.version,
        save: { ...freshSave(), gold: 50 },
      });
      expect(synced.version).toBe(p.version + 1);
      expect(((await progress(id)).data as { gold: number }).gold).toBe(0);
      await expect(
        syncSolo(id, { version: p.version, save: freshSave() }),
      ).rejects.toThrow();
    });
  },
);
async function fixture(n: number) {
  const id = `qa_${suffix}_${n}`;
  await db().user.create({
    data: { id, name: id, username: id, email: id + "@example.test" },
  });
  created.push(id);
  return id;
}
