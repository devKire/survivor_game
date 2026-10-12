import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/server/db";
import { RPG_MATERIALS } from "../../src/game/content/rpg";
import { explorationResource } from "../../src/game/content/rpg/exploration-resources";
import { EXPLORATION_RUINS as region } from "../../src/game/content/rpg/exploration-regions";
import { CoopSimulation } from "../../src/game/core/coop";
import { freshSave } from "../../src/game/core/save";
import { generateExploration } from "../../src/game/core/rpg/exploration/generation";
import { explorationPath } from "../helpers/exploration-navigation";
const enabled =
  process.env.RPG_ENABLED === "true" &&
  process.env.RPG_EXPLORATION_ENABLED === "true";
const world = new CoopSimulation(
  [{ id: "p", name: "P", character: "nara", progress: freshSave() }],
  "normal",
  "ruins",
  region.seed,
).world;
const nodes = generateExploration(region, world),
  obstacles = Array.from(
    { length: 9 },
    (_, i) => world.createChunk((i % 3) - 1, Math.floor(i / 3) - 1).structures,
  ).flat();
async function walk(page: Page, target: { x: number; y: number }) {
  const canvas = page.locator("#game");
  const position = async () => ({
    x: Number(await canvas.getAttribute("data-x")),
    y: Number(await canvas.getAttribute("data-y")),
  });
  const path = explorationPath(await position(), target, obstacles);
  const end = Date.now() + 30000;
  for (const point of path) {
    let own = await position();
    while (Math.hypot(own.x - point.x, own.y - point.y) > 15) {
      if (Date.now() > end) throw Error("Browser movement timeout");
      const dx = point.x - own.x,
        dy = point.y - own.y;
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
      own = await position();
    }
  }
  await page.waitForTimeout(350);
}
async function register(page: Page, username: string) {
  await page.goto("/register?callbackUrl=%2Frpg");
  await page.getByLabel("Nome de usuário").fill(username);
  await page.getByLabel("E-mail").fill(username + "@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("Gathering-Browser-2026");
  await page.getByLabel("Confirmar senha").fill("Gathering-Browser-2026");
  await page.getByRole("button", { name: "CRIAR CONTA", exact: true }).click();
  await expect(page).toHaveURL(/\/rpg$/);
}
test("exploration flags and safe authentication callbacks", async ({
  page,
  request,
}) => {
  for (const path of ["/rpg/exploration", "/rpg/discoveries"]) {
    if (!enabled) expect((await request.get(path)).status()).toBe(404);
    else {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp("/login\\?callbackUrl=" + encodeURIComponent(path)),
      );
    }
  }
});
test("real refuge to exploration, gathering, discovery, reconnect, mobile, journal and persistent inventory", async ({
  browser,
}) => {
  test.skip(
    !enabled || process.env.RPG_REFUGE_ENABLED !== "true",
    "Requires RPG/exploration/refuge rollout",
  );
  const context = await browser.newContext(),
    page = await context.newPage(),
    username = "gath_" + randomUUID().slice(0, 8),
    errors: string[] = [];
  await context.addInitScript(() => {
    // The deliberate offline reload also creates Chromium's opaque error document.
    if (location.protocol === "http:" && location.hostname === "localhost")
      sessionStorage.setItem("limiar.diagnostics", "1");
  });
  page.on("pageerror", (e) => errors.push(e.message));
  let userId: string | undefined,
    teamId: string | undefined,
    otherUserId: string | undefined;
  const otherContext = await browser.newContext();
  try {
    await register(page, username);
    userId = (await db().user.findUniqueOrThrow({ where: { username } })).id;
    await page
      .getByRole("link", { name: "Entrar no Refúgio", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Serviços acessíveis do Refúgio" })
      .getByRole("button", { name: "Exploração", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Escolher região de exploração" })
      .click();
    await page
      .getByRole("button", { name: "Preparar Arredores das Ruínas" })
      .click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByLabel("Tipo de expedição")).toHaveValue(
      "RPG_EXPLORATION",
    );
    await page.getByRole("button", { name: "PRONTO", exact: true }).click();
    await page
      .getByRole("button", { name: "INICIAR EXPEDIÇÃO", exact: true })
      .click();
    const canvas = page.locator("#game");
    await expect(canvas).toHaveAttribute("data-character", "nara");
    teamId = (await db().teamMember.findUniqueOrThrow({ where: { userId } }))
      .teamId;
    const target = [...nodes]
      .filter((n) => n.kind === "RESOURCE")
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
    const entryStart = performance.now();
    await walk(page, target);
    await expect(
      page.getByRole("button", { name: "[E] Coletar", exact: true }),
    ).toBeEnabled();
    const gatherStart = performance.now();
    await page.keyboard.press("KeyE");
    await expect(
      page.getByText("Esgotado neste ciclo UTC · pessoal", { exact: true }),
    ).toBeVisible();
    const gatherMs = performance.now() - gatherStart;
    expect(await db().rpgResourceClaim.count({ where: { userId } })).toBe(1);
    await context.setOffline(true);
    await expect(page.reload({ timeout: 10000 })).rejects.toThrow();
    await context.setOffline(false);
    await page.goto("/team");
    await expect(canvas).toHaveAttribute("data-character", "nara");
    await expect(
      page.getByText("Esgotado neste ciclo UTC · pessoal", { exact: true }),
    ).toBeVisible();
    const poi = [...nodes]
      .filter((n) => n.kind === "POI")
      .sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.y - target.y) -
          Math.hypot(b.x - target.x, b.y - target.y),
      )[0];
    await walk(page, poi);
    await expect
      .poll(() => db().rpgDiscoveredPoi.count({ where: { userId } }))
      .toBeGreaterThan(0);
    await mkdir("artifacts/exploration", { recursive: true });
    await page.screenshot({ path: "artifacts/exploration/desktop.png" });
    const metrics = await page.evaluate(() => {
      const w = window as unknown as {
        limiarDiagnostics: { render: number[]; frames: number[] };
        limiarRemoteGame: {
          fps: number;
          renderer: { worldTiles: { cacheStats: unknown } };
        };
      };
      const p95 = (v: number[]) =>
        [...v].sort((a, b) => a - b)[Math.floor(v.length * 0.95)] ?? 0;
      return {
        fps: w.limiarRemoteGame.fps,
        renderP95Ms: p95(w.limiarDiagnostics.render),
        frameP95Ms: p95(w.limiarDiagnostics.frames),
        cache: w.limiarRemoteGame.renderer.worldTiles.cacheStats,
      };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    const button = page.getByRole("button", { name: "Mover →" }),
      box = (await button.boundingBox())!;
    const before = await canvas.getAttribute("data-x");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await page.waitForTimeout(450);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(canvas).not.toHaveAttribute("data-x", before!);
    await page.screenshot({ path: "artifacts/exploration/mobile.png" });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Encerrar exploração e retornar" })
      .click();
    await expect(
      page.getByText(
        "Exploração encerrada. Materiais e descobertas confirmados permanecem na conta.",
        { exact: true },
      ),
    ).toBeVisible();
    const cleanup = await page.evaluate(() => {
      const d = (
        window as unknown as {
          limiarDiagnostics: { remoteGameInstances: number; rafLoops: number };
        }
      ).limiarDiagnostics;
      return { instances: d.remoteGameInstances, loops: d.rafLoops };
    });
    expect(cleanup).toEqual({ instances: 0, loops: 0 });
    await page
      .getByRole("link", { name: "Voltar ao Refúgio", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Serviços acessíveis do Refúgio" })
      .getByRole("button", { name: "Depósito", exact: true })
      .click();
    const resource = explorationResource(target.definitionId);
    await expect(page.getByRole("dialog")).toContainText(
      `${RPG_MATERIALS[resource.materialId as keyof typeof RPG_MATERIALS].name}: ${resource.quantity}`,
    );
    await page.goto("/rpg/discoveries");
    await expect(
      page.getByRole("heading", { name: "Coletas confirmadas" }),
    ).toBeVisible();
    await expect(
      page.getByText("1/18 coletas neste dia UTC.", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(poi.id, { exact: true })).toBeVisible();
    expect(await db().rpgResourceClaim.count({ where: { userId } })).toBe(1);
    expect(
      (await db().userProgress.findUniqueOrThrow({ where: { userId } }))
        .version,
    ).toBe(1);
    const navigationAndInteractionMs = performance.now() - entryStart;
    const other = await otherContext.newPage(),
      otherName = "gath_" + randomUUID().slice(0, 8);
    await register(other, otherName);
    otherUserId = (
      await db().user.findUniqueOrThrow({ where: { username: otherName } })
    ).id;
    await other.goto("/rpg/discoveries");
    await expect(
      other.getByText("Nenhuma coleta confirmada.", { exact: true }),
    ).toBeVisible();
    await expect(other.getByText(poi.id, { exact: true })).toHaveCount(0);
    const claim = await db().rpgResourceClaim.findFirstOrThrow({
      where: { userId },
    });
    expect(
      (
        await otherContext.request.get("/rpg/discoveries?cursor=" + claim.id)
      ).status(),
    ).toBe(404);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/rpg/exploration");
    await page
      .getByRole("button", { name: "Preparar Arredores das Ruínas" })
      .click();
    await page.getByRole("button", { name: "PRONTO", exact: true }).click();
    await page
      .getByRole("button", { name: "INICIAR EXPEDIÇÃO", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-character", "nara");
    await walk(page, target);
    await expect(
      page.getByText("Esgotado neste ciclo UTC · pessoal", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "[E] Coletar", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Encerrar exploração e retornar" })
      .click();
    await expect(
      page.getByText(
        "Exploração encerrada. Materiais e descobertas confirmados permanecem na conta.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(await db().rpgResourceClaim.count({ where: { userId } })).toBe(1);
    expect(errors).toEqual([]);
    await writeFile(
      "artifacts/exploration/browser-metrics.json",
      JSON.stringify(
        {
          ...metrics,
          cleanup,
          gatherMs,
          navigationAndInteractionMs,
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
    await otherContext.close();
    if (otherUserId) await db().user.delete({ where: { id: otherUserId } });
    if (userId) await db().user.delete({ where: { id: userId } });
    if (teamId) {
      await db().gameSession.deleteMany({ where: { teamId } });
      await db().team.delete({ where: { id: teamId } });
    }
  }
});
