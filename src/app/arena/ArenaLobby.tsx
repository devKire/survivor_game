"use client";
import { useEffect, useState } from "react";
import type { ArenaLobbyState } from "../../game/core/arena-lobby";
import {
  PVP_LOADOUTS,
  PVP_CHARACTER_PROFILES,
  type PvpCharacter,
} from "../../game/content/pvp";
import { WEAPON_DEFINITIONS } from "../../game/content/catalog";
import { COSMETICS } from "../../game/content/cosmetics";
import type { ClientMessage } from "../../game/network/protocol";
import { pvpCustomizationAction } from "../../server/actions";
import CharacterPreview from "../components/CharacterPreview";

export default function ArenaLobby({
  lobby,
  userId,
  send,
}: {
  lobby: ArenaLobbyState;
  userId: string;
  send: (message: ClientMessage) => void;
}) {
  const own = lobby.seats.find((s) => s.id === userId)!;
  const [owned, setOwned] = useState<string[]>([]);
  useEffect(() => {
    void pvpCustomizationAction().then((result) => {
      if (result.ok) setOwned(result.data.owned.map((c) => c.id));
    });
  }, []);
  const team = (index: number) => (
    <section className="lobby-team">
      <h2>{index === 0 ? "TIME AZUL" : "TIME VERMELHO"}</h2>
      {lobby.seats
        .filter((s) => s.team === index)
        .map((s) => (
          <article key={s.id} className="lobby-seat">
            <CharacterPreview
              character={s.character}
              cosmetics={s.cosmetics}
              size={60}
              animation={false}
            />
            <div>
              <strong>
                {s.name} {s.isBot ? "[BOT]" : ""}
              </strong>
              <small>
                {PVP_LOADOUTS[s.character].name} · {s.role || "SOLDADO"}
              </small>
              <small>
                {COSMETICS[s.cosmetics.CHARACTER_SKIN]?.name || "Padrão"}
              </small>
              <b>{s.locked ? "PRONTO" : "ESCOLHENDO"}</b>
            </div>
          </article>
        ))}
    </section>
  );
  return (
    <section className="arena-lobby">
      <header>
        <small>PARTIDA ENCONTRADA</small>
        <h1>
          {lobby.countdown ? "A partida se aproxima" : "Escolha seu personagem"}
        </h1>
        <strong role="timer">{lobby.remaining}s</strong>
      </header>
      <div className="lobby-layout">
        {team(0)}
        <section className="lobby-selection">
          <CharacterPreview
            character={own.character}
            cosmetics={own.cosmetics}
            size={240}
          />
          <h2>{PVP_LOADOUTS[own.character].name}</h2>
          <p>{PVP_LOADOUTS[own.character].title}</p>
          <div className="character-cards">
            {(Object.keys(PVP_LOADOUTS) as PvpCharacter[]).map((id) => (
              <button
                key={id}
                disabled={own.locked}
                aria-pressed={own.character === id}
                onClick={() =>
                  send({ type: "ARENA_SELECT_CHARACTER", character: id })
                }
              >
                <CharacterPreview character={id} size={70} animation={false} />
                <strong>{PVP_LOADOUTS[id].name}</strong>
              </button>
            ))}
          </div>
          {lobby.mode.startsWith("WAR") && (
            <div className="actions" aria-label="Classe">
              {(["SOLDADO", "CONSTRUTOR", "COMANDANTE"] as const).map(
                (role) => (
                  <button
                    key={role}
                    disabled={own.locked}
                    aria-pressed={role === own.role}
                    onClick={() => send({ type: "ARENA_SELECT_ROLE", role })}
                  >
                    {role}
                  </button>
                ),
              )}
            </div>
          )}
          <h3>Aparência</h3>
          <div className="actions">
            <button
              disabled={own.locked}
              onClick={() =>
                send({
                  type: "ARENA_SELECT_COSMETIC",
                  slot: "CHARACTER_SKIN",
                  id: null,
                })
              }
            >
              Padrão
            </button>
            {owned
              .map((id) => COSMETICS[id])
              .filter(
                (c) =>
                  c.type === "CHARACTER_SKIN" &&
                  (!c.character || c.character === own.character),
              )
              .map((c) => (
                <button
                  key={c.id}
                  disabled={own.locked}
                  aria-pressed={own.cosmetics.CHARACTER_SKIN === c.id}
                  onClick={() =>
                    send({
                      type: "ARENA_SELECT_COSMETIC",
                      slot: c.type,
                      id: c.id,
                    })
                  }
                >
                  {c.name}
                </button>
              ))}
          </div>
          <small>
            Arma inicial ·{" "}
            {
              WEAPON_DEFINITIONS[
                PVP_CHARACTER_PROFILES[own.character].war.starterWeapon
              ].name
            }
          </small>
          <button
            className="lobby-lock"
            disabled={own.locked}
            onClick={() => send({ type: "ARENA_LOCK_SELECTION" })}
          >
            {own.locked ? "SELEÇÃO CONFIRMADA" : "CONFIRMAR SELEÇÃO"}
          </button>
          <small>Build competitiva definida pelo servidor.</small>
        </section>
        {team(1)}
      </div>
    </section>
  );
}
