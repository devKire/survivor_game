import Link from "next/link";
import { notFound } from "next/navigation";
import { isRpgExplorationEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { explorationHistory } from "../../../server/rpg/exploration/history";
import { EXPLORATION_POIS } from "../../../game/content/rpg/exploration-pois";
import { RPG_MATERIALS } from "../../../game/content/rpg";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; regionId?: string }>;
}) {
  if (!isRpgExplorationEnabled()) notFound();
  const user = await requirePageUser("/rpg/discoveries");
  let data;
  try {
    data = await explorationHistory(user.id, await searchParams);
  } catch {
    notFound();
  }
  const poi = EXPLORATION_POIS["ruins-remnant"];
  return (
    <main className="account-shell rpg-page">
      <p className="eyebrow">ARREDORES DAS RUÍNAS</p>
      <h1>Diário de exploração</h1>
      <p>
        {data.discoveries.length} locais descobertos · {data.cycleClaims}/18
        coletas neste dia UTC.
      </p>
      <section className="card">
        <h2>Locais descobertos</h2>
        {data.discoveries.length ? (
          <ul>
            {data.discoveries.map((d) => (
              <li key={d.poiId}>
                <strong>{poi.name}</strong> · descoberto ·{" "}
                {new Date(d.discoveredAt).toLocaleString("pt-BR", {
                  timeZone: "UTC",
                })}{" "}
                UTC<p>{poi.description}</p>
                <small>{d.poiId}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Nenhum local registrado. Aproxime-se dos vestígios durante uma
            exploração.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Coletas confirmadas</h2>
        {data.claims.length ? (
          <ul>
            {data.claims.map((c) => (
              <li key={c.id}>
                +{c.quantity}{" "}
                {RPG_MATERIALS[c.materialId as keyof typeof RPG_MATERIALS]
                  ?.name ?? c.materialId}{" "}
                ·{" "}
                {new Date(c.createdAt).toLocaleString("pt-BR", {
                  timeZone: "UTC",
                })}{" "}
                UTC<small> · {c.nodeId}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma coleta confirmada.</p>
        )}
        {data.nextCursor && (
          <Link
            href={`/rpg/discoveries?cursor=${encodeURIComponent(data.nextCursor)}`}
          >
            Coletas anteriores
          </Link>
        )}
      </section>
      <nav className="actions">
        <Link href="/rpg/exploration">Explorar região</Link>
        <Link href="/rpg/inventory">Ver materiais no inventário</Link>
        <Link href="/rpg/refuge">Voltar ao Refúgio</Link>
      </nav>
    </main>
  );
}
