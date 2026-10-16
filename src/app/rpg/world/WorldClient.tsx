"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RealtimeClient } from "../../../game/network/client";
import { realtimeTicket } from "../../../server/actions";
import {
  WorldGame,
  worldDiagnostics,
  type WorldTarget,
} from "../../../game/client/rpg-world/WorldGame";
import { VirtualJoystick } from "../../../game/client/virtual-joystick";
import { WORLD_ZONES } from "../../../game/content/rpg/world-zones";
import {
  REFUGE_DIALOGUES,
  REFUGE_NPCS,
} from "../../../game/content/rpg/refuge-npcs";
import { xpForRpgLevel } from "../../../game/core/rpg/rules";
import type { ServerMessage } from "../../../game/network/protocol";
import type {
  WorldOperation,
  WorldSnapshot,
} from "../../../game/network/world";
import type { ExplorationNode } from "../../../game/core/rpg/exploration/types";
import type { QuestJournalData } from "../../../server/rpg/quests/types";
import QuestJournal from "../quests/QuestJournal";
import { WorldActionContext } from "./WorldActionContext";
import WorldMap from "./WorldMap";
import WorldRewards from "./WorldRewards";
import styles from "./world.module.css";
type State = Extract<ServerMessage, { type: "WORLD_STATE" }>;
type Group = Extract<ServerMessage, { type: "WORLD_GROUP" }>;
type Chat = Extract<ServerMessage, { type: "WORLD_CHAT" }>;
type RpcPending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  promise: Promise<unknown>;
};
export default function WorldClient({
  panels,
  initialJournal,
}: {
  panels: Record<string, ReactNode>;
  initialJournal?: QuestJournalData;
}) {
  const questsAvailable = useRef(!!initialJournal);
  const router = useRouter(),
    canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<WorldGame>(null),
    client = useRef<RealtimeClient>(null),
    latest = useRef<WorldSnapshot>(null),
    pending = useRef(new Map<string, RpcPending>()),
    dialog = useRef<HTMLDialogElement>(null),
    joystick = useRef(new VirtualJoystick());
  const [nodes, setNodes] = useState<readonly ExplorationNode[]>([]);
  const [snapshot, setSnapshot] = useState<WorldSnapshot>(),
    [state, setState] = useState<State>(),
    [status, setStatus] = useState("Conectando…"),
    [message, setMessage] = useState(""),
    [target, setTarget] = useState<WorldTarget>(),
    [panel, setPanel] = useState<string>(),
    [npc, setNpc] = useState<string>(),
    [journal, setJournal] = useState(initialJournal),
    [selectedPlayer, setSelectedPlayer] = useState<string>(),
    [group, setGroup] = useState<Group>(),
    [chat, setChat] = useState<Chat[]>([]),
    [chatOpen, setChatOpen] = useState(false),
    [channel, setChannel] = useState<"LOCAL" | "GROUP" | "DM">("LOCAL"),
    [text, setText] = useState(""),
    [axis, setAxis] = useState({ x: 0, y: 0 });
  const rpc = useCallback(
    (operation: WorldOperation, args: unknown): Promise<unknown> => {
      const s = latest.current;
      if (!s) return Promise.reject(Error("Aguarde a conexão com o mundo."));
      const provided =
        args &&
        typeof args === "object" &&
        "requestId" in args &&
        typeof args.requestId === "string"
          ? args.requestId
          : undefined;
      const requestId = provided ?? crypto.randomUUID(),
        prior = pending.current.get(requestId);
      if (prior) return prior.promise;
      let resolve!: (v: unknown) => void, reject!: (e: Error) => void;
      const promise = new Promise<unknown>((a, b) => {
        resolve = a;
        reject = b;
      });
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        reject(
          Error(
            "Conexão interrompida. Repita a mesma ação para consultar a confirmação.",
          ),
        );
      }, 15000);
      pending.current.set(requestId, { resolve, reject, timer, promise });
      client.current?.send({
        type: "WORLD_RPC",
        epoch: s.epoch,
        requestId,
        operation,
        args,
      });
      return promise;
    },
    [],
  );
  const refresh = useCallback(() => {
    router.refresh();
    const s = latest.current;
    if (s) client.current?.send({ type: "WORLD_REFRESH", epoch: s.epoch });
  }, [router]);
  const form = useCallback(
    async (operation: WorldOperation, data: FormData) => {
      const args: Record<string, unknown> = {};
      for (const [key, value] of data) {
        if (key.startsWith("$ACTION_")) continue;
        if (typeof value !== "string" || Object.hasOwn(args, key))
          return { status: "error" as const, message: "Formulário inválido." };
        args[key] = ["expectedRevision", "amount"].includes(key)
          ? Number(value)
          : value;
      }
      try {
        await rpc(operation, args);
        refresh();
        return { status: "success" as const, message: "Registro confirmado." };
      } catch (error) {
        return {
          status: "error" as const,
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível confirmar.",
        };
      }
    },
    [rpc, refresh],
  );
  const perform = useRef<(action: string, t?: WorldTarget) => void>(() => {});
  const performAction = useCallback(
    (action: string, t?: WorldTarget) => {
      const s = latest.current;
      if (!s) return;
      if (action !== "INTERACT") {
        setNpc(undefined);
        setPanel(
          action === "QUESTS" && initialJournal ? "QUESTS_LOADING" : action,
        );
        if (action === "QUESTS" && initialJournal)
          void rpc("JOURNAL", {})
            .then((data) => {
              setJournal(data as QuestJournalData);
              setPanel("QUESTS");
            })
            .catch((e) => setMessage(e.message));
        return;
      }
      if (!t) return;
      if (t.kind === "PORTAL")
        client.current?.send({
          type: "WORLD_TRANSITION",
          epoch: s.epoch,
          portalId: t.id,
          requestId: crypto.randomUUID(),
        });
      else if (t.kind === "RESOURCE")
        client.current?.send({
          type: "WORLD_GATHER",
          epoch: s.epoch,
          nodeId: t.id,
          requestId: crypto.randomUUID(),
          expectedRevision: Math.max(s.self.revision, state?.revision ?? 0),
        });
      else
        client.current?.send({
          type: "WORLD_INTERACT",
          epoch: s.epoch,
          targetId: t.id,
        });
    },
    [rpc, initialJournal, state?.revision],
  );
  useEffect(() => {
    perform.current = performAction;
  }, [performAction]);
  useEffect(() => {
    const view = new WorldGame(
      canvas.current!,
      (v) => client.current?.send(v),
      setTarget,
      (action, t) => perform.current(action, t),
      (id) => {
        setSelectedPlayer(id);
        setPanel("PLAYER");
      },
    );
    game.current = view;
    const receive = (v: ServerMessage) => {
      if (v.type === "ACCOUNT")
        client.current?.send({ type: "WORLD_ENTER", protocol: 1 });
      if (v.type === "WORLD_SNAPSHOT") {
        view.apply(v);
        if (view.snapshot !== v) return;
        if (latest.current?.epoch !== v.epoch) {
          setPanel(undefined);
          setNpc(undefined);
        }
        latest.current = v;
        setSnapshot(v);
        setNodes(view.nodes);
      }
      if (v.type === "WORLD_STATE" && v.epoch === latest.current?.epoch) {
        setState(v);
        view.setResources(v.depleted);
        if (v.message) setMessage(v.message);
      }
      if (v.type === "WORLD_RESULT") {
        const p = pending.current.get(v.requestId);
        if (p) {
          clearTimeout(p.timer);
          pending.current.delete(v.requestId);
          if (v.ok) p.resolve(v.data);
          else p.reject(Error(v.message));
        }
        setMessage(v.message);
      }
      if (v.type === "WORLD_INTERACTION" && v.epoch === latest.current?.epoch) {
        setNpc(v.service === "NPC" ? v.targetId : undefined);
        if (v.service === "NPC" && questsAvailable.current) {
          setPanel("NPC_LOADING");
          void rpc("JOURNAL", {})
            .then((data) => {
              setJournal(data as QuestJournalData);
              setPanel("NPC");
            })
            .catch((error) => {
              setMessage(error.message);
              setPanel(undefined);
            });
        } else setPanel(v.service === "NPC" ? "NPC" : v.service);
      }
      if (v.type === "WORLD_REWARDS") {
        setMessage(
          `Recompensa de campo confirmada: +${v.rewards.reduce((n, r) => n + r.xp, 0)} XP RPG. Consulte Recompensas.`,
        );
        refresh();
      }
      if (v.type === "WORLD_CHAT") setChat((old) => [...old, v].slice(-50));
      if (v.type === "WORLD_GROUP") setGroup(v);
      if (v.type === "WORLD_LEFT") {
        setMessage(v.message);
        setStatus("Fora do mundo");
        view.setConnected(false);
        latest.current = null;
        setSnapshot(undefined);
      }
      if (v.type === "ERROR") setMessage(v.message);
    };
    const network = new RealtimeClient(realtimeTicket, receive, (value) => {
      setStatus(value);
      if (value !== "Online") view.setConnected(false);
    });
    client.current = network;
    worldDiagnostics.networkClients++;
    void network.connect();
    canvas.current?.focus();
    const outstanding = pending.current;
    return () => {
      network.close();
      view.dispose();
      worldDiagnostics.networkClients--;
      for (const p of outstanding.values()) {
        clearTimeout(p.timer);
        p.reject(Error("Mundo encerrado."));
      }
      outstanding.clear();
    };
  }, [rpc, refresh]);
  useEffect(() => {
    game.current?.setPaused(!!panel || chatOpen);
    if (panel) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else {
      dialog.current?.close();
      canvas.current?.focus();
    }
  }, [panel, chatOpen]);
  const resourceKey = state
    ? JSON.stringify([state.cycle, state.depleted, state.discovered])
    : undefined;
  const lastResources = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previous = lastResources.current;
    lastResources.current = resourceKey;
    if (!previous || !resourceKey || previous === resourceKey) return;
    const timer = setTimeout(() => {
      router.refresh();
      if (questsAvailable.current)
        void rpc("JOURNAL", {})
          .then((data) => setJournal(data as QuestJournalData))
          .catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [resourceKey, rpc, router]);
  function closePanel() {
    setPanel(undefined);
    setNpc(undefined);
  }
  const own = snapshot?.players.find((p) => p.id === snapshot.selfId),
    selected = snapshot?.players.find((p) => p.id === selectedPlayer),
    zone = snapshot ? WORLD_ZONES[snapshot.zoneId] : undefined;
  const tracked = journal?.quests.find(
    (q) => q.status === "ACTIVE" || q.status === "COMPLETED",
  );
  const xpCap = own ? xpForRpgLevel(own.level) : 100;
  const worldCommand = (
    action: "INVITE" | "ACCEPT" | "DECLINE" | "LEAVE" | "KICK",
    target?: string,
    inviteId?: string,
  ) => {
    if (snapshot)
      client.current?.send({
        type: "WORLD_GROUP",
        epoch: snapshot.epoch,
        action,
        ...(target ? { target } : {}),
        ...(inviteId ? { inviteId } : {}),
      });
  };
  function sendChat() {
    if (!snapshot || !text.trim()) return;
    client.current?.send({
      type: "WORLD_CHAT",
      epoch: snapshot.epoch,
      scope: channel,
      text,
      ...(channel === "DM" && selectedPlayer ? { target: selectedPlayer } : {}),
    });
    setText("");
  }
  const names: Record<string, string> = {
    INVENTORY: "Inventário",
    EQUIPMENT: "Equipamentos",
    CHARACTER: "Personagem",
    QUESTS: "Missões",
    STORAGE: "Depósito",
    MAP: "Mapa",
    GROUP: "Grupo",
    PLAYER: "Aventureiro",
    NPC: "Conversa",
    EXPEDITIONS: "Expedições",
    REWARDS: "Recompensas",
  };
  return (
    <WorldActionContext.Provider value={{ form, rpc, refresh }}>
      <main className={styles.root} aria-label="Mundo compartilhado do Limiar">
        <canvas
          ref={canvas}
          id="rpg-world-canvas"
          tabIndex={0}
          aria-label="Mundo RPG: WASD ou setas para mover; E interagir; I inventário; C personagem; J missões; M mapa; P grupo"
          className={styles.canvas}
        />
        <section className={styles.character} aria-label="Estado do personagem">
          <strong>{own?.name ?? "Limiar"}</strong>
          <span>
            {own ? `${own.character} · nível RPG ${own.level}` : status}
          </span>
          <label>
            Vida <progress value={own?.health ?? 0} max={own?.maxHealth ?? 1} />
            <small>
              {Math.ceil(own?.health ?? 0)}/{Math.ceil(own?.maxHealth ?? 0)}
            </small>
          </label>
          <label>
            XP RPG{" "}
            <progress
              value={snapshot?.self.xp ?? 0}
              max={
                Number.isFinite(xpCap)
                  ? xpCap
                  : Math.max(1, snapshot?.self.xp ?? 1)
              }
            />
            <small>{snapshot?.self.xp ?? 0}</small>
          </label>
        </section>
        <aside className={styles.map} aria-label="Minimapa">
          <strong>{zone?.name ?? "Conectando"}</strong>
          {snapshot && (
            <button
              onClick={() => perform.current("MAP")}
              aria-label="Ampliar mapa"
            >
              <WorldMap
                snapshot={snapshot}
                nodes={nodes}
                discovered={state?.discovered ?? []}
              />
            </button>
          )}
          <small>
            {status} · {snapshot?.players.length ?? 0} próximos
          </small>
        </aside>
        {tracked && (
          <aside className={styles.quest} aria-label="Missão acompanhada">
            <button onClick={() => perform.current("QUESTS")}>
              {tracked.title}
            </button>
            <small>
              {tracked.objectives
                .map((o) => `${o.current}/${o.target}`)
                .join(" · ")}
            </small>
          </aside>
        )}
        <p className={styles.notification} role="status">
          {message}
        </p>
        {!snapshot && (
          <section className={styles.connection}>
            <p>{status}</p>
            <button
              onClick={() =>
                client.current?.send({ type: "WORLD_ENTER", protocol: 1 })
              }
            >
              Entrar no mundo
            </button>
            <Link href="/rpg/refuge">Abrir Refúgio legado</Link>
            <Link href="/">Voltar ao menu</Link>
          </section>
        )}
        <nav className={styles.hotbar} aria-label="Ações do mundo">
          {["INVENTORY", "CHARACTER", "QUESTS", "MAP", "GROUP", "REWARDS"].map(
            (action) => (
              <button key={action} onClick={() => perform.current(action)}>
                {names[action]}
                {action === "GROUP" && group?.invites.length
                  ? ` (${group.invites.length})`
                  : ""}
              </button>
            ),
          )}
          <button
            onClick={() => {
              if (snapshot)
                client.current?.send({
                  type: "WORLD_LEAVE",
                  epoch: snapshot.epoch,
                });
            }}
          >
            Sair do mundo
          </button>
        </nav>
        {target && (
          <button
            className={styles.interact}
            onClick={() => game.current?.interact()}
          >
            [E] {target.name}
          </button>
        )}
        {state?.gathering && (
          <section
            className={styles.gathering}
            aria-label="Coleta em andamento"
          >
            <progress
              value={state.gathering.elapsed}
              max={state.gathering.duration}
            />
            <button
              onClick={() => {
                if (snapshot)
                  client.current?.send({
                    type: "WORLD_CANCEL",
                    epoch: snapshot.epoch,
                  });
              }}
            >
              Cancelar coleta
            </button>
          </section>
        )}
        <div
          className={styles.joystick}
          role="button"
          tabIndex={0}
          aria-label="Joystick de movimento"
          onKeyDown={(e) => {
            const moves: Record<string, [number, number]> = {
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
            };
            if (moves[e.key]) {
              e.preventDefault();
              game.current?.setVirtual(...moves[e.key]);
            }
          }}
          onKeyUp={() => game.current?.setVirtual(0, 0)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect(),
              v = joystick.current.begin(
                e.pointerId,
                e.clientX,
                e.clientY,
                r.left + r.width / 2,
                r.top + r.height / 2,
                r.width / 2,
              );
            if (v) {
              setAxis(v);
              game.current?.setVirtual(v.x, v.y);
            }
          }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect(),
              v = joystick.current.move(
                e.pointerId,
                e.clientX,
                e.clientY,
                r.left + r.width / 2,
                r.top + r.height / 2,
                r.width / 2,
              );
            setAxis(v);
            game.current?.setVirtual(v.x, v.y);
          }}
          onPointerUp={(e) => {
            joystick.current.release(e.pointerId);
            setAxis({ x: 0, y: 0 });
            game.current?.setVirtual(0, 0);
          }}
          onPointerCancel={() => {
            joystick.current.clear();
            setAxis({ x: 0, y: 0 });
            game.current?.setVirtual(0, 0);
          }}
        >
          <span
            style={{
              transform: `translate(${axis.x * 25}px,${axis.y * 25}px)`,
            }}
          />
        </div>
        <section className={styles.chat} aria-label="Chat do mundo">
          <button onClick={() => setChatOpen((v) => !v)}>
            {chatOpen ? "Recolher chat" : "Chat"}
          </button>
          {chatOpen && (
            <>
              <div role="log" aria-label="Mensagens">
                {chat.map((m) => (
                  <p key={m.id}>
                    <strong>{m.name}: </strong>
                    {m.text}
                  </p>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat();
                }}
              >
                <select
                  aria-label="Canal"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as typeof channel)}
                >
                  <option value="LOCAL">Local</option>
                  <option value="GROUP">Grupo</option>
                  <option value="DM">Privada</option>
                </select>
                <input
                  aria-label="Mensagem"
                  maxLength={500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoFocus
                />
                <button>Enviar</button>
              </form>
            </>
          )}
        </section>
        <dialog
          ref={dialog}
          className={styles.dialog}
          onCancel={(e) => {
            e.preventDefault();
            closePanel();
          }}
          aria-label={
            panel === "NPC"
              ? `Conversa: ${REFUGE_NPCS.find((n) => n.id === npc)?.name}`
              : (names[panel ?? ""] ?? "Painel")
          }
        >
          <header>
            <h2>
              {panel === "NPC"
                ? REFUGE_NPCS.find((n) => n.id === npc)?.name
                : names[panel ?? ""]}
            </h2>
            <button onClick={closePanel}>Fechar · Esc</button>
          </header>
          {panel === "REWARDS" && (
            <WorldRewards key={snapshot?.self.revision} />
          )}
          {panel === "MAP" && snapshot && (
            <WorldMap
              snapshot={snapshot}
              nodes={nodes}
              discovered={state?.discovered ?? []}
              large
            />
          )}
          {panel === "GROUP" && (
            <section>
              <h3>Seu grupo</h3>
              {group?.members.length ? (
                <ul>
                  {group.members.map((m) => (
                    <li key={m.id}>
                      {m.name} · {m.online ? "online" : "offline"}
                      {group.leader === snapshot?.selfId &&
                        m.id !== snapshot?.selfId && (
                          <button onClick={() => worldCommand("KICK", m.id)}>
                            Remover
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Selecione um aventureiro próximo para convidar.</p>
              )}
              {group?.members.length ? (
                <button onClick={() => worldCommand("LEAVE")}>
                  Sair do grupo
                </button>
              ) : null}
              {group?.invites.map((i) => (
                <p key={i.id}>
                  {i.name} convidou você.
                  <button
                    onClick={() => worldCommand("ACCEPT", undefined, i.id)}
                  >
                    Aceitar convite
                  </button>
                  <button
                    onClick={() => worldCommand("DECLINE", undefined, i.id)}
                  >
                    Recusar
                  </button>
                </p>
              ))}
            </section>
          )}
          {panel === "PLAYER" && selected && (
            <section>
              <p>
                {selected.name} · {selected.character} · nível {selected.level}
              </p>
              <button onClick={() => worldCommand("INVITE", selected.id)}>
                Convidar para grupo
              </button>
              <button
                onClick={() => {
                  setChannel("DM");
                  setChatOpen(true);
                  closePanel();
                }}
              >
                Enviar mensagem
              </button>
              <small>Mensagens privadas seguem as permissões de amizade.</small>
            </section>
          )}
          {panel === "NPC" && npc && (
            <section>
              {journal ? (
                <QuestJournal
                  key={npc}
                  initial={journal}
                  npcId={npc}
                  onChange={setJournal}
                />
              ) : (
                <p>
                  {REFUGE_DIALOGUES[
                    REFUGE_NPCS.find((n) => n.id === npc)
                      ?.dialogueId as keyof typeof REFUGE_DIALOGUES
                  ]?.lines.join(" ")}
                </p>
              )}
              <nav>
                {npc === "refuge:keeper" && (
                  <button onClick={() => setPanel("STORAGE")}>
                    Abrir Depósito
                  </button>
                )}
                {npc === "refuge:armorer" && (
                  <button onClick={() => setPanel("INVENTORY")}>
                    Abrir Arsenal
                  </button>
                )}
                {npc === "refuge:guardian" && (
                  <button onClick={() => setPanel("CHARACTER")}>
                    Consultar personagem
                  </button>
                )}
              </nav>
            </section>
          )}
          {panel === "QUESTS" &&
            (journal ? (
              <QuestJournal
                key={journal.revision}
                initial={journal}
                onChange={setJournal}
              />
            ) : (
              <p>Missões indisponíveis no momento.</p>
            ))}
          {panel === "EXPEDITIONS" && (
            <section>
              <p>
                Expedições são atividades instanciadas. Sua exploração livre
                continua disponível pelo portal das ruínas.
              </p>
              <button
                onClick={() => {
                  if (snapshot)
                    client.current?.send({
                      type: "WORLD_LEAVE",
                      epoch: snapshot.epoch,
                    });
                  setPanel("EXPEDITION_EXIT");
                }}
              >
                Sair do mundo para preparar expedição
              </button>
            </section>
          )}
          {panel === "EXPEDITION_EXIT" && !snapshot && (
            <Link href="/rpg/expeditions">Preparar expedição</Link>
          )}
          {panel && panels[panel]}
        </dialog>
      </main>
    </WorldActionContext.Provider>
  );
}
