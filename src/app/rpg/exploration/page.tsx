import Link from "next/link";
import { notFound } from "next/navigation";
import { isRpgExplorationEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { EXPLORATION_RUINS as region } from "../../../game/content/rpg/exploration-regions";
import { rpgProfileData } from "../../../server/rpg/profile";
import { RPG_CHARACTERS } from "../../../game/content/rpg";
import PrepareExploration from "./PrepareExploration";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgExplorationEnabled()) notFound();
  const user = await requirePageUser("/rpg/exploration"),
    profile = await rpgProfileData(user.id),
    active = profile.characters.find(
      (c) => c.id === profile.activeCharacterId,
    )!;
  return (
    <main className="account-shell rpg-page">
      <p className="eyebrow">RECONHECIMENTO · 1–5 JOGADORES</p>
      <h1>Exploração do Limiar</h1>
      <section className="card">
        <h2>{region.name}</h2>
        <p>{region.description}</p>
        <p>
          {
            RPG_CHARACTERS[active.characterId as keyof typeof RPG_CHARACTERS]
              .name
          }{" "}
          · nível RPG {active.level}. A build é fixada ao iniciar.
        </p>
        <p>
          Área delimitada · até 15 minutos · sem ondas. Encontre minérios,
          fibras e cristais. Cada recurso é pessoal: uma coleta por conta e por
          dia UTC, até 12 nesta sessão e 18 no dia.
        </p>
        <p>
          A coleta exige proximidade e permanência. Movimento ou desconexão
          cancela a ação em andamento. Materiais confirmados e descobertas ficam
          na conta mesmo após sair.
        </p>
        <PrepareExploration />
        <p>
          No lobby, todos confirmam PRONTO; o líder inicia. Para participar de
          uma equipe existente, use seu código no lobby.
        </p>
      </section>
      <nav className="actions">
        <Link href="/team">Abrir lobby / reconectar</Link>
        <Link href="/rpg/discoveries">Diário de exploração</Link>
        <Link href="/rpg/refuge">Voltar ao Refúgio</Link>
      </nav>
    </main>
  );
}
