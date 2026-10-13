"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolveCharacterArt } from "../../../game/client/character-art";
import { useRouter } from "next/navigation";
import type { RefugeScene } from "../../../game/client/refuge-scene";
import { REFUGE_DIALOGUES } from "../../../game/content/rpg/refuge-npcs";
import type {
  RefugeService,
  RefugeTarget,
  RefugeDialogue,
} from "../../../game/core/rpg/refuge/types";
import styles from "./refuge.module.css";
const labels: Record<RefugeService, string> = {
  CHARACTER: "Personagem",
  EQUIPMENT: "Arsenal",
  STORAGE: "Depósito",
  EXPEDITIONS: "Expedições",
  REWARDS: "Recompensas",
  EXPLORATION: "Exploração",
};
export default function RefugeClient({
  characterId,
  name,
  level,
  xp,
  panels,
}: {
  characterId: string;
  name: string;
  level: number;
  xp: number;
  panels: Record<RefugeService, ReactNode>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<RefugeScene | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    menu = useRef<HTMLElement>(null);
  const initialCharacter = useRef(characterId),
    router = useRouter();
  const [target, setTarget] = useState<RefugeTarget>(),
    [error, setError] = useState("");
  const [panel, setPanel] = useState<RefugeService | null>(null),
    [talk, setTalk] = useState<{
      name: string;
      dialogue: RefugeDialogue;
      line: number;
    } | null>(null);
  const openRef = useRef<(target: RefugeTarget) => void>(() => {});
  function show(service?: RefugeService, npc?: RefugeTarget) {
    scene.current?.setPaused(true);
    setPanel(service ?? null);
    const dialogue = npc?.dialogueId
      ? REFUGE_DIALOGUES[npc.dialogueId as keyof typeof REFUGE_DIALOGUES]
      : undefined;
    setTalk(dialogue ? { name: npc!.name, dialogue, line: 0 } : null);
    dialog.current?.showModal();
  }
  useEffect(() => {
    openRef.current = (t) => show(t.service, t);
  });
  useEffect(() => {
    let cancelled = false;
    void import("../../../game/client/refuge-scene")
      .then(({ RefugeScene }) => {
        if (cancelled || !canvas.current) return;
        scene.current = new RefugeScene(
          canvas.current,
          initialCharacter.current,
          setTarget,
          (t) => openRef.current(t),
        );
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Cena indisponível. Use os serviços abaixo.",
          );
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    initialCharacter.current = characterId;
    scene.current?.setCharacter(characterId);
  }, [characterId]);
  function close() {
    dialog.current?.close();
  }
  return (
    <main className={styles.refuge}>
      <header className={styles.header}>
        <Image
          src={resolveCharacterArt(characterId)!.portrait}
          alt={`${name}, personagem ativo`}
          width={56}
          height={56}
          unoptimized
          className={styles.portrait}
        />
        <div>
          <p className="eyebrow">SANTUÁRIO DO OBELISCO</p>
          <h1>O Refúgio</h1>
          <p>
            {name} · nível RPG {level} · {xp} XP
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.safe}>Zona segura</span>
          <button onClick={() => menu.current?.focus()}>
            Menu de serviços
          </button>
          <Link href="/">Voltar ao Hub</Link>
        </div>
      </header>
      <p id="refuge-controls">
        WASD ou setas para caminhar. E para interagir. Escape fecha a conversa.
        Clique na cena para controlar.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.viewport}>
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label={`Cena do Refúgio — ${name}`}
          aria-describedby="refuge-controls"
          onPointerDown={() => canvas.current?.focus()}
        />
        <div className={styles.context}>
          <button onClick={() => scene.current?.interact()} disabled={!target}>
            {target
              ? `[E] ${target.dialogueId ? "Falar" : "Interagir"} — ${target.name}`
              : "Aproxime-se de um NPC ou estrutura"}
          </button>
        </div>
      </div>
      <div className={styles.touch} aria-label="Controles de movimento">
        {[
          [-1, -1, "↖", "noroeste"],
          [0, -1, "↑", "norte"],
          [1, -1, "↗", "nordeste"],
          [-1, 0, "←", "oeste"],
          [0, 0, "●", "parar"],
          [1, 0, "→", "leste"],
          [-1, 1, "↙", "sudoeste"],
          [0, 1, "↓", "sul"],
          [1, 1, "↘", "sudeste"],
        ].map(([x, y, , label]) => (
          <button
            key={label}
            aria-label={`Mover ${label}`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              scene.current?.setVirtual(Number(x), Number(y));
            }}
            onPointerUp={() => scene.current?.setVirtual(0, 0)}
            onPointerCancel={() => scene.current?.setVirtual(0, 0)}
            onLostPointerCapture={() => scene.current?.setVirtual(0, 0)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                scene.current?.setVirtual(Number(x), Number(y));
              }
            }}
            onKeyUp={() => scene.current?.setVirtual(0, 0)}
            onBlur={() => scene.current?.setVirtual(0, 0)}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                transform: `rotate(${(Math.atan2(Number(y), Number(x)) * 180) / Math.PI + 90}deg)`,
              }}
            >
              {x === 0 && y === 0 ? "●" : "↑"}
            </span>
          </button>
        ))}
      </div>
      <nav
        ref={menu}
        tabIndex={-1}
        className={styles.services}
        aria-label="Serviços acessíveis do Refúgio"
      >
        {(Object.keys(labels) as RefugeService[]).map((service) => (
          <button key={service} onClick={() => show(service)}>
            {labels[service]}
          </button>
        ))}
        <button onClick={() => router.refresh()}>Atualizar dados</button>
      </nav>
      <details>
        <summary>Orientação e controles</summary>
        <p>
          Praça ao norte; Arsenal a noroeste; Depósito a nordeste; personagens a
          oeste; quadro a leste; saída ao sul. Os serviços acima também
          funcionam sem movimentação.
        </p>
        <p>
          Movimento local, sem combate. A posição retorna à praça ao entrar. As
          mutações são confirmadas pelo servidor.
        </p>
      </details>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={
          talk?.name ?? (panel ? labels[panel] : "Serviço do Refúgio")
        }
        onClose={() => {
          setPanel(null);
          setTalk(null);
          scene.current?.setPaused(false);
          canvas.current?.focus();
        }}
      >
        <button className={styles.close} onClick={close} autoFocus>
          Fechar · Esc
        </button>
        {talk && (
          <section>
            <h2>{talk.name}</h2>
            <p>{talk.dialogue.lines[talk.line]}</p>
            {talk.line < talk.dialogue.lines.length - 1 ? (
              <button onClick={() => setTalk({ ...talk, line: talk.line + 1 })}>
                Continuar conversa
              </button>
            ) : (
              <nav className="actions">
                {talk.dialogue.services.map((service) => (
                  <button
                    key={service}
                    onClick={() => {
                      setTalk(null);
                      setPanel(service);
                    }}
                  >
                    {labels[service]}
                  </button>
                ))}
              </nav>
            )}
          </section>
        )}
        {panel && panels[panel]}
      </dialog>
    </main>
  );
}
