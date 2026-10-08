import { z } from "zod";
import {
  RPG_ATTRIBUTE_KEYS,
  RPG_ATTRIBUTE_MAX,
  RPG_MAX_LEVEL,
  RPG_POINTS_PER_LEVEL,
  type RpgAttribute,
  type RpgAttributeState,
  type RpgAttributes,
} from "./types";

const rank = z.number().int().min(0).max(RPG_ATTRIBUTE_MAX);
export const rpgAttributesSchema = z
  .object({
    vitality: rank,
    power: rank,
    agility: rank,
    focus: rank,
    will: rank,
  })
  .strict();

/** Total earned budget, never an increment to replay. Level 1 starts with zero. */
export function grantedAttributePoints(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > RPG_MAX_LEVEL)
    throw new RangeError("Nível RPG inválido.");
  return (level - 1) * RPG_POINTS_PER_LEVEL;
}

export function spentAttributePoints(attributes: RpgAttributes) {
  const parsed = rpgAttributesSchema.parse(attributes);
  return RPG_ATTRIBUTE_KEYS.reduce((sum, key) => sum + parsed[key], 0);
}

export function availableAttributePoints(
  level: number,
  attributes: RpgAttributes,
) {
  const available =
    grantedAttributePoints(level) - spentAttributePoints(attributes);
  if (available < 0)
    throw new RangeError("Atributos excedem os pontos concedidos.");
  return available;
}

export function initialRpgAttributes(level = 1): RpgAttributeState {
  return {
    level,
    attributePoints: grantedAttributePoints(level),
    attributes: { vitality: 0, power: 0, agility: 0, focus: 0, will: 0 },
  };
}

export function validateRpgAttributes(state: RpgAttributeState) {
  const available = availableAttributePoints(state.level, state.attributes);
  if (
    !Number.isInteger(state.attributePoints) ||
    state.attributePoints !== available
  )
    throw new RangeError("Saldo de atributos RPG inconsistente.");
  return state;
}

export function allocateAttributePoints(
  state: RpgAttributeState,
  attribute: RpgAttribute,
  amount: number,
): RpgAttributeState {
  validateRpgAttributes(state);
  if (
    !RPG_ATTRIBUTE_KEYS.includes(attribute) ||
    !Number.isInteger(amount) ||
    amount < 1
  )
    throw new RangeError("Distribuição de atributos inválida.");
  if (amount > state.attributePoints)
    throw new RangeError("Pontos de atributo insuficientes.");
  if (state.attributes[attribute] + amount > RPG_ATTRIBUTE_MAX)
    throw new RangeError("Limite do atributo atingido.");
  const attributes = {
    ...state.attributes,
    [attribute]: state.attributes[attribute] + amount,
  };
  return {
    ...state,
    attributes,
    attributePoints: availableAttributePoints(state.level, attributes),
  };
}

/** Pure preparation for future authoritative leveling; no XP source or grant API. */
export function attributesAtLevel(
  state: RpgAttributeState,
  level: number,
): RpgAttributeState {
  validateRpgAttributes(state);
  if (level < state.level)
    throw new RangeError("O nível RPG não pode diminuir.");
  return {
    level,
    attributes: { ...state.attributes },
    attributePoints: availableAttributePoints(level, state.attributes),
  };
}
