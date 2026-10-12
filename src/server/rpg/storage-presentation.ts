import "server-only";
import { randomUUID } from "node:crypto";
import type { rpgProfileData } from "./profile";
/** No private roll seeds or owner identifiers cross the client boundary. */
export function storagePresentation(
  profile: Awaited<ReturnType<typeof rpgProfileData>>,
) {
  return {
    revision: profile.revision,
    materials: profile.materials.map((m) => ({
      materialId: m.materialId,
      amount: m.amount,
    })),
    items: profile.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      rarity: i.rarity,
      level: i.level,
      quantity: i.quantity,
      location: i.location,
      equipped: !!i.equippedCharacterId,
      requestId: randomUUID(),
    })),
  };
}
