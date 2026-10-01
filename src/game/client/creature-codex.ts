import { BOSS_EVENTS, ENEMY_DEFINITIONS } from "../content/catalog";
import { creatureDiscoveryId } from "../content/creature-discovery";
import { esc } from "../core/math";
import { assetUrl } from "./character-art";
import { resolveCreatureArt } from "./creature-art";

const behaviors: Record<string, string> = {
  chase: "Perseguidor",
  ranged: "Atirador",
  burrow: "Escavador",
  sentinel: "Sentinela",
  herald: "Arauto",
  charger: "Investida",
  splitter: "Divisor",
  weaver: "Tecelão",
  boss: "Chefe",
  final: "Entidade final",
};
export function creatureCodexCard(type: string, name: string, seen: boolean) {
  // Locked cards never resolve an image or emit a URL/real name in their markup.
  if (!seen)
    return '<div class="card locked"><span class="sigil small">?</span><h2>???</h2><p>Ainda não encontrado.</p></div>';
  const art = resolveCreatureArt({ type, name });
  const portrait = art
    ? `<img src="${esc(assetUrl(art.portrait))}" alt="${esc(name)}" width="128" height="128" loading="lazy" style="object-fit:contain;image-rendering:pixelated" />`
    : '<span class="sigil small">◆</span>';
  return `<div class="card">${portrait}<h2>${esc(name)}</h2><p>Comportamento: ${esc(behaviors[ENEMY_DEFINITIONS[type]?.behavior] || "Desconhecido")}.</p></div>`;
}
export function creatureCodex(discovered: readonly string[]) {
  const regular = Object.entries(ENEMY_DEFINITIONS)
    .filter(([id]) => id !== "boss" && id !== "final")
    .map(([type, d]) =>
      creatureCodexCard(type, d.name, discovered.includes(type)),
    )
    .join("");
  const bosses = [
    { type: "boss", name: ENEMY_DEFINITIONS.boss.name },
    ...BOSS_EVENTS.map((b) => ({ type: "boss", name: b.name })),
    { type: "final", name: ENEMY_DEFINITIONS.final.name },
  ]
    .map((enemy) =>
      creatureCodexCard(
        enemy.type,
        enemy.name,
        discovered.includes(creatureDiscoveryId(enemy)),
      ),
    )
    .join("");
  return `<h3>Inimigos</h3><div class="cards meta">${regular}</div><h3>CHEFES</h3><div class="cards meta">${bosses}</div>`;
}
