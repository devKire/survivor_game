import { test, expect } from "@playwright/test";
import { writeFileSync, readFileSync } from "node:fs";
const legacy = JSON.parse(readFileSync("tests/legacy-save.json", "utf8"));
test("V1/V2 migrated offline game preserves movement, pause and legacy resume", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("BROWSER", e.message);
  });
  await page.goto("/offline");
  await expect(
    page.getByRole("button", { name: "INICIAR EXPEDIÇÃO" }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "INICIAR EXPEDIÇÃO" }).click();
  await page.getByRole("button", { name: "ATRAVESSAR A NÉVOA" }).click();
  await page.getByRole("button", { name: "ESTOU PRONTO" }).click();
  const fps = await page.evaluate(
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
    "docs/client-solo-performance.json",
    JSON.stringify(
      {
        fps,
        viewport: [1280, 800],
        scenario: "Solo migrado no início da run, Chrome headless.",
      },
      null,
      2,
    ),
  );
  await page.keyboard.down("d");
  await page.waitForTimeout(1000);
  await page.keyboard.up("d");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Travessia suspensa" }),
  ).toBeVisible();
  const s = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("limiar.save.v1") || "null"),
  );
  expect(s.activeRun.x).toBeGreaterThan(100);
  await page.evaluate(
    (save) => localStorage.setItem("limiar.save.v1", JSON.stringify(save)),
    legacy,
  );
  await page.reload();
  await page.getByRole("button", { name: "CONTINUAR EXPEDIÇÃO" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Travessia suspensa" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
