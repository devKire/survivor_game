import type { RefinementDefinition } from "../../../core/rpg/crafting/types";
import { freezeNarrative } from "../../../core/rpg/quests/content";
export const REFINEMENT_RECIPES: readonly RefinementDefinition[] = [
  {
    id: "refine:residual-dust",
    version: 1,
    name: "Refinamento de resíduos",
    stationId: "refuge:refinery",
    materials: [
      { materialId: "weathered-ore", amount: 6 },
      { materialId: "ruins-fiber", amount: 4 },
    ],
    output: { materialId: "obelisk-dust", amount: 1 },
  },
];
freezeNarrative(REFINEMENT_RECIPES);
