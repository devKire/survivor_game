import sharp from "sharp";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = fileURLToPath(
  new URL("../src/game/assets/character/", import.meta.url),
);
const size = 2048,
  cell = 256,
  padding = 3;
const directions = [
  "south",
  "southwest",
  "west",
  "northwest",
  "north",
  "northeast",
  "east",
  "southeast",
];
const rows = [
  "idle0",
  "walk0",
  "walk1",
  "walk2",
  "walk3",
  "attack0",
  "attack1",
  "attack2",
];
// Visual row separators in the supplied 1254px references. Their bands are not
// equally tall, so dividing height by eight would cut feet and attack effects.
// These are band boundaries, never individual sprite rectangles.
const layouts = {
  nara: {
    y: [0, 185, 361, 536, 717, 887, 1055, 1254],
    map: [0, 1, 2, 3, 3, 4, 5, 6],
  },
  orin: {
    y: [0, 180, 332, 487, 643, 802, 955, 1102, 1254],
    map: [0, 1, 2, 3, 4, 5, 6, 7],
  },
  ivo: {
    y: [0, 190, 365, 542, 725, 902, 1070, 1254],
    map: [0, 1, 2, 3, 3, 4, 5, 6],
  },
  sena: {
    y: [0, 179, 347, 514, 682, 844, 987, 1117, 1254],
    map: [0, 1, 2, 3, 4, 5, 6, 7],
  },
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

function rowSeparators(data, width, layout, column) {
  const left = Math.round((column * width) / 8);
  const right = Math.round(((column + 1) * width) / 8);
  return layout.y.map((expected, i) => {
    if (i === 0 || i === layout.y.length - 1) return expected;
    let best = expected,
      bestScore = Infinity;
    for (let y = expected - 19; y <= expected + 19; y++) {
      let score = 0;
      for (let yy = y - 1; yy <= y + 1; yy++)
        for (let x = left; x < right; x++) {
          const a = data[(yy * width + x) * 4 + 3];
          score += a * a;
        }
      score += Math.abs(y - expected) * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = y;
      }
    }
    return best;
  });
}

function columnSeparators(data, width, top, bottom) {
  return Array.from({ length: 9 }, (_, i) => {
    if (i === 0 || i === 8) return i === 0 ? 0 : width;
    const expected = Math.round((i * width) / 8);
    let best = expected,
      bestScore = Infinity;
    for (let x = expected - 25; x <= expected + 25; x++) {
      let score = 0;
      for (let y = top; y < bottom; y++)
        for (let xx = x - 1; xx <= x + 1; xx++) {
          const a = data[(y * width + xx) * 4 + 3];
          score += a * a;
        }
      score += Math.abs(x - expected) * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best;
  });
}

function extract(data, width, region) {
  let minX = region.right,
    minY = region.bottom,
    maxX = -1,
    maxY = -1;
  let pixels = 0;
  for (let y = region.top; y < region.bottom; y++)
    for (let x = region.left; x < region.right; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pixels++;
      }
  assert(pixels > 0, `Região vazia: ${JSON.stringify(region)}`);
  // Detect feet in the lower central body band. Disconnected VFX remain in the
  // alpha bbox; they are deliberately excluded only from the anchor estimate.
  const w = region.right - region.left;
  const center = (region.left + region.right) / 2;
  let footY = -1,
    footX = center;
  for (let y = region.bottom - 1; y >= Math.floor((minY + maxY) / 2); y--) {
    const xs = [];
    for (let x = Math.ceil(center - w * 0.25); x < center + w * 0.25; x++)
      if (data[(y * width + x) * 4 + 3] >= 180) xs.push(x);
    if (xs.length >= 4) {
      footY = y + 1;
      // Average the foot silhouette over its bottom 10px to avoid a single toe
      // or antialias pixel deciding the horizontal origin.
      let sum = 0,
        count = 0;
      for (let yy = Math.max(minY, y - 9); yy <= y; yy++)
        for (let x = Math.ceil(center - w * 0.25); x < center + w * 0.25; x++)
          if (data[(yy * width + x) * 4 + 3] >= 180) {
            sum += x;
            count++;
          }
      footX = Math.round(sum / count);
      break;
    }
  }
  assert(footY >= 0, `Pés não identificáveis: ${JSON.stringify(region)}`);
  let boundaryAlphaPixels = 0;
  for (let y = region.top; y < region.bottom; y++)
    for (const x of [region.left, region.right - 1])
      if (x > 0 && x < width - 1 && data[(y * width + x) * 4 + 3] >= 128)
        boundaryAlphaPixels++;
  for (let x = region.left; x < region.right; x++)
    for (const y of [region.top, region.bottom - 1])
      if (y > 0 && y < 1253 && data[(y * width + x) * 4 + 3] >= 128)
        boundaryAlphaPixels++;
  const bw = maxX - minX + 1,
    bh = maxY - minY + 1;
  const rgba = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++)
    data.copy(
      rgba,
      y * bw * 4,
      ((minY + y) * width + minX) * 4,
      ((minY + y) * width + maxX + 1) * 4,
    );
  return {
    region,
    bbox: { x: minX, y: minY, width: bw, height: bh },
    pixels,
    boundaryAlphaPixels,
    foot: { x: footX, y: footY },
    rgba,
  };
}

