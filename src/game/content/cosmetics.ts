export const COSMETIC_TYPES = [
  "CHARACTER_SKIN",
  "WEAPON_SKIN",
  "PROJECTILE_EFFECT",
  "DEATH_EFFECT",
  "MOVEMENT_TRAIL",
  "PROFILE_FRAME",
  "EMOTE",
  "PROFILE_ICON",
  "SPAWN_EFFECT",
  "EVOLUTION_EFFECT",
] as const;
export const RARITIES = [
  "COMUM",
  "RARO",
  "ÉPICO",
  "LENDÁRIO",
  "MÍTICO",
] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];
export type Rarity = (typeof RARITIES)[number];
export interface Cosmetic {
  id: string;
  name: string;
  type: CosmeticType;
  rarity: Rarity;
  color: string;
  glyph: string;
  character?: string;
  gold: number;
  gems?: number;
  fragments: number;
}
const colors = ["#b9c8b8", "#7ed4cc", "#b6a0df", "#e6c583", "#f0afb6"];
// Visual data only: no HP, damage, cooldown, range or hitbox fields.
export const COSMETICS: Record<string, Cosmetic> = Object.fromEntries(
  COSMETIC_TYPES.flatMap((type, t) =>
    RARITIES.map((rarity, r) => {
      const id = type.toLowerCase() + "_" + r;
      return [
        id,
        {
          id,
          type,
          rarity,
          name:
            ["Memória", "Maré", "Véu", "Aurora", "Limiar"][r] +
            " · " +
            [
              "Vestes",
              "Arsenal",
              "Faísca",
              "Despedida",
              "Rastro",
              "Moldura",
              "Saudação",
              "Selo",
              "Despertar",
              "Ascensão",
            ][t],
          color: colors[r],
          glyph: ["◇", "✧", "❖", "✦", "✺"][r],
          gold: [30, 100, 250, 600, 1500][r],
          gems: r === 0 ? 300 : undefined,
          fragments: [25, 75, 200, 500, 1200][r],
        },
      ];
    }),
  ),
) as Record<string, Cosmetic>;
export const SHOP_CATEGORIES = [
  "DESTAQUES",
  "SKINS",
  "SKINS DE ARMAS",
  "EFEITOS",
  "CONSUMÍVEIS PVE",
  "PACOTES",
  "GACHA",
] as const;
export function cosmeticVisual(loadout: Record<string, string>) {
  const get = (type: CosmeticType) => COSMETICS[loadout[type]];
  return {
    skin: get("CHARACTER_SKIN"),
    weapon: get("WEAPON_SKIN"),
    projectile: get("PROJECTILE_EFFECT"),
    trail: get("MOVEMENT_TRAIL"),
    frame: get("PROFILE_FRAME"),
    icon: get("PROFILE_ICON"),
    emote: get("EMOTE"),
    spawn: get("SPAWN_EFFECT"),
    death: get("DEATH_EFFECT"),
    evolution: get("EVOLUTION_EFFECT"),
  };
}
