"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { accountAction, realtimeTicket } from "../../server/actions";
import { logout } from "../../server/auth-actions";
import { RealtimeClient } from "../../game/network/client";
import {
  chatSchema,
  type ChatMessage,
  type Friend,
  type Snapshot,
  type Team,
} from "../../game/network/protocol";
import { GameShell } from "../../game/client/OfflineGame";
import { RemoteGame } from "../../game/client/RemoteGame";
import {
  ACHIEVEMENTS,
  CHARACTER_DEFINITIONS,
  MAP_DEFINITIONS,
  MODE_DEFINITIONS,
  WEAPON_DEFINITIONS,
  PASSIVE_DEFINITIONS,
  WEAPON_PATHS,
  META_DEFINITIONS,
} from "../../game/content/catalog";
import { freshSave, migrateSave } from "../../game/core/save";
import type { SaveData, Upgrade } from "../../game/core/types";
export default function AccountClient({
  user,
}: {
  user: { id: string; name: string };
}) {
  const connection = useRef<RealtimeClient | null>(null),
    chatInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Conectando…"),
    [error, setError] = useState(""),
    [team, setTeam] = useState<Team | null>(null),
    [friends, setFriends] = useState<Friend[]>([]),
    [progress, setProgress] = useState<SaveData>(freshSave),
    [local, setLocal] = useState<unknown>(null),
    [importPending, setImportPending] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [started, setStarted] = useState(false),
    [result, setResult] = useState(""),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [chat, setChat] = useState<{ scope: "dm" | "team"; target: string } | null>(
      null,
    ),
    [chatOpen, setChatOpen] = useState(false),
    [code, setCode] = useState(""),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<
      { id: string; username: string | null; displayUsername: string | null }[]
    >([]),
    [upgradeOpen, setUpgradeOpen] = useState(false),
    [banish, setBanish] = useState(false),
    [busy, setBusy] = useState(false);
  const [rtt, setRtt] = useState(0);
  useEffect(() => {
    const client = new RealtimeClient(
      realtimeTicket,
      (message) => {
        if (message.type === "PONG") setRtt(client.rtt);
        if (message.type === "ACCOUNT") {
          try {
            setLocal(
              JSON.parse(localStorage.getItem("limiar.save.v1") || "null"),
            );
          } catch {}
          setTeam(message.team);
          setFriends(message.friends);
          setProgress(migrateSave(message.progress.data));
          setImportPending(!message.progress.importResolved);
        }
        if (message.type === "ERROR") setError(message.message);
        if (message.type === "STARTED") {
          setStarted(true);
          setResult("");
        }
        if (message.type === "SNAPSHOT") setSnapshot(message);
        if (message.type === "CHAT")
          setMessages((old) =>
            [
              ...old.filter((m) => m.id !== message.message.id),
              message.message,
            ].slice(-200),
          );
        if (message.type === "PRESENCE")
          setFriends((old) =>
            old.map((f) =>
              [f.fromId, f.toId].includes(message.id)
                ? { ...f, presence: message.state }
                : f,
            ),
          );
        if (message.type === "RESULT") {
          setStarted(false);
          setSnapshot(null);
          setResult(
            `${message.completed ? "Travessia concluída" : "A equipe caiu"} · ${Math.floor(message.time / 60)} min · ${message.kills} baixas. Recompensas salvas na conta.`,
          );
        }
      },
      setStatus,
    );
    connection.current = client;
    void client.connect();
    return () => client.close();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChatOpen(false);
        chatInput.current?.blur();
      }
      if (
        e.key === "Enter" &&
        document.activeElement !== chatInput.current &&
        team
      ) {
        e.preventDefault();
        setChat({ scope: "team", target: team.id });
        setChatOpen(true);
        setTimeout(() => chatInput.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [team]);
  async function action(input: Parameters<typeof accountAction>[0]) {
    setBusy(true);
    setError("");
    try {
      const r = await accountAction(input);
      if (!r.ok) {
        setError(r.error);
        return r;
      }
      connection.current?.send({ type: "SYNC" });
      return r;
    } catch {
      setError("Sem conexão. Tente novamente.");
      return { ok: false as const, error: "Sem conexão." };
    } finally {
      setBusy(false);
    }
  }
  async function openChat(scope: "dm" | "team", target: string) {
    setChat({ scope, target });
    setChatOpen(true);
    const r = await accountAction({ type: "history", scope, target });
    if (r.ok && r.data) {
      const parsed = chatSchema
        .array()
        .safeParse(JSON.parse(JSON.stringify(r.data)));
      if (parsed.success) setMessages(parsed.data.reverse());
    }
  }
  const relevant = messages.filter((m) =>
    chat?.scope === "team"
      ? m.teamId === chat.target
      : chat?.scope === "dm" &&
        ((m.senderId === chat.target && m.recipientId === user.id) ||
          (m.senderId === user.id && m.recipientId === chat.target)),
  );
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
      {started ? (
        <>
          <OnlineArena
            userId={user.id}
            snapshot={snapshot}
            connection={connection}
            rtt={rtt}
            settings={progress.settings}
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
      ) : (
        <main className="account-screen">
          <section className="panel wide">
            <div className="menu-top">
              <span className="eyebrow">LIMIAR · {user.name}</span>
              <span>◈ {progress.gold}</span>
            </div>
            <h1>Uma travessia em companhia.</h1>
            <p className="lede">
              Escolha seu eco. Encontre sua equipe. Atravessem a névoa juntos.
            </p>
            {result && <p role="status">{result}</p>}
            {importPending && local !== null && (
              <section className="card">
                <h2>Encontramos progresso local.</h2>
                <p>
                  Preserve uma cópia na conta e importe suas configurações. Ouro
                  e conquistas locais permanecem no arquivo solo; recompensas de
                  equipe são conquistadas nas expedições online.
                </p>
                <div className="actions">
                  <button
                    onClick={() => void action({ type: "import", save: local })}
                  >
                    IMPORTAR PARA MINHA CONTA
                  </button>
                  <button onClick={() => void action({ type: "use-account" })}>
                    USAR PROGRESSO DA CONTA
                  </button>
                </div>
              </section>
            )}
            <div className="account-grid">
              <section>
                <h2>MODO EQUIPE</h2>
                {!team ? (
                  <>
                    <p>Nenhuma equipe ativa.</p>
                    <button
                      disabled={busy}
                      onClick={() => void action({ type: "create-team" })}
                    >
                      CRIAR EQUIPE
                    </button>
                    <form
                      className="actions"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action({ type: "join-team", code });
                      }}
                    >
                      <label>
                        CÓDIGO DA EQUIPE
                        <input
                          value={code}
                          onChange={(e) =>
                            setCode(e.target.value.toUpperCase())
                          }
                          maxLength={8}
                          required
                        />
                      </label>
                      <button disabled={busy}>ENTRAR</button>
                    </form>
                  </>
                ) : (
                  <>
                    <p>
                      Código: <strong>{team.code}</strong>{" "}
                      <button
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(team.code)
                            .catch(() =>
                              setError("Copie o código exibido manualmente."),
                            )
                        }
                      >
                        Copiar código
                      </button>
                    </p>
                    <p>{team.members.length} / 5</p>
                    {team.status === "RUNNING" && (
                      <p>
                        A equipe está em expedição. Se a janela de reconexão
                        terminou, aguarde o resultado para iniciar outra.
                      </p>
                    )}
                    {team.members.map((m) => (
                      <div className="lobby-member" key={m.userId}>
                        <span>
                          {m.user.displayUsername || m.user.username}{" "}
                          {team.leaderId === m.userId ? "· LÍDER" : ""}
                        </span>
                        <b>{m.ready ? "✓ PRONTO" : "NÃO PRONTO"}</b>
                        {team.leaderId === user.id && m.userId !== user.id && (
                          <button
                            onClick={() =>
                              connection.current?.send({
                                type: "KICK",
                                target: m.userId,
                              })
                            }
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    ))}
                    <label>
                      Personagem
                      <select
                        value={
                          team.members.find((m) => m.userId === user.id)
                            ?.character
                        }
                        onChange={(e) =>
                          connection.current?.send({
                            type: "CONFIG",
                            character: e.target.value as "nara",
                          })
                        }
                      >
                        {Object.entries(CHARACTER_DEFINITIONS).map(
                          ([id, c]) => (
                            <option
                              key={id}
                              value={id}
                              disabled={!progress.unlocked.includes(id)}
                            >
                              {c.name}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Mapa
                      <select
                        disabled={
                          team.leaderId !== user.id || team.status !== "LOBBY"
                        }
                        value={team.mapId}
                        onChange={(e) =>
                          connection.current?.send({
                            type: "CONFIG",
                            mapId: e.target.value as "ruins",
                          })
                        }
                      >
                        {Object.entries(MAP_DEFINITIONS).map(([id, m]) => (
                          <option key={id} value={id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Modo
                      <select
                        disabled={
                          team.leaderId !== user.id || team.status !== "LOBBY"
                        }
                        value={team.mode}
                        onChange={(e) =>
                          connection.current?.send({
                            type: "CONFIG",
                            mode: e.target.value as "normal",
                          })
                        }
                      >
                        {Object.entries(MODE_DEFINITIONS)
                          .filter(([id]) => id !== "test")
                          .map(([id, m]) => (
                            <option key={id} value={id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={() =>
                          connection.current?.send({
                            type: "READY",
                            ready: !team.members.find(
                              (m) => m.userId === user.id,
                            )?.ready,
                          })
                        }
                      >
                        PRONTO
                      </button>
                      {team.leaderId === user.id && (
                        <button
                          disabled={
                            team.status !== "LOBBY" ||
                            !team.members.every((m) => m.ready)
                          }
                          onClick={() =>
                            connection.current?.send({ type: "START" })
                          }
                        >
                          INICIAR EXPEDIÇÃO
                        </button>
                      )}
                      <button onClick={() => void openChat("team", team.id)}>
                        CHAT
                      </button>
                      <button
                        onClick={() => void action({ type: "leave-team" })}
                      >
                        Sair da equipe
                      </button>
                    </div>
                  </>
                )}
                <div className="actions">
                  <Link href="/solo">Jogar solo · salvo na conta</Link>
                  <Link href="/offline">Jogar offline</Link>
                  <form action={logout}>
                    <button>SAIR DA CONTA</button>
                  </form>
                </div>
                <details>
                  <summary>Configurações da conta</summary>
                  <label>
                    <input
                      type="checkbox"
                      checked={progress.settings.sounds}
                      onChange={(e) =>
                        void action({
                          type: "settings",
                          settings: {
                            ...progress.settings,
                            sounds: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    Áudio
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={progress.settings.numbers}
                      onChange={(e) =>
                        void action({
                          type: "settings",
                          settings: {
                            ...progress.settings,
                            numbers: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    Números de dano
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={progress.settings.shake}
                      onChange={(e) =>
                        void action({
                          type: "settings",
                          settings: {
                            ...progress.settings,
                            shake: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    Tremor de tela
                  </label>
                </details>
                <details>
                  <summary>Conquistas e descobertas online</summary>
                  <p>
                    {progress.runs} expedições · {progress.completed} concluídas
                    · Recorde {Math.floor(progress.bestTime / 60)} min
                  </p>
                  {ACHIEVEMENTS.map((a) => (
                    <p key={a.id}>
                      {progress.achievements.includes(a.id) ? "✓" : "◇"}{" "}
                      {a.name} — {a.text}
                    </p>
                  ))}
                  <p>
                    Descobertas:{" "}
                    {Object.entries(progress.discovered)
                      .map(([category, ids]) => `${category}: ${ids.length}`)
                      .join(" · ")}
                  </p>
                </details>
                <h3>Melhorias permanentes online</h3>
                <div className="cards meta">
                  {Object.entries(META_DEFINITIONS).map(([id, m]) => (
                    <button
                      key={id}
                      disabled={busy || (progress.upgrades[id] || 0) >= 5}
                      onClick={() => void action({ type: "buy", id })}
                    >
                      {m.name} · {progress.upgrades[id] || 0}/5
                      <br />◈{" "}
                      {Math.ceil(m.base * 1.7 ** (progress.upgrades[id] || 0))}
                    </button>
                  ))}
                </div>
              </section>
              <aside className="card">
                <h2>AMIGOS</h2>
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await action({ type: "search", query });
                    if (r?.ok && r.data) {
                      const results = r.data.filter(
                        (
                          v,
                        ): v is {
                          id: string;
                          username: string | null;
                          displayUsername: string | null;
                        } => "username" in v,
                      );
                      setMatches(results);
                    }
                  }}
                >
                  <label>
                    Buscar por username
                    <input
                      minLength={3}
                      maxLength={24}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      required
                    />
                  </label>
                  <button>Buscar</button>
                </form>
                {matches.map((m) => (
                  <p key={m.id}>
                    {m.displayUsername || m.username}{" "}
                    <button
                      onClick={() =>
                        void action({ type: "friend", target: m.id })
                      }
                    >
                      Adicionar
                    </button>
                  </p>
                ))}
                {friends.map((f) => {
                  const other = f.fromId === user.id ? f.to : f.from;
                  return (
                    <div className="friend" key={f.id}>
                      <b>{other.displayUsername || other.username}</b>
                      <small>
                        {f.status === "ACCEPTED"
                          ? f.presence
                          : "SOLICITAÇÃO PENDENTE"}
                      </small>
                      <div className="actions">
                        {f.status === "PENDING" && f.toId === user.id ? (
                          <>
                            <button
                              onClick={() =>
                                void action({
                                  type: "friend-update",
                                  id: f.id,
                                  action: "accept",
                                })
                              }
                            >
                              Aceitar
                            </button>
                            <button
                              onClick={() =>
                                void action({
                                  type: "friend-update",
                                  id: f.id,
                                  action: "reject",
                                })
                              }
                            >
                              Recusar
                            </button>
                          </>
                        ) : f.status === "ACCEPTED" ? (
                          <button onClick={() => void openChat("dm", other.id)}>
                            Conversar
                          </button>
                        ) : null}
                        <button
                          onClick={() =>
                            void action({
                              type: "friend-update",
                              id: f.id,
                              action: "remove",
                            })
                          }
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </aside>
            </div>
          </section>
        </main>
      )}
      <div className="connection-status" role="status">
        {status}
        {started ? ` · RTT ${Math.round(rtt)} ms` : ""}
        {error && (
          <p role="alert" onClick={() => setError("")}>
            {error}
          </p>
        )}
      </div>
      {started && !chatOpen && (
        <button
          className="chat-toggle"
          onClick={() => {
            if (team) setChat({ scope: "team", target: team.id });
            setChatOpen(true);
          }}
        >
          CHAT · ENTER {messages.length ? "•" : ""}
        </button>
      )}
      {chatOpen && chat && (
        <aside className="chat-panel">
          <header>
            <b>{chat.scope === "team" ? "CHAT DA EQUIPE" : "CONVERSA"}</b>
            <button onClick={() => setChatOpen(false)}>Fechar</button>
          </header>
          <div className="chat-history">
            {relevant.length >= 30 && (
              <button
                onClick={async () => {
                  const r = await accountAction({
                    type: "history",
                    ...chat,
                    cursor: relevant[0].id,
                  });
                  if (r.ok && r.data) {
                    const p = chatSchema
                      .array()
                      .safeParse(JSON.parse(JSON.stringify(r.data)));
                    if (p.success)
                      setMessages((old) => [...p.data.reverse(), ...old]);
                  }
                }}
              >
                Mensagens anteriores
              </button>
            )}
            {relevant.map((m) => (
              <p key={m.id}>
                <b>{m.sender.displayUsername || m.sender.username}</b> {m.text}
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = chatInput.current?.value.trim();
              if (text) {
                connection.current?.send({ type: "CHAT", ...chat, text });
                if (chatInput.current) chatInput.current.value = "";
              }
            }}
          >
            <input
              ref={chatInput}
              aria-label="Mensagem"
              maxLength={500}
              placeholder="Mensagem…"
              onFocus={() =>
                window.dispatchEvent(new Event("limiar-chat-focus"))
              }
            />
            <button>Enviar</button>
          </form>
        </aside>
      )}
    </>
  );
}
function OnlineArena({
  userId,
  snapshot,
  connection,
  rtt,
  settings,
}: {
  rtt: number;
  settings: SaveData["settings"];
  userId: string;
  snapshot: Snapshot | null;
  connection: React.RefObject<RealtimeClient | null>;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null),
    game = useRef<RemoteGame | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const g = new RemoteGame(
      canvasRef.current,
      userId,
      (m) => connection.current?.send(m),
      () => router.push("/"),
    );
    game.current = g;
    const clear = () => g.input.clear();
    window.addEventListener("limiar-chat-focus", clear);
    return () => {
      window.removeEventListener("limiar-chat-focus", clear);
      g.dispose();
    };
  }, [userId, connection, router]);
  useEffect(() => {
    if (game.current) {
      game.current.rtt = rtt;
      game.current.save.settings = settings;
    }
    if (snapshot) game.current?.apply(snapshot);
  }, [snapshot, rtt, settings]);
  return <GameShell canvasRef={canvasRef} />;
}