async function prepare(character, layout) {
  const dir = `${root}${character}/`,
    path = `${dir}source.png`,
    backup = `${dir}source.reference.png`;
  const original = await readFile((await exists(backup)) ? backup : path);
  const meta = await sharp(original).metadata();
  assert(
    meta.width === 1254 && meta.height === 1254 && meta.hasAlpha,
    `${character}: esperado PNG fonte 1254×1254 com alpha; não sobrescreva a referência com uma sheet diferente.`,
  );
  const { data, info } = await sharp(original)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  const frames = [];
  const separators = Array.from({ length: 8 }, (_, column) =>
    rowSeparators(data, info.width, layout, column),
  );
  const columns = layout.y
    .slice(0, -1)
    .map((top, i) => columnSeparators(data, info.width, top, layout.y[i + 1]));
  for (let row = 0; row < 8; row++)
    for (let column = 0; column < 8; column++) {
      const sourceRow = layout.map[row];
      frames.push({
        row,
        column,
        sourceRow,
        ...extract(data, info.width, {
          left: columns[sourceRow][column],
          right: columns[sourceRow][column + 1],
          top: separators[column][sourceRow],
          bottom: separators[column][sourceRow + 1],
        }),
      });
    }
  let scale = 1;
  for (const f of frames) {
    const { x, y, width, height } = f.bbox;
    for (const [available, extent] of [
      [128 - padding, f.foot.x - x],
      [256 - 128 - padding, x + width - f.foot.x],
      [220 - padding, f.foot.y - y],
      [256 - 220 - padding, y + height - f.foot.y],
    ])
      if (extent > 0) scale = Math.min(scale, available / extent);
  }
  // One scale per character; no upscaling and no frame-by-frame normalization.
  scale = Math.floor(scale * 10000) / 10000;
  const canvas = Buffer.alloc(size * size * 4);
  const frameReport = [];
  for (const f of frames) {
    const width = Math.max(1, Math.round(f.bbox.width * scale));
    const height = Math.max(1, Math.round(f.bbox.height * scale));
    const rgba =
      scale === 1
        ? f.rgba
        : await sharp(f.rgba, {
            raw: { width: f.bbox.width, height: f.bbox.height, channels: 4 },
          })
            .resize(width, height, { kernel: "nearest", fit: "fill" })
            .raw()
            .toBuffer();
    const x = 128 - Math.round((f.foot.x - f.bbox.x) * scale);
    const y = 220 - Math.round((f.foot.y - f.bbox.y) * scale);
    assert(
      x >= padding - 1 &&
        y >= padding - 1 &&
        x + width <= cell - padding + 1 &&
        y + height <= cell - padding + 1,
      `${character} ${rows[f.row]} ${directions[f.column]}: recorte fora da célula.`,
    );
    for (let yy = 0; yy < height; yy++)
      rgba.copy(
        canvas,
        ((f.row * cell + y + yy) * size + f.column * cell + x) * 4,
        yy * width * 4,
        (yy + 1) * width * 4,
      );
    frameReport.push({
      animation: rows[f.row],
      direction: directions[f.column],
      sourceRow: f.sourceRow,
      region: f.region,
      bbox: f.bbox,
      sourceFoot: f.foot,
      destination: { x, y, width, height },
      targetFoot: { x: 128, y: 220 },
      sourceAlphaPixels: f.pixels,
      boundaryAlphaPixels: f.boundaryAlphaPixels,
      requiresVfxReview: f.boundaryAlphaPixels >= 8,
    });
  }
  const png = await sharp(canvas, {
    raw: { width: size, height: size, channels: 4 },
  })
    .png({ palette: false, compressionLevel: 9 })
    .toBuffer();
  return {
    character,
    path,
    backup,
    original,
    canvas,
    png,
    report: {
      character,
      width: size,
      height: size,
      mode: "RGBA",
      columns: directions,
      rows,
      scale,
      padding,
      slots: 64,
      idle: 8,
      walk: 32,
      attack: 24,
      sourceSha256: hash(original),
      canonicalSha256: hash(png),
      repeatedRow:
        layout.y.length === 8
          ? "walk3 is an exact copy of walk2, authorized by user"
          : null,
      visualLimitations:
        "Alpha compositing was visually reviewed on a solid background. Boundary contacts are recorded for review; no masking, repainting or reconstruction was applied. Structural validation alone does not certify VFX separation.",
      frames: frameReport,
    },
  };
}

