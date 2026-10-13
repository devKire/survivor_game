"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameShell } from "../../game/client/OfflineGame";
import {
  RemoteExploration,
  type ExplorationState,
} from "../../game/client/RemoteExploration";
import type { OnlineSession } from "../../game/client/OnlineSession";
import type { RealtimeClient } from "../../game/network/client";
import type { ExplorationNode } from "../../game/core/rpg/exploration/types";
import { explorationResource } from "../../game/content/rpg/exploration-resources";
import { RPG_CHARACTERS } from "../../game/content/rpg";
import styles from "./exploration.module.css";
export default function OnlineExploration({
  userId,
  session,
  connection,
  state,
}: {
  userId: string;
  session: OnlineSession;
  connection: React.RefObject<RealtimeClient | null>;
  state: ExplorationState | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<RemoteExploration | null>(null),
    router = useRouter();
  const [target, setTarget] = useState<ExplorationNode>(),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    const g = new RemoteExploration(
      canvas.current,
      userId,
      (m) => connection.current?.send(m),
      () => router.push("/rpg/refuge"),
    );
    game.current = g;
    g.onTarget = setTarget;
    g.onPause = setMenu;
    const unbind = session.bind(g);
    return () => {
      unbind();
      g.dispose();
      game.current = null;
    };
  }, [userId, session, connection, router]);
  useEffect(() => {
    if (game.current) game.current.exploration = state ?? undefined;
  }, [state]);
  const depleted = !!target && state?.depleted.includes(target.id);
  function move(code: string, down: boolean) {
    const input = game.current?.input;
    if (!input) return;
    if (down) input.keys.add(code);
    else input.keys.delete(code);
  }
  return (
    <section
      className={styles.exploration}
      aria-label="Exploração autoritativa"
    >
      <GameShell canvasRef={canvas} />
      <header className={styles.header}>
        <strong>Arredores das Ruínas</strong>
        <small>
          {state
            ? `${RPG_CHARACTERS[state.characterId].name} · nível RPG ${state.level}`
            : "Conectando…"}
        </small>
        <span>Exploração · sem ondas · até 15 min</span>
        <button
          onClick={() => {
            if (menu) game.current?.resume();
            else game.current?.pause();
          }}
        >
          Menu
        </button>
      </header>
      <aside className={styles.interaction} aria-live="polite">
        <strong>
          {target
            ? explorationResource(target.definitionId).name
            : "Explore os arredores"}
        </strong>
        <span>
          {target
            ? depleted
              ? "Esgotado neste ciclo UTC · pessoal"
              : "Disponível para sua conta"
            : "WASD/setas ou controle de toque · E coleta"}
        </span>
        {state?.gathering ? (
          <>
            <progress
              max={state.gathering.duration}
              value={state.gathering.elapsed}
            />
            <button
              onClick={() =>
                connection.current?.send({ type: "GATHER_CANCEL" })
              }
            >
              Cancelar coleta
            </button>
          </>
        ) : (
          <button
            disabled={!target || depleted || menu}
            onClick={() => game.current?.interact()}
          >
            [E] Coletar
          </button>
        )}
        <output>{state?.message}</output>
        <small>
          {state?.discovered.length ?? 0} locais descobertos ·{" "}
          {state?.depleted.length ?? 0} recursos esgotados hoje
        </small>
      </aside>
      <nav className={styles.touch} aria-label="Movimento de exploração">
        {[
          ["KeyW", "↑"],
          ["KeyA", "←"],
          ["KeyS", "↓"],
          ["KeyD", "→"],
        ].map(([code, label]) => (
          <button
            key={code}
            aria-label={`Mover ${label}`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              move(code, true);
            }}
            onPointerUp={() => move(code, false)}
            onPointerCancel={() => move(code, false)}
            onLostPointerCapture={() => move(code, false)}
          >
            {label}
          </button>
        ))}
      </nav>
      {menu && (
        <aside
          className={styles.menu}
          role="dialog"
          aria-label="Menu da exploração"
        >
          <h2>Exploração</h2>
          <p>
            Coletas confirmadas já estão na conta. Sair cancela a coleta em
            andamento.
          </p>
          <button
            onClick={() => {
              game.current?.resume();
            }}
          >
            Continuar
          </button>
          <button
            onClick={() =>
              connection.current?.send({ type: "EXPLORATION_REFRESH" })
            }
          >
            Atualizar perfil RPG
          </button>
          <button
            onClick={() =>
              connection.current?.send({ type: "EXPLORATION_LEAVE" })
            }
          >
            Encerrar exploração e retornar
          </button>
        </aside>
      )}
    </section>
  );
}
