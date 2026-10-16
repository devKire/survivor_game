import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { WorldZone } from "../../src/realtime/world/zone";
import { explorationPath } from "./exploration-navigation";
export const worldGeometry = new WorldZone("ruins-outskirts", randomUUID());
const obstacles = Array.from(
  { length: 9 },
  (_, i) =>
    worldGeometry.world.createChunk((i % 3) - 1, Math.floor(i / 3) - 1)
      .structures,
).flat();
export async function registerWorld(page: Page, name: string) {
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
export async function worldPosition(page: Page) {
  const c = page.locator("#rpg-world-canvas");
  return {
    x: Number(await c.getAttribute("data-authoritative-x")),
    y: Number(await c.getAttribute("data-authoritative-y")),
  };
}
export async function walkWorld(page: Page, x: number, y: number) {
  await page.locator("#rpg-world-canvas").focus();
  const end = Date.now() + 25000;
  while (true) {
    const own = await worldPosition(page),
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
export async function walkWorldField(
  page: Page,
  target: { x: number; y: number },
  radius = 45,
) {
  for (const p of explorationPath(
    await worldPosition(page),
    target,
    obstacles,
    radius,
  ))
    await walkWorld(page, p.x, p.y);
}
