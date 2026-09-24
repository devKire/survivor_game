import Link from "next/link";
import { playerData } from "../server/hub";
import PlayerHeader from "./hub/PlayerHeader";
import HubMenu from "./hub/HubMenu";
import ContinueRuns from "./hub/ContinueRuns";
export const dynamic = "force-dynamic";
export default async function Home() {
 const {player,unavailable,solo,social}=await playerData();
 return <main className="game-hub">
  <div className="hub-scenery" aria-hidden="true"><div className="hub-moon"/><div className="hub-ruins"/><div className="hub-monolith"><i/></div><div className="hub-fog"/></div>
  <div className="hub-content"><PlayerHeader player={player} unavailable={unavailable}/>
   <div className="hub-intro"><span className="eyebrow">{player?"SEU ECO AINDA RESISTE":"A NÉVOA CHAMA POR VOCÊ"}</span><h1>{player?"Sua próxima travessia.":"Nem tudo se perde\nna escuridão."}</h1><p>{player?"Sozinho ou em companhia. Escolha como atravessar.":"Um mundo em ruínas. Um obelisco. Os ecos de quem ousou atravessar."}</p></div>
   <HubMenu authenticated={!!player} unavailable={unavailable}><ContinueRuns solo={solo}/></HubMenu>
   <footer className="hub-footer"><span>LIMIAR · VOL. 02</span><span>Progresso local e da conta são independentes.</span>{social&&<Link className="hub-social" href="/team"><span>Amigos <b>{social.friends}</b></span><span>Equipe <b>{social.teamSize}/5</b></span><small>Gerenciar ↗</small></Link>}</footer>
  </div>
 </main>;
}
