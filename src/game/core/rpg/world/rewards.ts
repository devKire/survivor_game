import { z } from "zod";
export const worldFieldResult = z
  .object({
    version: z.literal(1),
    source: z.literal("FIELD_ENEMY_DEFEAT"),
    eligible: z.boolean(),
    previousLevel: z.number().int().min(1).max(100),
    newLevel: z.number().int().min(1).max(100),
    pointsGranted: z.number().int().min(0),
    materials: z
      .array(
        z
          .object({
            materialId: z.string().max(80),
            quantity: z.number().int().min(1).max(1),
          })
          .strict(),
      )
      .max(1),
    equipment: z
      .array(
        z
          .object({
            id: z.string().max(100),
            itemId: z.string().max(80),
            rarity: z.literal("COMMON"),
            level: z.literal(1),
            affixes: z.array(z.unknown()).max(6),
          })
          .strict(),
      )
      .max(1),
  })
  .strict();
export const worldFieldHistory = z.object({
  rewards: z
    .array(
      z.object({
        id: z.uuid(),
        characterId: z.string(),
        xp: z.number().int(),
        revision: z.number().int(),
        result: worldFieldResult,
        at: z.string(),
      }),
    )
    .max(20),
  nextCursor: z.uuid().nullable(),
});
export type WorldFieldResult = z.infer<typeof worldFieldResult>;
