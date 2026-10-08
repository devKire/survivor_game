import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const output = "artifacts/tiles/scenes";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = [];
try {
  for (const scene of [
    "ruins",
    "gardens",
    "forest",
    "dead",
    "corrupted",
    "rock",
    "sand",
    "swamp",
    "cave",
    "lava",
    "mine",
    "volcanic_cave",
    "volcano",
    "props",
    "combat",
    "ruins&time=230",
    "remote",
    "fallback",
  ]) {
    if (scene === "fallback")
      await page.route("**/_next/static/media/*.png", (route) => route.abort());
    await page.goto(`http://localhost:3400/offline?tiles=${scene}`);
    await page.waitForFunction(
      (fallback) =>
        window.limiarTileQA &&
        (fallback ||
          window.limiarTileQA.game.renderer.worldTiles.cacheStats.rasters > 0),
      scene === "fallback",
      { timeout: 90000 },
    );
    await page.waitForTimeout(scene === "combat" ? 6000 : 1800);
    const state = await page.evaluate(() => {
      const { game, timings } = window.limiarTileQA;
      const sorted = timings.slice().sort((a, b) => a - b);
      return {
        cache: game.renderer.worldTiles.cacheStats,
        enemies: game.enemies.length,
        ground: [...game.renderer.worldTiles.chunks.chunks.values()].map(
          (c) => c.ground,
        ),
        chunks: [...game.renderer.worldTiles.chunks.chunks.values()],
        medianDrawMs: sorted[Math.floor(sorted.length * 0.5)],
        p95DrawMs: sorted[Math.floor(sorted.length * 0.95)],
      };
    });
    await page.screenshot({
      path: `${output}/${scene.replaceAll("&", "-").replaceAll("=", "-")}.png`,
    });
    if (scene === "remote") {
      let shared = 0;
      for (const chunk of state.chunks) {
        const baseline = report[0].chunks.find(c => c.cx === chunk.cx && c.cy === chunk.cy);
        if (!baseline) continue; // Retained offscreen cache entries depend on camera history.
        shared++;
        if (JSON.stringify(chunk) !== JSON.stringify(baseline)) throw Error(`Remote chunk ${chunk.cx},${chunk.cy} differs`);
      }
      if (shared < 4) throw Error("Insufficient shared visual region");
    }
    if (scene === "fallback" && state.cache.rasters !== 0)
      throw Error("Unexpected image after blocking atlases");
    report.push({ scene, ...state });
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        report: report.map(({ ground, chunks, ...row }) => ({
          comparedChunks: chunks.length,
          ...row,
          groundCells: ground.flat().length,
        })),
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `QA: ${report.length} scenes; remote terrain equals offline; fallback checked; errors=${errors.length}`,
  );
} finally {
  await browser.close();
}
