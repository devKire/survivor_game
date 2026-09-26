"use client";
import { useEffect, useState } from "react";
import {
  WAR,
  WAR_ITEM_DEFINITIONS,
  type WarView,
  type GroupOrder,
  type TroopType,
} from "../../game/content/war";
import {
  WEAPON_DEFINITIONS,
  PASSIVE_DEFINITIONS,
  WEAPON_PATHS,
} from "../../game/content/catalog";
import { GameDrawer, HudSlot } from "../components/GameUI";
import type { ClientMessage } from "../../game/network/protocol";
export default function WarControls({
  war,
  send,
  place,
  repair,
}: {
  war: WarView;
  send: (message: ClientMessage) => void;
  place: (kind: "TORRE" | "BARRICADA") => void;
  repair: () => void;
}) {
  const [lane, setLane] = useState(0),
    [kind, setKind] = useState<TroopType>("SOLDADO"),
    [count, setCount] = useState(3),
    [formation, setFormation] = useState<"LINHA" | "COLUNA" | "DISPERSAR">(
      "LINHA",
    ),
    [shopOpen, setShopOpen] = useState(false),
    [upgradeOpen, setUpgradeOpen] = useState(false),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Recomendados"),
    [rolePanelOpen, setRolePanelOpen] = useState(false);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input, textarea, select, [contenteditable="true"]',
          ))
      )
        return;
      if (event.code === "KeyB") {
        event.preventDefault();
        setShopOpen((open) => !open);
        setUpgradeOpen(false);
        setRolePanelOpen(false);
      }
      if (event.code === "KeyU" && war.pendingUpgrades > 0) {
        event.preventDefault();
        setUpgradeOpen((open) => !open);
        setShopOpen(false);
        setRolePanelOpen(false);
      }
      if (event.code === "Escape") {
        setShopOpen(false);
        setUpgradeOpen(false);
        setRolePanelOpen(false);
      }
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, [war.pendingUpgrades]);
  return (
    <section className="war-controls">
      <div className="war-player-stats">
        <strong>
          Nv. {war.level} · {war.role}
        </strong>
        <progress
          aria-label="Experiência da Guerra"
          max={war.xpToNextLevel || 1}
          value={war.xp}
        />
        <small>
          XP {war.xp} / {war.xpToNextLevel || "MÁX"}
        </small>
        {war.respawnIn > 0 && (
          <strong role="status">
            Renascendo · {Math.ceil(war.respawnIn)}s
          </strong>
        )}
      </div>
      <div className="war-arsenal" aria-label="Arsenal">
        {war.weapons.map((weapon) => (
          <HudSlot
            key={weapon.id}
            icon={WEAPON_DEFINITIONS[weapon.id]?.icon || "◆"}
            label={WEAPON_DEFINITIONS[weapon.id]?.name || weapon.id}
            detail={
              "Nv." +
              weapon.level +
              (weapon.path
                ? " · " +
                  (WEAPON_PATHS[weapon.id]?.[weapon.path]?.name || "Evolução")
                : "")
            }
          />
        ))}
        {Object.entries(war.passives)
          .filter(([, level]) => level > 0)
          .map(([id, level]) => (
            <HudSlot
              key={id}
              icon={PASSIVE_DEFINITIONS[id]?.icon || "◇"}
              label={PASSIVE_DEFINITIONS[id]?.name || id}
              detail={"Nv." + level}
            />
          ))}
        <HudSlot icon="»" label="Deslocamento" detail="Espaço" />
      </div>
      <div className="war-inventory" aria-label="Inventário">
        {Array.from({ length: 6 }, (_, i) => {
          const item = WAR_ITEM_DEFINITIONS[war.items[i]?.id];
          return (
            <HudSlot
              key={i}
              icon={item?.glyph || "·"}
              label={item?.name || "Slot vazio"}
            />
          );
        })}
      </div>
      <strong className="currency-badge">◈ {war.warGold}</strong>
      {war.pendingUpgrades > 0 && (
        <button
          className="upgrade-ready"
          onClick={() => {
            setUpgradeOpen(true);
            setShopOpen(false);
          }}
        >
          + MELHORIA · U · {war.pendingUpgrades}
        </button>
      )}
      {upgradeOpen && war.pendingUpgrades > 0 && (
        <GameDrawer
          title="Melhorias da Guerra"
          onClose={() => setUpgradeOpen(false)}
        >
          <strong>
            +{war.pendingUpgrades} MELHORIA{war.pendingUpgrades > 1 ? "S" : ""}{" "}
            · Escolha sua evolução
          </strong>
          <div className="actions">
            {war.choices.map((choice) => (
              <button
                key={choice.id}
                onClick={() => {
                  send({
                    type: "ARENA_WAR_CHOOSE_UPGRADE",
                    decision: war.decision,
                    choice: choice.id,
                  });
                  setUpgradeOpen(false);
                }}
              >
                <b>{choice.name}</b>
                <small>
                  {choice.kind.toUpperCase()} · {choice.description}
                </small>
                {choice.currentLevel !== undefined && (
                  <small>
                    Nv. {choice.currentLevel} → {choice.nextLevel}
                  </small>
                )}
              </button>
            ))}
          </div>
        </GameDrawer>
      )}
      <button
        onClick={() => {
          setShopOpen(true);
          setUpgradeOpen(false);
          setRolePanelOpen(false);
        }}
      >
        LOJA · B
      </button>
      {shopOpen && (
        <GameDrawer title="Loja da Guerra" onClose={() => setShopOpen(false)}>
          <strong className="currency-badge">◈ {war.warGold} WarGold</strong>
          {!war.shopAvailable && <p>Volte à base para comprar ou vender.</p>}
          <input
            aria-label="Buscar item"
            placeholder="Buscar item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="actions">
            {[
              "Recomendados",
              "Todos",
              "Poder",
              "Sobrevivência",
              "Mobilidade",
              "Utilidade",
            ].map((name) => (
              <button
                key={name}
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="war-item-grid">
            {Object.values(WAR_ITEM_DEFINITIONS)
              .filter(
                (item) =>
                  item.name
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()) &&
                  (category === "Todos" ||
                    (category === "Recomendados"
                      ? [
                          "glass_sigil",
                          "living_seed",
                          "feather_thread",
                        ].includes(item.id)
                      : category === "Poder"
                        ? item.stats.damage || item.stats.cooldown
                        : category === "Sobrevivência"
                          ? item.stats.maxHealth || item.stats.recovery
                          : category === "Mobilidade"
                            ? item.stats.speed
                            : item.stats.area || item.stats.duration)),
              )
              .map((item) => (
                <article key={item.id} className="game-panel">
                  <span className="item-glyph">{item.glyph}</span>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                  {Object.entries(item.stats).map(([stat, value]) => {
                    const current = war.items.reduce(
                      (sum, slot) =>
                        sum +
                        (WAR_ITEM_DEFINITIONS[slot.id]?.stats[
                          stat as keyof typeof item.stats
                        ] || 0),
                      0,
                    );
                    const scale = stat === "recovery" ? 1 : 100;
                    return (
                      <small key={stat}>
                        Bônus de itens: {(current * scale).toFixed(1)} →{" "}
                        {(
                          (current +
                            (war.items.some((slot) => slot.id === item.id)
                              ? 0
                              : value)) *
                          scale
                        ).toFixed(1)}
                        {stat === "recovery" ? " HP/s" : "%"}
                      </small>
                    );
                  })}
                  <button
                    disabled={
                      !war.shopAvailable ||
                      war.warGold < item.cost ||
                      war.items.some((slot) => slot.id === item.id) ||
                      war.items.length >= 6
                    }
                    onClick={() =>
                      send({ type: "ARENA_WAR_BUY_ITEM", itemId: item.id })
                    }
                  >
                    {war.items.some((slot) => slot.id === item.id)
                      ? "Adquirido"
                      : "Comprar · ◈ " + item.cost}
                  </button>
                </article>
              ))}
          </div>
          <h3>Inventário</h3>
          <div className="actions">
            {war.items.map((item, slot) => (
              <button
                key={slot}
                disabled={!war.shopAvailable}
                onClick={() => send({ type: "ARENA_WAR_SELL_ITEM", slot })}
              >
                Vender {WAR_ITEM_DEFINITIONS[item.id]?.name} · ◈{" "}
                {Math.floor((WAR_ITEM_DEFINITIONS[item.id]?.cost || 0) * 0.6)}
              </button>
            ))}
          </div>
        </GameDrawer>
      )}
      {war.role !== "SOLDADO" && (
        <button
          aria-expanded={rolePanelOpen}
          onClick={() => {
            setRolePanelOpen(true);
            setShopOpen(false);
            setUpgradeOpen(false);
          }}
        >
          {war.role === "CONSTRUTOR" ? "CONSTRUÇÃO" : "COMANDO"}
        </button>
      )}
      {rolePanelOpen && (
        <GameDrawer
          title={war.role === "CONSTRUTOR" ? "Construção" : "Comando"}
          onClose={() => setRolePanelOpen(false)}
        >
          <strong>Energia do Limiar · {war.energy} / 500</strong>
          {war.role === "CONSTRUTOR" && (
            <>
              <div className="actions">
                <button
                  onClick={() => {
                    place("TORRE");
                    setRolePanelOpen(false);
                  }}
                >
                  Posicionar torre · 80
                </button>
                <button
                  onClick={() => {
                    place("BARRICADA");
                    setRolePanelOpen(false);
                  }}
                >
                  Posicionar barricada · 30
                </button>
                <button
                  onClick={() => {
                    repair();
                    setRolePanelOpen(false);
                  }}
                >
                  Reparar estrutura próxima · 20
                </button>
              </div>
              <p>
                Escolha e clique no mapa a até 160 unidades. Recarga 4s · máximo
                4 construções próprias e 8 por time. Reparar recupera 50 de vida
                a cada 2s.
              </p>
            </>
          )}
          {war.role === "COMANDANTE" && (
            <>
              <div className="actions">
                <label>
                  Rota{" "}
                  <select
                    value={lane}
                    onChange={(e) => setLane(Number(e.target.value))}
                  >
                    {["Norte", "Central", "Sul"].map((name, i) => (
                      <option key={i} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ordem{" "}
                  <select
                    value={war.orders[lane]}
                    onChange={(e) =>
                      send({
                        type: "ARENA_ORDER",
                        lane,
                        order: e.target.value as GroupOrder,
                      })
                    }
                  >
                    {(
                      [
                        "ATACAR",
                        "DEFENDER",
                        "RECUAR",
                        "FOCAR_TORRE",
                        "FOCAR_BASE",
                      ] as const
                    ).map((order) => (
                      <option key={order} value={order}>
                        {order.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="actions">
                <label>
                  Tropa{" "}
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as TroopType)}
                  >
                    <option value="SOLDADO">Soldado · 10</option>
                    <option value="TANQUE">Tanque · 25</option>
                    <option value="SUPORTE">Suporte · 20</option>
                  </select>
                </label>
                <label>
                  Quantidade{" "}
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={count}
                    onChange={(e) =>
                      setCount(
                        Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </label>
                <label>
                  Formação{" "}
                  <select
                    value={formation}
                    onChange={(e) =>
                      setFormation(e.target.value as typeof formation)
                    }
                  >
                    <option value="LINHA">Linha</option>
                    <option value="COLUNA">Coluna</option>
                    <option value="DISPERSAR">Dispersar</option>
                  </select>
                </label>
                <button
                  onClick={() =>
                    send({
                      type: "ARENA_RECRUIT",
                      lane,
                      kind,
                      count,
                      formation,
                    })
                  }
                >
                  Recrutar ·{" "}
                  {count *
                    (kind === "TANQUE"
                      ? 25
                      : kind === "SUPORTE"
                        ? 20
                        : 10)}{" "}
                  Energia
                </button>
                <button
                  disabled={war.upgrades >= 3}
                  onClick={() =>
                    send({ type: "ARENA_UPGRADE", kind: "troops" })
                  }
                >
                  Tropas +10% · {(war.upgrades + 1) * 100} Energia
                </button>
              </div>
              <p>
                Ordens afetam grupos da rota. Recrutamento: recarga 6s, limite{" "}
                {WAR.minionCap / 2}
                tropas por time. Melhorias afetam novas tropas. Nível:{" "}
                {war.upgrades}/3.
              </p>
            </>
          )}
        </GameDrawer>
      )}
    </section>
  );
}
