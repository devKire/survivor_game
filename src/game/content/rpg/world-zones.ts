import { WORLD_REFUGE as REFUGE } from "./world-refuge";
import type {
  WorldZoneDefinition,
  WorldZoneId,
} from "../../core/rpg/world/types";

export const WORLD_ZONES: Readonly<Record<WorldZoneId, WorldZoneDefinition>> = {
  "obelisk-refuge": {
    id: "obelisk-refuge",
    version: 2,
    name: "O Refúgio",
    safe: true,
    bounds: {
      minX: 0,
      minY: 0,
      maxX: REFUGE.bounds.width,
      maxY: REFUGE.bounds.height,
    },
    spawn: REFUGE.spawn,
    portals: [
      {
        id: "refuge:exploration-portal",
        name: "Sair para os Arredores",
        x: 380,
        y: 795,
        radius: 85,
        destination: "ruins-outskirts",
      },
    ],
  },
  "ruins-outskirts": {
    id: "ruins-outskirts",
    version: 1,
    name: "Arredores das Ruínas",
    safe: false,
    bounds: { minX: -640, minY: -640, maxX: 1280, maxY: 1280 },
    spawn: { x: 0, y: 0 },
    portals: [
      {
        id: "world:ruins:refuge-return",
        name: "Voltar ao Refúgio",
        x: 0,
        y: 0,
        radius: 85,
        destination: "obelisk-refuge",
      },
    ],
  },
};
