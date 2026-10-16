import "server-only";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { RpgEquipment } from "../../../game/core/rpg/combat-types";
import {
  craftingCommandSchema,
  craftingResultSchema,
  publicForgeItem,
  type CraftingResult,
  type CraftingCommand,
  type MaterialAmount,
} from "../../../game/core/rpg/crafting/types";
import {
  CRAFTING_RECIPES,
  REFINEMENT_RECIPES,
  VENDOR_STOCK,
  CRAFTING_LIMITS,
} from "../../../game/content/rpg/crafting";
import {
  assertRecipeRequirements,
  forgeItemPlan,
  checkedMaterialAmount,
  materialChanges,
  vendorSaleGold,
} from "../../../game/core/rpg/crafting/rules";
import { validateCraftingCatalog } from "../../../game/core/rpg/crafting/validation";
import {
  equipmentDefinition,
  rollEquipmentAffixes,
  validateEquipment,
} from "../../../game/core/rpg/equipment";
import { canAccessRpgCharacter } from "../../../game/core/rpg/rules";
import {
  grantCurrency,
  spendCurrency,
  persistSave,
  economyJson,
} from "../../economy";
import { UserError } from "../../security";
import { rpgEquipmentData } from "../equipment";
import { lockRpgAccount, rpgTransaction } from "../transaction";
import { requireRpgCraftingEnabled } from "../guard";
import {
  assertActiveWorldServicePermit,
  recheckWorldServicePermit,
  hasWorldServicePermit,
} from "../world/service-context";
import { recordCraftingMetric } from "./metrics";
validateCraftingCatalog();
export function publicCraftingItem(item: RpgEquipment) {
  return publicForgeItem.parse({
    id: item.id,
    itemId: item.itemId,
    rarity: item.rarity,
    level: item.level,
    quantity: item.quantity,
    contentVersion: item.contentVersion,
    affixes: item.affixes,
  });
}
function recipeFor(
  command: Extract<CraftingCommand, { operation: "CRAFT_ITEM" }>,
) {
  const recipe = CRAFTING_RECIPES.find(
    (r) => r.id === command.recipeId && r.version === command.recipeVersion,
  );
  if (!recipe) throw new UserError("Receita indisponível.");
  return recipe;
}
/** Internal only. Identity comes from the authenticated WORLD connection and spatial permit. */
export async function mutateCrafting(
  userId: string,
  input: unknown,
): Promise<CraftingResult> {
  requireRpgCraftingEnabled();
  if (!hasWorldServicePermit())
    throw new UserError("Utilize a estação dentro do mundo.");
  const command = craftingCommandSchema.parse(input),
    operation = command.operation;
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  // Generated once per attempted invocation, outside serialization retries. A committed replay reads its result first.
  const entropy = randomBytes(32),
    now = new Date(),
    cycle = Math.floor(now.getTime() / 86400000);
  const started = performance.now();
  recordCraftingMetric("started", operation);
  try {
    const outcome = await rpgTransaction(async (tx) => {
      requireRpgCraftingEnabled();
      const save = await lockRpgAccount(tx, userId);
      const visit = await assertActiveWorldServicePermit(tx, userId);
      const prior = await tx.rpgMutationReceipt.findUnique({
        where: { userId_requestId: { userId, requestId: command.requestId } },
      });
      if (prior) {
        if (prior.operation !== operation || prior.payloadHash !== payloadHash)
          throw new UserError("requestId já utilizado por outra mutação RPG.");
        recheckWorldServicePermit();
        return {
          replay: true,
          result: craftingResultSchema.parse(prior.result),
        };
      }
      const profile = await tx.rpgProfile.findUniqueOrThrow({
        where: { userId },
        include: { activeCharacter: true },
      });
      if (profile.revision !== command.expectedRevision)
        throw new UserError(
          "O perfil RPG mudou. Atualize os dados da estação antes de tentar novamente.",
        );
      const character = profile.activeCharacter;
      if (
        !character ||
        character.characterId !== visit.characterId ||
        !canAccessRpgCharacter(character.characterId, save.unlocked)
      )
        throw new UserError("Personagem indisponível para esta operação.");
      const flags = await tx.rpgStoryFlag.findMany({
        where: { userId },
        select: { flagId: true },
      });
      const account = {
        characterId: character.characterId as "nara" | "orin" | "ivo" | "sena",
        level: character.level,
        flags: new Set(flags.map((f) => f.flagId)),
      };
      const usage = await tx.rpgCommerceRecord.groupBy({
        by: ["operation"],
        where: { userId, cycle },
        _count: { _all: true },
        _sum: { rareCreated: true, goldGranted: true },
      });
      if (
        (usage.find((u) => u.operation === operation)?._count._all ?? 0) >=
        CRAFTING_LIMITS.operations[operation]
      )
        throw new UserError(
          "Limite diário desta operação atingido para a conta.",
        );
      const costs: { gold: number; materials: readonly MaterialAmount[] } = {
        gold: 0,
        materials: [],
      };
      const gains: { gold: number; materials: readonly MaterialAmount[] } = {
        gold: 0,
        materials: [],
      };
      let before: RpgEquipment | null = null,
        item: RpgEquipment | null = null,
        sourceId: string = operation;
      const seed = createHmac("sha256", entropy)
        .update(
          JSON.stringify([
            "limiar-forge-v1",
            operation,
            userId,
            command.requestId,
            command.catalogVersion,
          ]),
        )
        .digest("hex");
      const createItem = (
        itemId: string,
        rarity: RpgEquipment["rarity"],
        level: number,
        id = "forge-" + randomUUID(),
      ) =>
        validateEquipment({
          id,
          itemId,
          rarity,
          level,
          quantity: 1,
          contentVersion: 1,
          rollSeed: seed,
          affixes: rollEquipmentAffixes(
            equipmentDefinition(itemId),
            rarity,
            level,
            seed,
          ),
        });
      if (operation === "CRAFT_ITEM" && command.operation === operation) {
        const recipe = recipeFor(command);
        assertRecipeRequirements(recipe, account);
        costs.materials = recipe.materials;
        sourceId = recipe.id;
        item = createItem(recipe.outputItemId, recipe.rarity, recipe.itemLevel);
        if (
          recipe.rarity !== "COMMON" &&
          usage.reduce((n, u) => n + (u._sum.rareCreated ?? 0), 0) >=
            CRAFTING_LIMITS.rareCrafts
        )
          throw new UserError("Limite diário de fabricação rara atingido.");
      } else if (
        operation === "REFINE_MATERIAL" &&
        command.operation === operation
      ) {
        const recipe = REFINEMENT_RECIPES.find(
          (r) =>
            r.id === command.recipeId && r.version === command.recipeVersion,
        );
        if (!recipe)
          throw new UserError("Receita de refinamento indisponível.");
        costs.materials = recipe.materials;
        gains.materials = [recipe.output];
        sourceId = recipe.id;
      } else if (
        operation === "BUY_FROM_VENDOR" &&
        command.operation === operation
      ) {
        const stock = VENDOR_STOCK.find((s) => s.id === command.stockItemId);
        if (!stock) throw new UserError("Oferta indisponível.");
        costs.gold = stock.cost.gold;
        costs.materials = stock.cost.materials;
        sourceId = stock.id;
        item = createItem(stock.itemId, stock.rarity, stock.level);
      } else if ("instanceId" in command) {
        const row = await tx.rpgItemInstance.findFirst({
          where: { id: command.instanceId, userId },
        });
        if (
          !row ||
          row.location !== "INVENTORY" ||
          row.equippedCharacterId ||
          row.equippedSlot ||
          row.quantity !== 1
        )
          throw new UserError(
            "Use um item próprio, unitário, no inventário e desequipado.",
          );
        before = rpgEquipmentData(row);
        sourceId = row.itemId;
        if (operation === "SELL_TO_VENDOR") {
          gains.gold = vendorSaleGold(before);
          if (
            usage.reduce((n, u) => n + (u._sum.goldGranted ?? 0), 0) +
              gains.gold >
            CRAFTING_LIMITS.goldGranted
          )
            throw new UserError("Limite diário de GOLD de vendas atingido.");
        } else if (
          operation === "UPGRADE_ITEM" ||
          operation === "REFORGE_ITEM"
        ) {
          const plan = forgeItemPlan(before, account, operation);
          costs.materials = plan.materials;
          item = createItem(
            before.itemId,
            plan.rarity,
            before.level,
            before.id,
          );
        } else throw new UserError("Operação indisponível.");
      } else throw new UserError("Operação inválida.");
      if (
        item &&
        !before &&
        (await tx.rpgItemInstance.count({ where: { userId } })) >=
          CRAFTING_LIMITS.inventoryCreationCap
      )
        throw new UserError(
          "Limite de criação atingido. Organize ou venda itens antes de fabricar/comprar.",
        );
      for (const [materialId, delta] of materialChanges(
        costs.materials,
        gains.materials,
      )) {
        const where = { userId_materialId: { userId, materialId } };
        const balance = await tx.rpgMaterialBalance.findUnique({ where });
        const amount = checkedMaterialAmount(balance?.amount ?? 0, delta);
        await tx.rpgMaterialBalance.upsert({
          where,
          create: { userId, materialId, amount },
          update: { amount },
        });
      }
      const currency = {
        userId,
        currency: "GOLD" as const,
        source: "rpg-vendor-v1",
        referenceId: "rpg-commerce:" + command.requestId,
      };
      if (costs.gold)
        await spendCurrency(tx, save, { ...currency, amount: costs.gold });
      if (gains.gold)
        await grantCurrency(tx, save, { ...currency, amount: gains.gold });
      if (costs.gold || gains.gold) await persistSave(tx, userId, save);
      if (operation === "SELL_TO_VENDOR" && before)
        await tx.rpgItemInstance.delete({ where: { id: before.id, userId } });
      else if (item && before)
        await tx.rpgItemInstance.update({
          where: { id: item.id, userId },
          data: {
            rarity: item.rarity,
            rollSeed: item.rollSeed,
            affixes: economyJson(item.affixes),
          },
        });
      else if (item)
        await tx.rpgItemInstance.create({
          data: { ...item, userId, affixes: economyJson(item.affixes) },
        });
      const updated = await tx.rpgProfile.updateMany({
        where: { userId, revision: command.expectedRevision },
        data: { revision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new UserError("O perfil RPG mudou. Atualize a estação.");
      const result = craftingResultSchema.parse({
        version: 1,
        requestId: command.requestId,
        operation,
        revision: command.expectedRevision + 1,
        characterId: account.characterId,
        at: now.toISOString(),
        sourceId,
        costs,
        gains,
        before: before ? publicCraftingItem(before) : null,
        item: item ? publicCraftingItem(item) : null,
      });
      const json = economyJson(result);
      await tx.rpgMutationReceipt.create({
        data: {
          userId,
          requestId: command.requestId,
          operation,
          payloadHash,
          revision: result.revision,
          result: json,
        },
      });
      await tx.rpgCommerceRecord.create({
        data: {
          userId,
          requestId: command.requestId,
          characterId: account.characterId,
          operation,
          cycle,
          instanceId: item?.id ?? before?.id,
          rareCreated:
            operation === "CRAFT_ITEM" && item?.rarity !== "COMMON" ? 1 : 0,
          goldGranted: gains.gold,
          result: json,
          createdAt: now,
        },
      });
      requireRpgCraftingEnabled();
      recheckWorldServicePermit();
      return { replay: false, result };
    });
    recordCraftingMetric(
      outcome.replay ? "replayed" : "confirmed",
      operation,
      performance.now() - started,
    );
    return outcome.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    recordCraftingMetric(
      error instanceof UserError || error instanceof RangeError
        ? message.includes("perfil RPG mudou")
          ? "revision-conflict"
          : "rejected"
        : "transaction-failed",
      operation,
      performance.now() - started,
    );
    if (error instanceof RangeError) throw new UserError(error.message);
    throw error;
  }
}
