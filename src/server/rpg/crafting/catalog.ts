import "server-only";
import { z } from "zod";
import { db } from "../../db";
import { saveSchema } from "../../../game/core/save";
import { RPG_ITEMS } from "../../../game/content/rpg/catalog";
import {
  CRAFTING_RECIPES,
  REFINEMENT_RECIPES,
  VENDOR_STOCK,
  CRAFTING_LIMITS,
} from "../../../game/content/rpg/crafting";
import {
  assertRecipeRequirements,
  forgeItemPlan,
  vendorSaleGold,
} from "../../../game/core/rpg/crafting/rules";
import {
  craftingResultSchema,
  type CraftingOperation,
} from "../../../game/core/rpg/crafting/types";
import { equipmentModifiers } from "../../../game/core/rpg/equipment";
import { requireRpgCraftingEnabled } from "../guard";
import {
  assertActiveWorldServicePermit,
  recheckWorldServicePermit,
  hasWorldServicePermit,
} from "../world/service-context";
import { rpgEquipmentData } from "../equipment";
import { publicCraftingItem } from "./service";
import { UserError } from "../../security";
export const craftingStationSchema = z.enum([
  "refuge:forge",
  "refuge:refinery",
  "refuge:trader",
]);
export const craftingCatalogInput = z
  .object({ stationId: craftingStationSchema })
  .strict();
export const craftingHistoryInput = z
  .object({ stationId: craftingStationSchema, cursor: z.uuid().optional() })
  .strict();
