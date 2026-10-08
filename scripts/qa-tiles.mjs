import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  root,
  discoverSources,
  validateMetadata,
  sha256,
} from "./lib/tile-metadata.mjs";
const output = new URL("../artifacts/tiles/qa/", import.meta.url);
await mkdir(output, { recursive: true });
const report = [];
for (const path of await discoverSources()) {
  const source = await readFile(new URL(path, root));
  const m = JSON.parse(
    await readFile(new URL(path.replace(".png", ".json"), root), "utf8"),
  );
  validateMetadata(m);
  if (sha256(source) !== m.source.sha256)
    throw Error(`${path}: stale metadata`);
  const width = m.source.width,
    height = m.source.height + 80;
  const elements = [
    `<rect width="${width}" height="80" fill="#10202b"/><text x="12" y="25" fill="white" font-size="19">${m.id} | confidence ${m.detection.confidence} | measured ${m.detection.measuredConfidence}</text><text x="12" y="51" fill="#ffe397" font-size="16">Cyan: rect | yellow: alpha | pink: base | red: excluded | warnings ${m.warnings.length}</text>`,
  ];
  for (const s of m.slots) {
    const r = s.rect,
      y = r.y + 80;
    elements.push(
      `<rect x="${r.x}" y="${y}" width="${r.width}" height="${r.height}" fill="none" stroke="${s.weight ? "#62dee4" : "#ff5050"}"/><text x="${r.x + 4}" y="${y + 18}" fill="white" stroke="black" stroke-width=".5" font-size="18">${s.index}${s.weight ? "" : " REVIEW"}</text>`,
    );
    if (s.alphaBounds) {
      const b = s.alphaBounds,
        a = s.anchor;
      elements.push(
        `<rect x="${r.x + b.x}" y="${y + b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="#ffda6677"/><path d="M${r.x + a.x - 7} ${y + a.y}h14 M${r.x + a.x} ${y + a.y - 7}v14" stroke="#ff72c8" stroke-width="2"/>`,
      );
    }
  }
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="sans-serif">${elements.join("")}</svg>`,
  );
  await sharp({ create: { width, height, channels: 4, background: "#24343d" } })
    .composite([
      { input: source, left: 0, top: 80 },
      { input: overlay, left: 0, top: 0 },
    ])
    .png()
    .toFile(new URL(`${m.id}.png`, output).pathname);
  report.push({
    id: m.id,
    source: path,
    confidence: m.detection,
    excluded: m.slots.filter((s) => !s.weight).map((s) => s.index),
    warnings: m.warnings,
  });
}
await writeFile(
  new URL("validation.json", output),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(`QA: ${report.length} indexed source sheets; originals unchanged.`);
