"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import WarControls from "./WarControls";
import type { WarView, WarRole } from "../../game/content/war";
import { RealtimeClient } from "../../game/network/client";
import type { ClientMessage } from "../../game/network/protocol";
import { accountAction, competitiveAction, pvpCustomizationAction, realtimeTicket } from "../../server/actions";
import { PVP_LOADOUTS, type PvpCharacter } from "../../game/content/pvp";
import { COSMETIC_TYPES, type Cosmetic } from "../../game/content/cosmetics";
import type { ArenaSnapshot } from "../../game/core/pvp";
import { CompetitiveRemoteGame } from "../../game/client/CompetitiveRemoteGame";
import { VirtualJoystick } from "../../game/client/virtual-joystick";
import { GameShell } from "../../game/client/OfflineGame";
import { MAP_DEFINITIONS } from "../../game/content/catalog";
import type { Vec } from "../../game/core/types";

type ArenaMode = "DUEL_CASUAL" | "DUEL_RANKED" | "WAR_CASUAL" | "WAR_RANKED";
type RosterMember = { id: string; name: string; team: number; isBot?: boolean };
type PvpCosmeticData = {
  profiles: Record<PvpCharacter, Record<string, string>>;
  owned: Cosmetic[];
};

export default function ArenaClient({
  userId,
  menuHeader,
  initialMode = "DUEL_CASUAL",
}: {
  userId: string;
  menuHeader: React.ReactNode;
  initialMode?: "DUEL_CASUAL" | "WAR_CASUAL";
}) {
  const [mode, setMode] = useState<ArenaMode>(initialMode);
  const [role, setRole] = useState<WarRole>("SOLDADO");
  const [character, setCharacter] = useState<PvpCharacter>("nara");
  const [status, setStatus] = useState("Conectando…");
  const [waiting, setWaiting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [queueInfo, setQueueInfo] = useState({ found: 0, target: 10, filling: false });
  const [playing, setPlaying] = useState(false);
  const [latestSnapshot, setLatestSnapshot] = useState<ArenaSnapshot | null>(null);
  const [mapName, setMapName] = useState("");
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [war, setWar] = useState<WarView | null>(null);
  const [chat, setChat] = useState<{ id: string; name: string; text: string }[]>([]);
  const [chatText, setChatText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeCharacter, setCustomizeCharacter] = useState<PvpCharacter>("nara");
  const [cosmeticData, setCosmeticData] = useState<PvpCosmeticData | null>(null);
  const [customizeStatus, setCustomizeStatus] = useState("");
  const [hud, setHud] = useState({ time: 0, round: 1, score: "0 : 0", rtt: 0, correction: 0 });
  const client = useRef<RealtimeClient | null>(null);
  const game = useRef<CompetitiveRemoteGame | null>(null);
  const snapshot = useRef<ArenaSnapshot | null>(null);
  const match = useRef("");
  const placement = useRef<"TORRE" | "BARRICADA" | null>(null);

  const send = useCallback((message: ClientMessage) => {
    client.current?.send(message);
  }, []);
  const currentPlacement = useCallback(() => placement.current, []);
  const cancelPlacement = useCallback(() => {
    placement.current = null;
    setError("");
  }, []);
  const beginPlacement = useCallback((kind: "TORRE" | "BARRICADA") => {
    placement.current = kind;
    setError("Clique no mapa para construir; Esc cancela.");
  }, []);
  const placeAt = useCallback((kind: "TORRE" | "BARRICADA", point: Vec) => {
    const bounds = snapshot.current;
    if (!bounds) return;
    send({
      type: "ARENA_BUILD",
      kind,
      x: Math.max(0, Math.min(bounds.width, point.x)),
      y: Math.max(0, Math.min(bounds.height, point.y)),
    });
    placement.current = null;
    setError("Comando de construção enviado.");
  }, [send]);

  useEffect(() => {
    const connection = new RealtimeClient(
      realtimeTicket,
      (message) => {
        if (message.type === "ARENA_CHAT")
          setChat((previous) => [...previous, message].slice(-30));
        if (message.type === "ERROR") setError(message.message);
        if (message.type === "ARENA_QUEUE_STATUS") {
          setWaiting(message.waiting);
          setSeconds(message.seconds);
          setQueueInfo({
            found: message.found || 0,
            target: message.target || 10,
            filling: message.filling || false,
          });
        }
        if (message.type === "ARENA_STARTED") {
          match.current = message.matchId;
          snapshot.current = null;
          setLatestSnapshot(null);
          placement.current = null;
          setRoster(message.roster);
          setPlaying(true);
          setWaiting(false);
          setResult("");
          setChat([]);
          setWar(null);
        }
        if (message.type === "ARENA_SNAPSHOT") {
          if (match.current && message.matchId !== match.current) return;
          snapshot.current = message.snapshot;
          setLatestSnapshot(message.snapshot);
          game.current?.apply(message.snapshot);
          setMapName(MAP_DEFINITIONS[message.snapshot.mapId]?.name || message.snapshot.mapId);
          setWar(message.snapshot.ended ? null : message.snapshot.war || null);
          setHud({
            time: Math.ceil(message.snapshot.roundRemaining),
            round: message.snapshot.round,
            score: message.snapshot.score.join(" : "),
            rtt: Math.round(connection.rtt),
            correction: Math.round(game.current?.correction || 0),
          });
        }
        if (message.type === "ARENA_RESULT") {
          setResult(
            message.winner === null
              ? "Empate"
              : message.winner === snapshot.current?.players.find((player) => player.id === userId)?.team
                ? "Vitória"
                : "Derrota",
          );
          setPlaying(false);
          setWar(null);
          snapshot.current = null;
          setLatestSnapshot(null);
          placement.current = null;
          setError("");
        }
      },
      setStatus,
    );
    client.current = connection;
    void connection.connect();
    return () => {
      connection.close();
      if (client.current === connection) client.current = null;
    };
  }, [userId]);

  const startQueue = () => {
    setError("");
    send({ type: "ARENA_QUEUE", character, mode, role });
  };
  const loadPvpCosmetics = async () => {
    const response = await pvpCustomizationAction();
    if (response.ok && "data" in response) setCosmeticData(response.data as PvpCosmeticData);
    else if (!response.ok) setCustomizeStatus(response.error);
  };
  const equipPvpCosmetic = async (slot: (typeof COSMETIC_TYPES)[number], id: string) => {
    const response = await accountAction({
      type: "pvp-cosmetic",
      character: customizeCharacter,
      slot,
      id: id || null,
    });
    if (!response.ok) {
      setCustomizeStatus(response.error);
      return;
    }
    setCustomizeStatus("Aparência PvP atualizada.");
    await loadPvpCosmetics();
  };
  const repair = () => {
    const current = snapshot.current;
    const own = current?.players.find((player) => player.id === userId);
    if (!own || !current?.war) return;
    const nearest = current.war.structures
      .filter((structure) => structure.team === own.team && structure.hp > 0 && structure.hp < structure.maxHp)
      .sort((a, b) => Math.hypot(a.x - own.x, a.y - own.y) - Math.hypot(b.x - own.x, b.y - own.y))[0];
    if (nearest) send({ type: "ARENA_REPAIR", targetId: nearest.id });
    else setError("Nenhuma estrutura aliada danificada.");
  };

  return (
    <main className={`account-shell arena-page ${playing ? "arena-playing" : ""}`}>
      {!playing && menuHeader}
      {!playing ? (
        <>
          <h1>ARENA DO LIMIAR</h1>
          <Link href="/ranked">Ranked · temporada e classificação</Link>
          <p>{status}</p>
          <p role="status">{error || result}</p>
          <p>
            Combate competitivo nos mapas e com as armas do LIMIAR. Mova-se com WASD; as armas do personagem atacam automaticamente.
          </p>
          {waiting && (
            <p role="status">
              {queueInfo.filling ? "Completando esquadrões…" : "PROCURANDO BATALHA…"}{" "}
              Jogadores encontrados: {queueInfo.found} / {queueInfo.target}
            </p>
          )}
          {mode === "WAR_CASUAL" && (
            <p>Casual 5v5: mínimo de 2 humanos. Após o tempo configurado, bots identificados completam os times; a party permanece junta.</p>
          )}
          {mode === "WAR_RANKED" && (
            <p>Ranked 5v5 prioriza dez humanos e não usa bot-fill.</p>
          )}
          <button disabled={waiting} onClick={() => {
            const open = !customizeOpen;
            setCustomizeOpen(open);
            setCustomizeStatus("");
            if (open && !cosmeticData) void loadPvpCosmetics();
          }}>PERSONALIZAR PvP</button>
          {customizeOpen && (
            <section className="pvp-customize" aria-label="Personalização PvP">
              <h2>PERSONALIZAÇÃO PvP · aparência sem vantagem de combate</h2>
              <div className="actions">
                {(Object.keys(PVP_LOADOUTS) as PvpCharacter[]).map((id) => (
                  <button key={id} aria-pressed={customizeCharacter === id} onClick={() => setCustomizeCharacter(id)}>
                    {PVP_LOADOUTS[id].name}
                  </button>
                ))}
              </div>
              <div className="pvp-cosmetic-preview" style={{ color: PVP_LOADOUTS[customizeCharacter].color, borderColor: PVP_LOADOUTS[customizeCharacter].color }}>
                <strong>{PVP_LOADOUTS[customizeCharacter].icon} {PVP_LOADOUTS[customizeCharacter].name}</strong>
                <span>{cosmeticData?.owned.find((item) => item.id === cosmeticData.profiles[customizeCharacter]?.CHARACTER_SKIN)?.glyph || "◇"}</span>
                <small>Loadout competitivo fixo · cosméticos somente visuais</small>
              </div>
              {!cosmeticData ? <p>Carregando itens adquiridos…</p> : COSMETIC_TYPES.map((slot) => {
                const options = cosmeticData.owned.filter((item) => item.type === slot && (!item.character || item.character === customizeCharacter));
                return (
                  <label className="pvp-cosmetic-slot" key={slot}>
                    {slot.replaceAll("_", " ")}
                    <select value={cosmeticData.profiles[customizeCharacter]?.[slot] || ""} onChange={(event) => void equipPvpCosmetic(slot, event.target.value)}>
                      <option value="">Padrão</option>
                      {options.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.rarity}</option>)}
                    </select>
                  </label>
                );
              })}
              <p role="status">{customizeStatus}</p>
            </section>
          )}
          <div className="actions">
            <label>
              Modo{" "}
              <select value={mode} onChange={(event) => setMode(event.target.value as ArenaMode)}>
                <option value="DUEL_CASUAL">1v1 Casual</option>
                <option value="DUEL_RANKED">1v1 Ranked</option>
                <option value="WAR_CASUAL">Guerra 5v5 · Casual</option>
                <option value="WAR_RANKED">Guerra 5v5 · Ranked</option>
              </select>
            </label>
            <label>
              Personagem{" "}
              <select value={character} onChange={(event) => setCharacter(event.target.value as PvpCharacter)}>
                {Object.entries(PVP_LOADOUTS).map(([id, definition]) => (
                  <option value={id} key={id}>{definition.name}</option>
                ))}
              </select>
            </label>
            {mode.startsWith("WAR") && (
              <label>
                Classe{" "}
                <select value={role} onChange={(event) => setRole(event.target.value as WarRole)}>
                  {(["SOLDADO", "CONSTRUTOR", "COMANDANTE"] as const).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            )}
            <button disabled={waiting || status !== "Online"} onClick={startQueue}>Buscar partida</button>
            {waiting && <button onClick={() => send({ type: "ARENA_CANCEL" })}>Cancelar fila · {seconds}s</button>}
          </div>
        </>
      ) : (
        <ArenaGameplay
          userId={userId}
          snapshot={latestSnapshot}
          snapshotRef={snapshot}
          gameRef={game}
          placement={currentPlacement}
          beginPlacement={beginPlacement}
          placeAt={placeAt}
          cancelPlacement={cancelPlacement}
          mapName={mapName}
          roster={roster}
          hud={hud}
          war={war}
          send={send}
          repair={repair}
          onForfeit={() => send({ type: "ARENA_FORFEIT" })}
          chat={chat}
          chatText={chatText}
          setChatText={setChatText}
        />
      )}
      {!playing && result && (
        <details>
          <summary>Reportar jogador</summary>
          {roster.filter((player) => player.id !== userId && !player.isBot).map((player) => (
            <div key={player.id}>
              {player.name}{" "}
              {(["cheat", "abuse", "afk", "grief"] as const).map((reason) => (
                <button
                  key={reason}
                  onClick={async () => {
                    const response = await competitiveAction({ type: "report", targetId: player.id, matchId: match.current, reason });
                    setError(response.ok ? "Report registrado para análise." : response.error);
                  }}
                >{reason}</button>
              ))}
            </div>
          ))}
        </details>
      )}
    </main>
  );
}

