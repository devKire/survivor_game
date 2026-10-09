import Link from "next/link";
import { notFound } from "next/navigation";
import { isRpgEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import {
  rpgRewardDetail,
  rpgRewardHistory,
  type RpgRewardDetail,
} from "../../../server/rpg/reward-history";
import {
  RPG_CHARACTERS,
  RPG_ITEMS,
  RPG_MATERIALS,
} from "../../../game/content/rpg";
import { rarityLabels } from "../presentation";

export const dynamic = "force-dynamic";
const names = RPG_CHARACTERS as Record<string, { name: string }>;
const itemNames = RPG_ITEMS as Record<string, { name: string }>;
const materialNames = RPG_MATERIALS as Record<string, { name: string }>;
const reasons = {
  ELIGIBLE: "Recompensa confirmada",
  DEFEAT: "Derrota: sem recompensa persistente",
  INSUFFICIENT_PARTICIPATION: "Tempo de participação insuficiente",
  INACTIVE: "Atividade insuficiente",
  DISCONNECTED: "Desconectado além da tolerância",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isRpgEnabled()) notFound();
  const user = await requirePageUser("/rpg/rewards"),
    query = await searchParams;
  let entries: RpgRewardDetail[],
    nextCursor: string | null = null;
  try {
    if (query.sessionId) {
      const entry = await rpgRewardDetail(user.id, query);
      entries = entry ? [entry] : [];
    } else ({ entries, nextCursor } = await rpgRewardHistory(user.id, query));
  } catch {
    return (
      <main className="account-shell rpg-page">
        <h1>Recompensas RPG</h1>
        <p role="alert">
          Não foi possível consultar as recompensas. Tente novamente.
        </p>
        <Link href="/rpg/rewards">Voltar ao histórico</Link>
      </main>
    );
  }
  return (
    <main className="account-shell rpg-page">
      <p className="eyebrow">RPG</p>
      <h1>Recompensas RPG</h1>
      <nav className="actions">
        <Link href="/rpg/expeditions">Expedições</Link>
        <Link href="/rpg/inventory">Inventário</Link>
        <Link href="/rpg/character">Personagens</Link>
        {query.sessionId && <Link href="/rpg/rewards">Todo o histórico</Link>}
      </nav>
      {!entries.length && <p>Nenhuma expedição disponível nesta conta.</p>}
      <div className="cards">
        {entries.map((entry) => (
          <article className="card" key={entry.sessionId}>
            <h2>{names[entry.characterId]?.name ?? entry.characterId}</h2>
            <p>
              {new Date(entry.startedAt).toLocaleString("pt-BR", {
                timeZone: "UTC",
              })}{" "}
              UTC
            </p>
            {!entry.receipt ? (
              <>
                <p role="status">
                  {entry.status === "INTERRUPTED"
                    ? "Expedição interrompida. Nenhuma recompensa concedida."
                    : entry.status === "RUNNING"
                      ? "Expedição em andamento."
                      : "Resultado registrado. Recompensas pendentes de confirmação."}
                </p>
                <Link
                  href={`/rpg/rewards?sessionId=${encodeURIComponent(entry.sessionId)}`}
                >
                  Atualizar resultado
                </Link>
              </>
            ) : (
              <>
                <p role="status">{reasons[entry.receipt.result.eligibility]}</p>
                <p>
                  +{entry.receipt.xpGranted} XP · nível{" "}
                  {entry.receipt.previousLevel} → {entry.receipt.newLevel}
                </p>
                {entry.receipt.pointsGranted > 0 && (
                  <p>
                    +{entry.receipt.pointsGranted} pontos de atributo
                    disponíveis.
                  </p>
                )}
                <h3>Materiais recebidos</h3>
                <ul>
                  {entry.receipt.result.materials.map((m) => (
                    <li key={m.materialId}>
                      {materialNames[m.materialId]?.name ?? m.materialId}: +
                      {m.quantity}
                      {m.capped ? " (limite de saldo atingido)" : ""}
                    </li>
                  ))}
                </ul>
                <h3>Equipamentos recebidos</h3>
                {!entry.receipt.result.equipment.length ? (
                  <p>Nenhum equipamento.</p>
                ) : (
                  <ul>
                    {entry.receipt.result.equipment.map((item) => (
                      <li key={item.id}>
                        {itemNames[item.itemId]?.name ?? item.itemId} ·{" "}
                        {rarityLabels[item.rarity]} · nível {item.level}
                        <p>
                          {item.affixes.length} affixes · veja os detalhes no
                          inventário.
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href={`/rpg/rewards?sessionId=${encodeURIComponent(entry.sessionId)}`}
                >
                  Ver recibo
                </Link>
              </>
            )}
          </article>
        ))}
      </div>
      {nextCursor && (
        <Link href={`/rpg/rewards?cursor=${encodeURIComponent(nextCursor)}`}>
          Próximas expedições
        </Link>
      )}
    </main>
  );
}
