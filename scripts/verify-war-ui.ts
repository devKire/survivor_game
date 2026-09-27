import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { WarSimulation } from "../src/game/core/war";
import { ArenaLobby } from "../src/game/core/arena-lobby";
import { freshSave } from "../src/game/core/save";
import { COSMETICS } from "../src/game/content/cosmetics";
import type { FighterSeed } from "../src/game/core/pvp";

// Isolated visual harness: real components/renderers; no account/database writes.
const directory = "artifacts/war-redesign";
await mkdir(directory, { recursive: true });
const seeds: FighterSeed[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  name: [
    "Guardião",
    "Aurora",
    "Cinza",
    "Vento",
    "Lume",
    "Prisma",
    "Sombra",
    "Maré",
    "Pedra",
    "Brasa",
  ][i],
  team: i < 5 ? 0 : 1,
  character: (["nara", "orin", "ivo", "sena"] as const)[i % 4],
  role: i === 0 ? "COMANDANTE" : "SOLDADO",
  cosmetics: {},
  isBot: i > 1,
}));
const game = new WarSimulation(seeds);
game.time = 4;
const own = game.fighters.get("p0")!;
own.player.x = 2450;
own.player.y = 1500;
for (const [i, f] of [...game.fighters.values()].entries()) {
  f.player.x = 2450 + (i % 5) * 85;
  f.player.y = 1500 + (f.team === 0 ? -1 : 1) * (50 + i * 9);
}
for (const team of [0, 1]) {
  game.spawnWave(team, 1, 5);
  for (const [i, u] of game.units.items
    .filter((u) => u.team === team)
    .entries()) {
    u.x = 2500 + i * 25;
    u.y = 1400 + team * 170;
  }
}
game.grantWarXp("p0", 180);
game.grantWarGold("p0", 540);
const snapshot = game.snapshot("p0");
snapshot.war.shopAvailable = true;
const save = freshSave();
save.gold = 700;
save.gems = 350;
save.pvpCosmetics.nara.CHARACTER_SKIN = "character_skin_0";
const state = {
  snapshot,
  lobby: new ArenaLobby("visual", "WAR_CASUAL", seeds).state(),
  save,
  owned: ["character_skin_0", "character_skin_3"],
  cosmetics: COSMETICS,
};
const mockActions = `export async function realtimeTicket(){return "fixture"}
export async function competitiveAction(){return {ok:true}}
export async function pvpCustomizationAction(){return {ok:true,data:{profiles:window.fixture.save.pvpCosmetics,owned:window.fixture.owned.map(id=>window.fixture.cosmetics[id])}}}
export async function accountAction(input){window.actions.push(input);if(input.type==='pvp-cosmetic'){if(input.id)window.fixture.save.pvpCosmetics[input.character][input.slot]=input.id;else delete window.fixture.save.pvpCosmetics[input.character][input.slot]}return {ok:true}}`;
const mockClient = `export class RealtimeClient {rtt=12;constructor(ticket,receive,status){this.receive=receive;this.status=status}async connect(){window.deliver=this.receive;this.status('Online');window.sent=[]}close(){}send(message){window.sent.push(message);if(message.type==='ARENA_QUEUE')this.receive({type:'ARENA_LOBBY_STATE',lobby:window.fixture.lobby});if(message.type==='ARENA_LOCK_SELECTION'){this.receive({type:'ARENA_STARTED',matchId:'visual',mode:'WAR_CASUAL',roster:window.fixture.lobby.seats});setTimeout(()=>this.receive({type:'ARENA_SNAPSHOT',matchId:'visual',snapshot:window.fixture.snapshot}),20)}if(message.type==='ARENA_SELECT_CHARACTER'){window.fixture.lobby.seats[0].character=message.character;this.receive({type:'ARENA_LOBBY_STATE',lobby:structuredClone(window.fixture.lobby)})}}}`;
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import ArenaClient from './src/app/arena/ArenaClient';import CollectionClient from './src/app/collection/CollectionClient';window.fixture=await fetch('/state').then(r=>r.json());window.actions=[];const root=createRoot(document.getElementById('root'));const render=()=>root.render(location.pathname==='/arena'?<ArenaClient userId="p0" initialMode="WAR_CASUAL" menuHeader={<nav>LIMIAR · ECOS DO OBELISCO</nav>}/>:<CollectionClient shop={location.pathname==='/shop'} save={window.fixture.save} owned={window.fixture.owned}/>);window.addEventListener('fixture-refresh',render);render();`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  loader: { ".png": "dataurl" },
  write: false,
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  plugins: [
    {
      name: "isolated-services",
      setup(b) {
        b.onResolve({ filter: /server\/actions$/ }, () => ({
          path: "actions",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /network\/client$/ }, () => ({
          path: "client",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /^next\/(link|navigation|image)$/ }, (args) => ({
          path: args.path,
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "actions"
              ? mockActions
              : args.path === "client"
                ? mockClient
                : args.path === "next/link"
                  ? `import React from 'react';export default function Link(p){return React.createElement('a',p)}`
                  : args.path === "next/image"
                    ? `import React from 'react';export default function Image({src,unoptimized,...props}){return React.createElement('img',{...props,src:typeof src==='string'?src:src.src})}`
                    : `export function useRouter(){return {refresh(){window.dispatchEvent(new Event('fixture-refresh'))},push(url){location.href=url}}}`,
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const css = await readFile("src/app/globals.css", "utf8");
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url === "/bundle.js"
      ? "text/javascript"
      : request.url === "/style.css"
        ? "text/css"
        : request.url === "/state"
          ? "application/json"
          : "text/html",
  );
  response.end(
    request.url === "/bundle.js"
      ? bundle.outputFiles[0].text
      : request.url === "/style.css"
        ? css
        : request.url === "/state"
          ? JSON.stringify(state)
          : '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
  );
});
await new Promise<void>((resolve) => server.listen(4179, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  await page.addInitScript(`
    window.characterSpriteDraws = [];
    const imageIds = new WeakMap();
    let nextImageId = 1;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
      if (image instanceof HTMLImageElement && image.naturalWidth === 2048) {
        let imageId = imageIds.get(image);
        if (!imageId) {
          imageId = nextImageId++;
          imageIds.set(image, imageId);
        }
        window.characterSpriteDraws.push({
          src: imageId,
          sw: args[2], sh: args[3], dw: args[6], dh: args[7],
          smoothing: this.imageSmoothingEnabled,
        });
      }
      return Reflect.apply(original, this, [image, ...args]);
    };
  `);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4179/arena");
  await expect(
    page.getByRole("button", { name: "Buscar partida" }),
  ).toBeVisible();
  await expect(page.locator("img.character-portrait")).toHaveCount(4);
  await expect
    .poll(() =>
      page
        .locator("img.character-portrait")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: `${directory}/01-arena.png` });
  await page.locator("img.character-portrait").first().dispatchEvent("error");
  await expect(page.locator(".arena-character-grid canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Buscar partida" }).click();
  await expect(
    page.getByRole("heading", { name: "Escolha seu personagem" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector(".arena-page")?.scrollTo(0, 0);
  });
  await page.locator(".lobby-selection .character-cards button").nth(1).click();
  await expect(page.locator(".lobby-selection > h2")).toHaveText("Orin");
  await expect(
    page.locator(".lobby-selection .character-cards button").nth(1),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: `${directory}/02-character-select.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "CONFIRMAR SELEÇÃO", exact: true })
    .click();
  await expect(page.locator(".war-controls")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".arena-scoreboard-panel")).toHaveCount(0);
  await page.screenshot({ path: `${directory}/03-guerra.png` });
  await page.keyboard.press("b");
  await expect(
    page.getByRole("dialog", { name: "Loja da Guerra" }),
  ).toBeVisible();
  await page.screenshot({ path: `${directory}/04-shop.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.press("u");
  await expect(
    page.getByRole("dialog", { name: "Melhorias da Guerra" }),
  ).toBeVisible();
  await page.screenshot({ path: `${directory}/05-upgrade.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.down("Tab");
  await expect(page.locator(".arena-scoreboard-panel")).toBeVisible();
  await page.screenshot({ path: `${directory}/06-scoreboard.png` });
  await page.keyboard.up("Tab");
  await expect(page.locator(".arena-scoreboard-panel")).toHaveCount(0);
  for (const [width, height] of [
    [1920, 1080],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${directory}/guerra-${width}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("http://127.0.0.1:4179/collection");
  await expect(
    page.getByRole("heading", { name: "PERSONAGENS", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".character-cards canvas")).toHaveCount(4);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { characterSpriteDraws: unknown[] })
            .characterSpriteDraws.length,
      ),
    )
    .toBeGreaterThanOrEqual(4);
  const sourceDraws = await page.evaluate(
    () =>
      (
        window as typeof window & {
          characterSpriteDraws: {
            sw: number;
            sh: number;
            dw: number;
            dh: number;
            smoothing: boolean;
          }[];
        }
      ).characterSpriteDraws,
  );
  expect(
    sourceDraws.every(
      (draw) =>
        draw.sw === 256 &&
        draw.sh === 256 &&
        draw.dw === 96 &&
        draw.dh === 96 &&
        !draw.smoothing,
    ),
  ).toBe(true);
  await expect(page.locator(".character-card").first()).toContainText(
    "Skin · Memória · Vestes",
  );
  await page.screenshot({ path: `${directory}/07-collection.png` });
  await page
    .getByRole("button", { name: "Visualizar Aurora · Vestes", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { actions: unknown[] }).actions.length,
    ),
  ).toBe(0);
  await expect(page.locator(".collection-hero")).toContainText(
    "Aurora · Vestes",
  );
  await expect(page.locator(".character-card").first()).toContainText(
    "Skin · Memória · Vestes",
  );
  await page.locator(".collection-hero").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/collection-preview.png` });
  await page
    .locator("article.card")
    .filter({
      has: page.getByRole("heading", { name: "Aurora · Vestes", exact: true }),
    })
    .getByRole("button", { name: "Equipar", exact: true })
    .click();
  await expect(page.locator(".character-card").first()).toContainText(
    "Skin · Aurora · Vestes",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { actions: unknown[] }).actions,
    ),
  ).toEqual([
    {
      type: "pvp-cosmetic",
      character: "nara",
      slot: "CHARACTER_SKIN",
      id: "character_skin_3",
    },
  ]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${directory}/collection-equipped.png` });
  await page.goto("http://127.0.0.1:4179/shop");
  await expect(
    page.getByRole("heading", { name: "LOJA DO LIMIAR" }),
  ).toBeVisible();
  await page.screenshot({ path: `${directory}/08-store.png` });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const touch = await mobile.newPage();
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto("http://127.0.0.1:4179/arena");
  await touch.getByRole("button", { name: "Buscar partida" }).tap();
  await touch.evaluate(() => window.scrollTo(0, 0));
  await touch.evaluate(() =>
    document.querySelector(".arena-page")?.scrollTo(0, 0),
  );
  expect(
    await touch.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await touch.screenshot({
    path: `${directory}/mobile-lobby.png`,
    fullPage: true,
  });
  await touch
    .getByRole("button", { name: "CONFIRMAR SELEÇÃO", exact: true })
    .tap();
  await expect(touch.locator(".war-controls")).toBeVisible();
  const joystick = await touch.locator(".arena-joystick").boundingBox();
  if (!joystick) throw new Error("Missing joystick");
  const cdp = await mobile.newCDPSession(touch);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: joystick.x + joystick.width * 0.8,
        y: joystick.y + joystick.height / 2,
      },
    ],
  });
  await touch.waitForTimeout(180);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await touch.evaluate(() =>
      (
        window as unknown as { sent: { type: string; moveX?: number }[] }
      ).sent.some((m) => m.type === "ARENA_INPUT" && (m.moveX || 0) > 0.2),
    ),
  ).toBe(true);
  await touch.screenshot({ path: `${directory}/09-mobile.png` });
  await touch.getByRole("button", { name: "LOJA · B", exact: true }).tap();
  await expect(touch.getByRole("dialog")).toBeVisible();
  await touch.getByRole("button", { name: "Fechar painel" }).tap();
  await touch.setViewportSize({ width: 430, height: 932 });
  await touch.screenshot({ path: `${directory}/mobile-430.png` });
  for (const route of ["collection", "shop"]) {
    await touch.goto(`http://127.0.0.1:4179/${route}`);
    await expect(touch.locator("h1")).toBeVisible();
    expect(
      await touch.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await touch.screenshot({ path: `${directory}/mobile-${route}.png` });
  }
  expect(errors).toEqual([]);
  await writeFile(
    `${directory}/validation.json`,
    JSON.stringify(
      {
        viewports: [
          [1366, 768],
          [1920, 1080],
          [768, 1024],
          [390, 844],
          [430, 932],
        ],
        errors,
        checks: [
          "scoreboard hold/release",
          "shop open/close",
          "upgrade opt-in",
          "preview does not equip",
          "equipping updates the character card through the account action",
          "collection cards use the gameplay renderer and equipped skins",
          "canonical 2048 sheets draw 256px cells at 96 world pixels with smoothing off",
          "lobby character selection",
          "mobile lobby, collection and shop fit viewport",
          "native touch joystick",
          "mobile drawer",
          "four portraits loaded",
          "portrait image failure falls back to canvas",
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Visual validation passed: ${directory}`);
} catch (error) {
  if (errors.length) console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
  server.close();
}
