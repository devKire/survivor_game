import { MATCHMAKING_CONFIG as CONFIG } from "../content/matchmaking";
import { queueRange } from "../content/ranked";
import { CHARACTER_DEFINITIONS } from "../content/catalog";
import type { FighterSeed } from "./pvp";
export interface QueueEntry extends Omit<FighterSeed, "team"> {
  joined: number;
  mode: string;
  mmr: number;
  seasonId: string | null;
  partyId?: string;
  partyMembers?: string[];
}
interface Assignment {
  teams: [QueueEntry[], QueueEntry[]];
  rating: [number, number];
}
export interface MatchPlan {
  humans: QueueEntry[];
  seeds: FighterSeed[];
  reason: "humans" | "low-population";
}
/** Bounded dynamic programming keeps parties atomic and human counts ahead of MMR. */
export function selectMatch(
  entries: QueueEntry[],
  now: number,
): MatchPlan | null {
  const ordered = [...entries].sort(
    (a, b) => a.joined - b.joined || a.id.localeCompare(b.id),
  );
  const searched = new Set<string>();
  for (const first of ordered) {
    const ranked = first.mode.endsWith("RANKED");
    const searchKey = `${first.mode}:${first.seasonId}:${Math.floor(first.mmr / (ranked ? 100 : CONFIG.initialRatingWindow))}`;
    if (searched.has(searchKey)) continue;
    searched.add(searchKey);
    const war = first.mode.startsWith("WAR");
    const compatible = ordered.filter(
      (e) =>
        e.mode === first.mode &&
        e.seasonId === first.seasonId &&
        (ranked
          ? Math.abs(e.mmr - first.mmr) <=
            Math.min(
              queueRange((now - first.joined) / 1000),
              queueRange((now - e.joined) / 1000),
            )
          : Math.abs(e.mmr - first.mmr) <= casualRatingWindow(first, e, now)),
    );
    if (!war) {
      if (compatible.length >= 2)
        return {
          humans: compatible.slice(0, 2),
          seeds: compatible.slice(0, 2).map((e, team) => ({ ...e, team })),
          reason: "humans",
        };
      continue;
    }
    const groups: QueueEntry[][] = [],
      seen = new Set<string>();
    for (const e of compatible) {
      const key = e.partyId || e.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const ids = e.partyMembers || [e.id];
      const group = compatible.filter(
        (p) => ids.includes(p.id) && p.partyId === e.partyId,
      );
      if (group.length === ids.length && group.length <= CONFIG.teamSize)
        groups.push(group);
    }
    const key = (a: Assignment) =>
      a.teams
        .map(
          (t) =>
            `${t.length}:${t.filter((e) => e.role === "COMANDANTE").length}:${t.filter((e) => e.role === "CONSTRUTOR").length}`,
        )
        .join("/") +
      `/${Math.round((a.rating[0] - a.rating[1]) / CONFIG.ratingBucketSize)}`;
    let states = new Map<string, Assignment>([
      ["0:0:0/0:0:0", { teams: [[], []], rating: [0, 0] }],
    ]);
    for (const group of groups.slice(0, 60)) {
      const next = new Map(states);
      for (const state of states.values())
        for (const team of [0, 1] as const) {
          const members = [...state.teams[team], ...group];
          if (
            members.length > CONFIG.teamSize ||
            members.filter((e) => e.role === "COMANDANTE").length > 1 ||
            (ranked &&
              members.filter((e) => e.role === "CONSTRUTOR").length > 1)
          )
            continue;
          const candidate: Assignment = {
            teams: [...state.teams],
            rating: [...state.rating],
          };
          candidate.teams[team] = members;
          candidate.rating[team] += group.reduce((n, e) => n + e.mmr, 0);
          const k = key(candidate),
            old = next.get(k);
          if (
            !old ||
            Math.abs(candidate.rating[0] - candidate.rating[1]) <
              Math.abs(old.rating[0] - old.rating[1])
          )
            next.set(k, candidate);
        }
      states = next;
    }
    const fill = !ranked && now - first.joined >= CONFIG.botFillAfterMs;
    const valid = [...states.values()]
      .filter((a) => {
        const count = a.teams.flat().length;
        return (
          a.teams.every((t) => t.length > 0) &&
          count >= CONFIG.minimumHumanPlayers &&
          (count === CONFIG.idealHumanPlayers || fill) &&
          (!ranked ||
            a.teams.every(
              (t) =>
                t.filter((e) => e.role === "COMANDANTE").length === 1 &&
                t.filter((e) => e.role === "CONSTRUTOR").length === 1,
            ))
        );
      })
      .sort(
        (a, b) =>
          b.teams.flat().length - a.teams.flat().length ||
          Math.abs(a.teams[0].length - a.teams[1].length) -
            Math.abs(b.teams[0].length - b.teams[1].length) ||
          Math.abs(a.rating[0] - a.rating[1]) -
            Math.abs(b.rating[0] - b.rating[1]),
      );
    if (!valid.length) continue;
    const best = valid[0],
      humans = best.teams.flat();
    const seeds: FighterSeed[] = best.teams.flatMap((t, team) =>
      t.map((e) => ({ ...e, team })),
    );
    for (const team of [0, 1])
      while (seeds.filter((s) => s.team === team).length < CONFIG.teamSize) {
        const own = seeds.filter((s) => s.team === team),
          index = own.length;
        const character = (["nara", "orin", "ivo", "sena"] as const)[index % 4];
        seeds.push({
          id: `bot:${team}:${index}`,
          name: `${CHARACTER_DEFINITIONS[character].name} [BOT]`,
          character,
          cosmetics: {},
          team,
          isBot: true,
          role: !own.some((s) => s.role === "COMANDANTE")
            ? "COMANDANTE"
            : !own.some((s) => s.role === "CONSTRUTOR")
              ? "CONSTRUTOR"
              : "SOLDADO",
        });
      }
    return {
      humans,
      seeds,
      reason: humans.length === 10 ? "humans" : "low-population",
    };
  }
  return null;
}

function casualRatingWindow(
  first: QueueEntry,
  candidate: QueueEntry,
  now: number,
) {
  const bothWaitedMs = Math.max(
    0,
    Math.min(now - first.joined, now - candidate.joined) - CONFIG.expandAfterMs,
  );
  const steps = Math.floor(bothWaitedMs / CONFIG.ratingExpansionIntervalMs);
  return Math.min(
    CONFIG.maximumRatingWindow,
    CONFIG.initialRatingWindow + steps * CONFIG.ratingExpansionStep,
  );
}
