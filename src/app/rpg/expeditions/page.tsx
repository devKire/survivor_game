import Link from "next/link";
import { notFound } from "next/navigation";
import { isRpgEnabled, isRpgExpeditionsEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgEnabled()) notFound();
  await requirePageUser("/rpg/expeditions");
  return (
    <main className="account-shell rpg-page">
      <p className="eyebrow">RPG · RUÍNAS</p>
      <h1>Expedição do Obelisco</h1>
      <p className="lede">
        Uma travessia online de 10 minutos para 1 a 5 jogadores. Sua build RPG
        entra em combate e fica fixa até o fim da expedição.
      </p>
      <p>
        O líder escolhe “Expedição RPG” no lobby. Cada jogador escolhe um
        personagem desbloqueado e confirma que está pronto.
      </p>
      <p>
        Sobreviva até o fim para receber XP do personagem, materiais e
        equipamentos. Bosses e elites derrotados e cofres abertos com chave
        ampliam as recompensas.
      </p>
      <p>
        É preciso participar por pelo menos 6 minutos e se movimentar por 30
        segundos. Desconexões têm tolerância de 60 segundos. Derrota e expedição
        interrompida não concedem recompensas.
      </p>
      <p>
        O inventário de quatro slots continua temporário. Os novos equipamentos
        ficam no inventário RPG e podem ser usados na próxima expedição.
      </p>
      <div className="actions">
        {isRpgExpeditionsEnabled() ? (
          <Link href="/team">Entrar no lobby</Link>
        ) : (
          <p role="status">Expedições RPG estão indisponíveis no momento.</p>
        )}
        <Link href="/rpg/character">Preparar personagem</Link>
        <Link href="/rpg/rewards">Histórico de recompensas</Link>
      </div>
    </main>
  );
}
