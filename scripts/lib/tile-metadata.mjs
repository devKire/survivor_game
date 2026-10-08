import sharp from "sharp";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
export const root = new URL("../../src/game/assets/tiles/", import.meta.url);
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const discoverSources = async () =>
  (await readdir(root, { recursive: true }))
    .filter((p) => /(^|\/)source(?:-[a-z0-9]+)?\.png$/.test(p))
    .sort();
const rounded = (n) => Math.round(n * 10000) / 10000;
const bounds = (xs, ys) => ({
  x: Math.min(...xs),
  y: Math.min(...ys),
  width: Math.max(...xs) - Math.min(...xs) + 1,
  height: Math.max(...ys) - Math.min(...ys) + 1,
});

// A narrow 3-pixel strip rejects valleys that are merely a single antialias row.
function separators(data, w, h, axis, start, end, expected, ground) {
  const extent = axis === "x" ? w : h;
  const value = (a, b) => {
    const i = ((axis === "x" ? b : a) * w + (axis === "x" ? a : b)) * 4;
    return ground
      ? (data[i] + data[i + 1] + data[i + 2]) / 3
      : data[i + 3] >= 128
        ? 1
        : 0;
  };
  const line = (a) => {
    let sum = 0;
    for (let b = start; b < end; b++) sum += value(a, b);
    return sum / (end - start);
  };
  const confidences = [];
  const lines = expected.map((e, i) => {
    if (i === 0 || i === 8) return i === 0 ? 0 : extent;
    let best = e,
      score = Infinity,
      raw = 0;
    const radius = ground ? 5 : 19;
    for (
      let a = Math.max(5, e - radius);
      a <= Math.min(extent - 6, e + radius);
      a++
    ) {
      const v = ground
        ? line(a) - (line(a - 4) + line(a + 4)) / 2
        : (line(a - 1) + line(a) + line(a + 1)) / 3;
      const s = v + Math.abs(a - e) * (ground ? 0.03 : 0.00005);
      if (s < score) {
        score = s;
        best = a;
        raw = v;
      }
    }
    confidences.push(
      ground ? Math.min(1, Math.max(0, -raw / 12)) : Math.max(0, 1 - raw),
    );
    return best;
  });
  return { lines, confidence: Math.min(...confidences) };
}

function silhouette(data, imageWidth, rect) {
  const { x, y, width: w, height: h } = rect;
  const mask = new Uint8Array(w * h),
    xs = [],
    ys = [];
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const alpha = data[((y + yy) * imageWidth + x + xx) * 4 + 3];
      if (alpha > 0) {
        xs.push(xx);
        ys.push(yy);
      }
      if (alpha >= 128) mask[yy * w + xx] = 1;
    }
  assert(xs.length, "Empty prop slot");
  // Largest connected opaque component excludes detached leaves, sparks and debris.
  let largest = [];
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const component = [i];
      mask[i] = 0;
      for (let q = 0; q < component.length; q++) {
        const at = component[q],
          px = at % w,
          py = Math.floor(at / w);
        for (const n of [
          px ? at - 1 : -1,
          px < w - 1 ? at + 1 : -1,
          py ? at - w : -1,
          py < h - 1 ? at + w : -1,
        ])
          if (n >= 0 && mask[n]) {
            mask[n] = 0;
            component.push(n);
          }
      }
      if (component.length > largest.length) largest = component;
    }
  assert(largest.length > 10, "No stable opaque base in prop slot");
  const bodyY = largest.map((i) => Math.floor(i / w)).sort((a, b) => a - b);
  const baseY = bodyY[Math.floor((bodyY.length - 1) * 0.985)];
  const foot = largest.filter((i) => Math.floor(i / w) >= baseY - 3);
  const anchor = {
    x: rounded(foot.reduce((s, i) => s + (i % w), 0) / foot.length),
    y: baseY,
  };
  const bbox = bounds(xs, ys);
  let touches = 0,
    perimeter = 0;
  for (let yy = 0; yy < h; yy++)
    for (const xx of [0, w - 1]) {
      perimeter++;
      if (data[((y + yy) * imageWidth + x + xx) * 4 + 3] >= 128) touches++;
    }
  for (let xx = 0; xx < w; xx++)
    for (const yy of [0, h - 1]) {
      perimeter++;
      if (data[((y + yy) * imageWidth + x + xx) * 4 + 3] >= 128) touches++;
    }
  return {
    alphaBounds: bbox,
    anchor,
    normalizedAnchor: { x: rounded(anchor.x / w), y: rounded(anchor.y / h) },
    boundaryContact: rounded(touches / perimeter),
    bodyPixels: largest.length,
  };
}

