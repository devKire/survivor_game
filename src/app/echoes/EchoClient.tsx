"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COSMETICS, RARITIES } from "../../game/content/cosmetics";
import {
  ECHO_BANNER,
  effectiveOdds,
  type Pity,
  type EchoResult,
} from "../../game/content/gacha";
import type { SaveData } from "../../game/core/types";
import { echoAction } from "../../server/actions";
export default function EchoClient({
  save,
  owned,
  state,
  history,
}: {
  save: SaveData;
  owned: string[];
  state: Pity & { fragments: number };
  history: {
    id: string;
    at: string;
    currency: string;
    cost: number;
    results: EchoResult[];
  }[];
}) {
  const router = useRouter(),
    [currency, setCurrency] = useState<"GOLD" | "GEMS">("GOLD"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [results, setResults] = useState<EchoResult[]>([]),
    [animation, setAnimation] = useState(false),
    [workshop, setWorkshop] = useState(false);
  async function pull(count: 1 | 11) {
    setBusy(true);
    setError("");
    const key = `limiar.echo.request.${currency}.${count}`;
    const requestId = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key, requestId);
    try {
      const r = await echoAction({ type: "pull", currency, count, requestId });
      if (r.ok) {
        sessionStorage.removeItem(key);
        setResults(r.results);
        setAnimation(true);
        router.refresh();
      } else setError(r.error);
    } catch {
      setError(
        "Conexão interrompida. Clique novamente para recuperar o mesmo pedido.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-shell">
      <header className="menu-top">
        <h1>{workshop ? "OFICINA DE ECOS" : "ECOS DO LIMIAR"}</h1>
      </header>
      <nav className="actions">
        <button onClick={() => setWorkshop(!workshop)}>
          {workshop ? "Voltar ao portal" : "Oficina de Ecos"}
        </button>
        <Link href="/collection">Coleção</Link>
      </nav>
      <p>
        Fragmentos de Eco: {state.fragments} · usados apenas para fabricar
        cosméticos.
      </p>
      <p role="status">{error}</p>
      {workshop ? (
        <div className="cards">
          {Object.values(COSMETICS).map((c) => (
            <article className="card" key={c.id}>
              <div className="cosmetic-preview" style={{ color: c.color }}>
                {c.glyph}
              </div>
              <h2>{c.name}</h2>
              <p>
                {c.rarity} · {c.fragments} Fragmentos
              </p>
              <button
                disabled={
                  busy || owned.includes(c.id) || state.fragments < c.fragments
                }
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await echoAction({ type: "craft", id: c.id });
                    if (!r.ok) setError(r.error);
                    else router.refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {owned.includes(c.id) ? "Adquirido" : "Fabricar"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <>
          <h2>{ECHO_BANNER.name}</h2>
          <p>
            Somente cosméticos. Todos os dez tipos participam; itens da mesma
            raridade têm chance igual.
          </p>
          <table>
            <thead>
              <tr>
                <th>Raridade</th>
                <th>Chance base</th>
                <th>Próximo giro, com pity</th>
                <th>Duplicata</th>
              </tr>
            </thead>
            <tbody>
              {RARITIES.map((r, i) => (
                <tr key={r}>
                  <td>{r}</td>
                  <td>{ECHO_BANNER.weights[i] / 100}%</td>
                  <td>{effectiveOdds(state)[i]}%</td>
                  <td>{ECHO_BANNER.duplicateFragments[i]} Fragmentos</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Pity Raro {state.rare}/10 · Épico {state.epic}/50 · Lendário{" "}
            {state.legendary}/100
          </p>
          <p>
            O 10º giro sem Raro+ garante Raro+; o 50º sem Épico+ garante Épico+;
            o 100º sem Lendário+ garante Lendário+. Vale a maior garantia. Cada
            resultado reinicia todos os contadores cuja raridade atingiu. Um
            Mítico reinicia os três. O pity deste banner permanente não expira.
          </p>
          <label>
            Moeda{" "}
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "GOLD" | "GEMS")}
            >
              <option value="GOLD">Ouro</option>
              <option value="GEMS">Gemas</option>
            </select>
          </label>
          <div className="actions">
            {([1, 11] as const).map((count) => {
              const cost =
                (currency === "GOLD" ? ECHO_BANNER.gold : ECHO_BANNER.gems) *
                (count === 11 ? 10 : 1);
              return (
                <button
                  key={count}
                  disabled={
                    busy || (currency === "GOLD" ? save.gold : save.gems) < cost
                  }
                  onClick={() => void pull(count)}
                >
                  {count} giro{count > 1 ? "s" : ""} · {cost}{" "}
                  {currency === "GOLD" ? "Ouro" : "Gemas"}
                </button>
              );
            })}
          </div>
          {animation && (
            <div className="echo-portal">
              <span>✺</span>
              <button onClick={() => setAnimation(false)}>
                Pular animação
              </button>
            </div>
          )}
          <div aria-live="polite" className="cards">
            {results.map((r, i) => (
              <article
                className="card"
                key={i}
                style={{ borderColor: COSMETICS[r.cosmeticId].color }}
              >
                <h3>{COSMETICS[r.cosmeticId].name}</h3>
                <p>
                  {r.rarity} ·{" "}
                  {r.duplicate
                    ? `Duplicata → ${r.fragments} Fragmentos`
                    : "Adicionado à coleção"}
                  {r.pityActivated ? " · Pity ativado" : ""}
                </p>
              </article>
            ))}
          </div>
          <details>
            <summary>Histórico recente</summary>
            {history.map((h) => (
              <article key={h.id}>
                <p>
                  {new Date(h.at).toLocaleString("pt-BR")} · {h.cost}{" "}
                  {h.currency}
                </p>
                <p>
                  {h.results
                    .map(
                      (r) =>
                        `${COSMETICS[r.cosmeticId].name}${r.duplicate ? ` (+${r.fragments} Fragmentos)` : ""}`,
                    )
                    .join(" · ")}
                </p>
              </article>
            ))}
          </details>
        </>
      )}
    </main>
  );
}
