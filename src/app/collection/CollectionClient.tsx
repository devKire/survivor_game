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
import CharacterPreview from "../components/CharacterPreview";
import { PVP_LOADOUTS, type PvpCharacter } from "../../game/content/pvp";
import { accountAction } from "../../server/actions";
import { STORE_OFFERS } from "../../game/content/store-offers";
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
    [character, setCharacter] = useState<PvpCharacter>("nara"),
    [preview, setPreview] = useState<string | null>(null),
    [equipment, setEquipment] = useState<"PVP" | "PVE">("PVP"),
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
  const equippedCosmetics =
    equipment === "PVP" ? save.pvpCosmetics[character] : save.cosmetics;
  const featured = STORE_OFFERS.find(
    (offer) => offer.enabled && offer.featured,
  )!;
  const unavailable =
    shop && ["CONSUMÍVEIS PVE", "PACOTES", "MOEDAS"].includes(category);
  const items = Object.values(COSMETICS).filter(
    (c) =>
      (!c.character || c.character === character) &&
      (filter === "TODOS" || c.type === filter) &&
      (!shop ||
        category === "DESTAQUES" ||
        (category === "PARA VOCÊ" && !owned.includes(c.id)) ||
        (category === "SKINS" && c.type === "CHARACTER_SKIN") ||
        (category === "SKINS DE ARMAS" && c.type === "WEAPON_SKIN") ||
        (category === "EFEITOS" &&
          (c.type.endsWith("EFFECT") || c.type === "MOVEMENT_TRAIL"))),
  );
  return (
    <main className="account-shell">
      <header className="menu-top">
        <h1>{shop ? "LOJA DO LIMIAR" : "PERSONAGENS"}</h1>
        {shop && (
          <strong className="currency-badge">
            ◈ {save.gold} Ouro · ◆ {save.gems} Gemas
          </strong>
        )}
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
      {shop && category === "DESTAQUES" && (
        <section className="store-feature game-panel">
          <CharacterPreview
            character={character}
            cosmetics={{ CHARACTER_SKIN: featured.productIds[0] }}
            size={220}
          />
          <div>
            <small>OFERTA EM DESTAQUE</small>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <strong className="currency-badge">
              ◈ {featured.internalPrice?.amount} Ouro
            </strong>
            <button
              disabled={
                busy ||
                owned.includes(featured.productIds[0]) ||
                save.gold < (featured.internalPrice?.amount || 0)
              }
              onClick={() =>
                void act({
                  type: "shop-buy",
                  id: featured.productIds[0],
                  currency: "GOLD",
                })
              }
            >
              {owned.includes(featured.productIds[0]) ? "ADQUIRIDO" : "COMPRAR"}
            </button>
          </div>
        </section>
      )}
      {!shop && (
        <div className="actions">
          <button
            aria-pressed={equipment === "PVP"}
            onClick={() => {
              setEquipment("PVP");
              setPreview(null);
            }}
          >
            Arena · por personagem
          </button>
          <button
            aria-pressed={equipment === "PVE"}
            onClick={() => {
              setEquipment("PVE");
              setPreview(null);
            }}
          >
            Expedição · aparência global
          </button>
        </div>
      )}
      <div
        className={shop ? "actions store-character-picker" : "character-cards"}
      >
        {(Object.keys(PVP_LOADOUTS) as PvpCharacter[]).map((id) => (
          <button
            key={id}
            className="character-card"
            aria-pressed={id === character}
            onClick={() => {
              setCharacter(id);
              setPreview(null);
            }}
          >
            {!shop && (
              <CharacterPreview
                character={id}
                cosmetics={
                  equipment === "PVP" ? save.pvpCosmetics[id] : save.cosmetics
                }
                size={150}
              />
            )}
            <strong>
              {shop ? "Ver em " : ""}
              {PVP_LOADOUTS[id].name}
            </strong>
            {!shop && (
              <>
                <small>{PVP_LOADOUTS[id].title}</small>
                <small>
                  {
                    Object.values(COSMETICS).filter(
                      (c) =>
                        c.type === "CHARACTER_SKIN" &&
                        owned.includes(c.id) &&
                        (!c.character || c.character === id),
                    ).length
                  }{" "}
                  skins possuídas
                </small>
              </>
            )}
          </button>
        ))}
      </div>
      {(!shop || preview) && (
        <section className="collection-hero game-panel">
          <CharacterPreview
            character={character}
            cosmetics={{
              ...equippedCosmetics,
              ...(preview ? { [COSMETICS[preview].type]: preview } : {}),
            }}
            size={240}
          />
          <div>
            <small>{shop ? "EXPERIMENTE A APARÊNCIA" : "APARÊNCIA"}</small>
            <h2>{PVP_LOADOUTS[character].name}</h2>
            <p>{PVP_LOADOUTS[character].title}</p>
            <p>{preview ? COSMETICS[preview].name : "Aparência equipada"}</p>
            <small>Visualizar não altera o equipamento.</small>
          </div>
        </section>
      )}
      {shop && category === "DESTAQUES" && (
        <h2>Skins e expressões do Limiar</h2>
      )}
      <label>
        Aparência{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>TODOS</option>
          {COSMETIC_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <p role="status">{error}</p>
      {unavailable ? (
        <p>Em breve. Compras com dinheiro real estão desativadas.</p>
      ) : (
        <div className="cards">
          {items.map((c) => {
            const has = owned.includes(c.id),
              equipped = equippedCosmetics[c.type] === c.id;
            return (
              <article key={c.id} className="card">
                <button
                  className="cosmetic-preview-button"
                  aria-label={"Visualizar " + c.name}
                  onClick={() => setPreview(c.id)}
                >
                  <CharacterPreview
                    character={character}
                    cosmetics={{
                      ...save.pvpCosmetics[character],
                      [c.type]: c.id,
                    }}
                    size={180}
                  />
                </button>
                <small>
                  {c.rarity} · {c.type}
                </small>
                <h2>{c.name}</h2>
                <p>{equipped ? "Equipado" : has ? "Adquirido" : "Bloqueado"}</p>
                {has ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        equipment === "PVP"
                          ? {
                              type: "pvp-cosmetic",
                              character,
                              slot: c.type,
                              id: equipped ? null : c.id,
                            }
                          : { type: "equip", id: c.id, equip: !equipped },
                      )
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