export async function inspectSource(path, override) {
  const bytes = await readFile(new URL(path, root)),
    hash = sha256(bytes);
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, "png");
  if (override)
    assert.equal(
      hash,
      override.sha256,
      `${path}: override hash changed; review source again`,
    );
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    kind = path.startsWith("ground/") ? "ground" : "prop";
  const family = path.split("/").slice(1, -1).join("_");
  const uniform = (n) =>
    Array.from({ length: 9 }, (_, i) => Math.round((i * n) / 8));
  let confidence = 1;
  const expectedY = override?.y ?? uniform(h);
  const rows =
    kind === "ground" && override?.y
      ? { lines: override.y, confidence: 1 }
      : separators(data, w, h, "y", 0, w, expectedY, kind === "ground");
  confidence = Math.min(confidence, rows.confidence);
  const columns = [];
  const slots = [];
  const warnings = [];
  for (let row = 0; row < 8; row++) {
    const cols =
      kind === "ground" && override?.x
        ? { lines: override.x, confidence: 1 }
        : separators(
            data,
            w,
            h,
            "x",
            rows.lines[row],
            rows.lines[row + 1],
            override?.x ?? uniform(w),
            kind === "ground",
          );
    columns.push(cols.lines);
    confidence = Math.min(confidence, cols.confidence);
    for (let column = 0; column < 8; column++) {
      // Props may have staggered bases: per-column horizontal valleys refine the bands.
      const localRows =
        kind === "prop"
          ? separators(
              data,
              w,
              h,
              "y",
              cols.lines[column],
              cols.lines[column + 1],
              rows.lines,
              false,
            )
          : rows;
      confidence = Math.min(confidence, localRows.confidence);
      const inset = kind === "ground" ? 3 : 0;
      const rect = {
        x: cols.lines[column] + inset,
        y: localRows.lines[row] + inset,
        width: cols.lines[column + 1] - cols.lines[column] - inset * 2,
        height: localRows.lines[row + 1] - localRows.lines[row] - inset * 2,
      };
      const index = row * 8 + column;
      const shape = kind === "prop" ? silhouette(data, w, rect) : {};
      const contact = shape.boundaryContact ?? 0;
      if (contact > 0.02)
        warnings.push(
          `slot ${index}: ${(contact * 100).toFixed(1)}% opaque boundary contact; source art may touch neighbor`,
        );
      const tall =
        family.startsWith("trees_") ||
        (shape.alphaBounds?.height ?? 0) > rect.height * 0.68;
      slots.push({
        id: `${kind}_${family}_${path.includes("source-a") ? "a_" : path.includes("source-b") ? "b_" : ""}${String(index).padStart(2, "0")}`,
        index,
        row,
        column,
        rect,
        ...shape,
        weight: contact > 0.02 ? 0 : 1,
        tags: [family, "generic"],
        occlusion: kind === "ground" ? "ground" : tall ? "tall" : "low",
        collisionHint: "none",
      });
    }
  }
  const id = path
    .replace(/\/source/, "")
    .replace(/\.png$/, "")
    .replaceAll("/", "_");
  return {
    schemaVersion: 1,
    id,
    kind,
    family,
    image: `./${path.split("/").at(-1)}`,
    source: { width: w, height: h, sha256: hash, hasAlpha: !!meta.hasAlpha },
    grid: { columns: 8, rows: 8, slots: 64 },
    detection: {
      method:
        kind === "prop" ? "alpha-valley-per-band" : "dark-line-near-expected",
      confidence: override?.reviewedConfidence ?? rounded(confidence),
      measuredConfidence: rounded(confidence),
      review: override?.reason ?? null,
      rows: rows.lines,
      columns,
    },
    warnings,
    slots,
  };
}
export function validateMetadata(m) {
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.slots.length, 64);
  assert(
    m.detection.confidence >= 0.8,
    `${m.id}: confidence ${m.detection.confidence} < .8. Add a SHA-bound reviewed override in scripts/tile-layout-overrides.json; no metadata was written.`,
  );
  for (const [index, s] of m.slots.entries()) {
    assert.equal(s.index, index);
    assert.equal(s.row, Math.floor(index / 8));
    assert.equal(s.column, index % 8);
    const r = s.rect;
    assert([r.x, r.y, r.width, r.height].every(Number.isInteger));
    assert(
      r.x >= 0 &&
        r.y >= 0 &&
        r.width > 0 &&
        r.height > 0 &&
        r.x + r.width <= m.source.width &&
        r.y + r.height <= m.source.height,
      `${m.id} ${index}: invalid rect`,
    );
    if (m.kind === "prop")
      assert(
        s.anchor.x >= 0 &&
          s.anchor.x < r.width &&
          s.anchor.y >= 0 &&
          s.anchor.y < r.height,
      );
  }
}
