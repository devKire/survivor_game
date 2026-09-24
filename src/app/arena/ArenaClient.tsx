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
import { COSMETICS } from "../../game/content/cosmetics";
import { MAP_DEFINITIONS } from "../../game/content/catalog";
import {
  WorldRenderer,
  type WorldRenderContext,
} from "../../game/client/world-renderer";
import { GameSimulation } from "../../game/core/simulation";
import { freshSave } from "../../game/core/save";
import { World } from "../../game/core/world";
import { Player } from "../../game/core/entities";
export default function ArenaClient({
  userId,
  menuHeader,
  initialMode = "DUEL_CASUAL",
}: {
  userId: string;
  menuHeader: React.ReactNode;
  initialMode?: "DUEL_CASUAL" | "WAR_CASUAL";
}) {
  const placement = useRef<"TORRE" | "BARRICADA" | null>(null),
    worldPointer = useRef({ x: 0, y: 0 });
  const [roster, setRoster] = useState<
    { id: string; name: string; team: number; isBot?: boolean }[]
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
    [queueInfo, setQueueInfo] = useState({
      found: 0,
      target: 10,
      filling: false,
    }),
    [mapName, setMapName] = useState(""),
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
    let world: World | null = null;
    let renderer: WorldRenderer | null = null;
    const visualPlayers = new Map<string, Player>();
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
          setQueueInfo({
            found: m.found || 0,
            target: m.target || 10,
            filling: m.filling || false,
          });
        }
        if (m.type === "ARENA_STARTED") {
          match.current = m.matchId;
          world = null;
          renderer = null;
          visualPlayers.clear();
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
          if (!world) {
            const g = new GameSimulation(freshSave());
            g.start("nara", "test", m.snapshot.mapId, m.snapshot.seed);
            world = new World(
              g,
              m.snapshot.mapId,
              m.snapshot.seed,
              {},
              MAP_DEFINITIONS[m.snapshot.mapId].profiles![m.snapshot.profile],
            );
            world.nearby = m.snapshot.structures;
            const ctx = canvas.current?.getContext("2d");
            if (ctx)
              renderer = new WorldRenderer({
                ctx,
                camera: { x: 500, y: 300 },
                viewW: 1000,
                viewH: 600,
                world,
                run: { worldSeed: m.snapshot.seed, simTime: m.snapshot.time },
                player: g.player,
                debug: {
                  chunks: false,
                  structureIds: false,
                  collisions: false,
                  hitboxes: false,
                },
              } satisfies WorldRenderContext);
            setMapName(MAP_DEFINITIONS[m.snapshot.mapId].name);
          }
          world.nearby = m.snapshot.structures;
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
              m.snapshot.structures,
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
          s.structures,
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
          if (renderer) {
            renderer.g.camera = { x: cx + 500, y: cy + 300 };
            renderer.g.run.simTime = s.time;
            renderer.terrain();
            for (const st of s.structures) renderer.structure(st, s.time);
            for (const area of s.areas) renderer.area(area);
            for (const item of s.pickups) {
              c.fillStyle = "#89edba";
              c.fillRect(item.x - 7, item.y - 2, 14, 4);
              c.fillRect(item.x - 2, item.y - 7, 4, 14);
            }
          }
          c.strokeStyle = "#a1ac88";
          c.lineWidth = 2;
          c.strokeRect(20, 20, s.width - 40, s.height - 40);
          if (s.war) {
            c.strokeStyle = "#c9b877";
            c.lineWidth = 3;
            c.beginPath();
            c.arc(1300, 700, 110, 0, Math.PI * 2);
            c.stroke();
            for (const u of s.war.minions) {
              c.fillStyle = u.team === 0 ? "#7fb99b" : "#c1817e";
              c.fillRect(u.x - 6, u.y - 6, 12, 12);
            }
            for (const st of s.war.structures) {
              c.globalAlpha = st.hp > 0 ? 1 : 0.2;
              c.strokeStyle = st.team === 0 ? "#83cca9" : "#d98e8c";
              c.lineWidth = 3;
              renderer?.structure(
                {
                  id: st.id,
                  type:
                    st.kind === "CORE"
                      ? "obelisk"
                      : st.kind === "TORRE"
                        ? "column"
                        : "wall",
                  x: st.x,
                  y: st.y,
                  r: st.r,
                  hp: st.hp,
                  maxHp: st.maxHp,
                  used: false,
                  destroyed: st.hp <= 0,
                  opened: false,
                  angle: 0,
                  variant: 0,
                },
                s.time,
              );
              c.beginPath();
              c.arc(st.x, st.y, st.r, 0, Math.PI * 2);
              c.stroke();
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
          for (const b of s.bullets)
            renderer?.projectile(
              b,
              COSMETICS[
                s.players.find((p) => p.id === b.owner)?.cosmetics
                  .PROJECTILE_EFFECT || ""
              ]?.color || b.color,
            );
          for (const line of s.lines) renderer?.line(line);
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
              pos = own && prediction ? prediction : remote;
            let visual = visualPlayers.get(p.id);
            if (!visual) {
              visual = new Player(p.character, {}, "PVP");
              visualPlayers.set(p.id, visual);
            }
            Object.assign(visual, {
              x: pos.x,
              y: pos.y,
              health: p.hp,
              maxHealth: p.maxHp,
              cosmetics: p.cosmetics,
              invulnerable: p.protected ? 1 : 0,
            });
            c.save();
            renderer?.player(visual, s.time);
            c.restore();
            c.globalAlpha = p.hp > 0 ? 1 : 0.3;
            c.strokeStyle = p.team === 0 ? "#83ccb7" : "#dd9c92";
            c.lineWidth = 2;
            c.beginPath();
            c.arc(pos.x, pos.y + 8, 20, 0, Math.PI * 2);
            c.stroke();
            c.fillStyle = "#273833";
            c.fillRect(pos.x - 22, pos.y - 28, 44, 4);
            c.fillStyle = p.team === 0 ? "#83ccb7" : "#dd9c92";
            c.fillRect(pos.x - 22, pos.y - 28, (44 * p.hp) / p.maxHp, 4);
            c.fillStyle = "#dbe6d5";
            c.font = "11px Georgia";
            c.textAlign = "center";
            c.fillText(
              p.name +
                (p.botControlled && !p.isBot
                  ? " [BOT temporário]"
                  : !p.connected && !p.isBot
                    ? " · reconectando"
                    : ""),
              pos.x,
              pos.y - 37,
            );
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
    <main
      className={`account-shell arena-page ${playing ? "arena-playing" : ""}`}
    >
      {!playing && menuHeader}
      {playing && <Link href="/">← Menu principal</Link>}
      <h1>ARENA DO LIMIAR</h1>
      <Link href="/ranked">Ranked · temporada e classificação</Link>
      <p>
        {status} · {hud.rtt} ms · Reconciliação {hud.correction}px
      </p>
      <p>
        Condições normalizadas. Obelisco e consumíveis PvE não entram. No 5v5,
        um bot assume após 30 s sem conexão; volte para reassumir seu slot.
      </p>
      <p role="status">{error || result}</p>
      {waiting && (
        <p role="status">
          {queueInfo.filling
            ? "Completando esquadrões…"
            : "PROCURANDO BATALHA…"}{" "}
          Jogadores encontrados: {queueInfo.found} / {queueInfo.target}
        </p>
      )}
      {playing && (
        <>
          <p>{mapName}</p>
          <div className="actions">
            {[0, 1].map((team) => (
              <div key={team}>
                <strong>{team === 0 ? "TIME AZUL" : "TIME VERMELHO"}</strong>
                <ul>
                  {roster
                    .filter((p) => p.team === team)
                    .map((p) => (
                      <li key={p.id}>{p.name}</li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      {!playing && mode === "WAR_CASUAL" && (
        <p>
          Casual: mínimo de 2 humanos. Após 45 s, bots identificados completam
          os times. Amigos na mesma equipe devem buscar o mesmo modo; a party
          permanece junta.
        </p>
      )}
      {!playing && mode === "WAR_RANKED" && (
        <p>
          Ranked: 10 humanos, sem bots na formação. Busca por até 5 minutos.
        </p>
      )}
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
            .filter((p) => p.id !== userId && !p.isBot)
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
        WASD/setas: mover · mouse: mirar · clique: arma do personagem · 1:
        Agulha do Vazio · 2: Sopro de Sal · 3/espaço: deslocamento · F7:
        hitboxes e posição servidor/predição.
      </p>
    </main>
  );
}