function checkPermit() {
  requireRpgCraftingEnabled();
  if (!hasWorldServicePermit())
    throw new UserError("Utilize a estação dentro do mundo.");
}
export async function craftingCatalog(userId: string, input: unknown) {
  craftingCatalogInput.parse(input);
  checkPermit();
  return db().$transaction(
    async (tx) => {
      await assertActiveWorldServicePermit(tx, userId);
      const profile = await tx.rpgProfile.findUniqueOrThrow({
        where: { userId },
        include: {
          activeCharacter: true,
          materials: true,
          user: { select: { progress: { select: { data: true } } } },
        },
      });
      const character = profile.activeCharacter!;
      const flags = await tx.rpgStoryFlag.findMany({
        where: { userId },
        select: { flagId: true },
      });
      const usage = await tx.rpgCommerceRecord.groupBy({
        by: ["operation"],
        where: { userId, cycle: Math.floor(Date.now() / 86400000) },
        _count: { _all: true },
        _sum: { rareCreated: true, goldGranted: true },
      });
      const remaining = Object.fromEntries(
        Object.entries(CRAFTING_LIMITS.operations).map(([op, cap]) => [
          op,
          Math.max(
            0,
            cap - (usage.find((r) => r.operation === op)?._count._all ?? 0),
          ),
        ]),
      ) as Record<CraftingOperation, number>;
      const goldRemaining = Math.max(
        0,
        CRAFTING_LIMITS.goldGranted -
          usage.reduce((n, u) => n + (u._sum.goldGranted ?? 0), 0),
      );
      const rareRemaining = Math.max(
        0,
        CRAFTING_LIMITS.rareCrafts -
          usage.reduce((n, u) => n + (u._sum.rareCreated ?? 0), 0),
      );
      const account = {
        characterId: character.characterId as "nara" | "orin" | "ivo" | "sena",
        level: character.level,
        flags: new Set(flags.map((f) => f.flagId)),
      };
      const recipes = CRAFTING_RECIPES.map((r) => {
        let reason = "";
        try {
          assertRecipeRequirements(r, account);
        } catch (e) {
          reason = e instanceof Error ? e.message : "Receita indisponível.";
        }
        if (!remaining.CRAFT_ITEM)
          reason = "Limite diário de fabricação atingido.";
        if (r.rarity !== "COMMON" && !rareRemaining)
          reason = "Limite diário de fabricação rara atingido.";
        return {
          ...r,
          slot: RPG_ITEMS[r.outputItemId as keyof typeof RPG_ITEMS].slot,
          reason,
        };
      });
      const rows = await tx.rpgItemInstance.findMany({
        where: { userId, location: "INVENTORY" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
      });
      const items = rows.flatMap((r) => {
        try {
          const item = rpgEquipmentData(r);
          if (item.quantity !== 1) return [];
          const reason =
            r.equippedCharacterId || r.equippedSlot
              ? "Desequipe o item antes de usar este serviço."
              : "";
          let upgrade = null;
          let reforge = null;
          let upgradeReason = reason,
            reforgeReason = reason,
            saleReason = reason,
            saleGold = 0;
          try {
            const plan = forgeItemPlan(item, account, "UPGRADE_ITEM");
            upgrade = { rarity: plan.rarity, materials: plan.materials };
          } catch (e) {
            upgradeReason ||=
              e instanceof Error ? e.message : "Aprimoramento indisponível.";
          }
          try {
            const plan = forgeItemPlan(item, account, "REFORGE_ITEM");
            reforge = { rarity: plan.rarity, materials: plan.materials };
          } catch (e) {
            reforgeReason ||=
              e instanceof Error ? e.message : "Reforja indisponível.";
          }
          try {
            saleGold = vendorSaleGold(item);
            if (saleGold > goldRemaining)
              saleReason ||= "Limite diário de GOLD atingido.";
          } catch (e) {
            saleReason ||=
              e instanceof Error ? e.message : "Venda indisponível.";
          }
          if (!remaining.UPGRADE_ITEM)
            upgradeReason ||= "Limite diário atingido.";
          if (!remaining.REFORGE_ITEM)
            reforgeReason ||= "Limite diário atingido.";
          if (!remaining.SELL_TO_VENDOR)
            saleReason ||= "Limite diário atingido.";
          return [
            {
              ...publicCraftingItem(item),
              name: RPG_ITEMS[item.itemId as keyof typeof RPG_ITEMS].name,
              modifiers: equipmentModifiers(item),
              equipped: !!r.equippedCharacterId,
              upgrade,
              reforge,
              upgradeReason,
              reforgeReason,
              saleGold,
              saleReason,
            },
          ];
        } catch {
          return [];
        }
      });
      const save = saveSchema.parse(profile.user.progress!.data);
      if (save.economyVersion !== 2)
        throw new UserError("Migração econômica pendente.");
      recheckWorldServicePermit();
      return {
        version: 1 as const,
        revision: profile.revision,
        characterId: account.characterId,
        level: account.level,
        gold: save.gold,
        materials: profile.materials.map((m) => ({
          materialId: m.materialId,
          amount: m.amount,
        })),
        remaining,
        rareRemaining,
        goldRemaining,
        recipes,
        refinements: REFINEMENT_RECIPES,
        stocks: VENDOR_STOCK.map((s) => ({
          ...s,
          name: RPG_ITEMS[s.itemId as keyof typeof RPG_ITEMS].name,
        })),
        items,
        inventoryListLimit: 200,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export type CraftingCatalogData = Awaited<ReturnType<typeof craftingCatalog>>;
export async function craftingHistory(userId: string, input: unknown) {
  const value = craftingHistoryInput.parse(input);
  checkPermit();
  return db().$transaction(
    async (tx) => {
      await assertActiveWorldServicePermit(tx, userId);
      if (
        value.cursor &&
        !(await tx.rpgCommerceRecord.findUnique({
          where: { userId_requestId: { userId, requestId: value.cursor } },
          select: { requestId: true },
        }))
      )
        throw new UserError("Histórico indisponível.");
      const rows = await tx.rpgCommerceRecord.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { requestId: "desc" }],
        take: 21,
        ...(value.cursor
          ? {
              cursor: { userId_requestId: { userId, requestId: value.cursor } },
              skip: 1,
            }
          : {}),
        select: { requestId: true, result: true },
      });
      const page = rows.slice(0, 20);
      recheckWorldServicePermit();
      return {
        records: page.map((r) => craftingResultSchema.parse(r.result)),
        next: rows.length > 20 ? page.at(-1)!.requestId : null,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
