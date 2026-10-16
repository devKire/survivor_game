import { Player } from "../../core/entities";
import { World, type WorldHost } from "../../core/world";
import type { Vec, Enemy } from "../../core/types";
import { ENEMY_DEFINITIONS } from "../../content/catalog";
import { EXPLORATION_RUINS } from "../../content/rpg/exploration-regions";
import { explorationResource } from "../../content/rpg/exploration-resources";
import { REFUGE } from "../../content/rpg/refuge";
import { WORLD_ZONES } from "../../content/rpg/world-zones";
import { moveInRefuge, refugeTarget } from "../../core/rpg/refuge/scene";
import {
  clampWorldPosition,
  normalizedWorldMove,
} from "../../core/rpg/world/rules";
import { generateExploration } from "../../core/rpg/exploration/generation";
import type { WorldSnapshot, WorldCommand } from "../../network/world";
import { WorldRenderer, type WorldRenderContext } from "../world-renderer";
import { RefugeLayer } from "../refuge-layer";
import { resolvePropAtlas } from "../tile-art";
import {
  beginMotion,
  sampleMotion,
  nextSnapshotTiming,
  type Motion,
  type SnapshotTiming,
} from "../interpolation";

export const worldDiagnostics = {
  instances: 0,
  rafLoops: 0,
  mounts: 0,
  disposed: 0,
  networkClients: 0,
};
if (typeof window !== "undefined" && process.env.NODE_ENV === "development")
  Object.assign(window, { __limiarWorld: worldDiagnostics });
