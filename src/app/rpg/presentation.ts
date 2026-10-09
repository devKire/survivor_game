import type {
  CombatModifierDefinition,
  CombatStatKey,
  RpgRarity,
} from "../../game/core/rpg";

export const statLabels: Record<CombatStatKey, string> = {
  maxHealth: "Vida máxima",
  speed: "Velocidade",
  armor: "Armadura",
  damage: "Dano",
  area: "Área",
  cooldown: "Cooldown",
  duration: "Duração",
  pickupRange: "Coleta",
  luck: "Sorte",
  critChance: "Chance crítica",
  recovery: "Recuperação",
};
export const slotLabels = {
  WEAPON: "Arma RPG",
  ARMOR: "Armadura RPG",
  CHARM: "Talismã",
};
export const rarityLabels: Record<RpgRarity, string> = {
  COMMON: "Comum",
  RARE: "Raro",
  EPIC: "Épico",
  LEGENDARY: "Lendário",
};
export function statValue(key: CombatStatKey, value: number) {
  return key === "critChance"
    ? `${(value * 100).toFixed(2)}%`
    : value.toFixed(2);
}
export function modifierText(modifier: CombatModifierDefinition) {
  const { operation, value, stat } = modifier;
  const amount =
    operation === "MULTIPLY"
      ? `×${value.toFixed(3)}`
      : operation === "ADD_PERCENT"
        ? `${value >= 0 ? "+" : ""}${+(value * 100).toFixed(3)}%`
        : `${value >= 0 ? "+" : ""}${statValue(stat, value)}`;
  return `${statLabels[stat]} ${amount}`;
}
