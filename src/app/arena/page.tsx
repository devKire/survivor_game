import PlayerHeader from "../hub/PlayerHeader";
import GameNavigation from "../hub/GameNavigation";
import { playerData } from "../../server/hub";
import { requirePageUser } from "../../server/hub";
import ArenaClient from "./ArenaClient";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}: {searchParams:Promise<{mode?:string}>}) {
  const user = await requirePageUser("/arena");
  const {player}=await playerData();
  return <ArenaClient menuHeader={<><PlayerHeader player={player}/><GameNavigation/></>} userId={user.id} initialMode={(await searchParams).mode === "war" ? "WAR_CASUAL" : "DUEL_CASUAL"} />;
}
