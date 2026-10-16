import { RefugeLayer } from "./refuge-layer";
import { Player } from "../core/entities";
import { rpgCharacterIdSchema } from "../core/rpg";
import { moveInRefuge, refugeTarget } from "../core/rpg/refuge/scene";
import type { RefugePoint, RefugeTarget } from "../core/rpg/refuge/types";
import { REFUGE } from "../content/rpg/refuge";
import { CharacterSpriteRenderer } from "./character-sprite-renderer";
import { TileRenderer } from "./tile-renderer";
import { resolvePropAtlas } from "./tile-art";

const movement: Record<string, RefugePoint> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
/** Bounded diagnostics: no player data, enabled in development for real-browser QA. */
export const refugeDiagnostics = {
  instances: 0,
  loops: 0,
  listeners: 0,
  observers: 0,
  mounts: 0,
  disposed: 0,
};
if (typeof window !== "undefined" && process.env.NODE_ENV === "development")
  Object.assign(window, { __limiarRefuge: refugeDiagnostics });

/** Safe scene only. No simulation, network, persistence, waves or settlement. */
export class RefugeScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tiles = new TileRenderer();
  private readonly layer = new RefugeLayer();
  private readonly sprites = new CharacterSpriteRenderer();
  private readonly player: Player;
  private readonly keys = new Set<string>();
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private frameId = 0;
  private disposed = false;
  private previous = 0;
  private elapsed = 0;
  private width = 1;
  private height = 1;
  private ratio = 1;
  private paused = false;
  private virtual = { x: 0, y: 0 };
  private target?: RefugeTarget;
  private sampleAt = 0;
  private readonly samples: number[] = [];
  private readonly frames: number[] = [];
  private lastInteraction = -Infinity;
  private readonly started = performance.now();
  constructor(
    private readonly canvas: HTMLCanvasElement,
    characterId: string,
    private readonly onTarget: (target?: RefugeTarget) => void,
    private readonly onInteract: (target: RefugeTarget) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Canvas 2D indisponível. Use os serviços abaixo.");
    this.ctx = ctx;
    this.player = new Player(rpgCharacterIdSchema.parse(characterId));
    Object.assign(this.player, REFUGE.spawn);
    const options = { signal: this.abort.signal };
    canvas.addEventListener("keydown", this.keyDown, options);
    window.addEventListener("keyup", this.keyUp, options);
    window.addEventListener("blur", this.clearInput, options);
    canvas.addEventListener("blur", this.clearInput, options);
    document.addEventListener("visibilitychange", this.visibility, options);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.resize();
    refugeDiagnostics.instances++;
    refugeDiagnostics.mounts++;
    refugeDiagnostics.listeners += 5;
    refugeDiagnostics.observers++;
    refugeDiagnostics.loops++;
    this.frameId = requestAnimationFrame(this.frame);
  }
  setCharacter(id: string) {
    this.player.character = rpgCharacterIdSchema.parse(id);
  }
  setPaused(value: boolean) {
    this.paused = value;
    this.clearInput();
  }
  setVirtual(x: number, y: number) {
    this.virtual = { x, y };
  }
  interact() {
    if (
      this.disposed ||
      this.paused ||
      performance.now() - this.lastInteraction < 350
    )
      return;
    const target = refugeTarget(REFUGE, this.player);
    if (!target) return;
    this.lastInteraction = performance.now();
    this.onInteract(target);
  }
  private keyDown = (event: KeyboardEvent) => {
    if (this.paused || event.ctrlKey || event.metaKey || event.altKey) return;
    if (movement[event.code]) {
      event.preventDefault();
      this.keys.add(event.code);
    }
    if (event.code === "KeyE" && !event.repeat) {
      event.preventDefault();
      this.interact();
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.virtual = { x: 0, y: 0 };
  };
  private visibility = () => {
    this.clearInput();
    this.previous = 0;
  };
  private resize = () => {
    if (this.disposed) return;
    const start = performance.now();
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.width * this.ratio),
      h = Math.round(this.height * this.ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.dataset.resizeMs = (performance.now() - start).toFixed(3);
  };
  private frame = (now: number) => {
    if (this.disposed) return;
    const delta = this.previous
      ? Math.min(0.05, (now - this.previous) / 1000)
      : 0;
    if (this.previous && !document.hidden) {
      this.frames.push(now - this.previous);
      if (this.frames.length > 240) this.frames.shift();
    }
    this.previous = now;
    this.elapsed += delta;
    const input = { ...this.virtual };
    for (const key of this.keys) {
      input.x += movement[key].x;
      input.y += movement[key].y;
    }
    if (this.paused || document.hidden) {
      input.x = 0;
      input.y = 0;
    }
    const position = moveInRefuge(REFUGE, this.player, input, delta);
    const motion = {
      x: position.x - this.player.x,
      y: position.y - this.player.y,
    };
    Object.assign(this.player, position);
    this.sprites.setMotion(this.player, motion);
    const next = refugeTarget(REFUGE, this.player);
    if (next?.id !== this.target?.id) {
      this.target = next;
      this.onTarget(next);
    }
    const start = performance.now();
    this.draw();
    this.samples.push(performance.now() - start);
    if (this.samples.length > 240) this.samples.shift();
    if (now - this.sampleAt > 250) {
      this.sampleAt = now;
      const p95 = (values: number[]) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ??
        0;
      Object.assign(this.canvas.dataset, {
        x: this.player.x.toFixed(1),
        y: this.player.y.toFixed(1),
        character: this.player.character,
        target: this.target?.id ?? "",
        renderP95: p95(this.samples).toFixed(3),
        frameP95: p95(this.frames).toFixed(3),
      });
    }
    if (!this.canvas.dataset.entryMs)
      this.canvas.dataset.entryMs = (performance.now() - this.started).toFixed(
        3,
      );
    this.frameId = requestAnimationFrame(this.frame);
  };
  private draw() {
    const c = this.ctx;
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#09161a";
    c.fillRect(0, 0, this.width, this.height);
    const zoom = 0.85;
    const viewW = this.width / zoom,
      viewH = this.height / zoom;
    const clampCamera = (value: number, view: number, bound: number) =>
      view >= bound
        ? bound / 2
        : Math.max(view / 2, Math.min(bound - view / 2, value));
    const cx = clampCamera(this.player.x, viewW, REFUGE.bounds.width),
      cy = clampCamera(this.player.y - 100, viewH, REFUGE.bounds.height);
    c.translate(this.width / 2, this.height / 2);
    c.scale(zoom, zoom);
    c.translate(-cx, -cy);
    c.drawImage(this.terrainRaster(), 0, 0);
    c.strokeStyle = "#6e7a64";
    c.lineWidth = 8;
    c.strokeRect(8, 8, 1184, 884);
    c.strokeStyle = "#8aac9b66";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(600, 360, 140, 70, 0, 0, Math.PI * 2);
    c.stroke();
    const objects = [
      ...REFUGE.decorations,
      ...REFUGE.structures,
      ...REFUGE.npcs,
    ].sort((a, b) => a.y - b.y);
    let drawn = false;
    for (const object of objects) {
      if (!drawn && object.y > this.player.y) {
        this.drawPlayer();
        drawn = true;
      }
      if ("family" in object) {
        if (
          !this.tiles.drawProp(
            c,
            resolvePropAtlas(object.family),
            object.slot,
            object.x,
            object.y,
            object.height,
          )
        ) {
          c.fillStyle = "#4c6559";
          c.fillRect(object.x - 10, object.y - 22, 20, 22);
        }
      } else this.drawTarget(object);
    }
    if (!drawn) this.drawPlayer();
  }
  /** One bounded offscreen raster; shared TileRenderer still owns atlas decoding. */
  private terrainRaster() {
    return this.layer.terrainRaster();
  }
  private drawPlayer() {
    const c = this.ctx,
      p = this.player;
    c.fillStyle = "#0007";
    c.beginPath();
    c.ellipse(p.x, p.y + 5, 18, 8, 0, 0, Math.PI * 2);
    c.fill();
    const ready = this.sprites.draw(c, p, this.elapsed, 0);
    this.canvas.dataset.sprite = ready ? "canonical" : "fallback";
    if (!ready) {
      c.fillStyle = "#d4dec2";
      c.beginPath();
      c.arc(p.x, p.y - 16, 10, 0, Math.PI * 2);
      c.fill();
      c.fillRect(p.x - 9, p.y - 9, 18, 20);
    }
  }
  /** Service-specific silhouettes are temporary art, not canonical NPC sprites. */
  private drawTarget(t: RefugeTarget) {
    this.layer.drawTarget(this.ctx, t, this.target?.id);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.abort.abort();
    this.observer.disconnect();
    this.clearInput();
    this.samples.length = 0;
    this.frames.length = 0;
    this.layer.dispose();
    refugeDiagnostics.instances--;
    refugeDiagnostics.loops--;
    refugeDiagnostics.listeners -= 5;
    refugeDiagnostics.observers--;
    refugeDiagnostics.disposed++;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
