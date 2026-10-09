import { z } from "zod";
import {
  RPG_ITEMS,
  RPG_CHARACTERS,
  type RpgCharacterId,
} from "../../content/rpg/catalog";
import {
  RPG_AFFIXES,
  RPG_AFFIX_POOLS,
  RPG_RARITY_RULES,
} from "../../content/rpg/affixes";
import {
  RPG_ITEM_SLOTS,
  RPG_RARITIES,
  type RpgItemSlot,
  type RpgRarity,
} from "./types";
import { combatModifierSchema } from "./stat-resolver";
import {
  COMBAT_STAT_KEYS,
  type RpgEquipmentDefinition,
  type RpgAffixDefinition,
  type RpgEquipment,
  type CombatModifier,
} from "./combat-types";

export const rpgCharacterIdSchema = z.enum(["nara", "orin", "ivo", "sena"]);
const itemLevel = z.number().int().min(1).max(100);
export const equipmentDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/),
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(300),
    slot: z.enum(RPG_ITEM_SLOTS),
    baseRarity: z.enum(RPG_RARITIES),
    minLevel: itemLevel,
    allowedCharacters: z
      .array(rpgCharacterIdSchema)
      .min(1)
      .max(4)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    baseModifiers: z
      .array(
        z
          .object({
            stat: z.enum(COMBAT_STAT_KEYS),
            operation: z.enum(["FLAT", "ADD_PERCENT", "MULTIPLY"]),
            value: z.number().finite(),
          })
          .strict(),
      )
      .max(8),
    affixPoolId: z.string(),
    contentVersion: z.literal(1),
  })
  .strict();

export function validateEquipmentDefinition(
  value: unknown,
): RpgEquipmentDefinition {
  const definition = equipmentDefinitionSchema.parse(value);
  const pool = RPG_AFFIX_POOLS[definition.affixPoolId];
  if (
    !pool ||
    !pool.every((id) =>
      (RPG_AFFIXES[id].allowedSlots as readonly string[]).includes(
        definition.slot,
      ),
    )
  )
    throw new RangeError("Pool de affixes incompatível.");
  for (const modifier of definition.baseModifiers)
    combatModifierSchema.parse({ ...modifier, sourceId: "definition" });
  return definition;
}

export function equipmentDefinition(
  id: string,
  contentVersion = 1,
): RpgEquipmentDefinition {
  if (!Object.hasOwn(RPG_ITEMS, id) || contentVersion !== 1)
    throw new RangeError("Definição ou versão do equipamento indisponível.");
  return RPG_ITEMS[id as keyof typeof RPG_ITEMS];
}
const affixSchema = z
  .object({
    id: z.string().max(60),
    tier: z.number().int().min(1).max(3),
    value: z.number().finite(),
  })
  .strict();
const seedSchema = z.string().min(1).max(128);
export const equipmentSchema = z
  .object({
    id: z.string().min(1).max(100),
    itemId: z.string().min(1).max(60),
    rarity: z.enum(RPG_RARITIES),
    level: itemLevel,
    quantity: z.number().int().min(1).max(9999),
    contentVersion: z.literal(1),
    rollSeed: seedSchema.nullable(),
    affixes: z.array(affixSchema).max(3),
  })
  .strict();

function random(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++)
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
export function affixRange(definition: RpgAffixDefinition, tier: number) {
  const factor = 1 + 0.25 * (tier - 1);
  return {
    min: Math.ceil((definition.minValue * factor) / definition.step - 1e-8),
    max: Math.floor((definition.maxValue * factor) / definition.step + 1e-8),
  };
}

