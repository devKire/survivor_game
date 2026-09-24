"use client";
import { useState } from "react";
import type { Friend } from "../../game/network/protocol";
import type { accountAction } from "../../server/actions";
export default function FriendsPanel({ user, friends, action, openChat }: {
 user: {id:string}; friends: Friend[];
 action: (input: Parameters<typeof accountAction>[0]) => Promise<Awaited<ReturnType<typeof accountAction>> | undefined>;
 openChat: (scope: "dm" | "team", target:string) => Promise<void>;
}) {
 const [query,setQuery]=useState("");
 const [matches,setMatches]=useState<{id:string;username:string|null;displayUsername:string|null}[]>([]);
 return (
              <aside className="card" id="friends">
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
);
}
