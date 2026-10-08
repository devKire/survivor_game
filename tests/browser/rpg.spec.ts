import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db } from "../../src/server/db";
import { json } from "../../src/server/progress";
import { freshSave } from "../../src/game/core/save";
import { initialRpgAttributes } from "../../src/game/core/rpg";

const enabled = process.env.RPG_ENABLED === "true";
test("RPG disabled routes return 404", async ({ request }) => {
  test.skip(enabled, "Run with RPG_ENABLED=false to verify disabled rollout");
  for (const path of ["/rpg/character", "/rpg/inventory"])
    expect((await request.get(path)).status()).toBe(404);
});

test("RPG enabled routes require login and preserve safe callbacks", async ({
  page,
}) => {
  test.skip(!enabled, "Requires RPG_ENABLED=true");
  for (const path of ["/rpg/character", "/rpg/inventory"]) {
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp("/login\\?callbackUrl=" + encodeURIComponent(path)),
    );
    await expect(
      page.getByRole("heading", { name: "Entrar", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.test");
  await expect(page.locator('input[name="callbackUrl"]')).toHaveValue("/");
});

test("RPG selection and attributes handle stale tabs inline and preserve Survivor state", async ({
  browser,
}) => {
  test.skip(!enabled, "Requires RPG_ENABLED=true");
  const context = await browser.newContext();
  const username = "rpg_" + randomUUID().slice(0, 8);
  let id: string | undefined;
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/register?callbackUrl=%2Frpg%2Fcharacter");
    await page.getByLabel("Nome de usuário").fill(username);
    await page.getByLabel("E-mail").fill(`${username}@example.test`);
    await page
      .getByLabel("Senha", { exact: true })
      .fill("Rpg-Browser-Only-2026");
    await page.getByLabel("Confirmar senha").fill("Rpg-Browser-Only-2026");
    await page
      .getByRole("button", { name: "CRIAR CONTA", exact: true })
      .click();
    await expect(page).toHaveURL(/\/rpg\/character$/);
    await expect(
      page.getByRole("heading", { name: "Personagens", exact: true }),
    ).toBeVisible();
    id = (await db().user.findUniqueOrThrow({ where: { username } })).id;
    await db().userProgress.update({
      where: { userId: id },
      data: { data: json({ ...freshSave(), unlocked: ["nara", "ivo"] }) },
    });
    // Server-side fixtures only: no public grant or XP action is introduced.
    await db().rpgCharacter.update({
      where: { userId_characterId: { userId: id, characterId: "nara" } },
      data: { ...initialRpgAttributes(3), xp: 400 },
    });
    await page.reload();
    const before = await db().userProgress.findUniqueOrThrow({
      where: { userId: id },
    });
    const tab = await context.newPage();
    await tab.goto("/rpg/character");
    const nara = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Nara", exact: true }),
    });
    const allocation = nara.getByRole("form", { name: "Distribuir atributos" });
    await allocation
      .getByLabel("Atributo", { exact: true })
      .selectOption("power");
    await allocation.getByLabel("Pontos", { exact: true }).fill("3");
    await allocation
      .getByRole("button", { name: "Distribuir", exact: true })
      .click();
    await expect(nara).toContainText("Pontos disponíveis: 7");
    const staleAllocation = tab
      .locator("article")
      .filter({
        has: tab.getByRole("heading", { name: "Nara", exact: true }),
      })
      .getByRole("form", { name: "Distribuir atributos" });
    await staleAllocation
      .getByLabel("Atributo", { exact: true })
      .selectOption("agility");
    await staleAllocation.getByLabel("Pontos", { exact: true }).fill("2");
    const pendingId = await staleAllocation
      .locator('[name="requestId"]')
      .inputValue();
    await staleAllocation
      .getByRole("button", { name: "Distribuir", exact: true })
      .click();
    await expect(staleAllocation.getByRole("alert")).toContainText("outra aba");
    await expect(
      staleAllocation.getByLabel("Atributo", { exact: true }),
    ).toHaveValue("agility");
    await expect(
      staleAllocation.getByLabel("Pontos", { exact: true }),
    ).toHaveValue("2");
    await expect(staleAllocation.locator('[name="requestId"]')).toHaveValue(
      pendingId,
    );
    const ivo = tab
      .locator("article")
      .filter({ has: tab.getByRole("heading", { name: "Ivo", exact: true }) });
    await ivo.getByRole("button", { name: "Selecionar", exact: true }).click();
    await expect(ivo.getByRole("alert")).toContainText("outra aba");
    await expect(
      tab.getByRole("heading", { name: "Personagens", exact: true }),
    ).toBeVisible();
    await ivo.getByRole("button", { name: "Atualizar perfil" }).click();
    await expect(ivo.getByRole("alert")).not.toBeVisible();
    await ivo.getByRole("button", { name: "Selecionar", exact: true }).click();
    await expect(
      ivo.getByRole("button", { name: "Ativo", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(nara).toContainText("Pontos disponíveis: 7");
    const character = await db().rpgCharacter.findUniqueOrThrow({
      where: { userId_characterId: { userId: id, characterId: "nara" } },
    });
    expect(character.attributes).toMatchObject({ power: 3 });
    expect(character.xp).toBe(400);
    expect(
      await db().userProgress.findUnique({ where: { userId: id } }),
    ).toEqual(before);
    expect(await db().rpgMutationReceipt.count({ where: { userId: id } })).toBe(
      2,
    );
    await page.goto("/rpg/inventory");
    await expect(
      page.getByText("Nenhum item RPG.", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (id) await db().user.delete({ where: { id } });
    await db().$disconnect();
  }
});
