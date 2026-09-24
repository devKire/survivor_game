"use client";
import { diagnostics } from "../../game/client/diagnostics";
import { useEffect, useRef, useState } from "react";
import OnlineCombat from "./OnlineCombat";
import FriendsPanel from "./FriendsPanel";
import { accountAction, realtimeTicket } from "../../server/actions";
import { RealtimeClient } from "../../game/network/client";
import {
  chatSchema,
  type ChatMessage,
  type Friend,
  type Team,
} from "../../game/network/protocol";
import { OnlineSession } from "../../game/client/OnlineSession";
import {
  CHARACTER_DEFINITIONS,
  MAP_DEFINITIONS,
  MODE_DEFINITIONS,
} from "../../game/content/catalog";
import { freshSave, migrateSave } from "../../game/core/save";
import type { SaveData } from "../../game/core/types";
export default function TeamClient({
  user, menuHeader,
}: {
  menuHeader: React.ReactNode;
  user: { id: string; name: string };
}) {
  const connection = useRef<RealtimeClient | null>(null),
    chatInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Conectando…"),
    [error, setError] = useState(""),
    [team, setTeam] = useState<Team | null>(null),
    [friends, setFriends] = useState<Friend[]>([]),
    [progress, setProgress] = useState<SaveData>(freshSave),
    [session] = useState(() => new OnlineSession()),
    [started, setStarted] = useState(false),
    [result, setResult] = useState(""),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [chat, setChat] = useState<{ scope: "dm" | "team"; target: string } | null>(
      null,
    ),
    [chatOpen, setChatOpen] = useState(false),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => { diagnostics.accountRenders++; });
  const [rtt, setRtt] = useState(0);
  useEffect(() => {
    const client = new RealtimeClient(
      realtimeTicket,
      (message) => {
        if (message.type === "PONG") {
          setRtt(client.rtt);
          if (session.game) session.game.rtt = client.rtt;
        }
        if (message.type === "ACCOUNT") {
          setTeam(message.team);
          setFriends(message.friends);
          setProgress(migrateSave(message.progress.data));
        }
        if (message.type === "ERROR") setError(message.message);
        if (message.type === "STARTED") {
          session.begin(message.room);
          setStarted(true);
          setResult("");
        }
        if (message.type === "SNAPSHOT") session.receive(message);
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
  }, [session]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && chatOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
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
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [team, chatOpen]);
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
  return (
    <>
      {started ? (
        <OnlineCombat userId={user.id} session={session} connection={connection} settings={progress.settings} />
      ) : (
        <main className="account-screen team-screen">
          <section className="panel wide">
            {menuHeader}
            <div className="menu-top">
              <span>{user.name} · EQUIPE ONLINE</span>
            </div>
            <h1>Uma travessia em companhia.</h1>
            <p className="lede">
              Escolha seu eco. Encontre sua equipe. Atravessem a névoa juntos.
            </p>
            {result && <p role="status">{result}</p>}
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
                      Expedição
                      <select
                        disabled={team.leaderId !== user.id || team.status !== "LOBBY"}
                        value={team.duration}
                        onChange={(e) => connection.current?.send({ type: "CONFIG", duration: Number(e.target.value) as 600 | 900 | 1800 })}
                      >
                        <option value={600}>10 min · x0,45</option>
                        <option value={900}>15 min · x0,70</option>
                        <option value={1800}>30 min · x1,00</option>
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

              </section>
<FriendsPanel user={user} friends={friends} action={action} openChat={openChat} />
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
