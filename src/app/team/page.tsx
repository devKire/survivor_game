import PlayerHeader from "../hub/PlayerHeader";
import GameNavigation from "../hub/GameNavigation";
import { playerData } from "../../server/hub";
import { requirePageUser } from "../../server/hub";
import {
  isRpgExplorationEnabled,
  isRpgRefugeEnabled,
  isRpgEnabled,
  isRpgQuestsEnabled,
  isRpgExpeditionsEnabled,
} from "../../server/env";
import TeamClient from "./TeamClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requirePageUser("/team");
  const { player } = await playerData();
  return (
    <TeamClient
      rpgQuestsEnabled={isRpgQuestsEnabled()}
      rpgExplorationEnabled={isRpgExplorationEnabled()}
      rpgRefugeEnabled={isRpgRefugeEnabled()}
      rpgExpeditionsEnabled={isRpgExpeditionsEnabled()}
      menuHeader={
        <>
          <PlayerHeader player={player} />
          <GameNavigation rpgEnabled={isRpgEnabled()} />
        </>
      }
      user={{
        id: user.id,
        name: user.displayUsername || user.username || user.name,
      }}
    />
  );
}
