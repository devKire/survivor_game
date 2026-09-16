"use client";
import { useEffect, useRef } from "react";
import { freshSave, migrateSave } from "../core/save";
import { BrowserGame } from "./browser";
export default function OfflineGame() {
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
    return () => game.dispose();
  }, []);
  return <GameShell canvasRef={canvasRef} />;
}
export function GameShell({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <>
      <canvas
        ref={canvasRef}
        id="game"
        aria-label="Arena do jogo Limiar"
      ></canvas>

      <div id="hud" hidden={true}>
        <div className="xp-track">
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
            <strong id="level">NV. 1</strong>
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
            <button id="pause-button" aria-label="Pausar jogo" title="Esc / P">
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

        <div className="run-inventory" aria-label="Itens da expedição">
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
          WASD / SETAS · MOVER &nbsp; E · INTERAGIR &nbsp; 1–4 · ITENS &nbsp;
          ESC / P · PAUSA
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
