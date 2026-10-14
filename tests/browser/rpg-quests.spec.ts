import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/server/db";
import { EXPLORATION_RUINS as region } from "../../src/game/content/rpg/exploration-regions";
import { CoopSimulation } from "../../src/game/core/coop";
import { freshSave } from "../../src/game/core/save";
import { generateExploration } from "../../src/game/core/rpg/exploration/generation";
import { explorationPath } from "../helpers/exploration-navigation";
const enabled =
  process.env.RPG_QUESTS_ENABLED === "true" &&
  process.env.RPG_ENABLED === "true";
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
  await page.getByLabel("Senha", { exact: true }).fill("Quest-Browser-2026");
  await page.getByLabel("Confirmar senha").fill("Quest-Browser-2026");
  await page.getByRole("button", { name: "CRIAR CONTA", exact: true }).click();
  await expect(page).toHaveURL(/\/rpg$/);
}
test("quest rollout and authentication", async ({ page, request }) => {
  if (!enabled) expect((await request.get("/rpg/quests")).status()).toBe(404);
  else {
    await page.goto("/rpg/quests");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Frpg%2Fquests/);
  }
});
async function ready(page: Page) {
  await expect(
    page.getByRole("button", { name: "Atualizar diário", exact: true }),
  ).toBeEnabled();
}
async function speak(page: Page, npc: string, choices: string[]) {
  await page
    .getByRole("button", { name: `Conversar: ${npc}`, exact: true })
    .click();
  await ready(page);
  for (const choice of choices) {
    await page.getByRole("button", { name: choice, exact: true }).click();
    await ready(page);
  }
}
async function accept(page: Page, id: string) {
  await page
    .locator(`[data-quest="${id}"]`)
    .getByRole("button", { name: "Aceitar missão", exact: true })
    .click();
  await ready(page);
}
async function claim(page: Page, id: string) {
  await page
    .locator(`[data-quest="${id}"]`)
    .getByRole("button", { name: "Resgatar recompensa", exact: true })
    .click();
  await ready(page);
  await expect(page.locator(`[data-quest="${id}"]`)).toContainText(
    "Recompensa recebida",
  );
}
async function startExploring(page: Page) {
  await page.goto("/rpg/exploration");
  await page
    .getByRole("button", { name: "Preparar Arredores das Ruínas" })
    .click();
  await expect(page).toHaveURL(/\/team$/);
  await page.getByRole("button", { name: "PRONTO", exact: true }).click();
  await page
    .getByRole("button", { name: "INICIAR EXPEDIÇÃO", exact: true })
    .click();
  await expect(page.locator("#game")).toHaveAttribute("data-character", "nara");
}
async function leave(page: Page) {
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
  await page.goto("/rpg/quests");
  await ready(page);
}
test("real three-quest arc, exclusive dialogue choice, exploration, delivery, side quest and refresh", async ({
  browser,
}) => {
  test.skip(
    !enabled ||
      process.env.RPG_REFUGE_ENABLED !== "true" ||
      process.env.RPG_EXPLORATION_ENABLED !== "true",
    "Requires narrative/refuge/exploration flags",
  );
  test.setTimeout(600000);
  const context = await browser.newContext(),
    page = await context.newPage(),
    username = "story_" + randomUUID().slice(0, 8);
  let userId: string | undefined, teamId: string | undefined;
  await context.addInitScript(() =>
    sessionStorage.setItem("limiar.diagnostics", "1"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const timings: Record<string, number> = {};
  try {
    await register(page, username);
    userId = (await db().user.findUniqueOrThrow({ where: { username } })).id;
    await page.goto("/rpg/refuge");
    await page
      .getByRole("button", { name: "Falar: Guardião do Refúgio", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("canvas")).toBeFocused();
    expect(await db().rpgQuestObjectiveProof.count({ where: { userId } })).toBe(
      0,
    );
    await page.goto("/rpg/quests");
    await ready(page);
    const before = await db().userProgress.findUnique({ where: { userId } });
    await mkdir("artifacts/quests", { recursive: true });
    await page.screenshot({
      path: "artifacts/quests/available.png",
      fullPage: true,
    });
    await page.goto("/rpg/refuge");
    await page
      .getByRole("button", { name: "Falar: Guardião do Refúgio", exact: true })
      .click();
    await page.screenshot({
      path: "artifacts/quests/npc-quest.png",
      fullPage: true,
    });
    const t = performance.now();
    await accept(page, "main:refuge-introduction");
    timings.acceptMs = performance.now() - t;
    await page.keyboard.press("Escape");
    await page.goto("/rpg/quests");
    await ready(page);
    await speak(page, "Guardião do Refúgio", [
      "Escolher uma prioridade de investigação",
      "Começar pelos vestígios visíveis",
    ]);
    await speak(page, "Guardião do Refúgio", [
      "Escolher uma prioridade de investigação",
    ]);
    await expect(
      page.getByRole("button", {
        name: "Começar pelos ecos que percebemos · indisponível",
        exact: true,
      }),
    ).toBeDisabled();
    await page.screenshot({
      path: "artifacts/quests/choice.png",
      fullPage: true,
    });
    await speak(page, "Orientador", [
      "Ouvir a orientação inicial",
      "Confirmar relato",
    ]);
    await speak(page, "Guardião do Refúgio", [
      "Relatar a orientação recebida",
      "Confirmar relato",
    ]);
    await claim(page, "main:refuge-introduction");
    await accept(page, "main:ruins-remnants");
    await accept(page, "side:ruins-reconnaissance");
    await startExploring(page);
    teamId = (await db().teamMember.findUniqueOrThrow({ where: { userId } }))
      .teamId;
    const pois = [...nodes]
      .filter((n) => n.kind === "POI")
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    for (const poi of pois.slice(0, 3)) {
      await walk(page, poi);
      await expect
        .poll(() =>
          db().rpgDiscoveredPoi.count({ where: { userId, poiId: poi.id } }),
        )
        .toBe(1);
    }
    await page.screenshot({ path: "artifacts/quests/exploration.png" });
    await leave(page);
    await speak(page, "Guardião do Refúgio", [
      "Apresentar os vestígios",
      "Confirmar relato",
    ]);
    await claim(page, "main:ruins-remnants");
    await speak(page, "Orientador", [
      "Relatar o reconhecimento",
      "Confirmar relato",
    ]);
    await claim(page, "side:ruins-reconnaissance");
    await accept(page, "main:material-echoes");
    await startExploring(page);
    const resources = ["weathered-vein", "ruins-herb"].flatMap((id) =>
      nodes
        .filter((n) => n.definitionId === id)
        .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
        .slice(0, 2),
    );
    for (const node of resources) {
      await walk(page, node);
      await expect(
        page.getByRole("button", { name: "[E] Coletar", exact: true }),
      ).toBeEnabled();
      await page.keyboard.press("KeyE");
      await expect(
        page.getByText("Esgotado neste ciclo UTC · pessoal", { exact: true }),
      ).toBeVisible();
    }
    await expect
      .poll(() => db().rpgResourceClaim.count({ where: { userId } }))
      .toBe(4);
    await page.screenshot({ path: "artifacts/quests/gathering.png" });
    await leave(page);
    await speak(page, "Responsável pelo Depósito", [
      "Apresentar as amostras",
      "Confirmar relato",
    ]);
    await page.screenshot({
      path: "artifacts/quests/completed.png",
      fullPage: true,
    });
    const rewardStart = performance.now();
    await claim(page, "main:material-echoes");
    timings.rewardMs = performance.now() - rewardStart;
    await page.reload();
    await expect(
      page.locator('[data-quest="main:material-echoes"]'),
    ).toContainText("Recompensa recebida");
    expect(await db().rpgQuestRewardReceipt.count({ where: { userId } })).toBe(
      4,
    );
    const xp = (await db().rpgCharacter.findFirstOrThrow({ where: { userId } }))
      .xp;
    expect(xp).toBe(130);
    expect(await db().userProgress.findUnique({ where: { userId } })).toEqual(
      before,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/quests/mobile-reward.png",
      fullPage: true,
    });
    await expect(
      page.getByText("Prioridade registrada: Vestígios.", { exact: false }),
    ).toBeVisible();
    await writeFile(
      "artifacts/quests/browser-metrics.json",
      JSON.stringify(timings, null, 2),
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (userId) await db().user.deleteMany({ where: { id: userId } });
    if (teamId) {
      await db().gameSession.deleteMany({ where: { teamId } });
      await db().team.deleteMany({ where: { id: teamId } });
    }
  }
});

test("quest tabs, network retry, private journal and mobile dialogue controls", async ({
  browser,
}) => {
  test.skip(!enabled, "Requires narrative rollout");
  const context = await browser.newContext({ hasTouch: true }),
    foreign = await browser.newContext(),
    page = await context.newPage(),
    other = await foreign.newPage(),
    users: string[] = [];
  try {
    const username = "qtab_" + randomUUID().slice(0, 8);
    await register(page, username);
    users.push((await db().user.findUniqueOrThrow({ where: { username } })).id);
    await page.goto("/rpg/quests");
    const tab = await context.newPage();
    await tab.goto("/rpg/quests");
    await ready(tab);
    await accept(page, "main:refuge-introduction");
    await tab
      .locator('[data-quest="main:refuge-introduction"]')
      .getByRole("button", { name: "Aceitar missão" })
      .click();
    await expect(
      tab
        .getByRole("region", { name: "Diário de missões", exact: true })
        .getByRole("alert"),
    ).toContainText("outra aba");
    await tab
      .getByRole("button", { name: "Atualizar diário", exact: true })
      .click();
    await ready(tab);
    await expect(
      tab.locator('[data-quest="main:refuge-introduction"]'),
    ).toContainText("Em andamento");
    await context.setOffline(true);
    await page
      .getByRole("button", { name: "Conversar: Orientador", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Diário de missões", exact: true })
        .getByRole("alert"),
    ).toContainText(/Conexão|possível/);
    await context.setOffline(false);
    await speak(page, "Orientador", [
      "Ouvir a orientação inicial",
      "Confirmar relato",
    ]);
    expect(
      await db().rpgQuestObjectiveProof.count({ where: { userId: users[0] } }),
    ).toBe(1);
    const foreignName = "qother_" + randomUUID().slice(0, 8);
    await register(other, foreignName);
    users.push(
      (await db().user.findUniqueOrThrow({ where: { username: foreignName } }))
        .id,
    );
    await other.goto("/rpg/quests");
    await expect(
      other.locator('[data-quest="main:refuge-introduction"]'),
    ).toContainText("Disponível");
    expect(
      await db().rpgQuestObjectiveProof.count({ where: { userId: users[1] } }),
    ).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    const button = page.getByRole("button", {
      name: "Conversar: Guardião do Refúgio",
      exact: true,
    });
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await ready(page);
    await expect(
      page.getByRole("region", { name: "Conversa: Guardião do Refúgio" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Fechar conversa", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Conversa: Guardião do Refúgio" }),
    ).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await context.close();
    await foreign.close();
    await db().user.deleteMany({ where: { id: { in: users } } });
  }
});
