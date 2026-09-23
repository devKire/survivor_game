"use client";
import { useState } from "react";
import type { WarView, GroupOrder, TroopType } from "../../game/content/war";
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
    );
  return (
    <section className="war-controls">
      <h2>
        {war.role} · Energia do Limiar: {war.energy} / 500
      </h2>
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
      {war.role === "SOLDADO" && (
        <div className="actions">
          {(["damage", "health", "speed"] as const).map((key, i) => (
            <button
              key={key}
              onClick={() => send({ type: "ARENA_UPGRADE", kind: key })}
            >
              {["Dano +4%", "Vida +10", "Velocidade +2%"][i]} · 50/100/150
            </button>
          ))}
          <span>{war.upgrades} melhorias · máximo 3 por atributo</span>
        </div>
      )}
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
    </section>
  );
}
