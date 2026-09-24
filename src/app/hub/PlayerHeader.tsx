import Link from "next/link";
import { logout } from "../../server/auth-actions";
export type HubPlayer = {name:string;gems:number|null;gold:number|null};
export function CurrencyBar({gems,gold}: Pick<HubPlayer,"gems"|"gold">) {
  return <div className="hub-currency" aria-label="Saldo da conta"><span>◆ {gems?.toLocaleString("pt-BR") ?? "—"} <small>Gemas</small></span><span>◈ {gold?.toLocaleString("pt-BR") ?? "—"} <small>Ouro</small></span></div>;
}
export default function PlayerHeader({player,unavailable=false}: {player:HubPlayer|null;unavailable?:boolean}) {
  return <header className="hub-header">
    <Link className="hub-brand" href="/" aria-label="Limiar — Menu principal">LIMIAR<small>ECOS DO OBELISCO</small></Link>
    <div className="hub-player">
      {player && <CurrencyBar gems={player.gems} gold={player.gold}/>}
      {player ? <details className="profile-menu"><summary><span className="player-sigil" aria-hidden="true">◇</span>{player.name}<span aria-hidden="true">⌄</span></summary><nav aria-label="Menu do jogador"><Link href="/account">Perfil / Conta</Link><Link href="/account#settings">Configurações</Link><form action={logout}><button>Sair</button></form></nav></details> : <nav className="hub-auth" aria-label="Conta"><Link href="/login">Entrar</Link><Link href="/register">Criar conta</Link></nav>}
      <small className="hub-status">{unavailable ? "○ Serviços online indisponíveis" : player ? "● Conta conectada" : "○ Visitante"}</small>
    </div>
  </header>;
}
