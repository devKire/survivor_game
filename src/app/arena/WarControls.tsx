"use client";
import { useEffect, useState } from "react";
import { WAR_ITEM_DEFINITIONS, type WarView, type GroupOrder, type TroopType } from "../../game/content/war";
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
    [mobile, setMobile] = useState(false),
    [rolePanelOpen, setRolePanelOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.code !== "KeyB" || !war.shopAvailable) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag || "")) return;
      event.preventDefault();
      setShopOpen((open) => !open);
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, [war.shopAvailable]);
  return (
    <section className="war-controls">
      <h2>
        {war.role} · Nível {war.level} · WarGold {war.warGold} · Energia do Limiar: {war.energy} / 500
      </h2>
      <progress aria-label="Experiência da Guerra" max={war.xpToNextLevel || 1} value={war.xp} />
      <p>XP {war.xp} / {war.xpToNextLevel || "nível máximo"} · K/D/A {war.kills}/{war.deaths}/{war.assists}</p>
      {war.respawnIn > 0 && <strong role="status">RENASCENDO EM {Math.ceil(war.respawnIn)}s</strong>}
      {war.weapons.map((weapon) => <span key={weapon.id}>{weapon.id} Nv.{weapon.level}{weapon.path ? ` · ${weapon.path}` : ""} · </span>)}
      {Object.entries(war.passives).filter(([, level]) => level > 0).map(([id, level]) => <span key={id}>{id} Nv.{level} · </span>)}
      <span>Itens: {war.items.map((item) => WAR_ITEM_DEFINITIONS[item.id]?.name || item.id).join(" · ") || "nenhum"}</span>
      {war.pendingUpgrades > 0 && (
        <aside className="war-levelup" aria-live="polite">
          <strong>+{war.pendingUpgrades} MELHORIA{war.pendingUpgrades > 1 ? "S" : ""} · Escolha sua evolução</strong>
          <div className="actions">
            {war.choices.map((choice) => (
              <button key={choice.id} onClick={() => send({
                type: "ARENA_WAR_CHOOSE_UPGRADE",
                decision: war.decision,
                choice: choice.id,
              })}>
                <b>{choice.name}</b><small>{choice.kind.toUpperCase()} · {choice.description}</small>
                {choice.currentLevel !== undefined && <small>Nv. {choice.currentLevel} → {choice.nextLevel}</small>}
              </button>
            ))}
          </div>
        </aside>
      )}
      <button disabled={!war.shopAvailable} onClick={() => setShopOpen((open) => !open)}>
        LOJA · {war.shopAvailable ? "disponível" : "volte à base"}
      </button>
      {shopOpen && war.shopAvailable && (
        <aside className="war-shop">
          <strong>Loja da Guerra · {war.warGold} WarGold</strong>
          <div className="actions">
            {Object.values(WAR_ITEM_DEFINITIONS).map((item) => (
              <button key={item.id} disabled={war.warGold < item.cost || war.items.some((slot) => slot.id === item.id) || war.items.length >= 6}
                onClick={() => send({ type: "ARENA_WAR_BUY_ITEM", itemId: item.id })}>
                {item.glyph} {item.name} · {item.cost}<small>{item.description}</small>
              </button>
            ))}
          </div>
          {war.items.map((item, slot) => <button key={`${item.id}:${slot}`} onClick={() => send({ type: "ARENA_WAR_SELL_ITEM", slot })}>Vender {WAR_ITEM_DEFINITIONS[item.id]?.name} · {Math.floor((WAR_ITEM_DEFINITIONS[item.id]?.cost || 0) * 0.6)}</button>)}
        </aside>
      )}
      <p>
        Energia e melhorias duram somente esta partida. Núcleos:{" "}
        {war.cores.map(Math.ceil).join(" / ")} · Tropas: {war.entityCount} / 180
      </p>
      <p>
        Obelisco central:{" "}
        {war.objective.owner === null
          ? "neutro"
          : `time ${war.objective.owner + 1}`}{" "}
        · captura {Math.floor(war.objective.capture)} / 10s. Capture em 1300,
        700 para receber Energia.
      </p>
      <button className="war-role-toggle" aria-expanded={rolePanelOpen} onClick={() => setRolePanelOpen((open) => !open)}>
        CLASSE · {war.role}
      </button>
      <div className="war-role-controls" hidden={mobile && !rolePanelOpen}>
      {war.role === "CONSTRUTOR" && (
        <>
          <div className="actions">
            <button onClick={() => place("TORRE")}>
              Posicionar torre · 80
            </button>
            <button onClick={() => place("BARRICADA")}>
              Posicionar barricada · 30
            </button>
            <button onClick={repair}>Reparar estrutura próxima · 20</button>
          </div>
          <p>
            Escolha e clique no mapa a até 160 unidades. Recarga 4s · máximo 4
            construções próprias e 8 por time. Reparar recupera 50 de vida a
            cada 2s.
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
                send({ type: "ARENA_RECRUIT", lane, kind, count, formation })
              }
            >
              Recrutar ·{" "}
              {count * (kind === "TANQUE" ? 25 : kind === "SUPORTE" ? 20 : 10)}{" "}
              Energia
            </button>
            <button
              disabled={war.upgrades >= 3}
              onClick={() => send({ type: "ARENA_UPGRADE", kind: "troops" })}
            >
              Tropas +10% · {(war.upgrades + 1) * 100} Energia
            </button>
          </div>
          <p>
            Ordens afetam grupos da rota. Recrutamento: recarga 6s, limite 90
            tropas por time. Melhorias afetam novas tropas. Nível:{" "}
            {war.upgrades}/3.
          </p>
        </>
      )}
      </div>
    </section>
  );
}
