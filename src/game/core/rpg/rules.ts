import { RPG_CHARACTERS, type RpgCharacterId } from "../../content/rpg";
import { RPG_MAX_LEVEL, RPG_MAX_XP } from "./types";

export function isRpgCharacterId(value: string): value is RpgCharacterId {
  return Object.hasOwn(RPG_CHARACTERS, value);
}

export function accessibleRpgCharacters(unlocked: readonly string[]) {
  return [...new Set(unlocked.filter(isRpgCharacterId))];
}

export function canAccessRpgCharacter(
  characterId: string,
  unlocked: readonly string[],
) {
  return isRpgCharacterId(characterId) && unlocked.includes(characterId);
}

export function xpForRpgLevel(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > RPG_MAX_LEVEL)
    throw new RangeError("Nível RPG inválido.");
  return level === RPG_MAX_LEVEL
    ? Number.POSITIVE_INFINITY
    : 100 * level * level;
}

export function rpgLevelFromXp(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0 || xp > RPG_MAX_XP)
    throw new RangeError("XP RPG inválido.");
  let level = 1;
  while (level < RPG_MAX_LEVEL && xp >= xpForRpgLevel(level)) level++;
  return level;
}
