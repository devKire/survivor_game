"use client";
import { useEffect, useState } from "react";
import {
  worldFieldHistory,
  type WorldFieldResult,
} from "../../../game/core/rpg/world/rewards";
import { RPG_ITEMS, RPG_MATERIALS } from "../../../game/content/rpg/catalog";
import { useWorldTransport } from "./WorldActionContext";
export function FieldReward({
  xp,
  result,
}: {
  xp: number;
  result: WorldFieldResult;
}) {
  return (
    <article>
      <p>
        {result.eligible
          ? `+${xp} XP RPG · nível ${result.previousLevel} → ${result.newLevel}`
          : "Limite diário de recompensas de campo atingido."}
      </p>
      {result.pointsGranted > 0 && (
        <p>+{result.pointsGranted} pontos de atributo.</p>
      )}
      <ul>
        {result.materials.map((m) => (
          <li key={m.materialId}>
            +{m.quantity}{" "}
            {RPG_MATERIALS[m.materialId as keyof typeof RPG_MATERIALS]?.name ??
              m.materialId}
          </li>
        ))}
        {result.equipment.map((i) => (
          <li key={i.id}>
            {RPG_ITEMS[i.itemId as keyof typeof RPG_ITEMS]?.name ?? i.itemId} ·
            comum · nível {i.level} · no inventário
          </li>
        ))}
      </ul>
    </article>
  );
}
export default function WorldRewards() {
  const transport = useWorldTransport(),
    [page, setPage] = useState<ReturnType<typeof worldFieldHistory.parse>>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const rpc = transport!.rpc;
  useEffect(() => {
    let live = true;
    void rpc("REWARDS", {})
      .then((v) => {
        if (live) setPage(worldFieldHistory.parse(v));
      })
      .catch(() => {
        if (live) setError("Não foi possível consultar o histórico.");
      });
    return () => {
      live = false;
    };
  }, [rpc]);
  return (
    <section aria-label="Histórico de recompensas de campo">
      <p>
        Recompensas confirmadas de combate no mundo. Até 20 concessões e um
        equipamento por dia UTC, por conta.
      </p>
      {error && <p role="alert">{error}</p>}
      {!page && !error && <p>Consultando registros…</p>}
      {page?.rewards.length === 0 && (
        <p>Nenhuma recompensa de campo nesta conta.</p>
      )}
      {page?.rewards.map((r) => (
        <section key={r.id}>
          <small>
            {r.characterId} · {new Date(r.at).toLocaleString("pt-BR")}
          </small>
          <FieldReward xp={r.xp} result={r.result} />
        </section>
      ))}
      {page?.nextCursor && (
        <button
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void rpc("REWARDS", { cursor: page.nextCursor })
              .then((v) => setPage(worldFieldHistory.parse(v)))
              .catch(() =>
                setError("Não foi possível consultar a próxima página."),
              )
              .finally(() => setLoading(false));
          }}
        >
          Recompensas anteriores
        </button>
      )}
    </section>
  );
}
