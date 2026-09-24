import { cosmeticVisual } from "../content/cosmetics";
import { OBELISK_BRANCHES, OBELISK_NODES, nodeBlocked, nodeCost, nodeValue } from "../content/obelisk";
import { achievementAmount, achievementCurrency, completionGold } from "../core/economy";
import { diagnostics } from "./diagnostics";
import {
  ACHIEVEMENTS,
  BOSS_PHASES,
  CHARACTER_DEFINITIONS,
  CHUNK_SIZE,
  ENEMY_DEFINITIONS,
  ITEM_DEFINITIONS,
  MAP_DEFINITIONS,
  EXPEDITION_LENGTHS,
  MODE_DEFINITIONS,
  PASSIVE_DEFINITIONS,
  RARITY,
  RUN_INVENTORY_SLOTS,
  SAVE_SCHEMA,
  STRUCTURE_DEFINITIONS,
  SYNERGY_DEFINITIONS,
  WAVE_TABLE,
  WEAPON_DEFINITIONS,
  WEAPON_PATHS,
  getModeDefinition,
} from "../content/catalog";
import { SpatialGrid } from "../core/collections";
import { Player } from "../core/entities";
import { TAU, clamp, clock, esc, fmt, hashString, rand } from "../core/math";
import {
  freshSave,
  migrateSave,
  validateImportEnvelope,
  validateRunSnapshot,
} from "../core/save";
import { DEBUG, GameSimulation, VERSION } from "../core/simulation";
import { hasStatus } from "../core/status";
import type * as T from "../core/types";
export class BrowserGame extends GameSimulation {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;
  zoom = 1;
  renderer: Renderer;
  declare sound: Sound;
  declare input: Input;
  declare ui: UI;
  abort = new AbortController();
  frameHandle = 0;
  onHub: () => void = () => {};
  dispose() {
    this.saveSnapshot(true);
    this.abort.abort();
    cancelAnimationFrame(this.frameHandle);
    this.sound.context?.close();
  }
  constructor(canvas: HTMLCanvasElement, save: T.SaveData) {
    super(save);
    this.persist = () => {
      try {
        localStorage.setItem("limiar.save.v1", JSON.stringify(this.save));
        return true;
      } catch {
        this.storageAvailable = false;
        return false;
      }
    };
    this.canvas = canvas;
    const context = this.canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Este navegador não disponibilizou o Canvas 2D.");
    }

    this.ctx = context;
    this.state = "menu";

    this.enemies = [];
    this.pickups = [];
    this.gems = [];
    this.gemCells = new Map();
    this.areas = [];
    this.lines = [];
    this.enemyId = 0;

    this.hitstop = 0;

    this.grid = new SpatialGrid();

    this.sound = new Sound(this);
    this.input = new Input(this);
    this.camera = { x: 0, y: 0 };
    this.mode = "normal";
    this.modeDef = getModeDefinition(this.mode);
    this.clockRate = 1;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.fps = 60;
    this.fx = 1;
    this.shake = 0;
    this.debug = {
      god: false,
      hitboxes: false,
      stats: DEBUG,
      chunks: false,
      structureIds: false,
      collisions: false,
    };
    this.hudClock = 0;

    this.ui = new UI(this);
    this.renderer = new Renderer(this);

    this.resize();
    window.addEventListener("resize", () => this.resize(), {
      signal: this.abort.signal,
    });
    window.addEventListener("beforeunload", () => this.saveSnapshot(true), {
      signal: this.abort.signal,
    });

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.canvas);
    this.abort.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
    this.ui.main();
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    this.width = Math.max(280, this.canvas.clientWidth || window.innerWidth);
    this.height = Math.max(280, this.canvas.clientHeight || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.zoom = Math.max(
      this.width / 1560,
      clamp(Math.min(this.width / 920, this.height / 660), 0.52, 1),
    );

    this.viewW = this.width / this.zoom;
    this.viewH = this.height / this.zoom;

    const width = Math.round(this.width * this.dpr), height = Math.round(this.height * this.dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      diagnostics.canvasResizes++;
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
    }
  }

  frame(now: number) {
    if (this.abort.signal.aborted) return;
    if (this.dpr !== Math.min(window.devicePixelRatio || 1, 2)) this.resize();
    const raw = this.lastFrame ? Math.max(0, (now - this.lastFrame) / 1000) : 0;

    this.lastFrame = now;

    if (raw > 0) {
      this.fps = this.fps * 0.96 + Math.min(240, 1 / raw) * 0.04;
    }

    const crowd = this.enemies.length;
    const autoFx =
      crowd >= 800
        ? 0.28
        : crowd >= 600
          ? 0.38
          : crowd >= 420
            ? 0.52
            : crowd >= 260
              ? 0.72
              : 1;
    this.fx =
      this.save.settings.particles === "off"
        ? 0
        : this.save.settings.particles === "low"
          ? 0.3
          : this.save.settings.particles === "high"
            ? 1
            : Math.min(autoFx, this.fps < 43 ? 0.35 : 1);

    if (this.state === "playing") {
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - raw);
      } else {
        this.accumulator += Math.min(raw, 0.25);
      }
      let steps = 0;

      while (
        this.accumulator + 1e-9 >= 1 / 60 &&
        steps++ < 15 &&
        this.state === "playing"
      ) {
        this.accumulator = Math.max(0, this.accumulator - 1 / 60);
        this.update(1 / 60);
      }
    } else {
      if (this.run?.telemetry && this.active)
        this.run.telemetry.menuSeconds += Math.min(raw, 0.25);
      this.accumulator = 0;
    }

    this.renderer.draw(now / 1000);
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
  }
}
class Sound {
  context: AudioContext | null = null;
  last = 0;
  constructor(public g: BrowserGame) {
    this.context = null;
    this.last = 0;
  }

  unlock() {
    try {
      if (!this.context) {
        const C = window.AudioContext;
        if (C) this.context = new C();
      }

      if (this.context?.state === "suspended") {
        this.context.resume().catch(() => {});
      }
    } catch {
      this.context = null;
    }
  }

  play(type: string) {
    const c = this.context;
    const s = this.g.save.settings;
    const now = performance.now();

    if (!c || c.state !== "running" || s.mute || !s.sounds || s.volume <= 0) {
      return;
    }

    if (type === "hit" && now - this.last < 75) return;
    if (type === "hit") this.last = now;

    const tones: Record<string, [number, number, number]> = {
      hit: [330, 90, 0.07],
      hurt: [130, 45, 0.22],
      level: [420, 900, 0.32],
      chest: [550, 1300, 0.5],
      boss: [100, 45, 0.65],
      phase: [180, 70, 0.35],
      item: [620, 980, 0.18],
      break: [240, 110, 0.12],
      interact: [430, 650, 0.2],
      evolve: [330, 1250, 0.55],
      end: [270, 55, 0.8],
    };

    const [from, to, duration] = tones[type] || tones.hit;

    try {
      const o = c.createOscillator();
      const gain = c.createGain();
      const t = c.currentTime;

      o.type = type === "hit" ? "triangle" : "sine";
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + duration);

      gain.gain.setValueAtTime(Math.max(0.0001, s.volume * 0.12), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      o.connect(gain);
      gain.connect(c.destination);
      o.start(t);
      o.stop(t + duration);

      o.onended = () => {
        o.disconnect();
        gain.disconnect();
      };
    } catch {
      /* Áudio opcional: a simulação continua sem dispositivo. */
    }
  }
}

class Input {
  keys = new Set<string>();
  touch: T.InputPort["touch"] = {
    active: false,
    id: null,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
  };
  g: BrowserGame;
  constructor(g: BrowserGame) {
    this.keys = new Set();
    this.touch = { active: false, id: null, x: 0, y: 0, dx: 0, dy: 0 };
    this.g = g;

    window.addEventListener(
      "keydown",
      (e) => {
        if (
          ["INPUT", "SELECT", "TEXTAREA"].includes(
            document.activeElement?.tagName || "",
          )
        ) {
          return;
        }

        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(
            e.key,
          )
        ) {
          e.preventDefault();
        }

        if (e.repeat) return;

        this.keys.add(e.code);
        g.sound.unlock();

        if (e.code === "Escape" || e.code === "KeyP") {
          if (g.state === "playing") g.pause();
          else if (g.state === "paused") g.resume();
        }

        if (g.state === "levelup" && /^Digit[1-4]$/.test(e.code)) {
          g.pickUpgrade(Number(e.code.slice(-1)) - 1);
        } else if (g.state === "playing" && /^Digit[1-4]$/.test(e.code)) {
          g.useItem(Number(e.code.slice(-1)) - 1);
        }

        if (g.state === "playing" && (e.code === "KeyE" || e.code === "KeyF")) {
          g.interact();
        }

        if (DEBUG && e.code.startsWith("F")) {
          e.preventDefault();
          g.debugKey(e.code);
        }
      },
      { signal: g.abort.signal },
    );

    window.addEventListener("keyup", (e) => this.keys.delete(e.code), {
      signal: g.abort.signal,
    });

    window.addEventListener(
      "blur",
      () => {
        this.clear();
        if (g.state === "playing") g.pause();
      },
      { signal: g.abort.signal },
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden && g.run && !g.run.settled) g.saveSnapshot(true);
        if (document.hidden && g.state === "playing") g.pause();
      },
      { signal: g.abort.signal },
    );

    g.canvas.addEventListener(
      "pointerdown",
      (e) => {
        g.sound.unlock();

        if (
          g.state !== "playing" ||
          e.pointerType === "mouse" ||
          this.touch.active
        ) {
          return;
        }

        this.touch = {
          active: true,
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          dx: 0,
          dy: 0,
        };

        g.canvas.setPointerCapture?.(e.pointerId);
      },
      { signal: g.abort.signal },
    );

    g.canvas.addEventListener(
      "pointermove",
      (e) => {
        const t = this.touch;
        if (!t.active || t.id !== e.pointerId) return;

        const dx = e.clientX - t.x;
        const dy = e.clientY - t.y;
        const d = Math.hypot(dx, dy) || 1;

        t.dx = (dx / d) * Math.min(1, d / 48);
        t.dy = (dy / d) * Math.min(1, d / 48);
      },
      { signal: g.abort.signal },
    );

    const release = (e: PointerEvent) => {
      if (e.pointerId === this.touch.id) this.touch.active = false;
    };

    g.canvas.addEventListener("pointerup", release, { signal: g.abort.signal });
    g.canvas.addEventListener("pointercancel", release, {
      signal: g.abort.signal,
    });
  }

  clear() {
    this.keys.clear();
    this.touch.active = false;
  }

  vector() {
    if (this.touch.active) {
      return { x: this.touch.dx, y: this.touch.dy };
    }

    const k = this.keys;

    let x =
      Number(k.has("KeyD") || k.has("ArrowRight")) -
      Number(k.has("KeyA") || k.has("ArrowLeft"));

    let y =
      Number(k.has("KeyS") || k.has("ArrowDown")) -
      Number(k.has("KeyW") || k.has("ArrowUp"));

    const d = Math.hypot(x, y);

    if (d > 1) {
      x /= d;
      y /= d;
    }

    return { x, y };
  }
}

