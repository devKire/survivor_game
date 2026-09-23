import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { db } from "../src/server/db";
import { freshSave, migrateSave } from "../src/game/core/save";
import { economyTransaction, lockProgress, grantCurrency, persistSave } from "../src/server/economy";
import { progress, buyMeta, json, importLocal, syncSolo } from "../src/server/progress";
import { CoopSimulation } from "../src/game/core/coop";
import { settle } from "../src/realtime/settlement";
import { META_DEFINITIONS } from "../src/game/content/catalog";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
const users: string[] = [], teamIds: string[] = [];
async function fixture() {
  const id = "economy_" + randomUUID();
  await db().user.create({ data: { id, name: "Economy QA", email: id + "@example.test" } });
  users.push(id); await progress(id); return id;
}
async function fund(id: string, amount: number, referenceId = "qa-funding") {
  return economyTransaction(async tx => {
    const { save } = await lockProgress(tx, id);
    const granted = await grantCurrency(tx, save, { userId: id, currency: "GEMS", amount, source: "qa", referenceId });
    await persistSave(tx, id, save); return granted;
  });
}
describe.skipIf(!enabled)("V22/V23 actual PostgreSQL economy", () => {
  afterAll(async () => {
    await db().gameSession.deleteMany({ where: { teamId: { in: teamIds } } });
    await db().team.deleteMany({ where: { id: { in: teamIds } } });
    await db().user.deleteMany({ where: { id: { in: users } } });
    await db().$disconnect();
  });
  it("rehearses the exact SQL migration on legacy rows with rollback", async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const schema = "economy_qa_" + randomUUID().replaceAll("-", "");
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`CREATE TABLE "${schema}"."User" (id TEXT PRIMARY KEY);
        CREATE TABLE "${schema}"."UserProgress" ("userId" TEXT PRIMARY KEY, data JSONB NOT NULL, version INT NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      for (const amount of [0, 42, 683, 1000000000]) {
        await client.query(`INSERT INTO "${schema}"."User" VALUES ($1)`, [String(amount)]);
        await client.query(`INSERT INTO "${schema}"."UserProgress" ("userId",data) VALUES ($1,$2::jsonb)`,
          [String(amount), JSON.stringify({ version: 3, gold: amount, upgrades: { might: 3 } })]);
      }
      const sql = readFileSync("prisma/migrations/20260923213000_economy_gems/migration.sql", "utf8")
        .replace(/^BEGIN;\n/, "").replace(/\nCOMMIT;\s*$/, "").replaceAll('"limiar"', `"${schema}"`);
      await client.query(sql);
      const migrated = await client.query(`SELECT * FROM "${schema}"."UserProgress" ORDER BY "userId"`);
      for (const row of migrated.rows) {
        expect(row.data.gems).toBe(Number(row.userId)); expect(row.data.gold).toBe(0);
        expect(row.data.upgrades).toEqual({ might: 3 }); expect(row.version).toBe(2);
      }
      const ledger = await client.query(`SELECT count(*)::int AS n FROM "${schema}"."CurrencyTransaction"`);
      expect(ledger.rows[0].n).toBe(8);
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
  it("retries a grant without duplicating its ledger or balance; rejects mismatched payload", async () => {
    const id = await fixture();
    const results = await Promise.all([fund(id, 100), fund(id, 100)]);
    expect(results.sort()).toEqual([false, true]);
    expect(migrateSave((await progress(id)).data).gems).toBe(100);
    expect(await db().currencyTransaction.count({ where: { userId: id } })).toBe(1);
    await expect(fund(id, 101)).rejects.toThrow(/Referência/);
  });
  it("same-rank double purchase charges once, distinct purchases cannot overdraw", async () => {
    const id = await fixture(), cost = META_DEFINITIONS.might.base;
    await fund(id, cost);
    await Promise.all([buyMeta(id, "might", 0), buyMeta(id, "might", 0)]);
    expect(migrateSave((await progress(id)).data)).toMatchObject({ gems: 0, upgrades: { might: 1 } });
    expect(await db().currencyTransaction.count({ where: { userId: id, type: "SPEND" } })).toBe(1);
    const other = await fixture(); await fund(other, 65);
    const race = await Promise.allSettled([buyMeta(other, "might", 0), buyMeta(other, "vitality", 0)]);
    expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(migrateSave((await progress(other)).data).gems).toBeGreaterThanOrEqual(0);
  });
  it("rolls back currency and ledger together on error", async () => {
    const id = await fixture();
    await expect(economyTransaction(async tx => {
      const { save } = await lockProgress(tx, id);
      await grantCurrency(tx, save, { userId: id, currency: "GOLD", amount: 50, source: "qa", referenceId: "rollback" });
      await persistSave(tx, id, save); throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(migrateSave((await progress(id)).data).gold).toBe(0);
    expect(await db().currencyTransaction.count({ where: { userId: id } })).toBe(0);
  });
  it("client archives cannot grant either currency", async () => {
    const id = await fixture(); await importLocal(id, { ...freshSave(), gems: 99999, gold: 88888 });
    const row = await progress(id);
    await syncSolo(id, { version: row.version, save: { ...freshSave(), gems: 1e9, gold: 1e9 } });
    expect(migrateSave((await progress(id)).data)).toMatchObject({ gems: 0, gold: 0 });
    expect(await db().currencyTransaction.count({ where: { userId: id } })).toBe(0);
  });
  it("simultaneous settlement and purchase retain both; repeated settlement pays once", async () => {
    const id = await fixture(); await fund(id, 100);
    const team = await db().team.create({ data: { code: randomUUID(), leaderId: id, expiresAt: new Date(), status: "RUNNING" } });
    teamIds.push(team.id);
    const session = await db().gameSession.create({ data: { teamId: team.id, seed: "ECONOMY-QA", mapId: "ruins", mode: "normal", partySize: 1,
      members: { create: { userId: id, character: "nara" } } } });
    const g = new CoopSimulation([{ id, name: "QA", character: "nara", progress: freshSave() }], "normal", "ruins", "ECONOMY-QA");
    g.members.get(id)!.gems = 50;
    const results = await Promise.all([settle(session.id, g), settle(session.id, g), buyMeta(id, "might", 0)]);
    expect(results.slice(0, 2).filter(Boolean)).toHaveLength(1);
    const save = migrateSave((await progress(id)).data);
    expect(save.gems).toBe(150 - META_DEFINITIONS.might.base); expect(save.upgrades.might).toBe(1);
    expect(save.runs).toBe(1);
    const ledger = await db().currencyTransaction.aggregate({ where: { userId: id, currency: "GEMS" }, _sum: { amount: true } });
    expect(ledger._sum.amount).toBe(save.gems);
  });
  it("database constraint rejects negative and fractional balances", async () => {
    const id = await fixture();
    for (const gems of [-1, 0.5, 1000000001])
      await expect(db().userProgress.update({ where: { userId: id }, data: { data: json({ ...freshSave(), gems }) } })).rejects.toThrow();
  });
});
