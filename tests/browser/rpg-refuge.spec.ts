import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { db } from "../../src/server/db";
import { freshSave } from "../../src/game/core/save";
import { json } from "../../src/server/progress";
const enabled =
  process.env.RPG_ENABLED === "true" &&
  process.env.RPG_REFUGE_ENABLED === "true";
test("Refuge rollout and safe login callbacks", async ({ page, request }) => {
  for (const path of ["/rpg/refuge", "/rpg/storage"]) {
    if (!enabled) expect((await request.get(path)).status()).toBe(404);
    else {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp("/login\\?callbackUrl=" + encodeURIComponent(path)),
      );
    }
  }
});
test("real refuge scene, NPC services, storage, mobile and repeated cleanup", async ({
  browser,
}) => {
  test.skip(!enabled, "Requires RPG_ENABLED=true and RPG_REFUGE_ENABLED=true");
  const context = await browser.newContext(),
    page = await context.newPage(),
    username = "ref_" + randomUUID().slice(0, 8);
  let userId: string | undefined;
  const cdp = await context.newCDPSession(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/register?callbackUrl=%2Frpg");
    await page.getByLabel("Nome de usuário").fill(username);
    await page.getByLabel("E-mail").fill(username + "@example.test");
    await page.getByLabel("Senha", { exact: true }).fill("Refuge-Browser-2026");
    await page.getByLabel("Confirmar senha").fill("Refuge-Browser-2026");
    await page
      .getByRole("button", { name: "CRIAR CONTA", exact: true })
      .click();
    await expect(page).toHaveURL(/\/rpg$/);
    userId = (await db().user.findUniqueOrThrow({ where: { username } })).id;
    await db().userProgress.update({
      where: { userId },
      data: { data: json({ ...freshSave(), unlocked: ["nara", "ivo"] }) },
    });
    const item = await db().rpgItemInstance.create({
      data: { userId, itemId: "blade-weathered", rarity: "COMMON" },
    });
    const progress = await db().userProgress.findUnique({ where: { userId } });
    const enterStart = performance.now();
    await page
      .getByRole("link", { name: "Entrar no Refúgio", exact: true })
      .click();
    const scene = page.locator("canvas"),
      services = page.getByRole("navigation", {
        name: "Serviços acessíveis do Refúgio",
      }),
      dialog = page.getByRole("dialog");
    await expect(scene).toHaveAttribute("data-sprite", "canonical");
    await expect(scene).toHaveAttribute("data-character", "nara");
    const routeEntryMs = performance.now() - enterStart;
    await expect(
      page.getByRole("img", { name: "Nara, personagem ativo" }),
    ).toBeVisible();
    await scene.focus();
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(800);
    await page.keyboard.up("KeyW");
    await expect(scene).not.toHaveAttribute("data-y", "620.0");
    await expect(scene).toHaveAttribute("data-target", "");
    await page.keyboard.press("KeyE");
    await expect(dialog).not.toBeVisible();
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(780);
    await page.keyboard.up("KeyS");
    await expect(scene).toHaveAttribute("data-target", "refuge:guardian");
    const interactionStart = performance.now();
    await page.keyboard.press("KeyE");
    await expect(dialog).toHaveAccessibleName("Guardião do Refúgio");
    const interactionMs = performance.now() - interactionStart;
    await page.keyboard.press("KeyE");
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Continuar conversa" }).click();
    await dialog
      .getByRole("button", { name: "Personagem", exact: true })
      .click();
    const ivo = dialog
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Ivo", exact: true }) });
    await ivo.getByRole("button", { name: "Selecionar", exact: true }).click();
    await expect(
      ivo.getByRole("button", { name: "Ativo", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(scene).toBeFocused();
    await expect(scene).toHaveAttribute("data-character", "ivo");
    await services
      .getByRole("button", { name: "Arsenal", exact: true })
      .click();
    await dialog
      .getByRole("region", { name: "Inventário de equipamentos" })
      .getByRole("button", { name: /Lâmina Gasta/ })
      .click();
    await dialog.getByRole("button", { name: "Equipar", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Desequipar", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Desequipar", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Desequipar", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await services
      .getByRole("button", { name: "Depósito", exact: true })
      .click();
    await dialog
      .getByRole("region", { name: "Itens carregados" })
      .getByRole("button", { name: "Guardar", exact: true })
      .click();
    await expect(
      dialog.getByRole("region", { name: "Itens guardados" }),
    ).toContainText("Lâmina Gasta");
    expect(
      (await db().rpgItemInstance.findUniqueOrThrow({ where: { id: item.id } }))
        .location,
    ).toBe("STASH");
    await page.reload();
    await expect(scene).toHaveAttribute("data-character", "ivo");
    await services
      .getByRole("button", { name: "Depósito", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Retirar", exact: true }).click();
    await expect(
      dialog.getByRole("region", { name: "Itens carregados" }),
    ).toContainText("Lâmina Gasta");
    expect(await db().rpgItemInstance.count({ where: { userId } })).toBe(1);
    await page.keyboard.press("Escape");
    await mkdir("artifacts/refuge", { recursive: true });
    await page.locator("h1").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "artifacts/refuge/desktop.png",
      fullPage: true,
    });
    const metrics = await scene.evaluate((el) => ({
      ...(el as HTMLCanvasElement).dataset,
    }));
    await services
      .getByRole("button", { name: "Expedições", exact: true })
      .click();
    if (process.env.RPG_EXPEDITIONS_ENABLED === "true") {
      await dialog
        .getByRole("link", { name: "Preparar expedição RPG" })
        .click();
      await page
        .getByRole("link", { name: "Entrar no lobby", exact: true })
        .click();
      await expect(page).toHaveURL(/\/team$/);
      await page
        .getByRole("link", { name: "Voltar ao Refúgio", exact: true })
        .click();
    } else {
      await expect(dialog).toContainText("indisponíveis");
      await page.keyboard.press("Escape");
    }
    const navigation = [];
    for (let i = 0; i < 5; i++) {
      await expect(scene).toHaveAttribute("data-sprite", "canonical");
      const leaveStart = performance.now();
      await page
        .getByRole("navigation", { name: "Refúgio", exact: true })
        .getByRole("link", { name: "Depósito", exact: true })
        .click();
      await expect(page.locator("canvas")).toHaveCount(0);
      const leaveMs = performance.now() - leaveStart;
      const disposed = await page.evaluate(
        () =>
          (window as unknown as { __limiarRefuge: Record<string, number> })
            .__limiarRefuge,
      );
      expect(disposed).toMatchObject({
        instances: 0,
        loops: 0,
        listeners: 0,
        observers: 0,
      });
      await cdp.send("HeapProfiler.collectGarbage");
      const heap = await cdp.send("Runtime.getHeapUsage");
      const dom = await cdp.send("Memory.getDOMCounters");
      navigation.push({ ...disposed, heap, dom, leaveMs });
      await page
        .getByRole("link", { name: "Voltar ao Refúgio", exact: true })
        .click();
    }
    await expect(scene).toHaveAttribute("data-sprite", "canonical");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(scene).toBeVisible();
    const south = page.getByRole("button", { name: "Mover sul", exact: true });
    await south.scrollIntoViewIfNeeded();
    const box = await south.boundingBox();
    const beforeY = Number(await scene.getAttribute("data-y"));
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box!.x + 20, y: box!.y + 20 }],
    });
    await page.waitForTimeout(400);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => Number(await scene.getAttribute("data-y")))
      .toBeGreaterThan(beforeY + 20);
    await page.screenshot({
      path: "artifacts/refuge/mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await services
      .getByRole("button", { name: "Depósito", exact: true })
      .click();
    await page.route("**/rpg/refuge", (route) =>
      route.request().method() === "POST"
        ? route.abort("failed")
        : route.continue(),
    );
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Sem conexão");
    await page.unroute("**/rpg/refuge");
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      dialog.getByRole("region", { name: "Itens guardados" }),
    ).toContainText("Lâmina Gasta");
    await page.keyboard.press("Escape");
    await page.route("**/_next/static/media/**", (route) => route.abort());
    await page.reload();
    await expect(scene).toHaveAttribute("data-sprite", "fallback");
    await services
      .getByRole("button", { name: "Personagem", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Personagens", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: "artifacts/refuge/fallback.png",
      fullPage: true,
    });
    expect(await db().userProgress.findUnique({ where: { userId } })).toEqual(
      progress,
    );
    expect(
      await db().rpgExpeditionParticipant.count({ where: { userId } }),
    ).toBe(0);
    expect(errors).toEqual([]);
    await writeFile(
      "artifacts/refuge/browser-metrics.json",
      JSON.stringify(
        { metrics, navigation, routeEntryMs, interactionMs },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
    if (userId) await db().user.delete({ where: { id: userId } });
  }
});
