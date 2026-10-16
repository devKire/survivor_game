import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../../src/server/db";
import { explorationResource } from "../../src/game/content/rpg/exploration-resources";
import {
  registerWorld,
  worldPosition,
  walkWorld,
  walkWorldField,
  worldGeometry,
} from "../helpers/world-browser";
const enabled =
  process.env.RPG_ENABLED === "true" &&
  process.env.RPG_SHARED_WORLD_ENABLED === "true" &&
  process.env.RPG_CRAFTING_ENABLED === "true";
test.use({ actionTimeout: 15000, navigationTimeout: 30000 });
test("real gathering to forge, rarity upgrade, equipment, barter, sale and persistent world", async ({
  browser,
}) => {
  test.skip(!enabled, "Requires shared world crafting rollout");
  test.setTimeout(480000);
  const context = await browser.newContext(),
    page = await context.newPage(),
    name = "forge_" + randomUUID().slice(0, 8),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let userId = "";
  const started = performance.now();
  try {
    await registerWorld(page, name);
    userId = (await db().user.findUniqueOrThrow({ where: { username: name } }))
      .id;
    const canvas = page.locator("#rpg-world-canvas"),
      shell = await canvas.getAttribute("data-shell-id"),
      dialog = page.getByRole("dialog");
    const originalVersion = (
      await db().userProgress.findUniqueOrThrow({ where: { userId } })
    ).version;
    expect(await db().teamMember.count({ where: { userId } })).toBe(0);
    // All inputs come from real gathering and field kills. No inventory/material/GOLD fixture is inserted.
    await walkWorld(page, 380, 620);
    await walkWorld(page, 380, 735);
    await page.keyboard.press("KeyE");
    await expect(canvas).toHaveAttribute("data-zone", "ruins-outskirts");
    const desired = [
      { materialId: "weathered-ore", amount: 12 },
      { materialId: "ruins-fiber", amount: 10 },
    ];
    let collected = 0;
    for (const target of desired) {
      const candidates = worldGeometry.nodes.filter(
        (n) =>
          n.kind === "RESOURCE" &&
          explorationResource(n.definitionId).materialId === target.materialId,
      );
      for (let count = 0; count < target.amount / 2; count++) {
        const own = await worldPosition(page);
        candidates.sort(
          (a, b) =>
            Math.hypot(a.x - own.x, a.y - own.y) -
            Math.hypot(b.x - own.x, b.y - own.y),
        );
        const node = candidates.shift()!;
        const expectedClaims = collected + 1;
        // Combat damage or an authoritative reward revision may cancel gathering.
        // Retry the real interaction with fresh state, never fabricate a claim.
        for (let attempt = 0; attempt < 4; attempt++) {
          await walkWorldField(page, node, 35);
          await page.keyboard.press("KeyE");
          const end = Date.now() + 6000;
          while (
            Date.now() < end &&
            (await db().rpgResourceClaim.count({ where: { userId } })) <
              expectedClaims
          )
            await page.waitForTimeout(250);
          if (
            (await db().rpgResourceClaim.count({ where: { userId } })) ===
            expectedClaims
          )
            break;
        }
        expect(await db().rpgResourceClaim.count({ where: { userId } })).toBe(
          expectedClaims,
        );
        collected = expectedClaims;
      }
    }
    await walkWorldField(page, { x: 260, y: 160 }, 15);
    await expect
      .poll(
        async () =>
          (
            await db().rpgMaterialBalance.findUnique({
              where: {
                userId_materialId: { userId, materialId: "obelisk-dust" },
              },
            })
          )?.amount ?? 0,
        { timeout: 90000 },
      )
      .toBeGreaterThanOrEqual(6);
    await walkWorldField(page, { x: 0, y: 0 }, 35);
    await page.keyboard.press("KeyE");
    await expect(canvas).toHaveAttribute("data-zone", "obelisk-refuge");
    await expect(canvas).toHaveAttribute("data-shell-id", shell!);
    const refugeEpoch = await canvas.getAttribute("data-epoch");
    await walkWorld(page, 600, 480);
    await walkWorld(page, 280, 480);
    await page.keyboard.press("KeyE");
    await expect(dialog).toHaveAccessibleName("Forja dos Ecos");
    const mantle = dialog.getByRole("article", {
      name: "Manto de Cinzas",
      exact: true,
    });
    await expect(
      mantle.getByRole("button", {
        name: "Fabricar Manto de Cinzas",
        exact: true,
      }),
    ).toBeEnabled();
    await mkdir("docs/qa/crafting", { recursive: true });
    await page.screenshot({ path: "docs/qa/crafting/forge-before.png" });
    await mantle
      .getByRole("button", { name: "Fabricar Manto de Cinzas", exact: true })
      .click();
    await dialog
      .getByRole("group", { name: "Confirmar operação" })
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Fabricação confirmada",
    );
    const craft = await db().rpgCommerceRecord.findFirstOrThrow({
        where: { userId, operation: "CRAFT_ITEM" },
      }),
      crafted = (craft.result as { item: { id: string } }).item.id;
    expect(
      (
        await db().rpgMaterialBalance.findUniqueOrThrow({
          where: { userId_materialId: { userId, materialId: "weathered-ore" } },
        })
      ).amount,
    ).toBe(10);
    expect(
      (
        await db().rpgMaterialBalance.findUniqueOrThrow({
          where: { userId_materialId: { userId, materialId: "ruins-fiber" } },
        })
      ).amount,
    ).toBe(6);
    await dialog
      .getByRole("button", { name: "Aprimorar", exact: true })
      .click();
    await dialog
      .getByRole("article", { name: new RegExp(crafted) })
      .getByRole("button", { name: "Aprimorar Manto de Cinzas", exact: true })
      .click();
    await expect(
      dialog.getByRole("group", { name: "Confirmar operação" }),
    ).toContainText("8");
    await dialog
      .getByRole("group", { name: "Confirmar operação" })
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Aprimoramento confirmado",
    );
    expect(
      (await db().rpgItemInstance.findUniqueOrThrow({ where: { id: crafted } }))
        .rarity,
    ).toBe("RARE");
    await page.screenshot({ path: "docs/qa/crafting/forge-upgraded.png" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Inventário", exact: true }).click();
    await dialog
      .getByRole("button", { name: /Manto de Cinzas/ })
      .first()
      .click();
    const healthComparison = dialog.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: "Vida máxima", exact: true }),
    });
    await expect(healthComparison.getByRole("cell")).toHaveCount(3);
    const healthValues = await healthComparison
      .getByRole("cell")
      .allTextContents();
    expect(Number(healthValues[1])).toBeGreaterThan(Number(healthValues[0]));
    await dialog.getByRole("button", { name: "Equipar", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await db().rpgItemInstance.findUniqueOrThrow({
              where: { id: crafted },
            })
          ).equippedCharacterId,
      )
      .toBeTruthy();
    await page.keyboard.press("Escape");
    expect(
      (await db().userProgress.findUniqueOrThrow({ where: { userId } }))
        .version,
    ).toBe(originalVersion);
    await walkWorld(page, 600, 480);
    await walkWorld(page, 900, 480);
    await walkWorld(page, 900, 755);
    await page.keyboard.press("KeyE");
    await expect(dialog).toHaveAccessibleName("Comerciante do Refúgio");
    await dialog
      .getByRole("button", {
        name: "Comprar Manto de Cinzas por escambo",
        exact: true,
      })
      .click();
    await dialog
      .getByRole("group", { name: "Confirmar operação" })
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("Compra confirmada");
    const buy = await db().rpgCommerceRecord.findFirstOrThrow({
        where: { userId, operation: "BUY_FROM_VENDOR" },
      }),
      bought = (buy.result as { item: { id: string } }).item.id;
    await dialog.getByRole("button", { name: "Vender", exact: true }).click();
    await dialog
      .getByRole("article", { name: new RegExp(bought) })
      .getByRole("button", { name: "Vender Manto de Cinzas", exact: true })
      .click();
    await dialog
      .getByRole("group", { name: "Confirmar operação" })
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("Venda confirmada");
    await expect(dialog.getByTestId("forge-wallet")).toContainText("GOLD 1");
    expect(await db().rpgItemInstance.count({ where: { id: bought } })).toBe(0);
    expect(
      await db().currencyTransaction.count({
        where: { userId, source: "rpg-vendor-v1" },
      }),
    ).toBe(1);
    expect(
      (await db().userProgress.findUniqueOrThrow({ where: { userId } }))
        .version,
    ).toBe(originalVersion + 1);
    await dialog
      .getByRole("button", { name: "Histórico", exact: true })
      .click();
    await expect(
      dialog.getByText("Venda · Confirmado", { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "docs/qa/crafting/trader-history.png" });
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-shell-id", shell!);
    await expect(canvas).toHaveAttribute("data-epoch", refugeEpoch!);
    await writeFile(
      "docs/qa/crafting/browser-metrics.json",
      JSON.stringify(
        {
          durationMs: performance.now() - started,
          claims: collected,
          shell: await canvas.evaluate((el) => ({
            ...(window as unknown as { __limiarWorld: object }).__limiarWorld,
            renderP95: (el as HTMLElement).dataset.renderP95,
            frameP95: (el as HTMLElement).dataset.frameP95,
          })),
        },
        null,
        2,
      ),
    );
    await page.reload();
    await expect(canvas).toHaveAttribute("data-zone", "obelisk-refuge");
    expect(
      (await db().rpgItemInstance.findUniqueOrThrow({ where: { id: crafted } }))
        .equippedCharacterId,
    ).toBeTruthy();
    expect(await db().rpgCommerceRecord.count({ where: { userId } })).toBe(4);
    await walkWorld(page, 600, 480);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (userId) await db().user.delete({ where: { id: userId } });
  }
});

