import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db } from "../../src/server/db";
import { freshSave } from "../../src/game/core/save";
import { json } from "../../src/server/progress";
import {
  initialRpgAttributes,
  rollEquipmentAffixes,
  equipmentDefinition,
} from "../../src/game/core/rpg";

test("RPG equipment comparison, atomic replacement, stale tab feedback, persistence, transfer and mobile layout", async ({
  browser,
}) => {
  test.skip(process.env.RPG_ENABLED !== "true", "Requires RPG_ENABLED=true");
  const context = await browser.newContext();
  const username = "eq_" + randomUUID().slice(0, 8);
  let id: string | undefined;
  try {
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/register?callbackUrl=%2Frpg%2Finventory");
    await page.getByLabel("Nome de usuário").fill(username);
    await page.getByLabel("E-mail").fill(username + "@example.test");
    await page
      .getByLabel("Senha", { exact: true })
      .fill("Equipment-Browser-2026");
    await page.getByLabel("Confirmar senha").fill("Equipment-Browser-2026");
    await page
      .getByRole("button", { name: "CRIAR CONTA", exact: true })
      .click();
    await expect(page).toHaveURL(/\/rpg\/inventory$/);
    await expect(
      page.getByText("Nenhum item RPG.", { exact: true }),
    ).toBeVisible();
    id = (await db().user.findUniqueOrThrow({ where: { username } })).id;
    await db().userProgress.update({
      where: { userId: id },
      data: { data: json({ ...freshSave(), unlocked: ["nara", "ivo"] }) },
    });
    await db().rpgCharacter.update({
      where: { userId_characterId: { userId: id, characterId: "nara" } },
      data: initialRpgAttributes(5),
    });
    const blade = await db().rpgItemInstance.create({
      data: { userId: id, itemId: "blade-weathered", rarity: "COMMON" },
    });
    await db().rpgItemInstance.createMany({
      data: [
        {
          userId: id,
          itemId: "blade-echo",
          rarity: "RARE",
          rollSeed: "browser-roll",
          affixes: json(
            rollEquipmentAffixes(
              equipmentDefinition("blade-echo"),
              "RARE",
              1,
              "browser-roll",
            ),
          ),
        },
        { userId: id, itemId: "mantle-ash", rarity: "COMMON" },
        { userId: id, itemId: "charm-obelisk", rarity: "RARE" },
        { userId: id, itemId: "mantle-still", rarity: "COMMON" },
      ],
    });
    await page.reload();
    const before = await db().userProgress.findUniqueOrThrow({
      where: { userId: id },
    });
    const tab = await context.newPage();
    await tab.goto("/rpg/inventory");
    const inventory = page.getByRole("region", {
      name: "Inventário de equipamentos",
    });
    const details = page.getByRole("region", {
      name: "Detalhes do equipamento",
    });
    await inventory.getByRole("button", { name: /Lâmina Gasta/ }).click();
    await expect(details.getByRole("table")).toContainText("1.04");
    await details.getByRole("button", { name: "Equipar", exact: true }).click();
    const slots = page.getByRole("region", { name: "Equipamentos por slot" });
    await expect(slots.getByLabel("Arma RPG", { exact: true })).toContainText(
      "Lâmina Gasta",
    );
    await expect(
      slots
        .getByLabel("Arma RPG", { exact: true })
        .getByRole("button", { name: "Desequipar", exact: true }),
    ).toBeVisible();
    await tab
      .getByRole("region", { name: "Inventário de equipamentos" })
      .getByRole("button", { name: /Manto de Cinzas/ })
      .click();
    const stale = tab.getByRole("form", { name: "Equipar", exact: true });
    const request = await stale.locator('[name="requestId"]').inputValue();
    await stale.getByRole("button", { name: "Equipar", exact: true }).click();
    await expect(stale.getByRole("alert")).toContainText("outra aba");
    await expect(stale.locator('[name="requestId"]')).toHaveValue(request);
    await stale.getByRole("button", { name: "Atualizar perfil" }).click();
    await expect(tab.getByRole("main").getByRole("alert")).not.toBeVisible();
    // Replacing a slot uses an expected instance and atomic server mutation.
    await inventory.getByRole("button", { name: /Lâmina do Eco/ }).click();
    await expect(details).toContainText("Affixes");
    await expect(details).not.toContainText("Sem affixes.");
    await details
      .getByRole("button", { name: "Trocar equipamento", exact: true })
      .click();
    await expect(slots.getByLabel("Arma RPG", { exact: true })).toContainText(
      "Lâmina do Eco",
    );
    for (const name of ["Manto de Cinzas", "Talismã do Obelisco"]) {
      await inventory.getByRole("button", { name: new RegExp(name) }).click();
      await details
        .getByRole("button", { name: "Equipar", exact: true })
        .click();
      await expect(slots).toContainText(name);
    }
    await inventory.getByRole("button", { name: /Manto da Quietude/ }).click();
    await expect(details).toContainText("incompatível com este personagem");
    await expect(
      details.getByRole("button", { name: "Trocar equipamento", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      slots.getByRole("button", { name: "Desequipar", exact: true }),
    ).toHaveCount(3);
    await slots
      .getByLabel("Arma RPG", { exact: true })
      .getByRole("button", { name: "Desequipar", exact: true })
      .click();
    await expect(slots.getByLabel("Arma RPG", { exact: true })).toContainText(
      "Slot vazio",
    );
    await inventory.getByRole("button", { name: /Lâmina Gasta/ }).click();
    await details.getByRole("button", { name: "Equipar", exact: true }).click();
    await expect(slots.getByLabel("Arma RPG", { exact: true })).toContainText(
      "Lâmina Gasta",
    );
    await page.getByLabel("Gerenciar equipamentos de").selectOption("ivo");
    await inventory.getByRole("button", { name: /Lâmina Gasta/ }).click();
    await expect(details).toContainText("transfere a instância");
    await details.getByRole("button", { name: "Equipar", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await db().rpgItemInstance.findUniqueOrThrow({
              where: { id: blade.id },
              include: { equippedCharacter: true },
            })
          ).equippedCharacter?.characterId,
      )
      .toBe("ivo");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Gerenciar equipamentos de").selectOption("ivo");
    await expect(slots).toContainText("Lâmina Gasta");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/rpg-equipment-mobile.png",
      fullPage: true,
    });
    await page.goto("/rpg/character");
    await expect(page.getByRole("table").first()).toContainText(
      "Com equipamentos",
    );
    expect(
      await db().userProgress.findUnique({ where: { userId: id } }),
    ).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (id) await db().user.delete({ where: { id } });
    await db().$disconnect();
  }
});
