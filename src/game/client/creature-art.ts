import type { StaticImageData } from "next/image";
import type { Enemy } from "../core/types";
import husk from "../assets/enemy/errante_de_xisto/portrait.png";
import dart from "../assets/enemy/rasante/portrait.png";
import tank from "../assets/enemy/muralha_oca/portrait.png";
import swarm from "../assets/enemy/cisco_vivo/portrait.png";
import ranged from "../assets/enemy/cantor_de_fendas/portrait.png";
import elite from "../assets/enemy/arauto_de_basalto/portrait.png";
import boss from "../assets/enemy/custodio/portrait.png";
import burrower from "../assets/enemy/escavador_da_nevoa/portrait.png";
import sentinel from "../assets/enemy/sentinela_de_vidro/portrait.png";
import herald from "../assets/enemy/arauto_do_veu/portrait.png";
import charger from "../assets/enemy/rasgador_de_laje/portrait.png";
import splitter from "../assets/enemy/partilhado/portrait.png";
import shardling from "../assets/enemy/lasca_viva/portrait.png";
import weaver from "../assets/enemy/tecelão_da_mare/portrait.png";
import stone_bell from "../assets/boss/o_sineiro_de_pedra/portrait.png";
import copper_doe from "../assets/boss/a_corça_de_cobre/portrait.png";
import rift_mother from "../assets/boss/mae_das_fendas/portrait.png";
import blind_cartographer from "../assets/boss/o_cartografo_cego/portrait.png";
import wandering_cathedral from "../assets/boss/a_catedral_errante/portrait.png";
import faceless_pilgrim from "../assets/boss/o_peregrino_sem_face/portrait.png";
import eye_beneath_stone from "../assets/boss/o_olho_sob_a_pedra/portrait.png";
import ash_king from "../assets/boss/o_rei_das_cinzas/portrait.png";
import abyss_voice from "../assets/boss/a_voz_do_abismo/portrait.png";
import last_custodian from "../assets/boss/o_ultimo_custodio/portrait.png";
import final from "../assets/boss/a_boca_do_firmamento/portrait.png";

/** Visual units are independent of the physical collision radius. Pivots were
 * measured at the feet/base (central aperture for final), excluding floating VFX. */
export interface CreatureArt {
  portrait: StaticImageData | string;
  worldHeight: number;
  footY: number;
  groundOffsetY: number;
}
function art(
  portrait: CreatureArt["portrait"],
  worldHeight: number,
  footY: number,
  groundOffsetY: number,
): CreatureArt {
  return { portrait, worldHeight, footY, groundOffsetY };
}
export const ENEMY_ART: Readonly<Record<string, CreatureArt>> = {
  husk: art(husk, 64, 0.86, 6),
  dart: art(dart, 46, 0.78, 3),
  tank: art(tank, 90, 0.85, 10),
  swarm: art(swarm, 30, 0.72, 3),
  ranged: art(ranged, 66, 0.78, 5),
  elite: art(elite, 114, 0.87, 12),
  boss: art(boss, 150, 0.85, 16),
  burrower: art(burrower, 66, 0.77, 6),
  sentinel: art(sentinel, 78, 0.86, 8),
  herald: art(herald, 74, 0.87, 6),
  charger: art(charger, 68, 0.77, 7),
  splitter: art(splitter, 70, 0.83, 7),
  shardling: art(shardling, 30, 0.77, 3),
  weaver: art(weaver, 78, 0.8, 7),
  final: art(final, 300, 0.57, 0),
};
export const BOSS_ART: Readonly<Record<string, CreatureArt>> = {
  "O Sineiro de Pedra": art(stone_bell, 185, 0.87, 16),
  "A Corça de Cobre": art(copper_doe, 190, 0.89, 14),
  "Mãe das Fendas": art(rift_mother, 190, 0.86, 16),
  "O Cartógrafo Cego": art(blind_cartographer, 195, 0.87, 14),
  "A Catedral Errante": art(wandering_cathedral, 260, 0.88, 18),
  "O Peregrino Sem Face": art(faceless_pilgrim, 205, 0.9, 16),
  "O Olho Sob a Pedra": art(eye_beneath_stone, 170, 0.83, 14),
  "O Rei das Cinzas": art(ash_king, 205, 0.9, 16),
  "A Voz do Abismo": art(abyss_voice, 200, 0.84, 14),
  "O Último Custódio": art(last_custodian, 210, 0.88, 16),
};
export function resolveCreatureArt(
  enemy: Pick<Enemy, "type" | "name">,
): CreatureArt | undefined {
  if (enemy.type === "boss")
    return Object.hasOwn(BOSS_ART, enemy.name)
      ? BOSS_ART[enemy.name]
      : ENEMY_ART.boss;
  return Object.hasOwn(ENEMY_ART, enemy.type)
    ? ENEMY_ART[enemy.type]
    : undefined;
}