const keys: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
export interface WorldTarget {
  id: string;
  name: string;
  kind: "PORTAL" | "NPC" | "RESOURCE" | "SERVICE";
}
/** Network view only: one Canvas/RAF, existing renderers, no combat or persistent grants. */
export class WorldGame {
  snapshot?: WorldSnapshot;
  private readonly context: WorldRenderContext;
  private readonly renderer: WorldRenderer;
  private readonly refuge = new RefugeLayer();
  readonly world: World;
  readonly nodes;
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private readonly held = new Set<string>();
  private readonly players = new Map<string, Player>();
  private readonly motions = new Map<string, Motion>();
  private readonly retired = new Set<string>();
  private readonly pending: { sequence: number; move: Vec }[] = [];
  private timing?: SnapshotTiming;
  private frameId = 0;
  private previous = 0;
  private elapsed = 0;
  private sendClock = 0;
  private sequence = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private zoom = 0.85;
  private virtual: Vec = { x: 0, y: 0 };
  private paused = false;
  private connected = false;
  private disposed = false;
  private target?: WorldTarget;
  private samples: number[] = [];
  private frames: number[] = [];
  private metricsAt = 0;
  private depleted = new Set<string>();
  setResources(ids: readonly string[]) {
    this.depleted = new Set(ids);
  }
  constructor(
    private canvas: HTMLCanvasElement,
    private send: (v: WorldCommand) => void,
    private onTarget: (t?: WorldTarget) => void,
    private onAction: (action: string, target?: WorldTarget) => void,
    private onPlayer: (id: string) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Canvas 2D indisponível.");
    const player = new Player("nara");
    const host: WorldHost = {
      player,
      playersForWorld: () => [this.context?.player ?? player],
      run: {
        worldVersion: 3,
        worldChanges: {},
        structuresBroken: 0,
        urnsBroken: 0,
      },
      spark: () => {},
      sound: { play: () => {}, unlock: () => {} },
      dropItemWeighted: () => {},
      drop: () => {},
      dropXP: () => {},
      saveSnapshot: () => false,
      hurtPlayer: () => {},
    };
    this.world = new World(host, "ruins", EXPLORATION_RUINS.seed);
    this.nodes = generateExploration(EXPLORATION_RUINS, this.world);
    this.world.nearby = [...this.world.chunks.values()].flatMap(
      (c) => c.structures,
    );
    this.context = {
      ctx,
      camera: { x: 600, y: 620 },
      viewW: 1,
      viewH: 1,
      world: this.world,
      player,
      run: { worldSeed: EXPLORATION_RUINS.seed, simTime: 0, time: 0 },
      debug: {
        chunks: false,
        structureIds: false,
        collisions: false,
        hitboxes: false,
      },
    };
    this.renderer = new WorldRenderer(this.context);
    const options = { signal: this.abort.signal };
    canvas.addEventListener("keydown", this.keyDown, options);
    window.addEventListener("keyup", this.keyUp, options);
    window.addEventListener("blur", this.clearInput, options);
    canvas.addEventListener("blur", this.clearInput, options);
    document.addEventListener("visibilitychange", this.clearInput, options);
    canvas.addEventListener("pointerdown", this.selectPlayer, options);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.resize();
    worldDiagnostics.instances++;
    worldDiagnostics.rafLoops++;
    worldDiagnostics.mounts++;
    canvas.dataset.shellId = String(worldDiagnostics.mounts);
    this.frameId = requestAnimationFrame(this.frame);
  }
  apply(value: WorldSnapshot) {
    if (this.retired.has(value.epoch)) return;
    const before = this.snapshot,
      now = performance.now();
    if (before?.epoch === value.epoch && value.tick <= before.tick) return;
    if (before?.epoch !== value.epoch) {
      if (before) this.retired.add(before.epoch);
      if (this.retired.size > 32)
        this.retired.delete(this.retired.values().next().value!);
      this.players.clear();
      this.motions.clear();
      this.pending.length = 0;
      this.sequence = value.ack;
      this.clearInput();
      this.timing = undefined;
    }
    this.timing = nextSnapshotTiming(this.timing, now);
    const incoming = new Set(value.players.map((p) => p.id));
    for (const id of this.players.keys())
      if (!incoming.has(id)) {
        this.players.delete(id);
        this.motions.delete(id);
      }
    for (const row of value.players) {
      let p = this.players.get(row.id);
      if (!p) this.players.set(row.id, (p = new Player(row.character)));
      const prior = before?.players.find((r) => r.id === row.id);
      this.motions.set(
        row.id,
        beginMotion(p, row, prior, 100, now, this.timing.delay),
      );
      p.character = row.character;
      p.dx = row.dx;
      p.dy = row.dy;
      p.health = row.health;
      p.maxHealth = row.maxHealth;
      if (row.id === value.selfId) {
        const waiting = this.pending.filter((i) => i.sequence > value.ack);
        this.pending.splice(0, this.pending.length, ...waiting);
        Object.assign(p, row);
        for (const input of waiting)
          Object.assign(p, this.predict(p, input.move, value));
        this.context.player = p;
        this.sequence = Math.max(this.sequence, value.ack);
      } else if (!prior) Object.assign(p, row);
    }
    this.snapshot = value;
    this.connected = true;
    Object.assign(this.canvas.dataset, {
      zone: value.zoneId,
      epoch: value.epoch,
      players: String(value.players.length),
      character: this.context.player.character,
      authoritativeX: value.players
        .find((p) => p.id === value.selfId)
        ?.x.toFixed(1),
      authoritativeY: value.players
        .find((p) => p.id === value.selfId)
        ?.y.toFixed(1),
    });
  }
  setConnected(value: boolean) {
    this.connected = value;
    if (!value) {
      this.clearInput();
      this.pending.length = 0;
    }
  }
  setPaused(value: boolean) {
    this.paused = value;
    this.clearInput();
  }
  setVirtual(x: number, y: number) {
    this.virtual = { x, y };
  }
  interact() {
    if (this.target && !this.paused) this.onAction("INTERACT", this.target);
  }
  private predict(p: Vec, move: Vec, s = this.snapshot!): Vec {
    if (s.zoneId === "obelisk-refuge")
      return moveInRefuge(REFUGE, p, move, 0.04);
    const next = this.world.resolvePlayerMove(
      p.x,
      p.y,
      p.x + move.x * s.self.speed * 0.04,
      p.y + move.y * s.self.speed * 0.04,
      13,
    );
    return clampWorldPosition(WORLD_ZONES[s.zoneId], next);
  }
  private keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey || this.paused) return;
    if (keys[event.code]) {
      event.preventDefault();
      this.held.add(event.code);
    } else if (!event.repeat) {
      const action: Record<string, string> = {
        KeyI: "INVENTORY",
        KeyC: "CHARACTER",
        KeyJ: "QUESTS",
        KeyM: "MAP",
        KeyP: "GROUP",
        KeyE: "INTERACT",
      };
      if (action[event.code]) {
        event.preventDefault();
        this.onAction(action[event.code], this.target);
      }
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };
  private clearInput = () => {
    this.held.clear();
    this.virtual = { x: 0, y: 0 };
  };
  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(this.width * this.dpr),
      h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  };
  private frame = (now: number) => {
    if (this.disposed) return;
    const dt = this.previous ? Math.min(0.05, (now - this.previous) / 1000) : 0;
    if (this.previous && !document.hidden) {
      this.frames.push(now - this.previous);
      if (this.frames.length > 240) this.frames.shift();
    }
    this.previous = now;
    this.elapsed += dt;
    if (this.snapshot && this.connected) {
      this.sendClock += dt;
      if (this.sendClock >= 0.04) {
        this.sendClock %= 0.04;
        const axis = { ...this.virtual };
        for (const key of this.held) {
          axis.x += keys[key].x;
          axis.y += keys[key].y;
        }
        const move =
          this.paused || document.hidden
            ? { x: 0, y: 0 }
            : normalizedWorldMove(
                Math.max(-1, Math.min(1, axis.x)),
                Math.max(-1, Math.min(1, axis.y)),
              );
        const sequence = ++this.sequence;
        this.send({
          type: "WORLD_INPUT",
          epoch: this.snapshot.epoch,
          sequence,
          moveX: move.x,
          moveY: move.y,
        });
        this.pending.push({ sequence, move });
        if (this.pending.length > 100) {
          this.pending.length = 0;
          this.connected = false;
          this.send({ type: "WORLD_REFRESH", epoch: this.snapshot.epoch });
        }
        if (this.context.player.health > 0)
          Object.assign(
            this.context.player,
            this.predict(this.context.player, move),
          );
      }
      const own = this.snapshot.players.find(
        (p) => p.id === this.snapshot!.selfId,
      )!;
      const zone = WORLD_ZONES[this.snapshot.zoneId];
      const portal = zone.portals.find(
        (p) => Math.hypot(p.x - own.x, p.y - own.y) <= p.radius,
      );
      const refuge =
        this.snapshot.zoneId === "obelisk-refuge"
          ? refugeTarget(REFUGE, own)
          : undefined;
      const resource =
        this.snapshot.zoneId === "ruins-outskirts"
          ? this.nodes.find(
              (n) =>
                n.kind === "RESOURCE" &&
                Math.hypot(n.x - own.x, n.y - own.y) <= n.radius,
            )
          : undefined;
      const target: WorldTarget | undefined = portal
        ? { id: portal.id, name: portal.name, kind: "PORTAL" }
        : refuge
          ? {
              id: refuge.id,
              name: refuge.name,
              kind: refuge.visual === "npc" ? "NPC" : "SERVICE",
            }
          : resource
            ? {
                id: resource.id,
                name:
                  explorationResource(resource.definitionId).name +
                  (this.depleted.has(resource.id) ? " · coletado" : ""),
                kind: "RESOURCE",
              }
            : undefined;
      if (
        target?.id !== this.target?.id ||
        target?.name !== this.target?.name
      ) {
        this.target = target;
        this.onTarget(target);
      }
    }
    const started = performance.now();
    this.draw(now);
    this.samples.push(performance.now() - started);
    if (this.samples.length > 240) this.samples.shift();
    if (now - this.metricsAt >= 250) {
      this.metricsAt = now;
      const p95 = (values: number[]) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ??
        0;
      Object.assign(this.canvas.dataset, {
        x: this.context.player.x.toFixed(1),
        y: this.context.player.y.toFixed(1),
        renderP95: p95(this.samples).toFixed(3),
        frameP95: p95(this.frames).toFixed(3),
        playerIds: this.snapshot?.players.map((p) => p.id).join(",") ?? "",
      });
    }
    this.frameId = requestAnimationFrame(this.frame);
  };
  private draw(now: number) {
    const g = this.context,
      c = g.ctx,
      s = this.snapshot;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#081318";
    c.fillRect(0, 0, this.width, this.height);
    if (!s) return;
    g.viewW = this.width / this.zoom;
    g.viewH = this.height / this.zoom;
    g.run.simTime = this.elapsed;
    const b = WORLD_ZONES[s.zoneId].bounds;
    const clamp = (v: number, min: number, max: number, size: number) =>
      size >= max - min
        ? (min + max) / 2
        : Math.max(min + size / 2, Math.min(max - size / 2, v));
    g.camera = {
      x: clamp(g.player.x, b.minX, b.maxX, g.viewW),
      y: clamp(g.player.y, b.minY, b.maxY, g.viewH),
    };
    c.translate(this.width / 2, this.height / 2);
    c.scale(this.zoom, this.zoom);
    c.translate(-g.camera.x, -g.camera.y);
    if (s.zoneId === "obelisk-refuge") {
      c.drawImage(this.refuge.terrainRaster(), 0, 0);
      for (const d of REFUGE.decorations)
        this.refuge.tiles.drawProp(
          c,
          resolvePropAtlas(d.family),
          d.slot,
          d.x,
          d.y,
          d.height,
        );
      for (const t of [...REFUGE.structures, ...REFUGE.npcs])
        this.refuge.drawTarget(c, t, this.target?.id);
    } else {
      this.renderer.terrain();
      for (const structure of this.world.nearby)
        if (this.renderer.visible(structure.x, structure.y, structure.r + 120))
          this.renderer.structure(structure, this.elapsed);
      for (const node of this.nodes)
        if (this.renderer.visible(node.x, node.y)) {
          const used = this.depleted.has(node.id);
          if (node.kind === "RESOURCE") {
            const resource = explorationResource(node.definitionId);
            this.refuge.tiles.drawProp(
              c,
              resolvePropAtlas(
                resource.category === "MINERAL"
                  ? "rocks"
                  : resource.category === "CRYSTAL"
                    ? "crystals"
                    : "trees_living",
              ),
              0,
              node.x,
              node.y,
              used ? 20 : 40,
            );
          }
          c.strokeStyle =
            node.kind === "POI" ? "#d5b275" : used ? "#687570" : "#90c4a5";
          c.lineWidth = 2;
          this.renderer.circle(node.x, node.y, 22);
          c.stroke();
        }
      for (const portal of WORLD_ZONES[s.zoneId].portals) {
        c.strokeStyle = "#93e7d0";
        c.lineWidth = 5;
        this.renderer.circle(portal.x, portal.y, 35);
        c.stroke();
      }
    }
    for (const row of [...s.players].sort((a, b) => a.y - b.y)) {
      const player = this.players.get(row.id)!;
      const old = { x: player.x, y: player.y };
      if (row.id !== s.selfId) {
        const motion = this.motions.get(row.id);
        if (motion) Object.assign(player, sampleMotion(motion, now));
      }
      this.renderer.setPlayerMotion(
        player,
        row.id === s.selfId && row.moving
          ? { x: row.dx, y: row.dy }
          : { x: player.x - old.x, y: player.y - old.y },
      );
      this.renderer.player(player, this.elapsed);
      c.font = "12px monospace";
      c.textAlign = "center";
      c.fillStyle = "#e8dcc0";
      c.fillText(`${row.name} · ${row.level}`, player.x, player.y - 78);
    }
    for (const e of s.entities) {
      if (e.kind === "enemy" && ENEMY_DEFINITIONS[e.type]) {
        const view: Enemy = {
          ...ENEMY_DEFINITIONS[e.type],
          id: 0,
          type: e.type,
          x: e.x,
          y: e.y,
          hp: e.health ?? 0,
          maxHp: e.maxHealth ?? 1,
          pattern: "ring",
          bossEventIndex: null,
          dead: false,
          kx: 0,
          ky: 0,
          flash: 0,
          attack: 0,
          wind: 0,
          charge: 0,
          aimX: 0,
          aimY: 0,
          bossPhase: 1,
          phase: 0,
          statuses: {},
          burrow: 0,
          shield: 0,
          buffAura: 0,
          specialClock: 0,
        };
        this.renderer.enemy(view, this.elapsed);
      } else if (e.kind === "bullet")
        this.renderer.projectile(
          {
            x: e.x,
            y: e.y,
            vx: e.dx ?? 0,
            vy: e.dy ?? 0,
            r: e.r,
            kind: e.type,
            age: 0,
          },
          e.color ?? "#c7dcc4",
        );
      else if (e.kind === "area")
        this.renderer.area({
          ...e,
          armed: true,
          delay: 0,
          kind: e.type,
          color: e.color,
        });
    }
  }
  private selectPlayer = (event: PointerEvent) => {
    if (!this.snapshot || this.paused) return;
    this.canvas.focus();
    const rect = this.canvas.getBoundingClientRect(),
      x =
        (event.clientX - rect.left - this.width / 2) / this.zoom +
        this.context.camera.x,
      y =
        (event.clientY - rect.top - this.height / 2) / this.zoom +
        this.context.camera.y;
    const target = this.snapshot.players.find(
      (p) =>
        p.id !== this.snapshot!.selfId &&
        Math.hypot(p.x - x, p.y - 25 - y) < 45,
    );
    if (target) this.onPlayer(target.id);
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.abort.abort();
    this.observer.disconnect();
    this.refuge.dispose();
    this.renderer.worldTiles.dispose();
    this.world.chunks.clear();
    this.players.clear();
    this.motions.clear();
    worldDiagnostics.instances--;
    worldDiagnostics.rafLoops--;
    worldDiagnostics.disposed++;
  }
}
