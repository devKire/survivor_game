import type { ExplorationResource } from "../../core/rpg/exploration/types";
export const EXPLORATION_RESOURCES: readonly ExplorationResource[] =
  Object.freeze(
    [
      {
        id: "weathered-vein",
        name: "Veio mineral",
        category: "MINERAL",
        materialId: "weathered-ore",
        quantity: 2,
        durationMs: 1800,
        radius: 65,
        minimumLevel: 1,
        biomes: ["ruins", "rock", "forest"],
        visual: "rocks",
      },
      {
        id: "ruins-herb",
        name: "Erva das ruínas",
        category: "VEGETAL",
        materialId: "ruins-fiber",
        quantity: 2,
        durationMs: 1200,
        radius: 65,
        minimumLevel: 1,
        biomes: ["ruins", "forest", "swamp"],
        visual: "trees/living",
      },
      {
        id: "residual-crystal",
        name: "Cristal residual",
        category: "CRYSTAL",
        materialId: "obelisk-dust",
        quantity: 1,
        durationMs: 2200,
        radius: 65,
        minimumLevel: 1,
        biomes: ["ruins", "rock", "forest"],
        visual: "crystals",
      },
    ].map((r) =>
      Object.freeze({ ...r, biomes: Object.freeze(r.biomes) }),
    ) as ExplorationResource[],
  );
export function explorationResource(id: string) {
  const value = EXPLORATION_RESOURCES.find((r) => r.id === id);
  if (!value) throw new Error("Recurso desconhecido.");
  return value;
}
