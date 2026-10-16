import { REFUGE } from "./refuge";
import type { RefugeDefinition } from "../../core/rpg/refuge/types";
/** Shared-world v2 only. The legacy Refuge geometry and stable IDs are preserved. */
export const WORLD_REFUGE: RefugeDefinition = {
  ...REFUGE,
  version: 2,
  structures: [
    ...REFUGE.structures,
    {
      id: "refuge:forge",
      name: "Forja dos Ecos",
      x: 220,
      y: 480,
      radius: 85,
      collisionRadius: 34,
      visual: "forge",
      worldService: "FORGE",
    },
    {
      id: "refuge:refinery",
      name: "Bancada de Refinamento",
      x: 990,
      y: 480,
      radius: 85,
      collisionRadius: 30,
      visual: "refinery",
      worldService: "REFINEMENT",
    },
  ],
  npcs: [
    ...REFUGE.npcs,
    {
      id: "refuge:trader",
      name: "Comerciante do Refúgio",
      x: 940,
      y: 755,
      radius: 80,
      collisionRadius: 14,
      visual: "npc",
      worldService: "TRADER",
    },
  ],
};
