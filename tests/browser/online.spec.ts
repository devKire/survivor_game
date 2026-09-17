import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import type { Snapshot } from "../../src/game/network/protocol";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { db } from "../../src/server/db";
const legacy = JSON.parse(readFileSync("tests/legacy-save.json", "utf8"));
const prefix = "browser_" + randomUUID().slice(0, 6);
for (const count of [2, 3])
  test(`V3/V4/V8: ${count} browsers register, lobby, synchronize gameplay and chat`, async ({
    browser,
  }) => {
    const runPrefix = prefix + count;
    const snapshots: Snapshot[] = [];
    const contexts: BrowserContext[] = [],
      pages: Page[] = [],
      errors: string[] = [];
    try {
      for (let i = 0; i < count; i++) {
        const context = await browser.newContext({
          permissions: ["clipboard-read", "clipboard-write"],
        });
        contexts.push(context);
        await context.addInitScript(() => sessionStorage.setItem("limiar.diagnostics", "1"));
        const page = await context.newPage();
        pages.push(page);
        page.on("websocket", (socket) =>
          socket.on("framereceived", (frame) => {
            if (!socket.url().includes(":3001")) return;
            const v = JSON.parse(String(frame.payload));
            if (v.type === "SNAPSHOT") snapshots[i] = v as Snapshot;
          }),
        );
        page.on("pageerror", (e) => errors.push(e.message));
        if (i === 0 && count === 2) {
          await page.goto("http://localhost:3000");
          await page.evaluate(
            (save) =>
              localStorage.setItem("limiar.save.v1", JSON.stringify(save)),
            legacy,
          );
        }
        await page.goto("http://localhost:3000/register");
        await page.getByLabel("Nome de usuário").fill(runPrefix + "_" + i);
        await page
          .getByLabel("E-mail")
          .fill(runPrefix + "_" + i + "@example.test");
        await page
          .getByLabel("Senha", { exact: true })
          .fill("Browser-Test-Secure-2026");
        await page
          .getByLabel("Confirmar senha")
          .fill("Browser-Test-Secure-2026");
        await page
          .getByRole("button", { name: "CRIAR CONTA", exact: true })
          .click();
        await expect(page).toHaveURL(/account/);
        await expect(page.getByText("Online", { exact: true })).toBeVisible({
          timeout: 20000,
        });
      }
      if (count === 2) {
        const p = pages[0];
        await p
          .getByRole("button", { name: "IMPORTAR PARA MINHA CONTA" })
          .click();
        await expect(
          p.getByText("Encontramos progresso local."),
        ).not.toBeVisible();
        await p
          .getByRole("link", { name: "Jogar solo · salvo na conta" })
          .click();
        await p.getByRole("button", { name: "CONTINUAR EXPEDIÇÃO" }).click();
        await p.keyboard.press("Escape");
        await expect(
          p.getByRole("heading", { name: "Travessia suspensa" }),
        ).toBeVisible();
        await expect(
          p.getByText("Solo salvo na conta", { exact: true }),
        ).toBeVisible();
        expect(
          await p.evaluate(() =>
            JSON.parse(localStorage.getItem("limiar.save.v1") || "null"),
          ),
        ).toEqual(legacy);
        await p.getByRole("link", { name: "← Conta" }).click();
        await expect(p.getByText("Online", { exact: true })).toBeVisible();
      }
      await pages[0].getByLabel("Buscar por username").fill(runPrefix + "_1");
      await pages[0]
        .getByRole("button", { name: "Buscar", exact: true })
        .click();
      await pages[0]
        .getByRole("button", { name: "Adicionar", exact: true })
        .click();
      await pages[1]
        .getByRole("button", { name: "Aceitar", exact: true })
        .click();
      await expect(
        pages[0].getByRole("button", { name: "Conversar", exact: true }),
      ).toBeVisible();
      await pages[0]
        .getByRole("button", { name: "Conversar", exact: true })
        .click();
      await pages[0].getByLabel("Mensagem").fill("DM entre amigos");
      await pages[0]
        .getByRole("button", { name: "Enviar", exact: true })
        .click();
      await pages[1]
        .getByRole("button", { name: "Conversar", exact: true })
        .click();
      await expect(pages[1].locator(".chat-history")).toContainText(
        "DM entre amigos",
      );
      for (const p of pages.slice(0, 2))
        await p.getByRole("button", { name: "Fechar", exact: true }).click();
      await pages[0]
        .getByRole("button", { name: "CRIAR EQUIPE", exact: true })
        .click();
      const codeLocator = pages[0]
        .locator("p")
        .filter({
          has: pages[0].getByRole("button", { name: "Copiar código" }),
        })
        .locator("strong");
      await expect(codeLocator).toBeVisible();
      const code = await codeLocator.innerText();
      await pages[0].getByRole("button", { name: "Copiar código" }).click();
      expect(
        await pages[0].evaluate(() => navigator.clipboard.readText()),
      ).toBe(code);
      for (let i = 1; i < count; i++) {
        await pages[i].getByLabel("CÓDIGO DA EQUIPE").fill(code);
        await pages[i]
          .getByRole("button", { name: "ENTRAR", exact: true })
          .click();
        await expect(
          pages[i].getByText(`${i + 1} / 5`, { exact: true }),
        ).toBeVisible({ timeout: 30000 });
      }
      await expect(
        pages[0].getByText(`${count} / 5`, { exact: true }),
      ).toBeVisible({ timeout: 20000 });
      for (const p of pages)
        await p.getByRole("button", { name: "PRONTO", exact: true }).click();
      const start = pages[0].getByRole("button", {
        name: "INICIAR EXPEDIÇÃO",
        exact: true,
      });
      await expect(start).toBeEnabled({ timeout: 20000 });
      await start.click();
      for (const p of pages)
        await expect(p.locator(".party-hud")).toContainText(runPrefix + "_0", {
          timeout: 20000,
        });
      expect(new Set(snapshots.map((s) => s.seed)).size).toBe(1);
      const initialX = snapshots[0].players[0].x;
      await pages[0].keyboard.down("d");
      await pages[0].waitForTimeout(600);
      await pages[0].keyboard.up("d");
      await expect
        .poll(() => snapshots[1].players[0].x)
        .toBeGreaterThan(initialX + 40);
      await pages[0].keyboard.press("Enter");
      await pages[0]
        .getByLabel("Mensagem")
        .fill("<script>window.hacked=1</script>");
      await pages[0]
        .getByRole("button", { name: "Enviar", exact: true })
        .click();
      await pages[1].keyboard.press("Enter");
      await expect(pages[1].locator(".chat-history")).toContainText(
        "<script>window.hacked=1</script>",
        { timeout: 15000 },
      );
      expect(
        await pages[1].evaluate(() => Object.hasOwn(window, "hacked")),
      ).toBe(false);
      await pages[count - 1].reload();
      await expect(pages[count - 1].locator(".party-hud")).toContainText(
        runPrefix + "_" + (count - 1),
        { timeout: 20000 },
      );
      if (process.env.STABILITY_BASELINE) {
        await pages[0].waitForTimeout(30000);
        const metrics = await Promise.all(pages.map((p) => p.evaluate(() => {
          const d = (window as unknown as { limiarDiagnostics: { frames: number[] } }).limiarDiagnostics;
          const frames = [...d.frames].sort((a,b) => a-b);
          return { ...d, frames: undefined, fps: 1000 / (frames.reduce((a,b) => a+b,0) / frames.length), low1: 1000 / frames[Math.floor(frames.length * 0.99)] };
        })));
        writeFileSync("docs/stability-baseline.json", JSON.stringify(metrics, null, 2));
      }
      const fps = await pages[0].evaluate(
        () =>
          new Promise<number>((resolve) => {
            let frames = 0;
            const start = performance.now();
            const frame = (now: number) => {
              frames++;
              if (now - start >= 2000) resolve((frames * 1000) / (now - start));
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }),
      );
      writeFileSync(
        `docs/client-${count}-performance.json`,
        JSON.stringify(
          {
            browsers: count,
            fps,
            viewport: [1280, 800],
            scenario:
              "Início da run real, navegadores simultâneos; sem carga sintética de 1100 inimigos.",
          },
          null,
          2,
        ),
      );
      expect(errors).toEqual([]);
      await pages[0].screenshot({ path: `docs/coop-${count}-browsers.png` });
    } finally {
      for (const c of contexts) await c.close();
      const users = await db().user.findMany({
        where: { username: { startsWith: runPrefix } },
      });
      const memberships = await db().teamMember.findMany({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      const teamIds = [...new Set(memberships.map((m) => m.teamId))];
      await db().gameSession.deleteMany({ where: { teamId: { in: teamIds } } });
      await db().team.deleteMany({ where: { id: { in: teamIds } } });
      await db().user.deleteMany({
        where: { id: { in: users.map((u) => u.id) } },
      });
      await db().$disconnect();
    }
  });
