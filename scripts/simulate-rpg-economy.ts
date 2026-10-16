import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { WorldZone } from "../src/realtime/world/zone";
import { explorationResource } from "../src/game/content/rpg/exploration-resources";
import {
  CRAFTING_RECIPES,
  REFINEMENT_RECIPES,
  VENDOR_STOCK,
  CRAFTING_LIMITS,
} from "../src/game/content/rpg/crafting";
import { validateCraftingCatalog } from "../src/game/core/rpg/crafting/validation";
import { RPG_REWARD_PROFILES_V1 } from "../src/game/content/rpg/reward-profiles";
import { RPG_LOOT_TABLES_V1 } from "../src/game/content/rpg/loot-tables";
import { equipmentDefinition } from "../src/game/core/rpg/equipment";
validateCraftingCatalog();
const zone = new WorldZone("ruins-outskirts", randomUUID());
const nodes = zone.nodes.filter((n) => n.kind === "RESOURCE");
const sources = ["weathered-ore", "ruins-fiber", "obelisk-dust"].map(
  (materialId) => {
    const available = nodes.filter(
      (n) => explorationResource(n.definitionId).materialId === materialId,
    );
    const definition = explorationResource(available[0].definitionId);
    return {
      materialId,
      nodes: available.length,
      quantity: definition.quantity,
      gatherSeconds: definition.durationMs / 1000,
    };
  },
);
const rows = [
  {
    profile: "INICIANTE",
    level: 1,
    fieldKills: 3,
    bossKills: 0,
    expeditions: 0,
  },
  {
    profile: "INTERMEDIÁRIO",
    level: 5,
    fieldKills: 10,
    bossKills: 1,
    expeditions: 1,
  },
  {
    profile: "AVANÇADO",
    level: 20,
    fieldKills: 20,
    bossKills: 3,
    expeditions: 2,
  },
].map((p) => {
  const claims = sources.map((s) => ({ ...s, claims: Math.min(6, s.nodes) }));
  const materials = Object.fromEntries(
    claims.map((s) => [s.materialId, s.quantity * s.claims]),
  );
  materials["obelisk-dust"] += p.fieldKills;
  materials["obelisk-dust"] +=
    p.expeditions * RPG_REWARD_PROFILES_V1.EXPEDITION_COMPLETION.dust +
    p.bossKills * RPG_REWARD_PROFILES_V1.BOSS_DEFEAT.dust;
  const bossEntries = RPG_LOOT_TABLES_V1["boss-v1"].entries.filter(
    (e) =>
      e.type !== "EQUIPMENT" ||
      equipmentDefinition(e.definitionId).minLevel <= p.level,
  );
  const totalWeight = bossEntries.reduce((n, e) => n + e.weight, 0);
  const weightedShards =
    bossEntries.reduce(
      (n, e) =>
        n +
        (e.type === "MATERIAL" && e.definitionId === "echo-shard"
          ? ((e.weight / totalWeight) *
              (e.minimumQuantity + e.maximumQuantity)) /
            2
          : 0),
      0,
    ) * p.bossKills;
  const guaranteedShards =
    p.expeditions * RPG_REWARD_PROFILES_V1.EXPEDITION_COMPLETION.shards +
    p.bossKills * RPG_REWARD_PROFILES_V1.BOSS_DEFEAT.shards;
  return {
    ...p,
    dailyClaims: claims.reduce((n, s) => n + s.claims, 0),
    materials,
    gatheringSecondsExcludingTravel: claims.reduce(
      (n, s) => n + s.claims * s.gatherSeconds,
      0,
    ),
    guaranteedRepeatableShards: guaranteedShards,
    expectedBonusShards: weightedShards,
    expectedRepeatableShards: guaranteedShards + weightedShards,
    oneTimeStoryShards: p.level >= 5 ? 2 : 0,
    firstMantleClaims: 3,
    firstMantleGatherSecondsExcludingTravel: 4.2,
    firstRareCharmNeeds:
      "2 herb claims and 3 dust sources; field kills can supply dust. Story unlock is not required.",
    maximumVendorGoldDaily: CRAFTING_LIMITS.goldGranted,
    goldWeaponCost: 12,
    survivorCompletionsForWeapon: {
      tenMinutes: 6,
      fifteenMinutes: 4,
      thirtyMinutes: 2,
    },
    vendorBuySellNetGold: [-11, -9],
    advancedRecipeNote:
      "Requires level 5 and material-samples-delivered. Eligible expedition completion and boss rewards include guaranteed shards, plus weighted boss bonuses. Activity participation is assumed, never an automatic daily grant.",
  };
});
zone.dispose();
await mkdir("docs/qa/crafting", { recursive: true });
await writeFile(
  "docs/qa/crafting/economy-simulation.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      version: 1,
      sources,
      profiles: rows,
      recipes: CRAFTING_RECIPES,
      refinements: REFINEMENT_RECIPES,
      stocks: VENDOR_STOCK,
      limits: CRAFTING_LIMITS,
      assumptions: [
        "Eighteen daily claims allocated six to each resource; limited by actual generated nodes, not client values.",
        "At most twelve per visit, requiring another visit for eighteen claims; no quota reset.",
        "Travel, combat survival and quest navigation times are deliberately excluded; gather seconds are a lower bound, not predicted playtime.",
        "Profiles are availability scenarios with assumed levels, not grants or expected automatic progression.",
        "Field rewards have their existing twenty/day account cap. No source sells materials for GOLD and no conversion yields a shard.",
        "Buy/sell cycles lose GOLD. Craft/refine consume finite nonpurchasable inputs; sales also have three/day and five GOLD/day caps.",
      ],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ sources, profiles: rows }, null, 2));
