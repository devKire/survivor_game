import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Offline developer tool: never imported by the app and never changes an asset.
assert.notEqual(process.env.NODE_ENV, "production", "QA is development-only.");
const root = new URL("../", import.meta.url);
const output = new URL("artifacts/character-sheets/qa/", root);
const characters = ["nara", "orin", "ivo", "sena"];
const args = process.argv.slice(2);
assert(
  args.every((arg) => arg === "--bbox" || characters.includes(arg)),
  "Usage: node scripts/qa-character-sheets.mjs [nara orin ivo sena] [--bbox]",
);
const selected = args.filter((arg) => characters.includes(arg));
const showBbox = args.includes("--bbox");
const report = JSON.parse(
  await readFile(
    new URL("src/game/assets/character/canonicalization-report.json", root),
    "utf8",
  ),
);
const cell = 256,
  sheet = 2048,
  left = 144,
  top = 96;
const width = left + sheet + 16,
  height = top + sheet + 64;
const summary = [];
await mkdir(output, { recursive: true });

for (const character of selected.length ? [...new Set(selected)] : characters) {
  const path = new URL(
    `src/game/assets/character/${character}/source.png`,
    root,
  );
  const source = await readFile(path);
  const meta = await sharp(source).metadata();
  assert.equal(meta.width, sheet, `${character}: width must be 2048`);
  assert.equal(meta.height, sheet, `${character}: height must be 2048`);
  assert.equal(meta.channels, 4, `${character}: RGBA required`);
  assert.equal(meta.hasAlpha, true);
  assert.equal(meta.isPalette, false);
  const characterReport = report.characters.find(
    (item) => item.character === character,
  );
  assert(characterReport && characterReport.frames.length === 64);
  const pixels = await sharp(source).raw().toBuffer();
  const frames = [];
  const overlay = [];
  const background = [];
  for (let row = 0; row < 8; row++) {
    const y = top + row * cell;
    overlay.push(
      `<text x="12" y="${y + 128}" fill="#dfe7ef" font-size="18">${row} ${characterReport.rows[row]}</text>`,
    );
    for (let column = 0; column < 8; column++) {
      const x = left + column * cell;
      if (!row)
        overlay.push(
          `<text x="${x + 128}" y="78" text-anchor="middle" fill="#dfe7ef" font-size="17">${column} ${characterReport.columns[column]}</text>`,
        );
      background.push(
        `<rect x="${x}" y="${y}" width="256" height="256" fill="${(row + column) % 2 ? "#203340" : "#172b38"}"/>`,
      );
      const rgba = Buffer.alloc(cell * cell * 4);
      let minX = cell,
        minY = cell,
        maxX = -1,
        maxY = -1,
        alphaPixels = 0;
      for (let yy = 0; yy < cell; yy++) {
        const start = ((row * cell + yy) * sheet + column * cell) * 4;
        pixels.copy(rgba, yy * cell * 4, start, start + cell * 4);
        for (let xx = 0; xx < cell; xx++) {
          if (!pixels[start + xx * 4 + 3]) continue;
          minX = Math.min(minX, xx);
          minY = Math.min(minY, yy);
          maxX = Math.max(maxX, xx);
          maxY = Math.max(maxY, yy);
          alphaPixels++;
        }
      }
      assert(alphaPixels > 0, `${character}: empty slot ${row},${column}`);
      const original = characterReport.frames[row * 8 + column];
      assert.deepEqual(original.targetFoot, { x: 128, y: 220 });
      const bbox = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
      frames.push({
        animation: original.animation,
        direction: original.direction,
        alphaPixels,
        bbox,
        targetFoot: original.targetFoot,
        boundaryAlphaPixels: original.boundaryAlphaPixels,
        requiresVfxReview: original.requiresVfxReview,
        sha256: createHash("sha256").update(rgba).digest("hex"),
      });
      overlay.push(
        `<rect x="${x}" y="${y}" width="256" height="256" fill="none" stroke="#526675"/>`,
      );
      overlay.push(
        `<path d="M${x} ${y + 220}h256" stroke="#68dce7" stroke-opacity=".7" stroke-dasharray="5 4"/>`,
      );
      overlay.push(
        `<path d="M${x + 116} ${y + 220}h24 M${x + 128} ${y + 208}v24" stroke="#ff7fc5" stroke-width="2"/>`,
      );
      if (showBbox)
        overlay.push(
          `<rect x="${x + minX}" y="${y + minY}" width="${bbox.width}" height="${bbox.height}" fill="none" stroke="#ffd56a" stroke-opacity=".85"/>`,
        );
      if (original.boundaryAlphaPixels)
        overlay.push(
          `<text x="${x + 8}" y="${y + 22}" font-size="14" fill="${original.requiresVfxReview ? "#ff958b" : "#ffd56a"}">source boundary: ${original.boundaryAlphaPixels}${original.requiresVfxReview ? " / REVIEW" : ""}</text>`,
        );
    }
  }
  const svg = (content) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="Arial, sans-serif">${content}</svg>`,
    );
  const title = `<text x="16" y="32" fill="#ffffff" font-size="23">LIMIAR / ${character.toUpperCase()} / source.png / 64 slots at native size</text>`;
  const legend = `<text x="${left}" y="${height - 27}" fill="#dfe7ef" font-size="16">Pink: explicit pivot (128,220) | Cyan: ground line${showBbox ? " | Yellow: alpha bbox (includes VFX, not feet)" : ""}</text>`;
  const filename = `${character}${showBbox ? "-bbox" : ""}.png`;
  const png = await sharp({
    create: { width, height, channels: 4, background: "#101c25" },
  })
    .composite([
      { input: svg(background.join("")), left: 0, top: 0 },
      { input: source, left, top },
      { input: svg(title + overlay.join("") + legend), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  const rendered = await sharp(png).metadata();
  assert.equal(rendered.width, width);
  assert.equal(rendered.height, height);
  await writeFile(new URL(filename, output), png);
  const duplicateWalk3 = frames
    .slice(24, 32)
    .every((frame, i) => frame.sha256 === frames[32 + i].sha256);
  summary.push({
    character,
    width: meta.width,
    height: meta.height,
    mode: "RGBA",
    slots: frames.length,
    duplicateWalk3,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    frames,
  });
  console.log(
    `${character}: 2048x2048 RGBA; 64 occupied slots; walk3=${duplicateWalk3 ? "walk2" : "distinct"}; ${fileURLToPath(new URL(filename, output))}`,
  );
}
await writeFile(
  new URL("validation.json", output),
  JSON.stringify(summary, null, 2) + "\n",
);
