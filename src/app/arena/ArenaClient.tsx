"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import WarControls from "./WarControls";
import type { WarView, WarRole } from "../../game/content/war";
import { RealtimeClient } from "../../game/network/client";
import { competitiveAction, realtimeTicket } from "../../server/actions";
import {
  PVP,
  PVP_LOADOUTS,
  type PvpCharacter,
  type PvpAbility,
} from "../../game/content/pvp";
import type { ArenaSnapshot, PvpInput } from "../../game/core/pvp";
import { predictMove } from "../../game/network/movement";
import { clamp } from "../../game/core/math";
import { COSMETICS, cosmeticVisual } from "../../game/content/cosmetics";
export default function ArenaClient({ userId, menuHeader, initialMode = "DUEL_CASUAL" }: { userId: string; menuHeader: React.ReactNode; initialMode?: "DUEL_CASUAL" | "WAR_CASUAL" }) {
  const placement = useRef<"TORRE" | "BARRICADA" | null>(null),
    worldPointer = useRef({ x: 0, y: 0 });
  const [roster, setRoster] = useState<
    { id: string; name: string; team: number }[]
  >([]);
  const [role, setRole] = useState<WarRole>("SOLDADO"),
    [war, setWar] = useState<WarView | null>(null),
    [chat, setChat] = useState<{ id: string; name: string; text: string }[]>(
      [],
    ),
    [chatText, setChatText] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    client = useRef<RealtimeClient | null>(null),
    snapshot = useRef<ArenaSnapshot | null>(null),
    match = useRef("");
  const [mode, setMode] = useState<
      "DUEL_CASUAL" | "DUEL_RANKED" | "WAR_CASUAL" | "WAR_RANKED"
    >(initialMode),
    [status, setStatus] = useState("Conectando…"),
    [waiting, setWaiting] = useState(false),
    [seconds, setSeconds] = useState(0),
    [playing, setPlaying] = useState(false),
    [character, setCharacter] = useState<PvpCharacter>("nara"),
    [error, setError] = useState(""),
    [result, setResult] = useState(""),
    [hud, setHud] = useState({
      time: 0,
      round: 1,
      score: "0 : 0",
      rtt: 0,
      correction: 0,
    });
  useEffect(() => {
    let raf = 0,
      sequence = 0,
      pending: PvpInput[] = [],
      prediction: { x: number; y: number } | null = null,
      correction = 0,
      debug = false,
      mouseDown = false,
      aim = { x: 1, y: 0 };
    const keys = new Set<string>();
    const renderPositions = new Map<string, { x: number; y: number }>();
    let lastFrame = performance.now();
    const connection = new RealtimeClient(
      realtimeTicket,
      (m) => {
        if (m.type === "ARENA_CHAT")
          setChat((previous) => [...previous, m].slice(-30));
        if (m.type === "ERROR") setError(m.message);
        if (m.type === "ARENA_QUEUE_STATUS") {
          setWaiting(m.waiting);
          setSeconds(m.seconds);
        }
        if (m.type === "ARENA_STARTED") {
          match.current = m.matchId;
          setRoster(m.roster);
          setPlaying(true);
          setWaiting(false);
          setResult("");
          setChat([]);
          setWar(null);
          snapshot.current = null;
          pending = [];
          prediction = null;
        }
        if (m.type === "ARENA_SNAPSHOT") {
          snapshot.current = m.snapshot;
          const own = m.snapshot.players.find((p) => p.id === userId);
          if (!own) return;
          sequence = Math.max(sequence, m.snapshot.own.ack);
          pending = pending.filter((p) => p.sequence > m.snapshot.own.ack);
          let next = { x: own.x, y: own.y };
          for (const input of pending)
            next = predictMove(
              next,
              { x: input.moveX, y: input.moveY },
              own.speed,
              0.04,
              [],
            );
          next.x = clamp(next.x, 20, m.snapshot.width - 20);
          next.y = clamp(next.y, 20, m.snapshot.height - 20);
          correction = prediction
            ? Math.hypot(prediction.x - next.x, prediction.y - next.y)
            : 0;
          prediction = next;
        }
        if (m.type === "ARENA_RESULT") {
          setResult(
            m.winner === null
              ? "Empate"
              : m.winner ===
                  snapshot.current?.players.find((p) => p.id === userId)?.team
                ? "Vitória"
                : "Derrota",
          );
          setPlaying(false);
          setWar(null);
          setError("");
        }
      },
      setStatus,
    );
    client.current = connection;
    void connection.connect();
    const down = (e: KeyboardEvent) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      keys.add(e.code);
      if (e.code === "Escape") {
        placement.current = null;
        setError("");
      }
      if (e.code === "F7") {
        debug = !debug;
        e.preventDefault();
      }
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code),
      blur = () => {
        keys.clear();
        mouseDown = false;
      };
    const move = (e: PointerEvent) => {
      const el = canvas.current,
        s = snapshot.current;
      if (!el || !s) return;
      const own = s.players.find((p) => p.id === userId);
      if (!own) return;
      const r = el.getBoundingClientRect(),
        cx = clamp(
          (prediction?.x ?? own.x) - 500,
          0,
          Math.max(0, s.width - 1000),
        ),
        cy = clamp(
          (prediction?.y ?? own.y) - 300,
          0,
          Math.max(0, s.height - 600),
        ),
        x = cx + ((e.clientX - r.left) / r.width) * 1000,
        y = cy + ((e.clientY - r.top) / r.height) * 600;
      worldPointer.current = { x, y };
      const dx = x - (prediction?.x ?? own.x),
        dy = y - (prediction?.y ?? own.y),
        len = Math.max(1, Math.hypot(dx, dy));
      aim = { x: dx / len, y: dy / len };
    };
    const press = () => {
        if (placement.current) {
          connection.send({
            type: "ARENA_BUILD",
            kind: placement.current,
            ...worldPointer.current,
          });
          placement.current = null;
          return;
        }
        mouseDown = true;
      },
      release = () => {
        mouseDown = false;
      };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerup", release);
    canvas.current?.addEventListener("pointermove", move);
    canvas.current?.addEventListener("pointerdown", press);
    const element = canvas.current;
    const inputTimer = setInterval(() => {
      const s = snapshot.current;
      if (!s || s.ended) return;
      const own = s.players.find((p) => p.id === userId);
      if (!own) return;
      const ability: PvpAbility = keys.has("Digit1")
        ? "skill"
        : keys.has("Digit2")
          ? "pulse"
          : keys.has("Digit3") || keys.has("Space")
            ? "dash"
            : mouseDown
              ? "basic"
              : "none";
      const input: PvpInput = {
        sequence: ++sequence,
        moveX:
          Number(keys.has("KeyD") || keys.has("ArrowRight")) -
          Number(keys.has("KeyA") || keys.has("ArrowLeft")),
        moveY:
          Number(keys.has("KeyS") || keys.has("ArrowDown")) -
          Number(keys.has("KeyW") || keys.has("ArrowUp")),
        aimX: aim.x,
        aimY: aim.y,
        ability,
        seenTick: s.tick,
      };
      connection.send({ type: "ARENA_INPUT", ...input });
      pending.push(input);
      if (pending.length > 125) pending.shift();
      if (prediction && own.hp > 0 && s.intermission === 0) {
        prediction = predictMove(
          prediction,
          { x: input.moveX, y: input.moveY },
          own.speed,
          0.04,
          [],
        );
        prediction.x = clamp(prediction.x, 20, s.width - 20);
        prediction.y = clamp(prediction.y, 20, s.height - 20);
      }
    }, 40);
    const hudTimer = setInterval(() => {
      const s = snapshot.current;
      if (s) {
        setWar(s.ended ? null : s.war || null);
        setHud({
          time: Math.ceil(s.roundRemaining),
          round: s.round,
          score: s.score.join(" : "),
          rtt: Math.round(connection.rtt),
          correction: Math.round(correction),
        });
      }
    }, 250);
    const frame = () => {
      const now = performance.now(),
        blend = 1 - Math.exp(-Math.min(0.1, (now - lastFrame) / 1000) * 24);
      lastFrame = now;
      const el = canvas.current,
        c = el?.getContext("2d"),
        s = snapshot.current;
      if (el && c) {
        c.fillStyle = "#091a21";
        c.fillRect(0, 0, 1000, 600);
        c.strokeStyle = "#284439";
        for (let x = 0; x <= 1000; x += 50) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, 600);
          c.stroke();
        }
        for (let y = 0; y <= 600; y += 50) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(1000, y);
          c.stroke();
        }
        c.strokeStyle = "#a1ac88";
        c.strokeRect(20, 20, 960, 560);
        if (s) {
          const own = s.players.find((p) => p.id === userId),
            cx = clamp(
              (prediction?.x ?? own?.x ?? 500) - 500,
              0,
              Math.max(0, s.width - 1000),
            ),
            cy = clamp(
              (prediction?.y ?? own?.y ?? 300) - 300,
              0,
              Math.max(0, s.height - 600),
            );
          c.save();
          c.translate(-cx, -cy);
          if (s.war) {
            c.strokeStyle = "#c9b877";
            c.lineWidth = 3;
            c.beginPath();
            c.arc(1300, 700, 110, 0, Math.PI * 2);
            c.stroke();
            for (const y of [250, 700, 1150]) {
              c.strokeStyle = "#41533c";
              c.lineWidth = 50;
              c.beginPath();
              c.moveTo(130, y);
              c.lineTo(2470, y);
              c.stroke();
            }
            for (const u of s.war.minions) {
              c.fillStyle = u.team === 0 ? "#7fb99b" : "#c1817e";
              c.fillRect(u.x - 6, u.y - 6, 12, 12);
            }
            for (const st of s.war.structures) {
              c.globalAlpha = st.hp > 0 ? 1 : 0.2;
              c.strokeStyle = st.team === 0 ? "#83cca9" : "#d98e8c";
              c.lineWidth = 3;
              c.strokeRect(st.x - st.r, st.y - st.r, st.r * 2, st.r * 2);
              c.fillStyle = c.strokeStyle;
              c.fillRect(
                st.x - st.r,
                st.y - st.r - 8,
                (st.r * 2 * st.hp) / st.maxHp,
                4,
              );
            }
            c.globalAlpha = 1;
          }
          for (const b of s.bullets) {
            c.fillStyle =
              COSMETICS[b.color]?.color ||
              (b.team === 0 ? "#91d5b4" : "#df9b9b");
            c.beginPath();
            c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            c.fill();
          }
          for (const id of renderPositions.keys())
            if (!s.players.some((p) => p.id === id)) renderPositions.delete(id);
          for (const p of s.players) {
            const remote = renderPositions.get(p.id) || { x: p.x, y: p.y };
            if (Math.hypot(remote.x - p.x, remote.y - p.y) > 180) {
              remote.x = p.x;
              remote.y = p.y;
            } else {
              remote.x += (p.x - remote.x) * blend;
              remote.y += (p.y - remote.y) * blend;
            }
            renderPositions.set(p.id, remote);
            const own = p.id === userId,
              pos = own && prediction ? prediction : remote,
              visual = cosmeticVisual(p.cosmetics),
              color =
                visual.skin?.color ||
                PVP_LOADOUTS[p.character as PvpCharacter]?.color ||
                "#fff";
            c.globalAlpha = p.hp > 0 ? 1 : 0.3;
            c.fillStyle = color;
            c.strokeStyle = p.team === 0 ? "#83ccb7" : "#dd9c92";
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(pos.x, pos.y - 16);
            c.lineTo(pos.x + 13, pos.y + 12);
            c.lineTo(pos.x - 13, pos.y + 12);
            c.closePath();
            c.fill();
            c.stroke();
            c.fillStyle = "#273833";
            c.fillRect(pos.x - 22, pos.y - 28, 44, 4);
            c.fillStyle = "#9cdc9a";
            c.fillRect(pos.x - 22, pos.y - 28, (44 * p.hp) / p.maxHp, 4);
            c.fillStyle = "#dbe6d5";
            c.font = "11px Georgia";
            c.textAlign = "center";
            c.fillText(
              p.name + (p.connected ? "" : " · reconectando"),
              pos.x,
              pos.y - 37,
            );
            if (visual.weapon) {
              c.strokeStyle = visual.weapon.color;
              c.beginPath();
              c.arc(pos.x, pos.y, 20, 0, Math.PI * 1.4);
              c.stroke();
            }
            const aura =
              p.hp <= 0
                ? visual.death
                : s.intermission > 0
                  ? visual.spawn
                  : null;
            if (aura) {
              c.strokeStyle = aura.color;
              c.beginPath();
              c.arc(
                pos.x,
                pos.y,
                25 + Math.sin(s.time * 4) * 3,
                0,
                Math.PI * 2,
              );
              c.stroke();
            }
            if (visual.frame) {
              c.strokeStyle = visual.frame.color;
              c.strokeRect(pos.x - 28, pos.y - 50, 56, 19);
            }
            if (visual.icon) {
              c.fillStyle = visual.icon.color;
              c.fillText(visual.icon.glyph, pos.x - 34, pos.y - 36);
            }
            if (visual.emote && s.time % 15 < 2) {
              c.fillStyle = visual.emote.color;
              c.fillText(visual.emote.glyph, pos.x, pos.y - 58);
            }
            if (visual.trail) {
              c.strokeStyle = visual.trail.color;
              c.beginPath();
              c.moveTo(pos.x - 20, pos.y + 18);
              c.lineTo(pos.x + 20, pos.y + 18);
              c.stroke();
            }
            if (debug) {
              c.strokeStyle = "#fff";
              c.beginPath();
              c.arc(p.x, p.y, PVP.radius, 0, Math.PI * 2);
              c.stroke();
              if (own) {
                c.fillStyle = "#f66";
                c.fillRect(p.x - 2, p.y - 2, 4, 4);
                c.strokeStyle = "#6cf";
                c.beginPath();
                c.arc(pos.x, pos.y, PVP.radius + 3, 0, Math.PI * 2);
                c.stroke();
              }
            }
          }
          c.restore();
          c.globalAlpha = 1;
          if (s.intermission > 0) {
            c.fillStyle = "#e0d5b0";
            c.font = "28px Georgia";
            c.fillText(
              `Round ${s.round} · ${Math.ceil(s.intermission)}`,
              500,
              300,
            );
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      clearInterval(inputTimer);
      clearInterval(hudTimer);
      cancelAnimationFrame(raf);
      connection.close();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerup", release);
      element?.removeEventListener("pointermove", move);
      element?.removeEventListener("pointerdown", press);
    };
  }, [userId]);
  return (
    <main className={`account-shell arena-page ${playing ? "arena-playing" : ""}`}>
      {!playing && menuHeader}
      {playing && <Link href="/">← Menu principal</Link>}
      <h1>ARENA DO LIMIAR</h1>
      <Link href="/ranked">Ranked · temporada e classificação</Link>
      <p>
        {status} · {hud.rtt} ms · Reconciliação {hud.correction}px
      </p>
      <p>
        Condições normalizadas. Obelisco e consumíveis PvE não entram.
        Reconexão: 30 s.
      </p>
      <p role="status">{error || result}</p>
      {!playing && (
        <div className="actions">
          <label>
            Modo{" "}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="DUEL_CASUAL">1v1 Casual</option>
              <option value="DUEL_RANKED">1v1 Ranked</option>
              <option value="WAR_CASUAL">Guerra 5v5 · Casual</option>
              <option value="WAR_RANKED">Guerra 5v5 · Ranked</option>
            </select>
          </label>
          <label>
            Personagem{" "}
            <select
              value={character}
              onChange={(e) => setCharacter(e.target.value as PvpCharacter)}
            >
              {Object.entries(PVP_LOADOUTS).map(([id, c]) => (
                <option value={id} key={id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {mode.startsWith("WAR") && (
            <label>
              Classe{" "}
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as WarRole)}
              >
                {(["SOLDADO", "CONSTRUTOR", "COMANDANTE"] as const).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            disabled={waiting || status !== "Online"}
            onClick={() => {
              setError("");
              client.current?.send({
                type: "ARENA_QUEUE",
                character,
                mode,
                role,
              });
            }}
          >
            Buscar partida
          </button>
          {waiting && (
            <button
              onClick={() => client.current?.send({ type: "ARENA_CANCEL" })}
            >
              Cancelar fila · {seconds}s
            </button>
          )}
        </div>
      )}
      <p>
        Round {hud.round} · {hud.score} · {hud.time}s{" "}
        {playing && (
          <button
            onClick={() => client.current?.send({ type: "ARENA_FORFEIT" })}
          >
            Desistir da partida
          </button>
        )}
      </p>
      {result && (
        <details>
          <summary>Reportar jogador</summary>
          {roster
            .filter((p) => p.id !== userId)
            .map((p) => (
              <div key={p.id}>
                {p.name}
                {(["cheat", "abuse", "afk", "grief"] as const).map((reason) => (
                  <button
                    key={reason}
                    onClick={async () => {
                      const r = await competitiveAction({
                        type: "report",
                        targetId: p.id,
                        matchId: match.current,
                        reason,
                      });
                      setError(
                        r.ok ? "Report registrado para análise." : r.error,
                      );
                    }}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            ))}
        </details>
      )}
      {playing && war && (
        <WarControls
          war={war}
          send={(m) => client.current?.send(m)}
          place={(kind) => {
            placement.current = kind;
            setError("Clique no mapa para construir; Esc cancela.");
          }}
          repair={() => {
            const s = snapshot.current,
              own = s?.players.find((p) => p.id === userId);
            if (!own || !s?.war) return;
            const nearest = s.war.structures
              .filter(
                (st) => st.team === own.team && st.hp > 0 && st.hp < st.maxHp,
              )
              .sort(
                (a, b) =>
                  Math.hypot(a.x - own.x, a.y - own.y) -
                  Math.hypot(b.x - own.x, b.y - own.y),
              )[0];
            if (nearest)
              client.current?.send({
                type: "ARENA_REPAIR",
                targetId: nearest.id,
              });
            else setError("Nenhuma estrutura aliada danificada.");
          }}
        />
      )}
      {playing && (
        <details>
          <summary>Chat da equipe</summary>
          <div aria-live="polite">
            {chat.map((m) => (
              <p key={m.id}>
                <strong>{m.name}:</strong> {m.text}
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (chatText.trim()) {
                client.current?.send({
                  type: "ARENA_CHAT_SEND",
                  text: chatText,
                });
                setChatText("");
              }
            }}
          >
            <input
              aria-label="Mensagem para aliados"
              maxLength={500}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
            />
            <button>Enviar</button>
          </form>
        </details>
      )}
      <canvas
        ref={canvas}
        width={1000}
        height={600}
        className="arena-canvas"
        aria-label="Arena competitiva"
      />
      <p>
        WASD/setas: mover · mouse: mirar · clique: ataque básico · 1: projétil ·
        2: pulso · 3/espaço: deslocamento · F7: hitboxes e posição
        servidor/predição.
      </p>
    </main>
  );
}
