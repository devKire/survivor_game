import "server-only";
import { RPG_MATERIALS } from "../game/content/rpg";
import { ExplorationSimulation } from "../game/core/rpg/exploration/simulation";
import { inDiscoveryRange } from "../game/core/rpg/exploration/generation";
import {
  gatheringCycle,
  gatheringIntent,
} from "../game/core/rpg/exploration/gathering";
import { EXPLORATION_RUINS as region } from "../game/content/rpg/exploration-regions";
import { explorationResource } from "../game/content/rpg/exploration-resources";
import { validateCombatLoadout, type RpgCombatLoadout } from "../game/core/rpg";
import { migrateSave } from "../game/core/save";
import { db } from "../server/db";
import { rewardHash } from "../server/rpg/reward-integrity";
import { requireRpgExplorationEnabled } from "../server/rpg/guard";
import { isRpgExplorationEnabled } from "../server/env";
import {
  persistGathering,
  persistDiscovery,
  closeExploration,
} from "../server/rpg/exploration/persistence";
import { UserError } from "../server/security";
interface PersonalState {
  revision: number;
  cycle: number;
  depleted: Set<string>;
  pending: boolean;
  message: string;
  nextAttempt: number;
}
interface Authority {
  sessionId: string;
  personal: Map<string, PersonalState>;
  leaving: Set<string>;
  operations: Set<Promise<unknown>>;
}
const authority = new WeakMap<ExplorationSimulation, Authority>();
export async function createAuthorizedExploration(sessionId: string) {
  try {
    return await hydrateExploration(sessionId);
  } catch (error) {
    // START already committed authorization. Release it if hydration cannot create a room.
    await closeExploration(sessionId, undefined, true).catch(() => {});
    throw error;
  }
}
async function hydrateExploration(sessionId: string) {
  requireRpgExplorationEnabled();
  const row = await db().rpgExplorationSession.findUniqueOrThrow({
    where: { sessionId },
    include: {
      participants: true,
      session: {
        include: {
          members: { include: { user: { include: { progress: true } } } },
        },
      },
    },
  });
  if (
    row.status !== "RUNNING" ||
    row.session.status !== "RUNNING" ||
    row.session.expeditionKind !== "RPG_EXPLORATION" ||
    row.regionId !== region.id ||
    row.regionVersion !== region.version ||
    row.session.seed !== region.seed ||
    row.session.duration !== region.maxSeconds ||
    row.participants.length !== row.session.partySize ||
    row.session.members.length !== row.session.partySize
  )
    throw new Error("Exploration authority unavailable");
  const loadouts: Record<string, RpgCombatLoadout> = {};
  for (const p of row.participants) {
    const l = validateCombatLoadout(p.loadout as unknown as RpgCombatLoadout);
    if (
      rewardHash(l) !== p.loadoutHash ||
      l.characterId !== p.characterId ||
      p.activeUserId !== p.userId
    )
      throw new Error("Exploration build integrity failure");
    loadouts[p.userId] = l;
  }
  const game = new ExplorationSimulation(
    row.session.members.map((m) => ({
      id: m.userId,
      name: m.user.displayUsername || m.user.username || "Eco",
      character: m.character,
      progress: migrateSave(m.user.progress?.data),
    })),
    "normal",
    region.mapId,
    region.seed,
    region.maxSeconds,
    { kind: "RPG_EXPLORATION", loadouts },
  );
  authority.set(game, {
    sessionId,
    personal: new Map(),
    leaving: new Set(),
    operations: new Set(),
  });
  for (const p of row.participants) await refreshExploration(game, p.userId);
  return game;
}
function bound(game: ExplorationSimulation) {
  const a = authority.get(game);
  if (!a) throw new Error("Unauthorized exploration simulation");
  return a;
}
export async function refreshExploration(
  game: ExplorationSimulation,
  userId: string,
) {
  requireRpgExplorationEnabled();
  const a = bound(game);
  if (!game.members.has(userId)) throw new UserError("Participante inválido.");
  const cycle = gatheringCycle(Date.now());
  const [profile, claims, discoveries] = await Promise.all([
    db().rpgProfile.findUniqueOrThrow({
      where: { userId },
      select: { revision: true },
    }),
    db().rpgResourceClaim.findMany({
      where: {
        userId,
        regionId: region.id,
        regionVersion: region.version,
        cycle,
      },
      select: { nodeId: true },
    }),
    db().rpgDiscoveredPoi.findMany({
      where: { userId, regionId: region.id, regionVersion: region.version },
      select: { poiId: true },
    }),
  ]);
  const existing = a.personal.get(userId);
  if (
    existing &&
    (existing.revision > profile.revision || existing.cycle > cycle)
  )
    return;
  if (existing) {
    existing.revision = profile.revision;
    existing.depleted =
      existing.cycle === cycle
        ? new Set([...existing.depleted, ...claims.map((c) => c.nodeId)])
        : new Set(claims.map((c) => c.nodeId));
    existing.cycle = cycle;
  } else
    a.personal.set(userId, {
      revision: profile.revision,
      cycle,
      depleted: new Set(claims.map((c) => c.nodeId)),
      pending: false,
      message: "",
      nextAttempt: 0,
    });
  game.discoveries.set(
    userId,
    new Set([
      ...(game.discoveries.get(userId) ?? []),
      ...discoveries.map((d) => d.poiId),
    ]),
  );
}
export async function startExplorationGather(
  game: ExplorationSimulation,
  userId: string,
  input: unknown,
) {
  requireRpgExplorationEnabled();
  const a = bound(game),
    intent = gatheringIntent.parse(input);
  const previous = await db().rpgResourceClaim.findUnique({
    where: { userId_requestId: { userId, requestId: intent.requestId } },
  });
  if (previous) {
    if (
      previous.payloadHash !== rewardHash({ sessionId: a.sessionId, ...intent })
    )
      throw new UserError("Pedido já utilizado com outra intenção.");
    await refreshExploration(game, userId);
    a.personal.get(userId)!.message =
      `Coleta já confirmada: +${previous.quantity} ${RPG_MATERIALS[previous.materialId as keyof typeof RPG_MATERIALS]?.name ?? previous.materialId}.`;
    return;
  }
  const state = a.personal.get(userId)!;
  if (state.cycle !== gatheringCycle(Date.now()))
    await refreshExploration(game, userId);
  if (a.personal.get(userId)!.depleted.has(intent.nodeId))
    throw new UserError("Recurso esgotado para sua conta neste ciclo UTC.");
  try {
    game.startGather(userId, intent);
  } catch {
    throw new UserError("Aproxime-se do recurso e aguarde a coleta atual.");
  }
}
export function explorationState(game: ExplorationSimulation, userId: string) {
  const a = bound(game),
    s = a.personal.get(userId),
    g = game.gathering.get(userId);
  if (!s) return null;
  return {
    type: "EXPLORATION_STATE" as const,
    room: a.sessionId,
    regionId: region.id,
    characterId: game.members.get(userId)!.player.character,
    level: game.levels.get(userId)!,
    revision: s.revision,
    cycle: s.cycle,
    depleted: [...s.depleted],
    discovered: [...(game.discoveries.get(userId) ?? [])],
    message: s.message,
    gathering: g
      ? {
          nodeId: g.node.id,
          elapsed: Math.min(
            g.elapsed,
            explorationResource(g.node.definitionId).durationMs,
          ),
          duration: explorationResource(g.node.definitionId).durationMs,
        }
      : null,
  };
}
function track(a: Authority, p: Promise<unknown>) {
  a.operations.add(p);
  void p.finally(() => a.operations.delete(p)).catch(() => {});
}
/** Called outside simulation hot path; IO only on newly completed discrete events. */
export function processExploration(game: ExplorationSimulation) {
  const a = bound(game);
  if (!isRpgExplorationEnabled()) {
    game.gathering.clear();
    return;
  }
  // Serialize discrete writes within this authority. PostgreSQL remains the cross-worker guard.
  if (a.operations.size) return;
  for (const userId of game.members.keys()) {
    const state = a.personal.get(userId)!;
    if (game.departed.has(userId) && !a.leaving.has(userId)) {
      a.leaving.add(userId);
      track(
        a,
        closeExploration(a.sessionId, userId).catch(() =>
          a.leaving.delete(userId),
        ),
      );
    }
    if (game.ended || state.pending || performance.now() < state.nextAttempt)
      continue;
    if (state.cycle !== gatheringCycle(Date.now())) {
      state.pending = true;
      track(
        a,
        refreshExploration(game, userId)
          .catch(() => {
            state.nextAttempt = performance.now() + 5000;
          })
          .finally(() => {
            state.pending = false;
          }),
      );
      continue;
    }
    const gather = game.gatheringReady(userId);
    if (gather) {
      gather.pending = true;
      state.pending = true;
      track(
        a,
        persistGathering({
          sessionId: a.sessionId,
          userId,
          node: gather.node,
          cycle: gather.cycle,
          intent: gather.intent,
          assertLive: () => game.assertGather(userId, gather),
        })
          .then((result) => {
            state.message = `Coleta confirmada: +${result.quantity} ${RPG_MATERIALS[result.materialId as keyof typeof RPG_MATERIALS]?.name ?? result.materialId}.`;
            // A gather begun before midnight consumes the old cycle only.
            if (result.cycle === state.cycle) state.depleted.add(result.nodeId);
            state.revision = Math.max(state.revision, result.revision);
          })
          .catch((error) => {
            state.message =
              error instanceof UserError
                ? error.message
                : "Coleta não confirmada. Consulte o diário ou tente novamente.";
          })
          .finally(() => {
            if (game.gathering.get(userId) === gather)
              game.gathering.delete(userId);
            state.pending = false;
            state.nextAttempt = performance.now() + 1000;
            void refreshExploration(game, userId).catch(() => {});
          }),
      );
      return;
    }
    // Do not invalidate this player's gathering revision with an automatic discovery.
    if (game.gathering.has(userId)) continue;
    const node = game.nearbyDiscoveries(userId)[0];
    if (node) {
      state.pending = true;
      game.discoveryPending.get(userId)!.add(node.id);
      track(
        a,
        persistDiscovery(a.sessionId, userId, node, () => {
          const m = game.members.get(userId);
          if (
            game.ended ||
            !m?.connected ||
            game.departed.has(userId) ||
            !inDiscoveryRange(node, m.player)
          )
            throw new Error("Discovery cancelled");
        })
          .then(() => {
            game.discoveries.get(userId)!.add(node.id);
            state.message = "Local descoberto. Consulte seu diário.";
          })
          .catch(() => {
            state.nextAttempt = performance.now() + 5000;
          })
          .finally(() => {
            state.pending = false;
            game.discoveryPending.get(userId)!.delete(node.id);
            void refreshExploration(game, userId).catch(() => {});
          }),
      );
      return;
    }
  }
}
export async function leaveExploration(
  game: ExplorationSimulation,
  userId: string,
) {
  const a = bound(game);
  game.leave(userId);
  await Promise.allSettled([...a.operations]);
  await closeExploration(a.sessionId, userId);
}
export async function finishExploration(game: ExplorationSimulation) {
  const a = bound(game);
  if (!game.ended) throw new Error("Exploration still running");
  await Promise.allSettled([...a.operations]);
  await closeExploration(a.sessionId);
  return "CONFIRMED" as const;
}
