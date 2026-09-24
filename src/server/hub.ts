import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { session } from "./auth";
import { configurationError } from "./config";
import { progress } from "./progress";
import { friends } from "./social";
import { currentTeam } from "./teams";
import { migrateSave, validateRunSnapshot } from "../game/core/save";
import { CHARACTER_DEFINITIONS, MAP_DEFINITIONS } from "../game/content/catalog";
import { loginHref } from "../app/hub/navigation";
import type { RunSnapshot } from "../game/core/types";

export const hubSession = cache(async () => {
  if (configurationError()) return { user: null, unavailable: true };
  try {
    const s = await session();
    return { user: s?.user ?? null, unavailable: false };
  } catch { return { user: null, unavailable: true }; }
});
export async function requirePageUser(destination: string) {
  const {user} = await hubSession();
  if (!user) redirect(loginHref(destination));
  return user;
}
export function runSummary(run: RunSnapshot | null) {
  if (!run || !validateRunSnapshot(run, false)) return null;
  return `${Math.floor(run.time / 60).toString().padStart(2,"0")}:${Math.floor(run.time % 60).toString().padStart(2,"0")} · ${CHARACTER_DEFINITIONS[run.character].name} · ${MAP_DEFINITIONS[run.mapId].name}`;
}
export const playerData = cache(async () => {
  const state = await hubSession();
  if (!state.user) return {...state, player:null, solo:null, social:null};
  const name = state.user.displayUsername || state.user.username || state.user.name;
  try {
    const [row, relationships, team] = await Promise.all([
      progress(state.user.id),
      friends(state.user.id),
      currentTeam(state.user.id),
    ]);
    const save = migrateSave(row.data);
    return {
      ...state,
      player: {name, gems:save.gems, gold:save.gold},
      solo: runSummary(migrateSave(row.localArchive || row.data).activeRun),
      social: {
        friends: relationships.filter((friend) => friend.status === "ACCEPTED").length,
        teamSize: team?.members.length ?? 0,
      },
    };
  } catch {
    return {...state, unavailable:true, player:{name,gems:null,gold:null},solo:null,social:null};
  }
});
