"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SaveData } from "../../game/core/types";
import {
  COSMETICS,
  COSMETIC_TYPES,
  SHOP_CATEGORIES,
} from "../../game/content/cosmetics";
import { accountAction } from "../../server/actions";
export default function CollectionClient({
  save,
  owned,
  shop = false,
}: {
  save: SaveData;
  owned: string[];
  shop?: boolean;
}) {
  const router = useRouter(),
    [filter, setFilter] = useState("TODOS"),
    [category, setCategory] = useState("DESTAQUES"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(input: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await accountAction(input);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }
  const unavailable = shop && ["CONSUMÍVEIS PVE", "PACOTES"].includes(category);
  const items = Object.values(COSMETICS).filter(
    (c) =>
      (filter === "TODOS" || c.type === filter) &&
      (!shop ||
        category === "DESTAQUES" ||
        (category === "SKINS" && c.type === "CHARACTER_SKIN") ||
        (category === "SKINS DE ARMAS" && c.type === "WEAPON_SKIN") ||
        (category === "EFEITOS" && c.type.endsWith("EFFECT"))),
  );
  return (
    <main className="account-shell">
      <Link href="/account">← Conta</Link>
      <header className="menu-top">
        <h1>{shop ? "LOJA" : "COLEÇÃO"}</h1>
        <span>
          ◆ {save.gems} Gemas · ◈ {save.gold} Ouro
        </span>
      </header>
      <nav className="actions">
        <Link href="/collection">Coleção</Link>
        <Link href="/shop">Loja</Link>
        <Link href="/echoes">Ecos do Limiar</Link>
      </nav>
      <p>Aparência e expressão. Nenhum item altera atributos ou hitboxes.</p>
      {shop && (
        <nav className="actions">
          {SHOP_CATEGORIES.map((c) => (
            <button
              key={c}
              aria-pressed={c === category}
              onClick={() =>
                c === "GACHA" ? router.push("/echoes") : setCategory(c)
              }
            >
              {c}
            </button>
          ))}
        </nav>
      )}
      <label>
        Tipo{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>TODOS</option>
          {COSMETIC_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <p role="status">{error}</p>
      {unavailable ? (
        <p>
          Sem ofertas nesta categoria. O catálogo atual é exclusivamente
          cosmético.
        </p>
      ) : (
        <div className="cards">
          {items.map((c) => {
            const has = owned.includes(c.id),
              equipped = save.cosmetics[c.type] === c.id;
            return (
              <article key={c.id} className="card">
                <div
                  className="cosmetic-preview"
                  style={{ color: c.color, borderColor: c.color }}
                >
                  {c.glyph}
                </div>
                <small>
                  {c.rarity} · {c.type}
                </small>
                <h2>{c.name}</h2>
                <p>{equipped ? "Equipado" : has ? "Adquirido" : "Bloqueado"}</p>
                {has ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act({ type: "equip", id: c.id, equip: !equipped })
                    }
                  >
                    {equipped ? "Desequipar" : "Equipar"}
                  </button>
                ) : shop ? (
                  <div className="actions">
                    <button
                      disabled={busy || save.gold < c.gold}
                      onClick={() =>
                        void act({
                          type: "shop-buy",
                          id: c.id,
                          currency: "GOLD",
                        })
                      }
                    >
                      ◈ {c.gold} Ouro
                    </button>
                    {c.gems && (
                      <button
                        disabled={busy || save.gems < c.gems}
                        onClick={() =>
                          void act({
                            type: "shop-buy",
                            id: c.id,
                            currency: "GEMS",
                          })
                        }
                      >
                        ◆ {c.gems} Gemas
                      </button>
                    )}
                  </div>
                ) : (
                  <Link href="/shop">Ver na loja</Link>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
