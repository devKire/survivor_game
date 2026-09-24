import { playerData } from "../../server/hub";
import PlayerHeader from "./PlayerHeader";
import GameNavigation from "./GameNavigation";
export default async function GameAppShell({children}: {children:React.ReactNode}) {
 const {player,unavailable}=await playerData();
 return <div className="game-app-shell"><PlayerHeader player={player} unavailable={unavailable}/><GameNavigation/><div className="game-app-content">{children}</div></div>;
}
