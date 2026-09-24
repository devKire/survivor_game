"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { diagnostics } from "../../game/client/diagnostics";
import { RealtimeClient } from "../../game/network/client";
import { OnlineSession } from "../../game/client/OnlineSession";
import { RemoteGame } from "../../game/client/RemoteGame";
import { GameShell } from "../../game/client/OfflineGame";
import { WEAPON_PATHS, WEAPON_DEFINITIONS, PASSIVE_DEFINITIONS } from "../../game/content/catalog";
import type { SaveData, Upgrade } from "../../game/core/types";
function OnlineArena({
  userId,
  session,
  connection,
  settings,
}: {
  settings: SaveData["settings"];
  userId: string;
  session: OnlineSession;
  connection: React.RefObject<RealtimeClient | null>;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null),
    game = useRef<RemoteGame | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    diagnostics.reactGameMounts++;
    const g = new RemoteGame(
      canvasRef.current,
      userId,
      (m) => connection.current?.send(m),
      () => router.push("/"),
    );
    game.current = g;
    const unbind = session.bind(g);
    const clear = () => g.input.clear();
    window.addEventListener("limiar-chat-focus", clear);
    return () => {
      window.removeEventListener("limiar-chat-focus", clear);
      unbind();
      g.dispose();
    };
  }, [userId, connection, router, session]);
  useEffect(() => {
    if (game.current) {
      game.current.save.settings = settings;
    }
  }, [settings]);
  return <GameShell canvasRef={canvasRef} />;
}

export default function OnlineCombat({userId, session, connection, settings}: {
  userId: string; session: OnlineSession;
  connection: React.RefObject<RealtimeClient | null>;
  settings: SaveData['settings'];
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, () => null);
  const [upgradeOpen, setUpgradeOpen] = useState(false), [banish, setBanish] = useState(false);
  function pick(
    index: number,
    action: "pick" | "reroll" | "banish" | "skip" = "pick",
  ) {
    if (snapshot)
      connection.current?.send({
        type: "UPGRADE",
        choice: index,
        decision: snapshot.own.decision,
        action: banish && action === "pick" ? "banish" : action,
      });
    setBanish(false);
    setUpgradeOpen(false);
  }
  function choiceText(choice: Upgrade) {
    if (choice.kind === "path") {
      const d = WEAPON_PATHS[choice.weaponId || ""]?.[choice.id];
      return {
        name: d?.name || choice.id,
        text: d?.text || "",
        with: WEAPON_DEFINITIONS[choice.weaponId || ""]?.name,
      };
    }
    if (choice.kind === "weapon") {
      const d = WEAPON_DEFINITIONS[choice.id];
      return {
        name: d.name,
        text: snapshot?.own.weapons.some((w) => w.id === choice.id)
          ? "+2 níveis: mais dano, área e frequência."
          : d.description,
        with: PASSIVE_DEFINITIONS[d.passive].name,
      };
    }
    const d = PASSIVE_DEFINITIONS[choice.id];
    return {
      name: d?.name || choice.id,
      text: d ? d.text + " Até +2 níveis." : "Bônus imediato.",
      with: "Sua build",
    };
  }
  return (
        <>
          <OnlineArena
            userId={userId}
            session={session}
            connection={connection}
            settings={settings}
          />
          <aside className="party-hud">
            {snapshot?.players.map((p) => (
              <div key={p.id} style={{ color: p.color }}>
                {p.name} ·{" "}
                {p.state === "downed"
                  ? "CAÍDO"
                  : p.state === "disconnected"
                    ? "DESCONECTADO"
                    : `♥ ${Math.ceil((p.hp / p.maxHp) * 100)}%`}
                {p.revive > 0 ? ` · Revivendo ${p.revive.toFixed(1)}/3 s` : ""}
              </div>
            ))}
            <small>Segure E próximo de um aliado caído.</small>
            <Link href="/">Sair da partida</Link>
          </aside>
          {(snapshot?.own.pending || 0) > 0 && (
            <button
              className="pending-upgrades"
              onClick={() => setUpgradeOpen(!upgradeOpen)}
            >
              +{snapshot?.own.pending} MELHORIA
              {(snapshot?.own.pending || 0) > 1 ? "S" : ""} PENDENTE
              {(snapshot?.own.pending || 0) > 1 ? "S" : ""}
            </button>
          )}
          {upgradeOpen && snapshot && (
            <aside className="upgrade-panel">
              <h2>
                {banish ? "Selecione para banir" : "Escolha sua melhoria"}
              </h2>
              <p className="muted">
                A expedição continua. WASD move enquanto você escolhe.
              </p>
              {snapshot.own.choices.map((c, i) => {
                const d = choiceText(c);
                return (
                  <button
                    className="card"
                    key={c.kind + c.id + i}
                    onClick={() => pick(i)}
                  >
                    <h3>{d.name}</h3>
                    <p>{d.text}</p>
                    <small>Combina com {d.with}</small>
                  </button>
                );
              })}
              <div className="actions">
                <button onClick={() => pick(0, "reroll")}>
                  ↻ {snapshot.own.rerolls}
                </button>
                <button onClick={() => setBanish(!banish)}>
                  ⊘ {snapshot.own.banishments}
                </button>
                <button onClick={() => pick(0, "skip")}>
                  → {snapshot.own.skips}
                </button>
              </div>
              <button onClick={() => setUpgradeOpen(false)}>Fechar</button>
            </aside>
          )}
          {snapshot?.votes.map((v) => (
            <aside className="team-vote" key={v.id}>
              <p>
                Decisão de equipe · {v.count}/{v.needed}
              </p>
              <button
                onClick={() =>
                  connection.current?.send({
                    type: "INTERACT",
                    structure: v.id,
                    accept: true,
                  })
                }
              >
                Aceitar
              </button>
              <button
                onClick={() =>
                  connection.current?.send({
                    type: "INTERACT",
                    structure: v.id,
                    accept: false,
                  })
                }
              >
                Recusar
              </button>
            </aside>
          ))}
        </>
  );
}
