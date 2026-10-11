import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db } from "../../src/server/db";
import { RPG_ITEMS } from "../../src/game/content/rpg";

test("public RPG expedition reaches confirmed rewards, persistent XP, usable inventory and private history", async ({
  browser,
}) => {
  test.skip(
    process.env.RPG_ENABLED !== "true" ||
      process.env.RPG_EXPEDITIONS_ENABLED !== "true" ||
      process.env.RPG_EXPEDITION_BROWSER_DRIVER !== "1",
    "Requires explicit engine driver and both rollout flags",
  );
  const context = await browser.newContext(),
    foreign = await browser.newContext();
  const users: string[] = [];
  let teamId: string | undefined;
  try {
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const username = "loot_" + randomUUID().slice(0, 8);
    await page.goto("/rpg/expeditions");
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await page.goto("/register?callbackUrl=%2Frpg%2Fexpeditions");
    await page.getByLabel("Nome de usuário").fill(username);
    await page.getByLabel("E-mail").fill(`${username}@example.test`);
    await page
      .getByLabel("Senha", { exact: true })
      .fill("Rpg-Loot-Browser-2026");
    await page.getByLabel("Confirmar senha").fill("Rpg-Loot-Browser-2026");
    await page
      .getByRole("button", { name: "CRIAR CONTA", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Expedição do Obelisco" }),
    ).toBeVisible();
    const user = await db().user.findUniqueOrThrow({ where: { username } });
    users.push(user.id);
    await page.goto("/");
    await page.getByRole("link", { name: /Jornada RPG/ }).click();
    await expect(
      page.getByRole("heading", { name: "Sua jornada RPG" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Iniciar uma expedição RPG" }).click();
    await page.getByRole("link", { name: "Entrar no lobby" }).click();
    await page
      .getByRole("button", { name: "CRIAR EQUIPE", exact: true })
      .click();
    await page.getByLabel("Tipo de expedição").selectOption("RPG_EXPEDITION");
    await expect(
      page.getByText("RPG · Ruínas · 10 minutos.", { exact: false }),
    ).toBeVisible();
    const team = await db().teamMember.findUniqueOrThrow({
      where: { userId: user.id },
    });
    teamId = team.teamId;
    const before = await db().userProgress.findUniqueOrThrow({
      where: { userId: user.id },
    });
    await page.getByRole("button", { name: "PRONTO", exact: true }).click();
    await page
      .getByRole("button", { name: "INICIAR EXPEDIÇÃO", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Ver recompensas RPG" }),
    ).toBeVisible({ timeout: 120000 });
    await expect(
      page.getByRole("status").filter({ hasText: "Resultado RPG confirmado" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ver recompensas RPG" }).click();
    await expect(
      page.getByText("Recompensa confirmada", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/pontos de atributo disponíveis/),
    ).toBeVisible();
    const receiptUrl = page.url();
    const receipt = await db().rpgRewardReceipt.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(receipt.xpGranted).toBeGreaterThanOrEqual(100);
    await page.reload();
    await expect(
      page.getByText("Recompensa confirmada", { exact: true }),
    ).toBeVisible();
    await page.goto("/rpg/inventory");
    expect(await page.content()).not.toMatch(/rewardSeed|rollSeed|loadoutHash/);
    const item = await db().rpgItemInstance.findFirstOrThrow({
      where: { userId: user.id },
    });
    const name = RPG_ITEMS[item.itemId as keyof typeof RPG_ITEMS].name;
    await page
      .getByRole("region", { name: "Inventário de equipamentos" })
      .getByRole("button", { name: new RegExp(name) })
      .first()
      .click();
    await page
      .getByRole("region", { name: "Detalhes do equipamento" })
      .getByRole("button", { name: "Equipar", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Equipamentos por slot" }),
    ).toContainText(name);
    await page.goto("/rpg/character");
    await expect(page.locator("article").first()).toContainText("Nível 2");
    await page.goto("/rpg/rewards");
    await expect(
      page.getByText("Recompensa confirmada", { exact: true }),
    ).toBeVisible();
    expect(
      await db().userProgress.findUniqueOrThrow({ where: { userId: user.id } }),
    ).toEqual(before);
    const stranger = await foreign.newPage(),
      otherName = "loot_" + randomUUID().slice(0, 8);
    await stranger.goto("/register?callbackUrl=%2Frpg%2Frewards");
    await stranger.getByLabel("Nome de usuário").fill(otherName);
    await stranger.getByLabel("E-mail").fill(`${otherName}@example.test`);
    await stranger
      .getByLabel("Senha", { exact: true })
      .fill("Rpg-Loot-Browser-2026");
    await stranger.getByLabel("Confirmar senha").fill("Rpg-Loot-Browser-2026");
    await stranger
      .getByRole("button", { name: "CRIAR CONTA", exact: true })
      .click();
    await expect(stranger).toHaveURL(/\/rpg\/rewards$/);
    users.push(
      (await db().user.findUniqueOrThrow({ where: { username: otherName } }))
        .id,
    );
    await stranger.goto(receiptUrl);
    await expect(
      stranger.getByText("Nenhuma expedição disponível nesta conta."),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await foreign.close();
    if (teamId) {
      await db().gameSession.deleteMany({ where: { teamId } });
      await db().team.delete({ where: { id: teamId } });
    }
    await db().user.deleteMany({ where: { id: { in: users } } });
  }
});