test("mobile forge confirmation and continuous Canvas (isolated material fixture)", async ({
  browser,
}) => {
  test.skip(!enabled, "Requires crafting rollout");
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    page = await context.newPage(),
    name = "forge_touch_" + randomUUID().slice(0, 8);
  let userId = "";
  try {
    await registerWorld(page, name);
    userId = (await db().user.findUniqueOrThrow({ where: { username: name } }))
      .id;
    // Explicit UI integration fixture: not evidence of gameplay acquisition.
    await db().rpgMaterialBalance.createMany({
      data: [
        { userId, materialId: "weathered-ore", amount: 2 },
        { userId, materialId: "ruins-fiber", amount: 4 },
      ],
    });
    const canvas = page.locator("#rpg-world-canvas"),
      shell = await canvas.getAttribute("data-shell-id");
    await walkWorld(page, 600, 480);
    await walkWorld(page, 280, 480);
    await page.getByRole("button", { name: /Forja dos Ecos/ }).tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Forja dos Ecos");
    await dialog
      .getByRole("button", { name: "Fabricar Manto de Cinzas", exact: true })
      .tap();
    const confirm = dialog
      .getByRole("group", { name: "Confirmar operação" })
      .getByRole("button", { name: "Confirmar", exact: true });
    await expect(confirm).toBeInViewport();
    await confirm.tap();
    await expect(dialog.getByRole("status")).toContainText(
      "Fabricação confirmada",
    );
    await mkdir("docs/qa/crafting", { recursive: true });
    await page.screenshot({ path: "docs/qa/crafting/forge-mobile.png" });
    await dialog
      .getByRole("button", { name: "Fechar · Esc", exact: true })
      .tap();
    await expect(canvas).toHaveAttribute("data-shell-id", shell!);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/qa/crafting/forge-world.png" });
    await page.getByRole("button", { name: /Forja dos Ecos/ }).tap();
    await expect(dialog).toBeInViewport();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/qa/crafting/forge-tablet.png" });
    await dialog
      .getByRole("button", { name: "Fechar · Esc", exact: true })
      .tap();
    await expect(canvas).toHaveAttribute("data-shell-id", shell!);
    expect(
      await db().rpgItemInstance.count({
        where: { userId, itemId: "mantle-ash" },
      }),
    ).toBe(1);
  } finally {
    await context.close();
    if (userId) await db().user.delete({ where: { id: userId } });
  }
});