export function rollEquipmentAffixes(
  definition: RpgEquipmentDefinition,
  rarity: RpgRarity,
  level: number,
  seed: string,
) {
  validateEquipmentDefinition(definition);
  z.enum(RPG_RARITIES).parse(rarity);
  itemLevel.parse(level);
  seedSchema.parse(seed);
  const rng = random(
    `${definition.contentVersion}:${definition.id}:${rarity}:${level}:${seed}`,
  );
  const rarityRule = RPG_RARITY_RULES[rarity];
  const tier = Math.min(rarityRule.maxTier, 1 + Math.floor((level - 1) / 30));
  const pool = [...RPG_AFFIX_POOLS[definition.affixPoolId]];
  const result = [];
  for (let i = 0; i < rarityRule.maxAffixes && pool.length; i++) {
    let weight =
      rng() * pool.reduce((sum, id) => sum + RPG_AFFIXES[id].weight, 0);
    let selected = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      weight -= RPG_AFFIXES[pool[j]].weight;
      if (weight < 0) {
        selected = j;
        break;
      }
    }
    const [id] = pool.splice(selected, 1),
      affix = RPG_AFFIXES[id];
    const range = affixRange(affix, tier);
    const value = Number(
      (
        (range.min + Math.floor(rng() * (range.max - range.min + 1))) *
        affix.step
      ).toFixed(6),
    );
    result.push({ id, tier, value });
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Old instances have null seed and no affixes. Rolled data must match its seed. */
export function validateEquipment(value: unknown): RpgEquipment {
  const item = equipmentSchema.parse(value),
    definition = equipmentDefinition(item.itemId, item.contentVersion);
  const rule = RPG_RARITY_RULES[item.rarity];
  if (
    item.affixes.length > rule.maxAffixes ||
    new Set(item.affixes.map((a) => a.id)).size !== item.affixes.length
  )
    throw new RangeError("Quantidade ou repetição de affixes inválida.");
  for (const a of item.affixes) {
    if (
      !Object.hasOwn(RPG_AFFIXES, a.id) ||
      !RPG_AFFIX_POOLS[definition.affixPoolId].includes(
        a.id as keyof typeof RPG_AFFIXES,
      )
    )
      throw new RangeError("Affix não permitido.");
    const d = RPG_AFFIXES[a.id as keyof typeof RPG_AFFIXES],
      range = affixRange(d, a.tier);
    const units = a.value / d.step;
    if (
      !(d.allowedSlots as readonly string[]).includes(definition.slot) ||
      a.tier > Math.min(rule.maxTier, 1 + Math.floor((item.level - 1) / 30)) ||
      units < range.min - 1e-8 ||
      units > range.max + 1e-8 ||
      Math.abs(units - Math.round(units)) > 1e-8
    )
      throw new RangeError("Roll de affix inválido.");
  }
  const expected =
    item.rollSeed === null
      ? []
      : rollEquipmentAffixes(
          definition,
          item.rarity,
          item.level,
          item.rollSeed,
        );
  if (JSON.stringify(item.affixes) !== JSON.stringify(expected))
    throw new RangeError("Affixes não correspondem à seed persistida.");
  return item;
}

export function equipmentRequirement(item: RpgEquipment) {
  return Math.max(
    item.level,
    equipmentDefinition(item.itemId, item.contentVersion).minLevel,
  );
}
export function assertCanEquip(
  item: RpgEquipment,
  character: { characterId: string; level: number },
  slot: RpgItemSlot,
) {
  const valid = validateEquipment(item),
    definition = equipmentDefinition(valid.itemId, valid.contentVersion);
  if (!Object.hasOwn(RPG_CHARACTERS, character.characterId))
    throw new RangeError("Personagem inválido.");
  itemLevel.parse(character.level);
  if (item.quantity !== 1)
    throw new RangeError("Separe a pilha antes de equipar uma unidade.");
  if (definition.slot !== slot)
    throw new RangeError("Slot incompatível com o equipamento.");
  if (character.level < equipmentRequirement(item))
    throw new RangeError("Nível RPG insuficiente para este equipamento.");
  if (
    definition.allowedCharacters &&
    !definition.allowedCharacters.includes(
      character.characterId as RpgCharacterId,
    )
  )
    throw new RangeError("Equipamento incompatível com este personagem.");
}
export function equipmentModifiers(item: RpgEquipment): CombatModifier[] {
  const definition = equipmentDefinition(item.itemId, item.contentVersion);
  return [
    ...definition.baseModifiers.map((m) => ({
      ...m,
      sourceId: `rpg-item:${item.id}`,
    })),
    ...item.affixes.map((a) => {
      const d = RPG_AFFIXES[a.id as keyof typeof RPG_AFFIXES];
      return {
        sourceId: `rpg-affix:${item.id}:${a.id}`,
        stat: d.stat,
        operation: d.operation,
        value: a.value,
      };
    }),
  ];
}
