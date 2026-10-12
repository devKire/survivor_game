import "server-only";
import { z } from "zod";
import { db } from "../../db";
import { requireRpgExplorationEnabled } from "../guard";
import { explorationRegion } from "../../../game/content/rpg/exploration-regions";
import { gatheringCycle } from "../../../game/core/rpg/exploration/gathering";
const query = z
  .object({
    regionId: z.literal("ruins-outskirts").default("ruins-outskirts"),
    cursor: z.string().min(1).max(100).optional(),
  })
  .strict();
/** userId is supplied only by the authenticated server page. */
export async function explorationHistory(userId: string, input: unknown = {}) {
  requireRpgExplorationEnabled();
  const q = query.parse(input),
    region = explorationRegion(q.regionId, 1);
  const cursor = q.cursor
    ? await db().rpgResourceClaim.findFirst({
        where: { id: q.cursor, userId, regionId: region.id },
      })
    : null;
  if (q.cursor && !cursor) throw new Error("Cursor indisponível.");
  return db().$transaction(
    async (tx) => {
      const claims = await tx.rpgResourceClaim.findMany({
        where: {
          userId,
          regionId: region.id,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 21,
        select: {
          id: true,
          nodeId: true,
          materialId: true,
          quantity: true,
          cycle: true,
          createdAt: true,
        },
      });
      const discoveries = await tx.rpgDiscoveredPoi.findMany({
        where: { userId, regionId: region.id, regionVersion: region.version },
        orderBy: { discoveredAt: "desc" },
        take: 9,
        select: { poiId: true, discoveredAt: true },
      });
      const count = await tx.rpgResourceClaim.count({
        where: { userId, cycle: gatheringCycle(Date.now()) },
      });
      return {
        claims: claims.slice(0, 20),
        nextCursor: claims.length > 20 ? claims[19].id : null,
        discoveries,
        cycleClaims: count,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
