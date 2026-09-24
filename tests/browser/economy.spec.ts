import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { db } from "../../src/server/db";
import { economyTransaction, lockProgress, grantCurrency, persistSave } from "../../src/server/economy";
import { freshSave, migrateSave } from "../../src/game/core/save";
import { META_DEFINITIONS } from "../../src/game/content/catalog";

test("V25 Chrome migrates offline gold, buys with gems and preserves it across reload", async ({ page }) => {
  await page.goto("/offline");
  await page.evaluate(save => localStorage.setItem("limiar.save.v1", JSON.stringify(save)),
    { ...freshSave(), economyVersion: 1, gold: 683, upgrades: { vitality: 2 } });
  await page.reload();
  await expect(page.locator("#screen")).toContainText("683 Gemas · ◈ 0 Ouro");
  await page.getByRole("button", { name: "Obelisco", exact: true }).click();
  await page.locator('button[data-action="buy"][data-id="might"]').click();
  await page.reload();
  await expect(page.locator("#screen")).toContainText(`${683 - META_DEFINITIONS.might.base} Gemas · ◈ 0 Ouro`);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem("limiar.save.v1")!));
  expect(save.upgrades).toMatchObject({ vitality: 2, might: 1 });
  expect(save.economyVersion).toBe(2);
});

test("V22/V23 two Chrome contexts purchasing the same rank debit once", async ({ browser }) => {
  const contexts = [await browser.newContext()];
  const username = "eco_" + randomUUID().slice(0, 8);
  let userId: string | undefined;
  try {
    const a = await contexts[0].newPage();
    await a.goto("/register");
    await a.getByLabel("Nome de usuário").fill(username);
    await a.getByLabel("E-mail").fill(username + "@example.test");
    await a.getByLabel("Senha", { exact: true }).fill("Browser-Economy-2026");
    await a.getByLabel("Confirmar senha").fill("Browser-Economy-2026");
    await a.getByRole("button", { name: "CRIAR CONTA", exact: true }).click();
    await expect(a).toHaveURL(/\/$/);
    await expect(a.getByRole("heading", { name: "Sua próxima travessia.", exact: true })).toBeVisible();
    userId = (await db().user.findUniqueOrThrow({ where: { username } })).id;
    const id = userId;
    await economyTransaction(async tx => {
      const { save } = await lockProgress(tx, id);
      await grantCurrency(tx, save, { userId: id, currency: "GEMS", amount: 100, source: "qa-browser", referenceId: "funding" });
      await persistSave(tx, id, save);
    });
    await a.reload();
    await expect(a.getByLabel("Saldo da conta")).toContainText("◆ 100 Gemas");
    contexts.push(await browser.newContext({ storageState: await contexts[0].storageState() }));
    const b = await contexts[1].newPage(); await b.goto("/account");
    await expect(b.getByLabel("Saldo da conta")).toContainText("◆ 100 Gemas");
    await Promise.all([a, b].map(p => p.goto("/obelisk")));
    await Promise.all([a, b].map(p => p.locator("article").filter({has:p.getByRole("heading",{name:META_DEFINITIONS.might.name,exact:true})}).getByRole("button").click()));
    await expect.poll(async () => db().currencyTransaction.count({ where: { userId: id, type: "SPEND" } })).toBe(1);
    await b.reload();
    await expect(b.getByLabel("Saldo da conta")).toContainText(`◆ ${100 - META_DEFINITIONS.might.base} Gemas`);
    expect(migrateSave((await db().userProgress.findUniqueOrThrow({ where: { userId: id } })).data).upgrades.might).toBe(1);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
    if (userId) await db().user.delete({ where: { id: userId } });
    await db().$disconnect();
  }
});
