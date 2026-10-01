import fs from "node:fs";
import { chromium } from "@playwright/test";
// Dev: npm run dev -- --port 3400; node scripts/qa-creature-portraits.mjs
// Production: npm run start -- --port 3402; append --production to this script.
// Produces screenshots; does not edit artwork.
async function validate(page) {
  const production = process.argv.includes("--production");
  const base =
    process.env.CREATURE_QA_URL ||
    `http://localhost:${production ? 3402 : 3400}`;
  const output = `artifacts/creature-portraits${production ? "/production" : ""}`;
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1560, height: 1050 });
  await page.addInitScript(() => {
    window.__portraitDraws = {};
    window.__portraitVisible = {};
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image instanceof HTMLImageElement)
        window.__portraitDraws[image.src] =
          (window.__portraitDraws[image.src] || 0) + 1;
      if (
        image instanceof HTMLImageElement &&
        image.src.includes("portrait.") &&
        args.length === 4
      ) {
        const m = this.getTransform();
        const x = m.a * (args[0] + args[2] / 2) + m.e;
        const y = m.d * (args[1] + args[3] / 2) + m.f;
        if (
          x > this.canvas.width * 0.15 &&
          x < this.canvas.width * 0.85 &&
          y > this.canvas.height * 0.2 &&
          y < this.canvas.height * 0.85
        )
          window.__portraitVisible[image.src] = true;
      }
      return draw.call(this, image, ...args);
    };
  });
  const summary = [];
  if (!production) {
    for (const [scene, phase, expected] of [
      ["regular", 1, 13],
      ["boss1", 1, 6],
      ["boss2", 1, 6],
      ["boss1", 2, 6],
      ["boss2", 2, 6],
      ["boss1", 3, 6],
      ["boss2", 3, 6],
      ["effects", 1, 13],
    ]) {
      await page.goto(`${base}/offline?creatures=${scene}&phase=${phase}`);
      await page.waitForFunction(
        (n) =>
          Object.keys(window.__portraitDraws).filter((url) =>
            url.includes("portrait."),
          ).length === n,
        expected,
      );
      await page.screenshot({
        path: `${output}/${scene}-phase${phase}-hitboxes.png`,
      });
      summary.push({
        scene,
        phase,
        portraits: expected,
        draws: await page.evaluate(() => window.__portraitDraws),
      });
    }
    await page.goto(`${base}/offline?creatures=war`);
    await page.waitForFunction(() =>
      Object.keys(window.__portraitDraws).some((url) =>
        url.includes("portrait."),
      ),
    );
    await page.screenshot({ path: `${output}/war-neutral-hitboxes.png` });
    summary.push({
      scene: "war",
      draws: await page.evaluate(() => window.__portraitDraws),
    });
  }
  // Ordinary PvE entry path: natural spawn and movement, no debug fixture.
  await page.goto(`${base}/offline`);
  await page.evaluate(() => localStorage.removeItem("limiar.save.v1"));
  await page.reload();
  await page.getByRole("button", { name: "INICIAR EXPEDIÇÃO" }).click();
  await page
    .getByRole("button", { name: "ATRAVESSAR A NÉVOA", exact: true })
    .click();
  await page.getByRole("button", { name: "ESTOU PRONTO", exact: true }).click();
  await page.waitForFunction(
    () => Object.keys(window.__portraitVisible).length > 0,
  );
  await page.screenshot({ path: `${output}/pve-natural-spawn.png` });
  summary.push({
    scene: "pve",
    draws: await page.evaluate(() => window.__portraitDraws),
  });
  await page.keyboard.press("Escape");
  // The real Codex uses the same save migration and DOM path as ordinary play.
  await page.goto(`${base}/offline?menu=codex`);
  await page.evaluate(() =>
    localStorage.setItem(
      "limiar.save.v1",
      JSON.stringify({ discovered: { enemies: [] } }),
    ),
  );
  await page.reload();
  await page.getByRole("heading", { name: "CHEFES", exact: true }).waitFor();
  if ((await page.locator(".card img").count()) !== 0)
    throw Error("Locked creature leaked portrait");
  await page
    .getByRole("heading", { name: "CHEFES", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/codex-locked.png` });
  await page.evaluate(() =>
    localStorage.setItem(
      "limiar.save.v1",
      JSON.stringify({
        discovered: {
          enemies: [
            "husk",
            "shardling",
            "boss",
            "boss:stone_bell",
            "boss:copper_doe",
            "final",
          ],
        },
      }),
    ),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Lasca Viva", exact: true })
    .waitFor();
  if ((await page.locator(".card img").count()) !== 5)
    throw Error("Wrong discovered portrait count");
  for (const image of await page.locator(".card img").all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((image) => image.decode());
  }
  await page
    .getByRole("heading", { name: "Lasca Viva", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/codex-discovered.png` });
  await page
    .getByRole("heading", { name: "O Sineiro de Pedra", exact: true })
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${output}/codex-bosses.png` });
  if (errors.length) throw Error(errors.join("\n"));
  fs.writeFileSync(
    `${output}/browser-validation.json`,
    JSON.stringify(
      { summary, errors, codex: { lockedImages: 0, discoveredImages: 5 } },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      scenes: summary.length,
      errors,
      codex: "locked and discovered passed",
    }),
  );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await validate(await browser.newPage());
} finally {
  await browser.close();
}