function ArenaGameplay({
  userId,
  snapshot,
  snapshotRef,
  gameRef,
  placement,
  beginPlacement,
  placeAt,
  cancelPlacement,
  mapName,
  roster,
  hud,
  war,
  send,
  repair,
  onForfeit,
  chat,
  chatText,
  setChatText,
}: {
  userId: string;
  snapshot: ArenaSnapshot | null;
  snapshotRef: React.RefObject<ArenaSnapshot | null>;
  gameRef: React.RefObject<CompetitiveRemoteGame | null>;
  placement: () => "TORRE" | "BARRICADA" | null;
  beginPlacement: (kind: "TORRE" | "BARRICADA") => void;
  placeAt: (kind: "TORRE" | "BARRICADA", point: Vec) => void;
  cancelPlacement: () => void;
  mapName: string;
  roster: RosterMember[];
  hud: { time: number; round: number; score: string; rtt: number; correction: number };
  war: WarView | null;
  send: (message: ClientMessage) => void;
  repair: () => void;
  onForfeit: () => void;
  chat: { id: string; name: string; text: string }[];
  chatText: string;
  setChatText: (value: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const currentSnapshot = snapshot;
  const own = snapshot?.players.find((player) => player.id === userId);
  const dead = (own?.hp || 0) <= 0;
  useEffect(() => {
    if (!canvas.current) return;
    const instance = new CompetitiveRemoteGame(
      canvas.current,
      userId,
      send,
      placement,
      placeAt,
      cancelPlacement,
    );
    gameRef.current = instance;
    if (snapshotRef.current) instance.apply(snapshotRef.current);
    return () => {
      if (gameRef.current === instance) gameRef.current = null;
      instance.dispose();
    };
  }, [userId, send, placement, placeAt, cancelPlacement, gameRef, snapshotRef]);
  return (
    <>
      <GameShell canvasRef={canvas} variant="competitive" />
      <div className="arena-game-overlay">
        <header className="arena-match-header">
          <div><strong>ARENA DO LIMIAR</strong><small>{mapName}</small></div>
          <Link href="/">Menu principal</Link>
        </header>
        <div className="arena-match-score" aria-live="polite">
          RODADA {hud.round} · {hud.score} · {hud.time}s
          <small>{hud.rtt} ms · reconciliação {hud.correction}px</small>
        </div>
        {war && (
          <div className="arena-scoreboard">
            <button aria-expanded={scoreboardOpen} onClick={() => setScoreboardOpen((open) => !open)}>PLACAR · TAB</button>
            {scoreboardOpen && currentSnapshot && (
              <div className="arena-scoreboard-panel" role="region" aria-label="Placar da Guerra">
                {[0, 1].map((team) => (
                  <section key={team}>
                    <strong>{team === 0 ? "TIME AZUL" : "TIME VERMELHO"}</strong>
                    {currentSnapshot.players.filter((player) => player.team === team).map((player) => (
                      <div key={player.id} className="arena-scoreboard-row">
                        <span>{player.name}{player.isBot ? " [BOT]" : ""}</span>
                        <span>Nv.{player.level} · {player.kills}/{player.deaths}/{player.assists}</span>
                        <small>{player.warItems.join(" · ") || "sem itens"}</small>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="arena-roster">
          {[0, 1].map((team) => (
            <div key={team}>
              <strong>{team === 0 ? "TIME AZUL" : "TIME VERMELHO"}</strong>
              {roster.filter((player) => player.team === team).map((player) => (
                <span key={player.id}>{player.name}{player.isBot ? " [BOT]" : ""}</span>
              ))}
            </div>
          ))}
        </div>
        {war && (
          <WarControls
            war={war}
            send={send}
          place={beginPlacement}
            repair={repair}
          />
        )}
        <ArenaTouchControls key={dead ? "dead" : "alive"} dead={dead} gameRef={gameRef} />
        <div className="arena-match-actions">
          <button onClick={onForfeit}>Desistir da partida</button>
          <details>
            <summary>Chat da equipe</summary>
            <div aria-live="polite" className="arena-chat-history">
              {chat.map((message) => <p key={message.id}><strong>{message.name}:</strong> {message.text}</p>)}
            </div>
            <form onSubmit={(event) => {
              event.preventDefault();
              if (chatText.trim()) {
                send({ type: "ARENA_CHAT_SEND", text: chatText });
                setChatText("");
              }
            }}>
              <input aria-label="Mensagem para aliados" maxLength={500} value={chatText} onChange={(event) => setChatText(event.target.value)} />
              <button>Enviar</button>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}

function ArenaTouchControls({
  dead,
  gameRef,
}: {
  dead: boolean;
  gameRef: React.RefObject<CompetitiveRemoteGame | null>;
}) {
  const joystickInput = useRef(new VirtualJoystick());
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!dead) return;
    joystickInput.current.clear();
    gameRef.current?.clearVirtualMove();
    gameRef.current?.setVirtualDash(false);
  }, [dead, gameRef]);

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>, begin = false) => {
    if (dead || (!begin && joystickInput.current.pointerId !== event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const axis = begin
      ? joystickInput.current.begin(event.pointerId, event.clientX, event.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width * 0.36)
      : joystickInput.current.move(event.pointerId, event.clientX, event.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width * 0.36);
    if (!axis) return;
    setJoystick(axis);
    gameRef.current?.setVirtualMove(axis.x, axis.y);
  };
  const releaseJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickInput.current.release(event.pointerId)) return;
    setJoystick({ x: 0, y: 0 });
    gameRef.current?.clearVirtualMove();
  };

  return (
    <div className="arena-virtual-controls" aria-label="Controles de toque">
      <div
        className={`arena-joystick ${dead ? "is-disabled" : ""}`}
        role="application"
        aria-label={dead ? "Analógico desativado durante o renascimento" : "Analógico de movimento"}
        onPointerDown={(event) => {
          if (dead || joystickInput.current.pointerId !== null) return;
          event.preventDefault();
          updateJoystick(event, true);
          if (joystickInput.current.pointerId === event.pointerId) event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={updateJoystick}
        onPointerUp={releaseJoystick}
        onPointerCancel={releaseJoystick}
        onLostPointerCapture={releaseJoystick}
      >
        <span className="arena-joystick-knob" style={{ transform: `translate(${joystick.x * 34}px, ${joystick.y * 34}px)` }} />
      </div>
      <button
        className="arena-dash-control"
        aria-label="Deslocamento"
        disabled={dead}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          gameRef.current?.setVirtualDash(true);
        }}
        onPointerUp={() => gameRef.current?.setVirtualDash(false)}
        onPointerCancel={() => gameRef.current?.setVirtualDash(false)}
        onLostPointerCapture={() => gameRef.current?.setVirtualDash(false)}
      >DESLOCAR</button>
    </div>
  );
}
