import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/server/db";
import { WorldZone } from "../../src/realtime/world/zone";
import { explorationPath } from "../helpers/exploration-navigation";
test.use({ actionTimeout: 15000, navigationTimeout: 30000 });
const enabled =
  process.env.RPG_ENABLED === "true" &&
  process.env.RPG_SHARED_WORLD_ENABLED === "true";
const geometry = new WorldZone("ruins-outskirts", randomUUID()),
  obstacles = Array.from(
    { length: 9 },
    (_, i) =>
      geometry.world.createChunk((i % 3) - 1, Math.floor(i / 3) - 1).structures,
  ).flat();
async function register(page: Page, name: string) {
  await page.goto("/register?callbackUrl=%2Frpg");
  await page.getByLabel("Nome de usuário").fill(name);
  await page.getByLabel("E-mail").fill(name + "@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("World-Browser-2026");
  await page.getByLabel("Confirmar senha").fill("World-Browser-2026");
  await page.getByRole("button", { name: "CRIAR CONTA", exact: true }).click();
  await expect(page).toHaveURL(/\/rpg\/world$/);
  await expect(page.locator("#rpg-world-canvas")).toHaveAttribute(
    "data-zone",
    "obelisk-refuge",
  );
}
async function position(page: Page) {
  const c = page.locator("#rpg-world-canvas");
  return {
    x: Number(await c.getAttribute("data-authoritative-x")),
    y: Number(await c.getAttribute("data-authoritative-y")),
  };
}
async function walk(page: Page, x: number, y: number) {
  await page.locator("#rpg-world-canvas").focus();
  const end = Date.now() + 25000;
  while (true) {
    const own = await position(page),
      dx = x - own.x,
      dy = y - own.y;
    if (Math.hypot(dx, dy) < 14) break;
    if (Date.now() > end)
      throw Error("World movement timeout " + JSON.stringify(own));
    const key =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "KeyD"
          : "KeyA"
        : dy > 0
          ? "KeyS"
          : "KeyW";
    await page.keyboard.down(key);
    await page.waitForTimeout(65);
    await page.keyboard.up(key);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(300);
}
async function fieldWalk(
  page: Page,
  target: { x: number; y: number },
  radius = 45,
) {
  for (const p of explorationPath(
    await position(page),
    target,
    obstacles,
    radius,
  ))
    await walk(page, p.x, p.y);
}
test("shared-world flag and authentication callback", async ({
  page,
  request,
}) => {
  if (!enabled) expect((await request.get("/rpg/world")).status()).toBe(404);
  else {
    await page.goto("/rpg/world");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Frpg%2Fworld/);
  }
});
test("two independent accounts, persistent shell, real field rewards and refresh", async ({
  browser,
}) => {
  test.skip(!enabled, "Requires shared world rollout");
  test.setTimeout(240000);
  const a = await browser.newContext(),
    b = await browser.newContext(),
    page = await a.newPage(),
    other = await b.newPage(),
    names = [
      "world_" + randomUUID().slice(0, 8),
      "world_" + randomUUID().slice(0, 8),
    ],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  let userId = "";
  try {
    await register(page, names[0]);
    await register(other, names[1]);
    await page.bringToFront();
    userId = (
      await db().user.findUniqueOrThrow({ where: { username: names[0] } })
    ).id;
    const canvas = page.locator("#rpg-world-canvas"),
      dialog = page.getByRole("dialog");
    await expect(canvas).toHaveAttribute("data-players", "2");
    expect(await db().teamMember.count({ where: { userId } })).toBe(0);
    const shell = await canvas.getAttribute("data-shell-id"),
      epoch = await canvas.getAttribute("data-epoch");
    await page.keyboard.press("KeyE");
    await expect(dialog).toHaveAccessibleName("Conversa: Guardião do Refúgio");
    await page.keyboard.press("Escape");
    for (const action of [
      "Inventário",
      "Personagem",
      "Missões",
      "Mapa",
      "Grupo",
    ]) {
      await page
        .getByRole("navigation", { name: "Ações do mundo" })
        .getByRole("button", { name: action, exact: true })
        .click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(canvas).toBeFocused();
      await expect(canvas).toHaveAttribute("data-shell-id", shell!);
      await expect(canvas).toHaveAttribute("data-epoch", epoch!);
    }
    await walk(page, 380, 620);
    await walk(page, 380, 735);
    await page.keyboard.press("KeyE");
    await expect(canvas).toHaveAttribute("data-zone", "ruins-outskirts");
    await expect(canvas).toHaveAttribute("data-shell-id", shell!);
    await fieldWalk(page, { x: 260, y: 160 }, 15);
    await expect
      .poll(() => db().rpgWorldRewardReceipt.count({ where: { userId } }), {
        timeout: 30000,
      })
      .toBeGreaterThan(0);
    const reward = await db().rpgWorldRewardReceipt.findFirstOrThrow({
      where: { userId },
    });
    expect(reward.xpGranted).toBe(3);
    const item = await db().rpgItemInstance.findFirstOrThrow({
      where: { userId },
    });
    expect(item.equippedCharacterId).toBeNull();
    await mkdir("docs/qa/world", { recursive: true });
    await page.screenshot({ path: "docs/qa/world/ruins-pve.png" });
    const target = [...geometry.nodes]
      .filter((n) => n.kind === "RESOURCE")
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
    await fieldWalk(page, target);
    await page.keyboard.press("KeyE");
    await expect
      .poll(() => db().rpgResourceClaim.count({ where: { userId } }))
      .toBe(1);
    await fieldWalk(page, { x: 0, y: 0 }, 35);
    await page.keyboard.press("KeyE");
    await expect(canvas).toHaveAttribute("data-zone", "obelisk-refuge");
    await expect(canvas).toHaveAttribute("data-shell-id", shell!);
    await page
      .getByRole("button", { name: "Recompensas", exact: true })
      .click();
    await expect(
      dialog.getByText("Lâmina Gasta · comum · nível 1 · no inventário"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Inventário", exact: true }).click();
    await dialog
      .getByRole("button", { name: /Lâmina Gasta/ })
      .first()
      .click();
    await dialog.getByRole("button", { name: "Equipar", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await db().rpgItemInstance.findUniqueOrThrow({
              where: { id: item.id },
            })
          ).equippedCharacterId,
      )
      .toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-shell-id", shell!);
    await mkdir("docs/qa/world", { recursive: true });
    await page.screenshot({ path: "docs/qa/world/refuge-desktop.png" });
    await writeFile(
      "docs/qa/world/browser-metrics.json",
      JSON.stringify(
        await canvas.evaluate((el) => ({
          ...(window as unknown as { __limiarWorld: object }).__limiarWorld,
          renderP95: (el as HTMLElement).dataset.renderP95,
          frameP95: (el as HTMLElement).dataset.frameP95,
        })),
        null,
        2,
      ),
    );
    await page.reload();
    await expect(canvas).toHaveAttribute("data-zone", "obelisk-refuge");
    await expect(canvas).toHaveAttribute("data-players", "2");
    expect(await db().rpgItemInstance.count({ where: { userId } })).toBe(1);
    expect(await db().rpgResourceClaim.count({ where: { userId } })).toBe(1);
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: await a.storageState(),
    });
    const touch = await mobile.newPage();
    try {
      await page.close();
      await touch.goto("/rpg/world");
      const mobileCanvas = touch.locator("#rpg-world-canvas");
      await expect(mobileCanvas).toHaveAttribute("data-zone", "obelisk-refuge");
      await touch
        .getByRole("button", { name: "Personagem", exact: true })
        .click();
      await expect(touch.getByRole("dialog")).toBeVisible();
      await touch.screenshot({ path: "docs/qa/world/mobile-character.png" });
      await touch.getByRole("button", { name: "Fechar · Esc" }).tap();
      const before = await position(touch),
        stick = touch.getByRole("button", { name: "Joystick de movimento" });
      await expect(stick).toBeVisible();
      const box = (await stick.boundingBox())!;
      const cdp = await mobile.newCDPSession(touch);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: box.x + box.width * 0.2, y: box.y + box.height / 2 },
        ],
      });
      await touch.waitForTimeout(700);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(async () =>
          Math.hypot(
            (await position(touch)).x - before.x,
            (await position(touch)).y - before.y,
          ),
        )
        .toBeGreaterThan(15);
      await cdp.detach();
      await touch.screenshot({ path: "docs/qa/world/mobile-world.png" });
    } finally {
      await mobile.close();
    }
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
    await db().user.deleteMany({ where: { username: { in: names } } });
  }
});
