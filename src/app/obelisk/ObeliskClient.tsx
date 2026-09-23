"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SaveData } from "../../game/core/types";
import {
  OBELISK_BRANCHES,
  OBELISK_NODES,
  nodeBlocked,
  nodeCost,
  nodeValue,
  type Branch,
} from "../../game/content/obelisk";
import { accountAction } from "../../server/actions";
export default function ObeliskClient({ save }: { save: SaveData }) {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch>("OFENSIVA");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="account-shell">
      <Link href="/account">← Conta</Link>
      <header className="menu-top">
        <div>
          <span className="eyebrow">O QUE PERMANECE</span>
          <h1>OBELISCO</h1>
        </div>
        <span>
          ◆ {save.gems} Gemas · ◈ {save.gold} Ouro
        </span>
      </header>
      <p>
        Escolha seus caminhos. Bônus pequenos, com retornos decrescentes.
        Válidos apenas no PvE.
      </p>
      <nav className="actions" aria-label="Ramos do Obelisco">
        {OBELISK_BRANCHES.map((b) => (
          <button
            key={b}
            aria-pressed={branch === b}
            onClick={() => setBranch(b)}
          >
            {b}
          </button>
        ))}
      </nav>
      <p role="status">{error}</p>
      <div className="obelisk-tree">
        {Object.values(OBELISK_NODES)
          .filter((n) => n.branch === branch)
          .map((n) => {
            const rank = save.upgrades[n.id] || 0,
              blocked = nodeBlocked(n.id, save.upgrades, save.unlocked),
              cost = nodeCost(n.id, rank);
            return (
              <article
                key={n.id}
                className="card obelisk-node"
                style={{
                  gridRow: n.position.row + 1,
                  gridColumn: n.position.column + 1,
                }}
              >
                <small>
                  {n.prerequisites.length
                    ? "↓ " +
                      n.prerequisites
                        .map((p) => `${OBELISK_NODES[p.id].name} ${p.rank}`)
                        .join(" + ")
                    : "RAIZ"}
                </small>
                <h2>{n.name}</h2>
                <p>{n.text}</p>
                <p>
                  Nível {rank}/{n.maxRank}
                  <br />
                  Atual: {nodeValue(n.id, rank)}
                  <br />
                  Próximo:{" "}
                  {rank === n.maxRank ? "MÁXIMO" : nodeValue(n.id, rank + 1)}
                </p>
                {n.excludes && <p>Ou: {OBELISK_NODES[n.excludes].name}</p>}
                <button
                  disabled={busy || !!blocked || save.gems < cost}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const r = await accountAction({
                        type: "buy",
                        id: n.id,
                        expectedRank: rank,
                      });
                      if (!r.ok) setError(r.error);
                      else router.refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {blocked || `◆ ${cost} Gemas · Desenvolver`}
                </button>
              </article>
            );
          })}
      </div>
      <p className="muted">
        Níveis anteriores foram preservados. Caminhos já adquiridos continuam
        disponíveis. Não há respec nesta versão.
      </p>
    </main>
  );
}
