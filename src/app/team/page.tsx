import PlayerHeader from "../hub/PlayerHeader";
import GameNavigation from "../hub/GameNavigation";
import { playerData } from "../../server/hub";
import { requirePageUser } from "../../server/hub";
import TeamClient from "./TeamClient";
export const dynamic = "force-dynamic";
export default async function Page(){const user=await requirePageUser("/team");const {player}=await playerData();return <TeamClient menuHeader={<><PlayerHeader player={player}/><GameNavigation/></>} user={{id:user.id,name:user.displayUsername||user.username||user.name}}/>;}
