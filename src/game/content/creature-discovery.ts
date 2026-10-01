import { BOSS_EVENTS, ENEMY_DEFINITIONS } from "./catalog";
import type { Enemy } from "../core/types";

const bossIds = new Map(
  BOSS_EVENTS.map((boss) => [boss.name, `boss:${boss.id}`]),
);
export const CREATURE_DISCOVERY_IDS = new Set([
  ...Object.keys(ENEMY_DEFINITIONS),
  ...bossIds.values(),
  "boss:custodian",
]);

/** Old `boss` discovery remains valid but cannot reveal a particular named boss. */
export function creatureDiscoveryId(enemy: Pick<Enemy, "type" | "name">) {
  if (enemy.type !== "boss") return enemy.type;
  return (
    bossIds.get(enemy.name) ??
    (enemy.name === ENEMY_DEFINITIONS.boss.name ? "boss:custodian" : "boss")
  );
}
export function discoverCreature(
  discovered: string[],
  enemy: Pick<Enemy, "type" | "name">,
) {
  if (!discovered.includes(enemy.type)) discovered.push(enemy.type);
  const id = creatureDiscoveryId(enemy);
  if (!discovered.includes(id)) discovered.push(id);
}
