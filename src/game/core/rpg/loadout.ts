import { z } from "zod";
import { rpgAttributesSchema, availableAttributePoints } from "./attributes";
import {
  assertCanEquip,
  equipmentDefinition,
  equipmentModifiers,
  equipmentSchema,
  rpgCharacterIdSchema,
  validateEquipment,
} from "./equipment";
import { RPG_ITEM_SLOTS } from "./types";
import type { RpgAttributes } from "./types";
import type { CombatModifier, RpgCombatLoadout } from "./combat-types";
import { compileCombatModifiers, RPG_RULESET_VERSION } from "./stat-resolver";

export function attributeModifiers(a: RpgAttributes): CombatModifier[] {
  rpgAttributesSchema.parse(a);
  const values: CombatModifier[] = [
    {
      sourceId: "rpg-attribute:vitality",
      stat: "maxHealth",
      operation: "FLAT",
      value: a.vitality,
    },
    {
      sourceId: "rpg-attribute:power",
      stat: "damage",
      operation: "ADD_PERCENT",
      value: a.power * 0.002,
    },
    {
      sourceId: "rpg-attribute:agility",
      stat: "speed",
      operation: "ADD_PERCENT",
      value: a.agility * 0.001,
    },
    {
      sourceId: "rpg-attribute:agility",
      stat: "cooldown",
      operation: "ADD_PERCENT",
      value: -a.agility * 0.0005,
    },
    {
      sourceId: "rpg-attribute:focus",
      stat: "critChance",
      operation: "FLAT",
      value: a.focus * 0.0005,
    },
    {
      sourceId: "rpg-attribute:focus",
      stat: "duration",
      operation: "ADD_PERCENT",
      value: a.focus * 0.001,
    },
    {
      sourceId: "rpg-attribute:will",
      stat: "recovery",
      operation: "FLAT",
      value: a.will * 0.005,
    },
    {
      sourceId: "rpg-attribute:will",
      stat: "armor",
      operation: "FLAT",
      value: a.will * 0.01,
    },
  ];
  return values.filter((m) => m.value !== 0);
}
const buildSchema = z
  .object({
    characterId: rpgCharacterIdSchema,
    level: z.number().int().min(1).max(100),
    attributes: rpgAttributesSchema,
    equipment: z.array(equipmentSchema).max(3),
    profileRevision: z.number().int().min(1).max(2147483647),
  })
  .strict();

/** Shared pure assembly. Server callers supply persisted rows, never client builds. */
export function createRpgCombatLoadout(input: unknown): RpgCombatLoadout {
  const build = buildSchema.parse(input);
  availableAttributePoints(build.level, build.attributes);
  const equipment = build.equipment
    .map((value) => {
      const item = validateEquipment(value),
        slot = equipmentDefinition(item.itemId, item.contentVersion).slot;
      assertCanEquip(item, build, slot);
      return { ...item, slot };
    })
    .sort(
      (a, b) => RPG_ITEM_SLOTS.indexOf(a.slot) - RPG_ITEM_SLOTS.indexOf(b.slot),
    );
  if (
    new Set(equipment.map((i) => i.slot)).size !== equipment.length ||
    new Set(equipment.map((i) => i.id)).size !== equipment.length
  )
    throw new RangeError("Equipamentos duplicados na build.");
  const modifiers = [
    ...attributeModifiers(build.attributes),
    ...equipment.flatMap(equipmentModifiers),
  ];
  compileCombatModifiers(modifiers);
  return deepFreeze({
    ...build,
    equipment,
    modifiers,
    rulesetVersion: RPG_RULESET_VERSION,
  });
}

/** Rebuilds derived values so serialized/forged modifiers can never become authority. */
export function validateCombatLoadout(
  input: RpgCombatLoadout,
): RpgCombatLoadout {
  if (input.rulesetVersion !== RPG_RULESET_VERSION)
    throw new RangeError("Versão de combate RPG indisponível.");
  const valid = createRpgCombatLoadout({
    characterId: input.characterId,
    level: input.level,
    attributes: input.attributes,
    profileRevision: input.profileRevision,
    equipment: input.equipment.map(({ slot, ...item }) => {
      if (slot !== equipmentDefinition(item.itemId, item.contentVersion).slot)
        throw new RangeError("Slot inválido na build.");
      return item;
    }),
  });
  if (JSON.stringify(valid.modifiers) !== JSON.stringify(input.modifiers))
    throw new RangeError("Modificadores da build inválidos.");
  return valid;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
