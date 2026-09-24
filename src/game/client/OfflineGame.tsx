"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { freshSave, migrateSave } from "../core/save";
import { BrowserGame } from "./browser";
export default function OfflineGame() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let save = freshSave();
    try {
      save = migrateSave(
        JSON.parse(localStorage.getItem("limiar.save.v1") || "null"),
      );
    } catch {}
    const game = new BrowserGame(canvas, save);
    game.onHub = () => router.push("/");
    const menu = new URLSearchParams(window.location.search).get("menu");
    if (menu === "settings") game.ui.settings(() => game.ui.main());
    if (menu === "codex") game.ui.codex(() => game.ui.main());
    return () => game.dispose();
  }, [router]);
  return <GameShell canvasRef={canvasRef} />;
}
export function GameShell({
  canvasRef,
  variant = "expedition",
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  variant?: "expedition" | "competitive";
}) {
  const competitive = variant === "competitive";
  return (
    <>
      <canvas
        ref={canvasRef}
        id="game"
        className={competitive ? "competitive-game-canvas" : undefined}
        aria-label={competitive ? "Partida competitiva do Limiar" : "Expedição do Limiar"}
      ></canvas>

      <div id="hud" data-variant={variant} hidden={true}>
        <div className="xp-track" hidden={competitive}>
          <i id="xp-fill"></i>
        </div>

        <div className="hud-top">
          <div className="health">
            <div>
              <span>VITALIDADE</span>
              <b id="hp-text">110 / 110</b>
            </div>
            <div className="hp-track">
              <i id="hp-fill"></i>
            </div>
            <strong id="level" hidden={competitive}>NV. 1</strong>
          </div>

          <div className="time">
            <b id="timer">00:00</b>
            <span id="wave">O despertar</span>
          </div>

          <div className="counters">
            <span hidden>
              <b id="gold">0</b>
            </span>
            <span hidden>
              <b id="kills">0</b>
            </span>
            <button id="pause-button" hidden={competitive} aria-label="Pausar jogo" title="Esc / P">
              Ⅱ
            </button>
          </div>
        </div>

        <div id="boss-hud" hidden={true}>
          <span id="boss-name"></span>
          <small id="boss-phase"></small>
          <div>
            <i id="boss-fill"></i>
          </div>
        </div>

        <div className="build-bar">
          <div>
            <small>ARSENAL</small>
            <div id="weapons" className="slots"></div>
          </div>
          <div hidden>
            <small>RELICÁRIO</small>
            <div id="passives" className="slots"></div>
          </div>
        </div>

        <div className="run-inventory" hidden={competitive} aria-label="Itens da expedição">
          <small>ITENS</small>
          <div id="run-items" className="item-slots"></div>
        </div>

        <div
          id="interaction-prompt"
          className="interaction-prompt"
          hidden={true}
        >
          <button
            id="interaction-button"
            type="button"
            aria-label="Interagir com objeto próximo"
          >
            <kbd>E</kbd> <span id="interaction-name">INTERAGIR</span>
          </button>
        </div>

        <pre id="debug" hidden={true}></pre>
        <div className="controls-note">
          {competitive
            ? "WASD / SETAS · MOVER &nbsp; ARMAS · ATAQUE AUTOMÁTICO &nbsp; ESPAÇO · DESLOCAMENTO"
            : "WASD / SETAS · MOVER &nbsp; E · INTERAGIR &nbsp; 1–4 · ITENS &nbsp; ESC / P · PAUSA"}
        </div>
      </div>

      <main
        id="screen"
        role="dialog"
        aria-modal="true"
        aria-label="Menu do Limiar"
      ></main>
      <div id="toast" role="status" aria-live="polite"></div>
    </>
  );
}
