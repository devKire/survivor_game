import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "../../../server/hub";
import { isRpgQuestsEnabled } from "../../../server/env";
import { rpgQuestJournal } from "../../../server/rpg/quests/journal";
import QuestJournal from "./QuestJournal";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgQuestsEnabled()) notFound();
  const user = await requirePageUser("/rpg/quests");
  const journal = await rpgQuestJournal(user.id);
  return (
    <main className="account-shell rpg-page">
      <h1>Diário de missões</h1>
      <p>
        Converse com os responsáveis, registre suas descobertas e acompanhe suas
        entregas. As recompensas aparecem após confirmação do servidor.
      </p>
      <nav className="actions">
        <Link href="/rpg/refuge">Voltar ao Refúgio</Link>
        <Link href="/rpg/exploration">Explorar os arredores</Link>
        <Link href="/rpg/expeditions">Preparar expedição</Link>
      </nav>
      <QuestJournal initial={journal} />
    </main>
  );
}