async function validate(bytes, expected) {
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.width, size);
  assert.equal(meta.height, size);
  assert.equal(meta.channels, 4);
  assert.equal(meta.hasAlpha, true);
  assert.equal(meta.isPalette, false);
  const actual = await sharp(bytes).raw().toBuffer();
  assert(
    actual.equals(expected.canvas),
    `${expected.character}: pixels não correspondem aos recortes da referência.`,
  );
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      let count = 0;
      for (let y = row * cell; y < (row + 1) * cell; y++)
        for (let x = col * cell; x < (col + 1) * cell; x++)
          if (actual[(y * size + x) * 4 + 3]) count++;
      assert(count > 0, `${expected.character}: célula ${row},${col} vazia.`);
      if (expected.report.scale === 1)
        assert.equal(count, expected.report.frames[row * 8 + col].sourceAlphaPixels,
          `${expected.character}: perda de pixels alpha no recorte ${row},${col}.`);
    }
}

const checkOnly = process.argv.includes("--validate");
// Prepare and validate every character before changing any source.png.
const outputs = [];
for (const [name, layout] of Object.entries(layouts))
  outputs.push(await prepare(name, layout));
for (const output of outputs)
  await validate(checkOnly ? await readFile(output.path) : output.png, output);
if (!checkOnly) {
  for (const o of outputs) {
    if (!(await exists(o.backup)))
      await writeFile(o.backup, o.original, { flag: "wx" });
    await writeFile(o.path, o.png);
  }
  await writeFile(
    `${root}canonicalization-report.json`,
    JSON.stringify(
      { version: 1, characters: outputs.map((o) => o.report) },
      null,
      2,
    ) + "\n",
  );
}
for (const o of outputs)
  console.log(
    `${o.character}: ${checkOnly ? "estrutura validada" : "gerado"} 2048×2048 RGBA · 64 slots (8 idle / 32 walk / 24 attack) · escala ${o.report.scale}${o.report.repeatedRow ? " · walk3 repete walk2" : ""} · ${o.report.frames.filter((f) => f.requiresVfxReview).length} recortes com contato alpha significativo na fronteira`,
  );