type Actions = Record<string, (button: HTMLButtonElement) => void>;
class UI {
  g: BrowserGame;
  root: HTMLElement;
  actions: Actions = {};
  mode = "normal";
  toastTimer: ReturnType<typeof setTimeout> | number = 0;
  slotKey = "";
  nodes: Record<string, HTMLElement> = {};
  onInput: ((target: HTMLInputElement | HTMLSelectElement) => void) | null =
    null;
  onChange: ((target: HTMLInputElement) => void) | null = null;

  constructor(g: BrowserGame) {
    this.g = g;
    this.root = requiredNode("screen");
    this.actions = {};
    this.mode = "normal";
    this.toastTimer = 0;
    this.slotKey = "";
    this.nodes = {};

    for (const id of [
      "hud",
      "hp-fill",
      "hp-text",
      "xp-fill",
      "level",
      "timer",
      "wave",
      "gold",
      "kills",
      "weapons",
      "passives",
      "run-items",
      "boss-hud",
      "boss-name",
      "boss-phase",
      "boss-fill",
      "interaction-prompt",
      "interaction-name",
      "debug",
      "toast",
    ]) {
      this.nodes[id] = requiredNode(id);
    }

    if (!this.root || Object.values(this.nodes).some((n) => !n)) {
      throw new Error(
        "O HTML está incompleto. Mantenha todos os arquivos da mesma versão.",
      );
    }

    this.root.addEventListener(
      "click",
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
          "button[data-action]",
        );
        if (!b || b.disabled) return;

        this.g.sound.unlock();
        this.actions[b.dataset.action || ""]?.(b);
      },
      { signal: g.abort.signal },
    );

    this.root.addEventListener(
      "input",
      (e) => this.onInput?.(e.target as HTMLInputElement),
      { signal: g.abort.signal },
    );
    this.root.addEventListener(
      "change",
      (e) => this.onChange?.(e.target as HTMLInputElement),
      { signal: g.abort.signal },
    );

    requiredNode("pause-button").addEventListener("click", () => g.pause(), {
      signal: g.abort.signal,
    });
    requiredNode("interaction-button").addEventListener(
      "click",
      () => {
        g.sound.unlock();
        g.interact();
      },
      { signal: g.abort.signal },
    );
    this.nodes["run-items"].addEventListener(
      "click",
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
          "button[data-run-item]",
        );
        if (!b) return;
        g.sound.unlock();
        g.useItem(Number(b.dataset.runItem));
      },
      { signal: g.abort.signal },
    );
  }

  show(html: string, actions: Actions = {}, wide = false) {
    this.actions = actions;
    this.onInput = null;
    this.onChange = null;

    if (this.nodes?.["interaction-prompt"])
      this.nodes["interaction-prompt"].hidden = true;
    this.root.innerHTML = `<section class="panel ${wide ? "wide" : ""}">${html}</section>`;

    this.root.hidden = false;

    this.root
      .querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus({ preventScroll: true });
  }

  hide() {
    this.root.hidden = true;
    this.actions = {};
    this.onInput = null;
    this.onChange = null;
  }

  hud(visible: boolean) {
    this.nodes.hud.hidden = !visible;
  }

  head(kicker: string, title: string, sub = "") {
    return `
      <div class="eyebrow">${kicker}</div>
      <h1>${title}</h1>
      ${sub ? `<p class="lede">${sub}</p>` : ""}
    `;
  }

  button(action: string, text: string, primary = false) {
    return `
      <button data-action="${action}" class="${primary ? "primary" : ""}">
        ${text}
      </button>
    `;
  }

  main() {
    const c = CHARACTER_DEFINITIONS[this.g.save.selected];
    const hasRun = validateRunSnapshot(this.g.save.activeRun, false);
    const run = hasRun ? this.g.save.activeRun : null;
    this.show(
      `
      <div class="menu-top">
        <span class="eyebrow">ESTÚDIO DO LIMIAR · VOL. 01</span>
        <span class="gold">◆ ${fmt(this.g.save.gems)} Gemas · ◈ ${fmt(this.g.save.gold)} Ouro</span>
      </div>
      <div class="hero">
        <div>
          <div class="eyebrow">UM SURVIVOR DE FANTASIA ARCANA</div>
          <h1 class="logo">LIMIAR<span>ECOS DO OBELISCO</span></h1>
          <p class="lede">A noite guarda o que você deixou para trás.<br>Quanto de você atravessa a névoa?</p>
          <div class="actions">
            ${hasRun ? this.button("continue", "CONTINUAR EXPEDIÇÃO", true) : ""}
            ${this.button("play", hasRun ? "NOVA EXPEDIÇÃO" : "INICIAR EXPEDIÇÃO ↗", !hasRun)}
          </div>
          ${
            run
              ? `<div class="run-summary">
            <span>ECO<b>${CHARACTER_DEFINITIONS[run.character].name}</b></span>
            <span>LIMIAR<b>${MAP_DEFINITIONS[run.mapId].name}</b></span>
            <span>EXPEDIÇÃO<b>${getModeDefinition(run.mode).name}</b></span>
            <span>TEMPO<b>${clock(run.time)}</b></span>
          </div>`
              : ""
          }
          <div class="menu-grid">
            ${this.button("characters", "Personagens e mapas")}
            ${this.button("meta", "Obelisco")}
            ${this.button("achievements", "Conquistas")}
            ${this.button("settings", "Configurações")}
          </div>
        </div>
        <aside class="hero-seal">
          <div class="obelisk"><i></i></div>
          <span class="eyebrow">SEU PRÓXIMO ECO</span>
          <h2>${c.name}</h2><p>${c.title}</p>
          <span style="color:${c.color}">${c.icon} ${WEAPON_DEFINITIONS[c.weapon].name}</span>
        </aside>
      </div>
      ${this.g.save.legacyGoldConverted !== undefined ? `<p class="muted">Economia atualizada: ${fmt(this.g.save.legacyGoldConverted)} Ouro antigo → Gemas. Melhorias preservadas.</p>` : ""}
      <div class="records">
        <span>RECORDE <b>${fmt(this.g.save.highScore)}</b></span>
        <span>MAIOR TEMPO <b>${clock(this.g.save.bestTime)}</b></span>
        <span>MAIS BAIXAS <b>${fmt(this.g.save.bestKills)}</b></span>
        <span>TRAVESSIAS <b>${this.g.save.completed}</b></span>
      </div>
      <div class="footer">
        ${this.button("hub", "VOLTAR AO MENU PRINCIPAL")}
        ${this.button("codex", "Códice")}
        ${this.button("reset", "Resetar progresso")}
        <small>v${VERSION} · ${this.g.storageAvailable ? "SALVAMENTO LOCAL" : "PROGRESSO TEMPORÁRIO"}</small>
      </div>
    `,
      {
        hub: () => this.g.onHub(),
        continue: () => this.g.continueRun(),
        play: () =>
          hasRun
            ? this.confirm(
                "Iniciar uma nova expedição?",
                "A run em andamento será apagada.",
                () => {
                  this.g.save.activeRun = null;
                  this.g.persist();
                  this.characters();
                },
                () => this.main(),
              )
            : this.characters(),
        characters: () => this.characters(),
        meta: () => this.meta(),
        achievements: () => this.achievements(),
        settings: () => this.settings(() => this.main()),
        codex: () => this.codex(() => this.main()),
        reset: () =>
          this.confirm(
            "Resetar todo o progresso?",
            "As moedas, as conquistas, melhorias e a expedição ativa serão apagados.",
            () => {
              this.g.save = freshSave();
              this.g.persist();
              this.main();
            },
            () => this.main(),
          ),
      },
      true,
    );
  }

  characters() {
    this.show(
      this.head(
        "PREPARE A TRAVESSIA",
        "Escolha seu eco e seu limiar",
        "Personagem, mapa e modo definem o início da expedição.",
      ) +
        `
      <h3>Eco</h3>
      <div class="cards characters">
        ${Object.entries(CHARACTER_DEFINITIONS)
          .map(([id, c]) => {
            const unlocked = this.g.save.unlocked.includes(id);
            return `<button data-action="select" data-id="${id}" class="card ${this.g.save.selected === id ? "selected" : ""} ${unlocked ? "" : "locked"}" ${unlocked ? "" : "disabled"}>
            <span class="sigil" style="color:${c.color}">${c.icon}</span>
            <small>${unlocked ? (this.g.save.selected === id ? "SELECIONADO" : "DISPONÍVEL") : "BLOQUEADO"}</small>
            <h2>${c.name}</h2><p>${c.title}</p><strong>${WEAPON_DEFINITIONS[c.weapon].name}</strong><p>${c.bonus}</p><small>${c.condition}</small>
          </button>`;
          })
          .join("")}
      </div>
      <h3>Escolha o Limiar</h3>
      <div class="cards map-grid">
        ${Object.entries(MAP_DEFINITIONS)
          .map(
            ([
              id,
              m,
            ]) => `<button data-action="map" data-id="${id}" class="card map-card ${this.g.save.selectedMap === id ? "selected" : ""}">
          <small>${this.g.save.selectedMap === id ? "SELECIONADO" : "DISPONÍVEL"}</small><span class="map-glyph">${m.icon}</span><h2>${m.name}</h2><p>${m.description}</p>
          <strong>${m.water ? "Água rasa · rotas secas · fauna própria" : "Ruínas · fendas · estruturas de pedra"}</strong>
        </button>`,
          )
          .join("")}
      </div>
      <div class="mode"><label for="run-mode">Expedição</label><select id="run-mode">
        ${Object.entries(MODE_DEFINITIONS)
          .map(
            ([id, m]) =>
              `<option value="${id}" ${this.mode === id ? "selected" : ""}>${m.label}</option>`,
          )
          .join("")}
      </select></div>
      <div class="mode"><label for="run-duration">Duração</label><select id="run-duration">
        ${Object.values(EXPEDITION_LENGTHS).map((p) => `<option value="${p.duration}" ${this.g.save.selectedExpeditionLength === p.duration ? "selected" : ""}>${p.duration / 60} min · x${p.rewardMultiplier.toFixed(2).replace(".", ",")}</option>`).join("")}
      </select></div>
      <div class="run-summary">
        <span>ECO<b>${CHARACTER_DEFINITIONS[this.g.save.selected].name}</b></span>
        <span>LIMIAR<b>${MAP_DEFINITIONS[this.g.save.selectedMap].name}</b></span>
        <span>EXPEDIÇÃO<b>${getModeDefinition(this.mode).summary}</b></span>
      </div>
      <div class="actions">${this.button("start", "ATRAVESSAR A NÉVOA", true)}${this.button("back", "Voltar")}</div>
    `,
      {
        select: (b) => {
          this.g.save.selected = b.dataset.id!;
          this.g.persist();
          this.characters();
        },
        map: (b) => {
          this.g.save.selectedMap = b.dataset.id!;
          this.g.persist();
          this.characters();
        },
        start: () => this.begin(),
        back: () => this.main(),
      },
      true,
    );
    this.onInput = (t) => {
      if (t.id === "run-mode") {
        this.mode = Object.hasOwn(MODE_DEFINITIONS, t.value)
          ? t.value
          : "normal";
        this.characters();
      }
      if (t.id === "run-duration") {
        this.g.save.selectedExpeditionLength = [600, 900, 1800].includes(Number(t.value)) ? Number(t.value) : 1800;
        this.g.persist();
        this.characters();
      }
    };
  }

  begin() {
    if (!this.g.save.tutorial) {
      this.show(
        this.head("ANTES DE ATRAVESSAR", "Mova-se. O resto desperta.") +
          `
        <div class="tutorial">
          <p><kbd>W A S D</kbd> ou <kbd>↑ ← ↓ →</kbd> para mover.</p>
          <p>
            <b>Os ataques são automáticos.</b>
            Procure espaço entre os inimigos.
          </p>
          <p>
            Recolha <span class="mint">◆ cristais de XP</span>
            e escolha uma melhoria a cada nível.
          </p>
          <p>
            Chefes deixam baús.
            Arma nível 8 + passivo parceiro + baú = evolução.
          </p>
          <p>
            ${
              getModeDefinition(this.mode).endless
                ? "No <b>Infinito</b>, atravesse 30 minutos e sobreviva ao escalonamento além do Limiar."
                : "Sobreviva <b>30 minutos</b> para concluir a expedição."
            }
            No touch, arraste o dedo sobre a arena.
          </p>
          <p>
            <kbd>Esc</kbd> / <kbd>P</kbd> pausa. <kbd>E</kbd> interage.
            <kbd>1–4</kbd> usa itens durante a ação e escolhe melhorias no level-up.
          </p>
        </div>
        <div class="actions">
          ${this.button("go", "ESTOU PRONTO", true)}
          ${this.button("back", "Voltar")}
        </div>
      `,
        {
          go: () => {
            this.g.save.tutorial = true;
            this.g.persist();
            this.g.start(
              this.g.save.selected,
              this.mode,
              this.g.save.selectedMap,
            );
          },
          back: () => this.characters(),
        },
      );

      return;
    }

    this.g.start(this.g.save.selected, this.mode, this.g.save.selectedMap);
  }

  pause() {
    const g = this.g,
      p = g.player,
      r = g.run;
    const weapons = p.weapons
      .map(
        (w) =>
          `<div class="card"><span style="color:${w.definition.color}">${w.definition.icon}</span><h3>${w.name}</h3><p>Nível ${w.level} · ${w.path ? WEAPON_PATHS[w.id][w.path].name : "Sem caminho"}</p></div>`,
      )
      .join("");
    const passives = Object.entries(p.passives)
      .map(
        ([id, n]) =>
          `<p>${PASSIVE_DEFINITIONS[id].icon} ${PASSIVE_DEFINITIONS[id].name} · ${n}</p>`,
      )
      .join("");
    this.show(
      this.head(
        "SUA BUILD",
        "Travessia suspensa",
        `${clock(r.time)} · nível ${p.level} · ${MAP_DEFINITIONS[r.mapId].name} · ${g.modeDef.name}`,
      ) +
        `
      <div class="run-summary"><span>GEMAS<b>${fmt(r.gems)}</b></span><span>BAIXAS<b>${fmt(r.kills)}</b></span><span>SEED<b>${esc(r.worldSeed)}</b></span></div>
      <h3>Armas e caminhos</h3><div class="cards meta">${weapons}</div>
      <h3>Passivos</h3>${passives || '<p class="muted">Nenhum passivo adquirido.</p>'}
      <h3>Sinergias</h3>${r.synergies.map((id) => `<p>${SYNERGY_DEFINITIONS[id].name} · ${SYNERGY_DEFINITIONS[id].text}</p>`).join("") || '<p class="muted">Combine armas para descobrir sinergias.</p>'}
      <h3>Consumíveis</h3>${r.inventory.map((slot) => (slot ? `<p>${ITEM_DEFINITIONS[slot.id].icon} ${ITEM_DEFINITIONS[slot.id].name} ×${slot.qty}</p>` : "")).join("") || '<p class="muted">Nenhum consumível.</p>'}
      <h3>Atributos</h3><p>Dano ${Math.round(p.stats.damage * 100)}% · Movimento ${Math.round(p.speed)} · Armadura ${p.armor} · Área ${Math.round(p.stats.area * 100)}% · Growth ${Math.round(p.stats.growth * 100)}% · Sorte ${Math.round(p.stats.luck * 100)}%</p>
      <h3>Mapa explorado</h3><div class="map-overview">${[...g.world.chunks.values()].map((ch) => `<span>${ch.cx}, ${ch.cy}<br>${ch.structures.filter((s) => !s.destroyed).length} estruturas</span>`).join("")}</div>
      <div class="actions">${this.button("resume", "Continuar", true)}${this.button("settings", "Configurações")}${this.button("codex", "Códice")}${this.button("quit", "Encerrar expedição")}${this.button("hub", "VOLTAR AO MENU PRINCIPAL")}</div>`,
      {
        hub: () => { g.saveSnapshot(true); g.onHub(); },
        resume: () => g.resume(),
        settings: () => this.settings(() => this.pause()),
        codex: () => this.codex(() => this.pause()),
        quit: () =>
          this.confirm(
            "Encerrar expedição?",
            "O progresso será contabilizado.",
            () => {
              g.finish(false, true);
              g.menu();
            },
            () => this.pause(),
          ),
      },
      true,
    );
  }

  confirm(title: string, text: string, yes: () => void, no: () => void) {
    this.show(
      this.head("CONFIRMAÇÃO", title, text) +
        `
      <div class="actions">
        ${this.button("no", "Cancelar", true)}
        ${this.button("yes", "Confirmar")}
      </div>
    `,
      { yes, no },
    );
  }

  exportSave() {
    if (this.g.run && !this.g.run.settled) this.g.saveSnapshot(true);
    const payload = {
      schemaVersion: SAVE_SCHEMA,
      gameVersion: VERSION,
      exportedAt: new Date().toISOString(),
      progress: { ...this.g.save, activeRun: undefined },
      activeRun: this.g.save.activeRun || null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `limiar-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toast("Save exportado", "Arquivo JSON gerado localmente.");
  }

  importSaveFile(file: File, back: () => void) {
    if (!file || file.size > 2_000_000) {
      this.toast(
        "Arquivo de save inválido",
        "O arquivo excede o limite permitido.",
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        if (!validateImportEnvelope(data)) throw new Error("invalid");
        const imported = migrateSave({ ...data.progress, activeRun: data.activeRun ?? data.progress.activeRun ?? null });
        this.confirm(
          "Importar este progresso?",
          "Importar este progresso substituirá o save atual deste navegador.",
          () => {
            this.g.save = imported;
            this.g.persist();
            this.toast("Save importado", "Progresso validado e aplicado.");
            this.main();
          },
          () => this.settings(back),
        );
      } catch {
        this.toast(
          "Arquivo de save inválido",
          "Nenhuma alteração foi feita no progresso atual.",
        );
      }
    };
    reader.onerror = () =>
      this.toast("Arquivo de save inválido", "Não foi possível ler o arquivo.");
    reader.readAsText(file);
  }

  settings(back: () => void) {
    const s = this.g.save.settings;
    const toggle = (key: keyof T.Settings, label: string) =>
      `<label class="setting"><span>${label}</span><input data-setting="${key}" type="checkbox" ${s[key] ? "checked" : ""}></label>`;
    this.show(
      this.head("PREFERÊNCIAS", "Ajuste a atmosfera") +
        `
      <div class="settings">
        <label class="setting"><span>Volume geral</span><input data-setting="volume" type="range" min="0" max="1" step=".05" value="${s.volume}"></label>
        ${toggle("mute", "Silenciar")}${toggle("sounds", "Efeitos sonoros")}${toggle("shake", "Tremor de tela")}${toggle("numbers", "Números de dano")}
        <label class="setting"><span>Partículas</span><select data-setting="particles">
          ${[
            ["auto", "Automática"],
            ["high", "Alta"],
            ["low", "Reduzida"],
            ["off", "Desativadas"],
          ]
            .map(
              ([v, t]) =>
                `<option value="${v}" ${s.particles === v ? "selected" : ""}>${t}</option>`,
            )
            .join("")}
        </select></label>
      </div>
      <p class="muted">Na qualidade automática, os efeitos diminuem quando a taxa de quadros cai. A simulação permanece a mesma.</p>
      <div class="save-actions">
        ${this.button("export", "EXPORTAR SAVE")}${this.button("import", "IMPORTAR SAVE")}
        <input id="save-import-file" type="file" accept="application/json,.json" hidden>
      </div>
      <div class="actions">${this.button("back", "Voltar", true)}${this.button("sound", "Testar som")}</div>
    `,
      {
        back,
        sound: () => {
          this.g.sound.unlock();
          this.g.sound.play("level");
        },
        export: () => this.exportSave(),
        import: () =>
          this.root
            .querySelector<HTMLInputElement>("#save-import-file")
            ?.click(),
      },
    );
    this.onInput = (t) => {
      const key = t.dataset.setting;
      if (!key || !Object.hasOwn(s, key)) return;
      if (key === "volume") s.volume = clamp(Number(t.value), 0, 1);
      else if (
        key === "particles" &&
        ["auto", "low", "high", "off"].includes(t.value)
      )
        s.particles = t.value as T.Settings["particles"];
      else if (
        t instanceof HTMLInputElement &&
        ["sounds", "mute", "shake", "numbers"].includes(key)
      )
        s[key as "sounds" | "mute" | "shake" | "numbers"] = t.checked;
      this.g.persist();
    };
    this.onChange = (t) => {
      if (t.id === "save-import-file" && t.files?.[0])
        this.importSaveFile(t.files[0], back);
    };
  }

  meta(branch: string = "OFENSIVA") {
    this.show(this.head("O QUE PERMANECE", "Obelisco", `◆ ${fmt(this.g.save.gems)} Gemas · bônus apenas PvE, com retornos decrescentes.`) +
      `<nav class="actions">${OBELISK_BRANCHES.map(b=>`<button data-action="branch" data-id="${b}" aria-pressed="${b===branch}">${b}</button>`).join("")}</nav>
      <div class="obelisk-tree">${Object.values(OBELISK_NODES).filter(n=>n.branch===branch).map(n=>{
        const rank=this.g.save.upgrades[n.id]||0, cost=nodeCost(n.id,rank), blocked=nodeBlocked(n.id,this.g.save.upgrades,this.g.save.unlocked);
        return `<article class="card obelisk-node" style="grid-row:${n.position.row+1};grid-column:${n.position.column+1}"><small>${n.prerequisites.length ? "↓ "+n.prerequisites.map(p=>`${OBELISK_NODES[p.id].name} ${p.rank}`).join(" + ") : "RAIZ"}</small>
        <h2>${n.name}</h2><p>${n.text}</p><p>Nível ${rank}/${n.maxRank}<br>Atual: ${nodeValue(n.id,rank)}<br>Próximo: ${rank===n.maxRank?"MÁXIMO":nodeValue(n.id,rank+1)}</p>
        ${n.excludes?`<p>Ou: ${OBELISK_NODES[n.excludes].name}</p>`:""}
        <button data-action="buy" data-id="${n.id}" ${blocked||this.g.save.gems<cost?"disabled":""}>${blocked||`◆ ${cost} Gemas · Desenvolver`}</button></article>`;
      }).join("")}</div><div class="actions">${this.button("back","Voltar")}</div>`, {
        back:()=>this.main(), branch:b=>this.meta(b.dataset.id), buy:b=>{
          const id=b.dataset.id!, rank=this.g.save.upgrades[id]||0, cost=nodeCost(id,rank);
          if(nodeBlocked(id,this.g.save.upgrades,this.g.save.unlocked)||this.g.save.gems<cost)return;
          this.g.save.gems-=cost;this.g.save.upgrades[id]=rank+1;this.g.persist();this.meta(branch);
        },
      },true);
  }

  achievements() {
    this.show(
      this.head(
        "MEMÓRIAS DA NÉVOA",
        "Conquistas",
        `${this.g.save.achievements.length} de ${ACHIEVEMENTS.length}
         · somente no modo padrão`,
      ) +
        `
      <div class="cards meta">
        ${ACHIEVEMENTS.map(
          (a) => `
          <div class="card ${this.g.save.achievements.includes(a.id) ? "selected" : ""}">
            <small>
              ${this.g.save.achievements.includes(a.id) ? "✓ CONCLUÍDA" : "A DESCOBRIR"}
            </small>
            <h2>${a.name}</h2>
            <p>${a.text}</p>
            <strong>
              ${
                a.character
                  ? "Desbloqueia " + CHARACTER_DEFINITIONS[a.character].name
                  : `+${achievementAmount(a.id, a.reward)} ${achievementCurrency(a.id) === "GOLD" ? "Ouro" : "Gemas"}`
              }
            </strong>
          </div>
        `,
        ).join("")}
      </div>
      <div class="actions">${this.button("back", "Voltar")}</div>
    `,
      { back: () => this.main() },
      true,
    );
  }

  codex(back: () => void) {
    const discovered = (kind: string, id: string) =>
      this.g.save.discovered?.[kind]?.includes(id);
    this.show(
      this.head(
        "CÓDICE DO LIMIAR",
        "O que a névoa já revelou",
        "Armas e passivos são conhecidos; criaturas, itens e sinergias surgem conforme são encontrados.",
      ) +
        `
      <h3>Armas e evoluções</h3>
      <div class="cards meta">
        ${Object.entries(WEAPON_DEFINITIONS)
          .map(
            ([id, d]) => `<div class="card">
          <span class="sigil small" style="color:${d.color}">${d.icon}</span><h2>${d.name}</h2><p>${d.description}</p>
          <small>+ ${PASSIVE_DEFINITIONS[d.passive].name}</small><h3>${d.evolution}</h3><p>${d.evolvedDescription}</p>
          <p class="path-badge">${Object.values(WEAPON_PATHS[id])
            .map((x) => x.name)
            .join(" · ")}</p>
        </div>`,
          )
          .join("")}
      </div>
      <h3>Passivos</h3>
      <div class="cards meta">${Object.values(PASSIVE_DEFINITIONS)
        .map(
          (d) =>
            `<div class="card"><span class="sigil small">${d.icon}</span><h2>${d.name}</h2><p>${d.text}</p></div>`,
        )
        .join("")}</div>
      <h3>Itens</h3>
      <div class="cards meta">${Object.entries(ITEM_DEFINITIONS)
        .map(([id, d]) => {
          const seen = discovered("items", id);
          return `<div class="card ${seen ? "" : "locked"}"><span class="sigil small">${seen ? d.icon : "?"}</span><h2>${seen ? d.name : "???"}</h2><small class="rarity-${d.rarity}">${seen ? RARITY[d.rarity].name : "NÃO DESCOBERTO"}</small><p>${seen ? d.text : "A névoa ainda guarda este objeto."}</p></div>`;
        })
        .join("")}</div>
      <h3>Inimigos</h3>
      <div class="cards meta">${Object.entries(ENEMY_DEFINITIONS)
        .filter(([id]) => !["boss", "final", "shardling"].includes(id))
        .map(([id, d]) => {
          const seen = discovered("enemies", id);
          return `<div class="card ${seen ? "" : "locked"}"><span class="sigil small" style="color:${seen ? d.color : "#65706b"}">${seen ? "◆" : "?"}</span><h2>${seen ? d.name : "???"}</h2><p>${seen ? `Comportamento: ${d.behavior}.` : "Ainda não encontrado."}</p></div>`;
        })
        .join("")}</div>
      <h3>Mapas</h3>
      <div class="cards map-grid">${Object.entries(MAP_DEFINITIONS)
        .map(
          ([, m]) =>
            `<div class="card"><span class="map-glyph">${m.icon}</span><h2>${m.name}</h2><p>${m.description}</p></div>`,
        )
        .join("")}</div>
      <h3>Sinergias</h3>
      <div class="cards meta">${Object.entries(SYNERGY_DEFINITIONS)
        .map(([id, d]) => {
          const seen = discovered("synergies", id);
          return `<div class="card ${seen ? "selected" : "locked"}"><small>${seen ? "DESCOBERTA" : "???"}</small><h2>${seen ? d.name : "???"}</h2><p>${seen ? d.text : "Combine armas e efeitos para revelar."}</p></div>`;
        })
        .join("")}</div>
      <div class="actions">${this.button("back", "Voltar")}</div>
    `,
      { back },
      true,
    );
  }

  upgradeText(item: T.Upgrade) {
    const p = this.g.player;
    if (item.kind === "path") {
      const w = p.weapons.find((w) => w.id === item.weaponId),
        d = WEAPON_PATHS[item.weaponId!][item.id];
      return {
        title: d.name,
        icon: w?.definition.icon || "◇",
        color: w?.definition.color || "#e9c48b",
        tag: "CAMINHO DE ESPECIALIZAÇÃO",
        text: d.text,
        foot: `${w?.name || WEAPON_DEFINITIONS[item.weaponId!].name} · permanece após evolução`,
      };
    }
    if (item.kind === "weapon") {
      const d = WEAPON_DEFINITIONS[item.id],
        w = p.weapons.find((w) => w.id === item.id);
      return {
        title: d.name,
        icon: d.icon,
        color: d.color,
        tag: w
          ? `ARMA · ${w.level} → ${Math.min(8, w.level + 2)}`
          : "NOVA ARMA",
        text: w
          ? "+2 níveis: mais dano, área e frequência. " +
            (w.level + 1 === 4 && !w.path
              ? "Caminhos surgem a partir de 6 minutos."
              : (w.level + 1) % 3 === 0
                ? "Ataques compatíveis ganham +1 unidade."
                : "")
          : d.description,
        foot: `Evolução: ${PASSIVE_DEFINITIONS[d.passive].name}${w?.path ? ` · ${WEAPON_PATHS[w.id][w.path].name}` : ""}`,
      };
    }
    if (item.kind === "passive") {
      const d = PASSIVE_DEFINITIONS[item.id],
        n = p.passives[item.id] || 0;
      return {
        title: d.name,
        icon: d.icon,
        color: "#87d7bf",
        tag: n ? `PASSIVO · ${n} → ${n + 1}` : "NOVO PASSIVO",
        text: d.text + " Esta escolha concede até 2 níveis.",
        foot: `Combina com: ${
          Object.values(WEAPON_DEFINITIONS)
            .filter((w) => w.passive === item.id)
            .map((w) => w.name)
            .join(" · ") || "qualquer build"
        }`,
      };
    }
    const alternatives: Record<string, string[]> = {
      heal: ["Seiva fresca", "♥", "Recupere 35 de vida."],
      gems: ["Bolsa de ecos", "◆", "Receba 25 Gemas."],
      buff: ["Pulso de âmbar", "✷", "Fortaleça seus ataques por 12 segundos."],
      magnet: ["Ressonância", "⌖", "Atraia todos os cristais no mundo."],
    };
    const a = alternatives[item.id];
    return {
      title: a[0],
      icon: a[1],
      color: "#e9c48b",
      tag: "RECOMPENSA",
      text: a[2],
      foot: "Efeito imediato",
    };
  }

  levelup() {
    const path = this.g.pathSelection;
    this.show(
      this.head(
        path ? "ESPECIALIZAÇÃO" : `NÍVEL ${this.g.player.level}`,
        path ? "Escolha um caminho" : "Subiu de nível",
        path
          ? "Esta decisão altera o comportamento da arma e permanecerá após a evolução."
          : "O próximo eco é uma escolha sua. A partida está pausada.",
      ) +
        `
      <div class="cards choices">
        ${this.g.choices
          .map((o, i) => {
            const d = this.upgradeText(o);
            return `<button class="card choice" data-action="pick" data-index="${i}">
          <small>${i + 1} · ${d.tag}</small><span class="sigil" style="color:${d.color}">${d.icon}</span><h2>${d.title}</h2><p>${d.text}</p><footer>${d.foot}</footer>
        </button>`;
          })
          .join("")}
      </div>
      ${
        path
          ? ""
          : `<div class="level-controls">
        <button data-action="reroll" ${this.g.run.rerolls <= 0 ? "disabled" : ""}>↻ REROLL ${this.g.run.rerolls}</button>
        <button data-action="skip" ${this.g.run.skips <= 0 ? "disabled" : ""}>→ PULAR ${this.g.run.skips}</button>
        <button data-action="banish-mode" ${this.g.run.banishments <= 0 ? "disabled" : ""}>⊘ BANIR ${this.g.run.banishments}${this.g.banishMode ? " · SELECIONE UMA ESCOLHA" : ""}</button>
      </div>
`
      }
      <p class="muted">Clique em uma opção ou use as teclas 1–4.</p>
    `,
      {
        pick: (b) => this.g.pickUpgrade(Number(b.dataset.index)),
        reroll: () => this.g.rerollChoices(),
        skip: () => this.g.skipLevelUp(),
        "banish-mode": () => {
          this.g.banishMode = !this.g.banishMode;
          this.levelup();
        },
      },
      true,
    );
  }

  itemOverflow() {
    const pending = this.g.pendingItem;
    if (!pending) return;
    const d = ITEM_DEFINITIONS[pending.id];
    this.show(
      this.head(
        "INVENTÁRIO CHEIO",
        "Algo precisa ficar para trás",
        `${d.name} ×${pending.qty} não cabe nos quatro quick slots.`,
      ) +
        `
      <div class="cards choices">
        ${this.g.run.inventory
          .map((slot, i) => {
            const x = slot && ITEM_DEFINITIONS[slot.id];
            return `<button class="card" data-action="replace" data-index="${i}"><small>SUBSTITUIR SLOT ${i + 1}</small><span class="sigil small">${x?.icon || "·"}</span><h2>${x?.name || "Vazio"}</h2><p>${slot ? `Quantidade: ${slot.qty}` : "Slot disponível"}</p></button>`;
          })
          .join("")}
      </div><div class="actions">${this.button("discard", "DESCARTAR NOVO ITEM", true)}</div>
    `,
      {
        replace: (b) => this.g.replaceInventorySlot(Number(b.dataset.index)),
        discard: () => this.g.discardPendingItem(),
      },
      true,
    );
  }

  structureInteraction(s: T.Structure) {
    const d = STRUCTURE_DEFINITIONS[s.type];
    if (!d) return;
    let text = "",
      accept = "USAR";
    if (s.type === "fountain") {
      text = "Recuperar 42% da vida máxima? A fonte secará depois do uso.";
      accept = "BEBER DA FONTE";
    }
    if (s.type === "exchange") {
      text =
        "Sacrificar 25% da vida atual para receber uma melhoria rara? O sacrifício não pode matar você.";
      accept = "ACEITAR TROCA";
    }
    if (s.type === "memory") {
      text = "Entregar 35 XP desta expedição para converter memória em experiência?";
      accept = "OFERECER XP";
    }
    if (s.type === "rift_altar") {
      text =
        "Abrir a fenda e invocar quatro elites em troca de um baú enriquecido?";
      accept = "ABRIR A FENDA";
    }
    if (s.type === "silence") {
      text =
        "Silenciar as aparições por 20 segundos e aceitar uma onda intensa logo depois?";
      accept = "ACEITAR O SILÊNCIO";
    }
    if (s.type === "chest") {
      text =
        "Abrir este cofre consome uma Chave Basáltica. Ele contém Gemas, reroll e relíquias.";
      accept = "ABRIR COFRE";
    }
    if (s.type === "obelisk") {
      text =
        "Tocar o fragmento concede fortuna temporária e uma nova chance de reroll.";
      accept = "TOCAR O OBELISCO";
    }
    this.g.setState("interaction");
    this.show(
      this.head("ESTRUTURA ENCONTRADA", d.name, text) +
        `<div class="actions">${this.button("accept", accept, true)}${this.button("decline", "RECUSAR")}</div>`,
      {
        accept: () => this.g.resolveStructure(s, true),
        decline: () => this.g.resolveStructure(s, false),
      },
    );
  }

  chest() {
    const r = this.g.chestReward;
    if (!r) return;
    const d = r.kind === "evolution" ? WEAPON_DEFINITIONS[r.id] : null;
    const upgrade = r.upgrade ? this.upgradeText(r.upgrade) : null;

    this.show(
      this.head(
        "RELÍQUIA RECUPERADA",
        d ? "A forma desperta" : "Algo resistiu ao tempo",
      ) +
        `
      <div class="chest-reveal">
        <span class="sigil">${d ? d.icon : "⬡"}</span>
        <h2>${d ? d.evolution : upgrade ? upgrade.title : "Reserva de âmbar"}</h2>
        <p>
          ${
            d
              ? d.evolvedDescription
              : upgrade
                ? upgrade.text
                : "Seu arsenal está completo."
          }
        </p>
        <strong class="gold">+${r.gems} Gemas</strong>
      </div>

      <div class="actions">
        ${this.button(
          "claim",
          d ? "ACEITAR EVOLUÇÃO" : "RECOLHER RECOMPENSA",
          true,
        )}
      </div>
    `,
      { claim: () => this.g.claimChest() },
    );
  }

  goal() {
    this.show(
      this.head(
        "30:00 · OBJETIVO CONCLUÍDO",
        "Limiar atravessado",
        "Você resistiu à noite. A Boca do Firmamento acaba de chegar.",
      ) +
        `
      <div class="chest-reveal">
        <span class="sigil">✧</span>
        <p>
          Encerre a expedição com vitória e <b>${this.g.expeditionProfile.completionBase} Gemas de conclusão e ${completionGold(true, this.g.run.expeditionLength)} Ouro</b>,
          ou continue contra uma presença que fica mais veloz
          a cada segundo.
        </p>
        <p class="muted">
          A conclusão permanece válida mesmo se você cair no pós-limiar.
          As recompensas são contabilizadas ao encerrar.
        </p>
      </div>

      <div class="actions">
        ${this.button("finish", "ENCERRAR COM VITÓRIA", true)}
        ${this.button("continue", "Enfrentar o pós-limiar")}
      </div>
    `,
      {
        finish: () => this.g.finish(true),
        continue: () => this.g.resume(),
      },
    );
  }

  result() {
    const g = this.g;
    const r = g.run;
    const p = g.player;

    const ranking = [...p.weapons].sort(
      (a, b) => b.damageDealt - a.damageDealt,
    );

    const top = ranking[0];

    this.show(
      this.head(
        r.completed ? "TRAVESSIA CONCLUÍDA" : "O ECO PERMANECE",
        r.completed
          ? "Você atravessou."
          : r.abandoned
            ? "Até a próxima noite."
            : "A névoa o alcançou.",
        `${g.modeDef.hud} · ${
          g.mode === "test"
            ? "recompensas e recordes não salvos"
            : "Expedição contabilizada"
        }${!this.g.storageAvailable ? " · Armazenamento indisponível" : ""}`,
      ) +
        `
      <div class="result-grid">
        <span>TEMPO<b>${clock(r.time)}</b></span>
        <span>NÍVEL<b>${p.level}</b></span>
        <span>INIMIGOS<b>${fmt(r.kills)}</b></span>
        <span>CHEFES<b>${fmt(r.bossKills)}</b></span>
        <span>EVOLUÇÕES<b>${fmt(r.evolutions)}</b></span>
        <span>GEMAS<b>${fmt(r.gems + (r.bonus || 0))}</b></span><span>OURO<b>${completionGold(r.completed, r.expeditionLength)}</b></span>
        <span>DANO TOTAL<b>${fmt(r.totalDamage)}</b></span>
        <span>PONTUAÇÃO<b>${fmt(r.score || 0)}</b></span>
      </div>

      <p class="muted">
        Arma com mais dano: <b>${top.name}</b>
        ${r.bonus ? ` · Bônus de conclusão: ${r.bonus} Gemas${r.difficultyBonus ? ` (${r.difficultyBonus} do Pesadelo)` : ""}` : ""}.
      </p>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Arma</th><th>Dano</th><th>Baixas</th>
              <th>Ataques</th><th>Acertos</th>
            </tr>
          </thead>
          <tbody>
            ${ranking
              .map(
                (w) => `
              <tr>
                <td>
                  <span style="color:${w.definition.color}">
                    ${w.definition.icon}
                  </span>
                  ${w.name}
                  <div class="damage-track">
                    <i style="
                      width:${(100 * w.damageDealt) / Math.max(1, top.damageDealt)}%;
                      background:${w.definition.color}
                    "></i>
                  </div>
                </td>
                <td>${fmt(w.damageDealt)}</td>
                <td>${fmt(w.kills)}</td>
                <td>${fmt(w.shots)}</td>
                <td>${fmt(w.hits)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="actions">
        ${this.button("again", "JOGAR NOVAMENTE", true)}
        ${this.button("menu", "Menu principal")}
      </div>
    `,
      {
        again: () => g.start(p.character, g.mode, r.mapId),
        menu: () => g.menu(),
      },
      true,
    );
  }

  updateHUD() {
    const g = this.g,
      p = g.player,
      r = g.run;
    if (!p || !r) return;
    const n = this.nodes;
    n["hp-fill"].style.width = `${(100 * p.health) / p.maxHealth}%`;
    n["hp-text"].textContent = `${Math.ceil(p.health)} / ${p.maxHealth}`;
    n["xp-fill"].style.width =
      `${clamp((100 * p.xp) / p.xpToNextLevel, 0, 100)}%`;
    n.level.textContent = "NV. " + p.level;
    n.timer.textContent = clock(r.time);
    const event =
      r.event === "deep_fog"
        ? " · NÉVOA PROFUNDA"
        : r.surgeTime > 0
          ? " · CÉU PARTIDO"
          : "";
    const phase =
      g.modeDef.endless && r.time >= g.modeDef.endlessStart
        ? "ALÉM DO LIMIAR"
        : WAVE_TABLE[g.director.index].name;
    const modeTag =
      g.mode === "normal"
        ? ""
        : g.mode === "test"
          ? `TESTE ${g.clockRate}× · `
          : `${g.modeDef.hud} · `;
    n.wave.textContent =
      modeTag +
      phase +
      (p.buff > 0 ? " · ÂMBAR" : "") +
      (p.inWater ? " · ÁGUA RASA" : "") +
      event;
    n.gold.textContent = fmt(r.gems);
    n.kills.textContent = fmt(r.kills);

    const key =
      p.weapons
        .map((w) => `${w.id}:${w.level}:${w.evolved}:${w.path || "-"}`)
        .join("|") +
      JSON.stringify(p.passives) +
      JSON.stringify(r.inventory);
    if (this.slotKey !== key) {
      this.slotKey = key;
      n.weapons.innerHTML = Array.from({ length: p.weapons.length }, (_, i) => {
        const w = p.weapons[i];
        return w
          ? `<span class="slot ${w.evolved ? "evolved" : ""}" style="color:${w.definition.color}" title="${esc(w.name + " · " + (w.evolved ? "Evoluída" : "Nível " + w.level) + (w.path ? " · " + WEAPON_PATHS[w.id][w.path].name : ""))}">${w.definition.icon}<b>${w.evolved ? "✦" : w.level}</b></span>`
          : `<span class="slot empty">·</span>`;
      }).join("");
      const passives = Object.entries(p.passives);
      n.passives.innerHTML = Array.from({ length: 6 }, (_, i) => {
        const o = passives[i];
        return o
          ? `<span class="slot passive" title="${esc(PASSIVE_DEFINITIONS[o[0]].name)}">${PASSIVE_DEFINITIONS[o[0]].icon}<b>${o[1]}</b></span>`
          : `<span class="slot empty">·</span>`;
      }).join("");
      n["run-items"].innerHTML = Array.from(
        { length: RUN_INVENTORY_SLOTS },
        (_, i) => {
          const slot = r.inventory[i],
            d = slot && ITEM_DEFINITIONS[slot.id];
          return d
            ? `<button class="item-slot item-${d.rarity}" data-run-item="${i}" title="${esc(d.name + " · " + d.text)}" aria-label="Usar ${esc(d.name)}"><span class="key">${i + 1}</span><span class="item-icon" style="color:${RARITY[d.rarity].color}">${d.icon}</span><b>×${slot.qty}</b></button>`
            : "";
        },
      ).join("");
    }

    const inventoryNode = n["run-items"].parentElement;
    if (inventoryNode) inventoryNode.hidden = !r.inventory.some(Boolean);
    const boss = g.enemies.find(
      (e) => !e.dead && (e.type === "boss" || e.type === "final"),
    );
    n["boss-hud"].hidden = !boss;
    if (boss) {
      n["boss-name"].textContent = boss.name;
      const names = BOSS_PHASES[boss.name] || BOSS_PHASES.default;
      n["boss-phase"].textContent =
        names[(boss.bossPhase || 1) - 1] || `FASE ${boss.bossPhase || 1}`;
      n["boss-fill"].style.width = `${(100 * boss.hp) / boss.maxHp}%`;
    }

    const interactive = g.state === "playing" && g.world?.interactive;
    n["interaction-prompt"].hidden = !interactive;
    if (interactive)
      n["interaction-name"].textContent =
        STRUCTURE_DEFINITIONS[g.world.interactive!.type].name.toUpperCase();

    n.debug.hidden = !g.debug.stats;
    if (g.debug.stats) {
      n.debug.textContent =
        `FPS ${Math.round(g.fps)} | Enemies ${g.enemies.length} | Projectiles ${g.bullets.items.length}\n` +
        `Particles ${g.particles.items.length} | Pickups ${g.gems.length + g.pickups.length} | Areas ${g.areas.length}\n` +
        `Structures ${g.world?.nearby.length || 0} | Chunks ${g.world?.chunks.size || 0} | Interactive ${g.world?.countInteractive() || 0}\n` +
        `Spatial cells ${g.grid.cells.size} | Mode ${g.modeDef.name} | Seed ${r.worldSeed} | ${g.clockRate}× ${g.debug.god ? "INVENCÍVEL" : ""}`;
    }
  }

  toast(title: string, sub: string) {
    clearTimeout(this.toastTimer);

    this.nodes.toast.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;

    this.nodes.toast.classList.add("visible");

    this.toastTimer = setTimeout(
      () => this.nodes.toast.classList.remove("visible"),
      3800,
    );
  }
}

/* O mundo usa coordenadas próprias; só o render aplica câmera e escala. */
class Renderer {
  g: BrowserGame;
  c: CanvasRenderingContext2D;
  floor: CanvasPattern | null;
  constructor(g: BrowserGame) {
    this.g = g;
    this.c = g.ctx;

    const tile = document.createElement("canvas");
    tile.width = 384;
    tile.height = 384;

    const t = tile.getContext("2d")!;

    t.fillStyle = "#101e24";
    t.fillRect(0, 0, 384, 384);
    t.strokeStyle = "#192b31";
    t.lineWidth = 1;

    for (let x = 0; x < 384; x += 64) {
      for (let y = 0; y < 384; y += 64) {
        t.beginPath();
        t.moveTo(x + 31, y + 2);
        t.lineTo(x + 63, y + 32);
        t.lineTo(x + 31, y + 62);
        t.lineTo(x, y + 32);
        t.closePath();
        t.stroke();

        if ((x + y) % 192 === 0) {
          t.fillStyle = "#283b3c";
          t.fillRect(x + 28, y + 29, 4, 4);
        }
      }
    }

    for (let i = 0; i < 110; i++) {
      t.fillStyle = i % 2 ? "#243439" : "#15272d";
      t.fillRect((i * 97) % 384, (i * 131) % 384, 2, 2);
    }

    this.floor = this.c.createPattern(tile, "repeat");
  }

  drawOrbit(
    x: number,
    y: number,
    area: number,
    amount: number,
    evolved: boolean,
    time: number,
  ) {
    const c = this.c,
      n = amount + 1;
    for (let ring = 0; ring < (evolved ? 2 : 1); ring++)
      for (let i = 0; i < n; i++) {
        const a = time * (ring ? -2.5 : 2.5) + (i / n) * TAU,
          r = (ring ? 115 : 65) * area;
        c.fillStyle = WEAPON_DEFINITIONS.orbit.color;
        this.polygon(x + Math.cos(a) * r, y + Math.sin(a) * r, 10 * area, 3, a);
        c.fill();
      }
  }

  visible(x: number, y: number, r = 40) {
    const g = this.g;

    return (
      Math.abs(x - g.camera.x) < g.viewW / 2 + r &&
      Math.abs(y - g.camera.y) < g.viewH / 2 + r
    );
  }

  polygon(x: number, y: number, r: number, sides: number, angle = 0) {
    const c = this.c;
    c.beginPath();

    for (let i = 0; i < sides; i++) {
      const a = angle + (i / sides) * TAU;

      if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }

    c.closePath();
  }

  circle(x: number, y: number, r: number) {
    const c = this.c;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
  }

  draw(realTime: number) {
    const g = this.g;
    const c = this.c;
    const p = g.active ? g.player : null;

    c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = "#0c181d";
    c.fillRect(0, 0, g.width, g.height);

    if (!p) {
      g.camera.x = Math.sin(realTime * 0.03) * 80;
      g.camera.y = realTime * 3;
    }

    const shake =
      p && g.state === "playing" && this.g.save.settings.shake ? g.shake : 0;

    c.setTransform(
      g.dpr * g.zoom,
      0,
      0,
      g.dpr * g.zoom,
      (g.width * g.dpr) / 2 -
        g.camera.x * g.dpr * g.zoom +
        rand(-shake, shake) * g.dpr,
      (g.height * g.dpr) / 2 -
        g.camera.y * g.dpr * g.zoom +
        rand(-shake, shake) * g.dpr,
    );

    this.terrain();

    if (p) {
      for (const a of g.areas) {
        if (!this.visible(a.x, a.y, a.r)) continue;

        const areaColor = a.enemy
          ? a.kind === "web"
            ? "#79b7aa"
            : "#c07395"
          : a.w?.definition.color || "#d7a2da";
        c.fillStyle = areaColor;
        c.strokeStyle = areaColor;

        if (!a.armed) {
          c.globalAlpha = 0.25;
          c.lineWidth = 2;
          this.circle(a.x, a.y, a.r);
          c.stroke();

          this.circle(a.x, a.y, a.r * clamp(1 - a.delay / 0.8, 0.05, 1));

          c.globalAlpha = 0.15;
          c.fill();
          c.globalAlpha = 1;
          c.font = "22px Georgia";
          c.fillText("✦", a.x - 10, a.y + 8);
        } else {
          c.globalAlpha = 0.12;
          this.circle(a.x, a.y, a.r);
          c.fill();

          c.globalAlpha = 0.5;
          c.lineWidth = 1.5;

          this.circle(
            a.x,
            a.y,
            a.r * (0.85 + 0.07 * Math.sin(g.run.simTime * 4)),
          );

          c.stroke();
        }

        c.globalAlpha = 1;
      }

      for (const s of g.world?.nearby || []) this.structure(s, g.run.simTime);

      for (const gem of g.gems) {
        if (!this.visible(gem.x, gem.y, 10)) continue;

        const r = gem.value > 20 ? 7 : gem.value > 5 ? 5 : 3.5;

        c.fillStyle =
          gem.value > 20 ? "#edb974" : gem.value > 5 ? "#a8baff" : "#7cd4ba";

        this.polygon(gem.x, gem.y, r, 4);
        c.fill();
      }

      for (const item of g.pickups) {
        this.pickup(item, g.run.simTime);
      }

      for (const e of g.enemies) {
        if (!e.dead && this.visible(e.x, e.y, e.r + 20)) {
          this.enemy(e, g.run.simTime);
        }
      }

      for (const b of g.bullets.items) {
        if (!this.visible(b.x, b.y, b.r + 10)) continue;

        const projectileColor = !b.enemy && b.source ? cosmeticVisual(g.ownerOf(b.source).cosmetics).projectile?.color || b.color : b.color;
        c.strokeStyle = projectileColor;
        c.fillStyle = projectileColor;
        c.globalAlpha = 0.35;
        c.lineWidth = b.r * (b.kind === "needle" ? 1.2 : 0.8);

        c.beginPath();
        c.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
        c.lineTo(b.x, b.y);
        c.stroke();
        c.globalAlpha = 1;

        if (b.kind === "disc") {
          this.polygon(b.x, b.y, b.r, 6, b.age * 15);
          c.lineWidth = 2;
          c.stroke();
          this.circle(b.x, b.y, 3);
          c.fill();
        } else if (b.kind === "needle") {
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
          c.lineTo(b.x, b.y);
          c.stroke();
        } else {
          this.circle(b.x, b.y, b.r);
          c.fill();
          c.fillStyle = "#fff2d8";
          this.circle(b.x - 1, b.y - 1, b.r * 0.35);
          c.fill();
        }
      }

      for (const w of p.weapons)
        if (w.id === "orbit") {
          const v = w.values(p);
          this.drawOrbit(p.x, p.y, v.area, v.amount, w.evolved, g.run.simTime);
        }

      this.player(p, g.run.simTime);

      for (const l of g.lines) {
        c.globalAlpha = clamp(l.life / l.max, 0, 1);
        c.strokeStyle = l.color;
        c.lineWidth = 2;

        if (l.kind === "ring") {
          this.circle(l.x, l.y, (l.r || 0) * (1.05 - (l.life / l.max) * 0.3));
          c.stroke();
        } else {
          c.beginPath();
          c.moveTo(l.x, l.y);

          const dx = (l.tx || 0) - l.x;
          const dy = (l.ty || 0) - l.y;

          for (let j = 1; j < 5; j++) {
            const offset = j % 2 ? 8 : -8;

            c.lineTo(
              l.x + (dx * j) / 5 - (dy * 0.03 * offset) / 8,
              l.y + (dy * j) / 5 + (dx * 0.03 * offset) / 8,
            );
          }

          c.lineTo(l.tx || 0, l.ty || 0);
          c.stroke();
        }
      }

      for (const a of g.particles.items) {
        if (!this.visible(a.x, a.y)) continue;

        c.globalAlpha = clamp(a.life / a.max, 0, 1);
        c.fillStyle = a.color;
        c.fillRect(a.x, a.y, a.r, a.r);
      }

      c.textAlign = "center";

      for (const f of g.floats.items) {
        if (!this.visible(f.x, f.y)) continue;

        c.globalAlpha = clamp(f.life / 0.25, 0, 1);
        c.fillStyle = f.color;
        c.font = `600 ${f.size}px system-ui`;
        c.fillText(f.text, f.x, f.y);
      }

      c.globalAlpha = 1;
      c.textAlign = "left";
    }

    c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);

    if (p && g.input.touch.active) {
      const t = g.input.touch;

      c.strokeStyle = "#90d6c080";
      c.fillStyle = "#90d6c030";
      c.lineWidth = 2;

      this.circle(t.x, t.y, 50);
      c.fill();
      c.stroke();

      this.circle(t.x + t.dx * 34, t.y + t.dy * 34, 18);
      c.fillStyle = "#c2efce80";
      c.fill();
    }

    if (p && g.run?.event === "deep_fog") {
      const grd = c.createRadialGradient(
        g.width / 2,
        g.height / 2,
        Math.min(g.width, g.height) * 0.2,
        g.width / 2,
        g.height / 2,
        Math.max(g.width, g.height) * 0.72,
      );
      grd.addColorStop(0, "#0c181d00");
      grd.addColorStop(1, "#061016c9");
      c.fillStyle = grd;
      c.fillRect(0, 0, g.width, g.height);
    }

    if (g.state === "playing" && p && p.health / p.maxHealth < 0.25) {
      c.strokeStyle = "#c8516266";
      c.lineWidth = 14;
      c.strokeRect(0, 0, g.width, g.height);
    }
  }

  terrain() {
    const g = this.g,
      c = this.c;
    const left = g.camera.x - g.viewW / 2 - 30,
      top = g.camera.y - g.viewH / 2 - 30;
    const map = g.world?.map;
    c.fillStyle = map?.palette?.floor || map?.floor || this.floor || "#101e24";
    c.fillRect(left, top, g.viewW + 60, g.viewH + 60);

    if (map?.water) {
      const cell = 220;
      const minX = Math.floor(left / cell) - 1,
        maxX = Math.ceil((left + g.viewW + 60) / cell) + 1;
      const minY = Math.floor(top / cell) - 1,
        maxY = Math.ceil((top + g.viewH + 60) / cell) + 1;
      for (let cy = minY; cy <= maxY; cy++)
        for (let cx = minX; cx <= maxX; cx++) {
          const x = cx * cell,
            y = cy * cell;
          if (
            !g.world.isWater(x + cell * 0.2, y + cell * 0.2) &&
            !g.world.isWater(x + cell * 0.8, y + cell * 0.8)
          )
            continue;
          c.fillStyle = (map.palette?.water || "#153b40") + "45";
          c.fillRect(x, y, cell, cell);
          const hash = hashString(`${g.run.worldSeed}|water|${cx}|${cy}`);
          if (hash % 3 === 0) {
            c.strokeStyle = "#6fa3a31d";
            c.lineWidth = 1;
            c.beginPath();
            const rippleY =
              y +
              cell * 0.52 +
              Math.sin(g.run.simTime * 0.55 + (hash % 17)) * 4;
            c.moveTo(x + 45, rippleY);
            c.lineTo(
              x + cell - 45,
              rippleY + Math.cos(g.run.simTime * 0.45 + cy) * 3,
            );
            c.stroke();
          }
        }
    }

    const cell = 560;
    const density = map?.terrainDensity ?? 0.5;
    const minX = Math.floor(left / cell) - 1,
      maxX = Math.ceil((left + g.viewW + 60) / cell) + 1;
    const minY = Math.floor(top / cell) - 1,
      maxY = Math.ceil((top + g.viewH + 60) / cell) + 1;
    for (let cy = minY; cy <= maxY; cy++)
      for (let cx = minX; cx <= maxX; cx++) {
        const hash = hashString(
          `${g.run?.worldSeed || "menu"}|terrain|${g.world?.mapId || "ruins"}|${cx}|${cy}`,
        );
        if (hash % 100 >= Math.round(18 * density)) continue;
        const px = cx * cell + 90 + ((hash >>> 4) % (cell - 180));
        const py = cy * cell + 90 + ((hash >>> 12) % (cell - 180));
        const kind = (hash >>> 20) % 3;
        c.save();
        c.globalAlpha = map?.water ? 0.18 : 0.22;
        c.strokeStyle = map?.palette?.accent || "#71998b";
        c.fillStyle = "#26383b";
        c.lineWidth = 1;
        if (kind === 0) {
          c.beginPath();
          c.ellipse(px, py, 48, 17, (hash % 31) / 31, 0, TAU);
          c.stroke();
          c.beginPath();
          c.ellipse(px + 8, py - 2, 25, 8, (hash % 19) / 19, 0, TAU);
          c.stroke();
        } else if (kind === 1) {
          this.polygon(px, py, 22, 4, Math.PI / 4);
          c.stroke();
          this.polygon(px + 34, py + 10, 11, 5, 0);
          c.stroke();
        } else {
          c.beginPath();
          c.moveTo(px - 34, py + 12);
          c.lineTo(px - 7, py - 14);
          c.lineTo(px + 18, py + 3);
          c.lineTo(px + 43, py - 18);
          c.stroke();
        }
        c.restore();
      }

    if (g.debug.chunks && g.world) {
      c.strokeStyle = "#8fd0b755";
      c.lineWidth = 1;
      c.font = "11px monospace";
      c.fillStyle = "#bfe6d0";
      for (const ch of g.world.chunks.values()) {
        const x = ch.cx * CHUNK_SIZE,
          y = ch.cy * CHUNK_SIZE;
        c.strokeRect(x, y, CHUNK_SIZE, CHUNK_SIZE);
        c.fillText(`${ch.cx},${ch.cy}`, x + 8, y + 16);
      }
    }
  }

  structure(s: T.Structure, time: number) {
    const g = this.g,
      c = this.c,
      d = STRUCTURE_DEFINITIONS[s.type];
    if (!d) return;
    if (!this.visible(s.x, s.y, s.r + 30)) {
      if (!d.rare) return;
      const x = clamp(
        s.x,
        g.camera.x - g.viewW / 2 + 42,
        g.camera.x + g.viewW / 2 - 42,
      );
      const y = clamp(
        s.y,
        g.camera.y - g.viewH / 2 + 125,
        g.camera.y + g.viewH / 2 - 90,
      );
      c.fillStyle = "#e9d093";
      c.font = "13px Georgia";
      c.textAlign = "center";
      c.fillText("◇", x, y);
      c.font = "9px system-ui";
      c.fillText(
        `${Math.round(Math.hypot(s.x - g.player.x, s.y - g.player.y))}m`,
        x,
        y + 12,
      );
      c.textAlign = "left";
      return;
    }
    c.save();
    c.translate(s.x, s.y);
    c.rotate((s.angle || 0) + (s.type === "rift" ? time * 0.08 : 0));
    const gameplayAlpha =
      d.kind === "HAZARD"
        ? 1
        : d.interactive
          ? 0.95
          : d.destructible
            ? 0.76
            : s.type === "platform"
              ? 0.58
              : d.collidable
                ? 0.56
                : 0.38;
    c.globalAlpha = s.used || s.opened ? gameplayAlpha * 0.46 : gameplayAlpha;
    c.fillStyle = "#07111688";
    c.beginPath();
    c.ellipse(5, s.r * 0.7, s.r * 0.9, s.r * 0.35, 0, 0, TAU);
    c.fill();
    c.strokeStyle = d.color;
    c.fillStyle = d.color;
    c.lineWidth = 1.5;
    if (s.type === "urn") {
      c.beginPath();
      c.moveTo(-10, -12);
      c.quadraticCurveTo(-17, 4, -11, 15);
      c.lineTo(11, 15);
      c.quadraticCurveTo(17, 4, 10, -12);
      c.closePath();
      c.fill();
      c.fillStyle = "#1b2b2c";
      c.fillRect(-8, -15, 16, 5);
    } else if (["column", "wall", "stone", "ruin"].includes(s.type)) {
      this.polygon(0, 0, s.r, s.type === "wall" ? 4 : 6, s.angle || 0);
      c.fill();
      c.stroke();
      c.fillStyle = "#1b3033";
      this.polygon(-3, -5, s.r * 0.55, 5, 0);
      c.fill();
    } else if (s.type === "tree") {
      c.fillStyle = "#263d36";
      c.fillRect(-4, -5, 8, 25);
      c.fillStyle = d.color;
      this.polygon(0, -16, s.r, 5, time * 0.03 + s.variant);
      c.fill();
    } else if (s.type === "platform") {
      c.fillStyle = "#405456aa";
      c.strokeStyle = "#71868877";
      c.beginPath();
      c.ellipse(0, 0, s.r * 1.25, s.r * 0.72, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = "#88aaa655";
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(-s.r, i * 12);
        c.lineTo(s.r, i * 12);
        c.stroke();
      }
    } else if (s.type === "fountain") {
      c.strokeStyle = d.color;
      c.lineWidth = 3;
      this.circle(0, 0, s.r);
      c.stroke();
      c.fillStyle = s.used ? "#293b39" : "#4e9a8277";
      this.circle(0, 0, s.r * 0.67);
      c.fill();
      c.fillStyle = "#d8f4db";
      c.font = "18px Georgia";
      c.textAlign = "center";
      c.fillText(s.used ? "·" : "✚", 0, 6);
    } else if (
      ["exchange", "memory", "rift_altar", "silence"].includes(s.type)
    ) {
      this.polygon(0, 0, s.r, 6, Math.PI / 6);
      c.fill();
      c.stroke();
      c.fillStyle = "#14252c";
      this.polygon(0, 0, s.r * 0.68, 6, 0);
      c.fill();
      c.fillStyle = d.color;
      c.font = "20px Georgia";
      c.textAlign = "center";
      c.fillText(
        s.type === "exchange"
          ? "↔"
          : s.type === "memory"
            ? "◈"
            : s.type === "rift_altar"
              ? "✧"
              : "○",
        0,
        7,
      );
    } else if (s.type === "chest") {
      c.fillStyle = "#493e33";
      c.fillRect(-18, -10, 36, 24);
      c.strokeRect(-18, -10, 36, 24);
      c.fillStyle = d.color;
      c.fillRect(-3, -3, 6, 9);
      c.beginPath();
      c.arc(0, -10, 18, Math.PI, TAU);
      c.stroke();
    } else if (s.type === "obelisk") {
      c.fillStyle = "#34514d";
      c.beginPath();
      c.moveTo(0, -38);
      c.lineTo(17, 19);
      c.lineTo(0, 29);
      c.lineTo(-17, 19);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = "#9edcc177";
      c.beginPath();
      c.moveTo(0, -26);
      c.lineTo(0, 13);
      c.stroke();
    } else if (s.type === "rift" || s.type === "thorn") {
      c.globalAlpha = 0.35 + 0.15 * Math.sin(time * 4 + s.variant);
      c.fillStyle = d.color;
      this.circle(0, 0, s.r);
      c.fill();
      c.globalAlpha = 0.9;
      c.strokeStyle = d.color;
      this.circle(0, 0, s.r * (0.72 + 0.08 * Math.sin(time * 5)));
      c.stroke();
      if (s.type === "thorn") {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          c.beginPath();
          c.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
          c.lineTo(Math.cos(a) * s.r, Math.sin(a) * s.r);
          c.stroke();
        }
      }
    }
    c.restore();
    if (g.debug.structureIds) {
      c.fillStyle = "#fff";
      c.font = "9px monospace";
      c.fillText(s.id, s.x - s.r, s.y - s.r - 6);
    }
    if (g.debug.collisions && d.collidable) {
      c.strokeStyle = "#ff8a8a";
      this.circle(s.x, s.y, s.r);
      c.stroke();
    }
  }

  player(p: Player, time: number) {
    const c = this.c,
      g = this.g,
      def = CHARACTER_DEFINITIONS[p.character],
      visuals = cosmeticVisual(p.cosmetics),
      color = visuals.skin?.color || def.color;
    const moving = Math.abs(p.dx) + Math.abs(p.dy) > 0.01;
    const bob = moving ? Math.sin(time * 10) * 1.8 : Math.sin(time * 3) * 0.8;
    c.fillStyle = "#020b10aa";
    c.beginPath();
    c.ellipse(p.x, p.y + 16, 18, 8, 0, 0, TAU);
    c.fill();
    if (p.invulnerable > 0 && Math.floor(time * 16) % 2 === 0)
      c.globalAlpha = 0.45;
    if (p.hurtFlash > 0) c.globalAlpha = 0.58;
    if (p.buff > 0) {
      c.strokeStyle = "#f6d093";
      c.lineWidth = 2;
      this.circle(p.x, p.y, 25 + Math.sin(time * 6) * 3);
      c.stroke();
    }
    c.save();
    c.translate(p.x, p.y + bob);
    if(visuals.trail && moving){c.strokeStyle=visuals.trail.color;c.lineWidth=2;c.beginPath();c.moveTo(-p.dx*18,-p.dy*18);c.lineTo(-p.dx*38,-p.dy*38);c.stroke();}
    if(visuals.weapon){c.strokeStyle=visuals.weapon.color;this.circle(0,0,21);c.stroke();}
    if(visuals.spawn && time<3){c.strokeStyle=visuals.spawn.color;this.circle(0,0,28+time*5);c.stroke();}
    if(visuals.evolution && p.weapons.some(w=>w.evolved)){c.strokeStyle=visuals.evolution.color;this.circle(0,0,25+Math.sin(time*2)*2);c.stroke();}
    if(visuals.death && p.health<=0){c.fillStyle=visuals.death.color;c.fillText(visuals.death.glyph,-8,-28);}
    if(visuals.emote && time%20<2){c.fillStyle=visuals.emote.color;c.fillText(visuals.emote.glyph,18,-28);}
    if(visuals.icon){c.fillStyle=visuals.icon.color;c.fillText(visuals.icon.glyph,-6,-32);}
    if(visuals.frame){c.strokeStyle=visuals.frame.color;c.strokeRect(-11,-44,22,20);}

    c.fillStyle = "#19353a";
    c.strokeStyle = color;
    c.lineWidth = 2;
    if (p.character === "nara") {
      c.beginPath();
      c.moveTo(0, -18);
      c.lineTo(15, 15);
      c.lineTo(0, 9);
      c.lineTo(-15, 15);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      this.polygon(0, -9, 9, 4, Math.PI / 4);
      c.fill();
      c.strokeStyle = "#ffbd86";
      c.beginPath();
      c.moveTo(-11, 8);
      c.quadraticCurveTo(-18, 3 + Math.sin(time * 6) * 3, -12, -8);
      c.stroke();
    } else if (p.character === "orin") {
      c.beginPath();
      c.arc(0, -3, 14, Math.PI * 0.1, Math.PI * 0.9);
      c.lineTo(11, 15);
      c.lineTo(-11, 15);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = color;
      for (let i = 0; i < 3; i++) {
        this.circle(0, -4, 7 + i * 5 + Math.sin(time * 2 + i));
        c.stroke();
      }
    } else if (p.character === "ivo") {
      c.beginPath();
      c.moveTo(0, -19);
      c.lineTo(13, -2);
      c.lineTo(9, 16);
      c.lineTo(-9, 16);
      c.lineTo(-13, -2);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      this.polygon(0, -7, 8, 6, time * 0.5);
      c.fill();
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(-17, -2);
      c.lineTo(-9, -2);
      c.moveTo(9, -2);
      c.lineTo(17, -2);
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(0, -20);
      c.lineTo(14, 12);
      c.lineTo(0, 17);
      c.lineTo(-14, 12);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = color;
      this.circle(0, -7, 9);
      c.stroke();
      c.fillStyle = color;
      for (let i = 0; i < 3; i++) {
        const a = time * 0.45 + (i / 3) * TAU;
        this.circle(Math.cos(a) * 11, -7 + Math.sin(a) * 6, 2.2);
        c.fill();
      }
    }
    c.fillStyle = "#13242d";
    c.fillRect(-5, -10, 10, 5);
    c.fillStyle = "#ffedca";
    c.fillRect(-4 + p.dx * 2, -9, 3, 2);
    c.fillRect(2 + p.dx * 2, -9, 3, 2);
    c.restore();
    c.globalAlpha = 1;
    if (g.debug.hitboxes) {
      c.strokeStyle = "#fff";
      this.circle(p.x, p.y, p.r);
      c.stroke();
      c.strokeStyle = "#7ecab4";
      this.circle(p.x, p.y, p.stats.pickupRange);
      c.stroke();
    }
  }

  enemy(e: T.Enemy, time: number) {
    const c = this.c,
      special = e.type === "boss" || e.type === "final";
    const angle = e.type === "swarm" ? time * 2 : -Math.PI / 2;
    if (e.behavior === "burrow" && e.burrow) c.globalAlpha = 0.28;
    c.fillStyle = "#030b1088";
    c.beginPath();
    c.ellipse(e.x, e.y + e.r * 0.8, e.r, e.r * 0.45, 0, 0, TAU);
    c.fill();
    c.fillStyle =
      e.flash > 0 ? "#fff2d2" : hasStatus(e, "freeze") ? "#bee9f2" : e.color;
    c.strokeStyle = special ? "#ffdec0" : "#23323d";
    c.lineWidth = special ? 3 : 1.5;
    this.polygon(
      e.x,
      e.y,
      e.r,
      e.shape,
      angle + (special ? (e.bossPhase - 1) * 0.08 : 0),
    );
    c.fill();
    c.stroke();
    c.fillStyle = "#14252c";
    this.polygon(e.x, e.y, e.r * 0.66, e.shape, -angle);
    c.fill();
    c.fillStyle = e.color;
    this.polygon(e.x, e.y - 2, e.r * 0.25, 3, time * 0.3);
    c.fill();
    if (e.name === "A Catedral Errante" && special) {
      c.strokeStyle = e.bossPhase >= 3 ? "#ffe2af" : "#d7a7a1";
      c.lineWidth = 2;
      const towers = e.bossPhase === 1 ? 4 : e.bossPhase === 2 ? 3 : 2;
      for (let i = 0; i < towers; i++) {
        const a =
          -Math.PI * 0.82 + (i / Math.max(1, towers - 1)) * Math.PI * 0.64;
        c.beginPath();
        c.moveTo(
          e.x + Math.cos(a) * e.r * 0.45,
          e.y + Math.sin(a) * e.r * 0.45,
        );
        c.lineTo(
          e.x + Math.cos(a) * e.r * 1.12,
          e.y + Math.sin(a) * e.r * 1.12,
        );
        c.stroke();
      }
      if (e.bossPhase >= 2) {
        c.strokeStyle = "#efb1a788";
        c.beginPath();
        c.moveTo(e.x - e.r * 0.65, e.y - e.r * 0.35);
        c.lineTo(e.x + e.r * 0.55, e.y + e.r * 0.28);
        c.stroke();
      }
      if (e.bossPhase >= 3) {
        c.fillStyle = "#fff0bf";
        this.circle(e.x, e.y, e.r * 0.18 + Math.sin(time * 7) * 2);
        c.fill();
      }
    }

    if (e.behavior === "sentinel" && e.shield > 0) {
      c.strokeStyle = "#aee9ef";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(e.x, e.y, e.r + 8, -Math.PI * 0.75, Math.PI * 0.75);
      c.stroke();
    }
    if (e.behavior === "herald") {
      c.strokeStyle = "#d0af7750";
      c.lineWidth = 1;
      this.circle(e.x, e.y, 55 + Math.sin(time * 3) * 5);
      c.stroke();
      c.font = "15px Georgia";
      c.fillStyle = "#ead29b";
      c.fillText("✧", e.x - 5, e.y + 5);
    }
    if (e.behavior === "weaver") {
      c.strokeStyle = "#76aaa477";
      for (let i = 0; i < 3; i++) {
        const a = time + (i * TAU) / 3;
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(e.x + Math.cos(a) * e.r * 1.5, e.y + Math.sin(a) * e.r * 1.5);
        c.stroke();
      }
    }
    if (e.behavior === "charger" && e.charge > 0) {
      c.strokeStyle = "#ff8f86";
      c.lineWidth = 2;
      this.circle(e.x, e.y, e.r + 5);
      c.stroke();
    }
    if (hasStatus(e, "burn")) {
      c.fillStyle = "#ffac75";
      c.fillRect(e.x - 2, e.y - e.r - 8, 4, 5);
    }
    if (hasStatus(e, "mark")) {
      c.strokeStyle = "#c6b7ff";
      this.polygon(e.x, e.y, e.r + 5, 4, Math.PI / 4);
      c.stroke();
    }

    c.fillStyle = "#ffdebc";
    c.fillRect(e.x - e.r * 0.36, e.y - e.r * 0.13, 3, 3);
    c.fillRect(e.x + e.r * 0.18, e.y - e.r * 0.13, 3, 3);
    if (e.type === "elite" || special) {
      c.strokeStyle = e.color;
      c.lineWidth = 1;
      this.circle(
        e.x,
        e.y,
        e.r +
          7 +
          Math.sin(time * 3) * 2 +
          (special ? (e.bossPhase - 1) * 3 : 0),
      );
      c.stroke();
      if (special && e.bossPhase >= 2) {
        c.strokeStyle = e.bossPhase === 3 ? "#ffe3b8" : "#eeb5ae";
        this.circle(e.x, e.y, e.r + 13 + Math.sin(time * 4) * 3);
        c.stroke();
      }
      c.fillStyle = "#102129";
      c.fillRect(e.x - e.r, e.y - e.r - 15, e.r * 2, 4);
      c.fillStyle = e.color;
      c.fillRect(e.x - e.r, e.y - e.r - 15, (e.r * 2 * e.hp) / e.maxHp, 4);
    }
    if (e.wind > 0) {
      c.strokeStyle = "#f6b7ac";
      c.globalAlpha = 0.65;
      c.lineWidth = 2;
      if (
        e.behavior === "ranged" ||
        e.behavior === "charger" ||
        e.pattern === "charge"
      ) {
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(e.x + e.aimX * 320, e.y + e.aimY * 320);
        c.stroke();
      } else {
        this.circle(e.x, e.y, e.r + 28 + Math.sin(time * 8) * 4);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    c.globalAlpha = 1;
    if (this.g.debug.hitboxes) {
      c.strokeStyle = "#ff7286";
      this.circle(e.x, e.y, e.r);
      c.stroke();
    }
  }

  pickup(item: T.Pickup, time: number) {
    const g = this.g;
    const c = this.c;

    if (!this.visible(item.x, item.y, 20)) {
      if (item.type !== "chest") return;

      const x = clamp(
        item.x,
        g.camera.x - g.viewW / 2 + 40,
        g.camera.x + g.viewW / 2 - 40,
      );

      const y = clamp(
        item.y,
        g.camera.y - g.viewH / 2 + 115,
        g.camera.y + g.viewH / 2 - 95,
      );

      c.fillStyle = "#edca8b";
      this.polygon(x, y, 8, 3, Math.atan2(item.y - y, item.x - x));
      c.fill();

      c.font = "10px system-ui";
      c.fillText("BAÚ", x - 10, y - 14);
      return;
    }

    const itemDef =
      item.type === "item" ? ITEM_DEFINITIONS[item.itemId || ""] : null;
    const symbols: Record<string, string> = {
      gems: "◆",
      heal: "♥",
      magnet: "⌖",
      bomb: "✹",
      buff: "✷",
      chest: "⬡",
      item: itemDef?.icon || "◇",
    };
    const colors: Record<string, string> = {
      gems: "#a8baff",
      heal: "#9ad9ac",
      magnet: "#a6c9ed",
      bomb: "#e9a4a0",
      buff: "#dfbcff",
      chest: "#ffe0a1",
      item: itemDef ? RARITY[itemDef.rarity].color : "#d9d2bd",
    };

    c.fillStyle = "#0b171dc0";
    this.circle(item.x, item.y, 13);
    c.fill();

    c.fillStyle = colors[item.type];
    c.textAlign = "center";
    c.font = `${item.type === "chest" ? 28 : item.type === "item" ? 22 : 20}px Georgia`;

    c.fillText(symbols[item.type], item.x, item.y + 7 + Math.sin(time * 3) * 2);

    c.textAlign = "left";

    if (item.type === "chest") {
      c.strokeStyle = "#edca8b80";
      this.circle(item.x, item.y, 21 + Math.sin(time * 2) * 3);
      c.stroke();
    }
  }
}

function requiredNode(id: string): HTMLElement {
  const n = document.getElementById(id);
  if (!n) throw new Error(`Elemento ausente: ${id}`);
  return n;
}
