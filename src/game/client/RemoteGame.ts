import { diagnostics, recordFrame, recordMetric } from "./diagnostics";
import { BrowserGame } from "./browser";
import { freshSave } from "../core/save";
import { Player, Weapon } from "../core/entities";
import { ENEMY_DEFINITIONS, WEAPON_DEFINITIONS } from "../content/catalog";
import type { NetEntity, Snapshot, ClientMessage } from "../network/protocol";
import { predictMove } from "../network/movement";
import type { Area, Bullet, Enemy, Gem, Pickup, Status, Vec } from "../core/types";
import { TICK_HZ } from "../network/protocol";
import {
  beginMotion,
  nextSnapshotTiming,
  sampleMotion,
  type Motion,
  type SnapshotTiming,
} from "./interpolation";

type SceneVisual = Enemy | Bullet | Area | Pickup | Gem;

export class RemoteGame extends BrowserGame {
  snapshot?: Snapshot;
  entities = new Map<string, NetEntity>();
  visuals = new Map<string, SceneVisual>();
  motions = new Map<string, Motion>();
  sceneKinds = new Map<string, NetEntity["kind"]>();
  statusKeys = new Map<string, string>();
  entityHp = new Map<string, number>();
  bulletVisuals = 0;
  remotePlayers = new Map<string, Player>();
  remoteMotions = new Map<string, Motion>();
  snapshotTiming?: SnapshotTiming;
  private motionSample = { x: 0, y: 0, extrapolating: false };
  sequence = 0;
  pending: { sequence: number; move: Vec; dt: number }[] = [];
  prediction?: Vec;
  awaitingResync = false;
  visualOffset: Vec = { x: 0, y: 0 };
  corrections = 0;
  sendClock = 0;
  rtt = 0;
  fxSeen = new Set<string>();
  packetRate = 0;
  snapshotRate = 0;
  metricsAt = 0;
  packetCount = 0;
  snapshotCount = 0;
  constructor(
    canvas: HTMLCanvasElement,
    readonly userId: string,
    readonly sendMessage: (message: ClientMessage) => void,
    readonly exit: () => void,
  ) {
    super(canvas, freshSave());
    this.persist = () => true;
    diagnostics.remoteGameInstances++;
    diagnostics.remoteGameCreated++;
    diagnostics.rafLoops++;
    if (diagnostics.enabled) Object.assign(window, { limiarRemoteGame: this });
  }
  override dispose() {
    if (this.abort.signal.aborted) return;
    diagnostics.remoteGameInstances--;
    diagnostics.rafLoops--;
    super.dispose();
  }
  override saveSnapshot() {
    return false;
  }
  override checkAchievements() {}
  override useItem(slot: number) {
    this.sendMessage({ type: "USE_ITEM", slot });
  }
  override interact() {
    const s = this.world?.findInteractive(this.player.x, this.player.y, 70);
    if (s)
      this.sendMessage({ type: "INTERACT", structure: s.id, accept: true });
  }
  override pause() {
    this.input.clear();
    if (this.state === "paused") {
      this.resume();
      return;
    }
    this.state = "paused";
    this.ui.pause();
  }
  override resume() {
    this.state = "playing";
    this.ui.hide();
  }
  override menu() {
    this.exit();
  }
  override finish() {
    this.exit();
  }
  override debugKey(key: string) {
    if (key === "F8") this.debug.stats = !this.debug.stats;
    if (key === "F7") this.debug.hitboxes = !this.debug.hitboxes;
  }
  apply(snapshot: Snapshot) {
    if (snapshot.tick === this.snapshot?.tick) diagnostics.duplicateSnapshots++;
    if (snapshot.full) diagnostics.fullSnapshots++;
    if (this.snapshot && snapshot.tick <= this.snapshot.tick) return;
    if (!snapshot.full && snapshot.base !== (this.snapshot?.tick || 0)) {
      if (!this.awaitingResync) {
        this.awaitingResync = true;
        diagnostics.resyncRequests++;
        this.sendMessage({ type: "RESYNC" });
      }
      return;
    }
    if (!this.active) {
      super.start("nara", snapshot.mode, snapshot.mapId, snapshot.seed);
      this.ui.hide();
    }
    const applyStarted = performance.now();
    const receivedAt = applyStarted;
    const previousSnapshot = this.snapshot;
    const elapsedMs = previousSnapshot
      ? Math.max(1, (snapshot.tick - previousSnapshot.tick) * (1000 / TICK_HZ))
      : 1000 / TICK_HZ;
    this.snapshotTiming = nextSnapshotTiming(this.snapshotTiming, receivedAt);
    diagnostics.interpolationDelay = this.snapshotTiming.delay;
    for (const fx of snapshot.fx) {
      if (this.fxSeen.has(fx.id)) continue;
      this.fxSeen.add(fx.id);
      if (this.fxSeen.size > 512) this.fxSeen.delete(this.fxSeen.values().next().value as string);
      const color = WEAPON_DEFINITIONS[fx.weapon]?.color || "#dbe5df";
      this.ring(fx.x, fx.y, fx.radius, color);
      this.spark(fx.x, fx.y, color, fx.variant === "evolved" ? 20 : 10);
    }
    const authoritativeBefore = new Map<string, Vec>();
    if (snapshot.full) {
      this.entities.clear();
      this.entityHp.clear();
      this.awaitingResync = false;
    }
    for (const id of snapshot.remove) {
      this.entities.delete(id);
      this.entityHp.delete(id);
    }
    diagnostics.entityRemovals += snapshot.remove.length;
    for (const entity of snapshot.upsert) {
      const previous = this.entities.get(entity.id);
      if (previous)
        authoritativeBefore.set(entity.id, { x: previous.x, y: previous.y });
      this.entities.set(entity.id, entity);
    }
    diagnostics.entityUpserts += snapshot.upsert.length;
    for (const patch of snapshot.patch) {
      const entity = this.entities.get(patch.id);
      if (!entity) continue;
      authoritativeBefore.set(patch.id, { x: entity.x, y: entity.y });
      Object.assign(entity, patch);
    }
    for (const e of this.entities.values()) {
      const oldHp = this.entityHp.get(e.id);
      if (e.hp !== undefined) this.entityHp.set(e.id, e.hp);
      if (
        e.kind !== "enemy" ||
        e.hp === undefined ||
        oldHp === undefined ||
        e.hp >= oldHp
      )
        continue;
      const weapon = e.lastHitWeapon
          ? WEAPON_DEFINITIONS[e.lastHitWeapon]
          : undefined,
        color = weapon?.color || "#dbe5df";
      this.spark(e.x, e.y, color, 3);
      if (this.save.settings.numbers)
        this.float(e.x, e.y, Math.ceil(oldHp - e.hp), color);
      if (["chain", "spear"].includes(e.lastHitWeapon || "")) {
        const owner = snapshot.players.find((p) => p.id === e.lastHitOwner);
        if (owner && this.lines.length < 100)
          this.lines.push({
            kind: "chain",
            x: owner.x,
            y: owner.y,
            tx: e.x,
            ty: e.y,
            color,
            life: 0.16,
            max: 0.16,
          });
      }
      this.sound.play("hit");
    }
    const own = snapshot.players.find((p) => p.id === this.userId);
    if(own) this.player.cosmetics = own.cosmetics || {};
    if (!own) return;
    this.pending = this.pending.filter((p) => p.sequence > own.ack);
    this.prediction = { x: own.x, y: own.y };
    for (const input of this.pending)
      this.prediction = predictMove(
        this.prediction,
        input.move,
        own.speed * (own.inWater ? 0.88 : 1),
        input.dt,
        snapshot.structures,
      );
    const dx = this.player.x - this.prediction.x;
    const dy = this.player.y - this.prediction.y;
    const error = Math.hypot(dx, dy);
    if (error > 8) this.corrections++;
    // Keep authority exact; only the visual offset decays over ~100 ms.
    this.visualOffset = this.snapshot && error < 96 && own.state === "alive"
      ? { x: dx, y: dy } : { x: 0, y: 0 };
    this.sequence = Math.max(this.sequence, own.ack);
    this.player.character = own.character;
    this.player.dx = own.dx;
    this.player.dy = own.dy;
    this.player.inWater = own.inWater;
    if (own.hp < this.player.health) this.player.hurtFlash = 0.15;
    this.player.buff = own.buff || 0;
    this.player.invulnerable = own.invulnerable || 0;
    this.player.health = own.hp;
    this.player.maxHealth = own.maxHp;
    this.player.speed = own.speed;
    this.player.stats = snapshot.own.stats;
    this.run.kills = snapshot.own.kills;
    this.run.synergies = snapshot.own.synergies;
    this.player.level = snapshot.own.level;
    this.player.xp = snapshot.own.xp;
    this.player.xpToNextLevel = snapshot.own.xpToNextLevel;
    this.player.weapons = snapshot.own.weapons.map((data) =>
      Object.assign(this.player.weapons.find(w => w.id === data.id) || new Weapon(data.id), data),
    );
    this.player.passives = snapshot.own.passives;
    this.run.inventory = snapshot.own.inventory;
    this.run.gems = snapshot.own.gems;
    this.run.time = snapshot.time;
    // Cosmetic animation keeps advancing locally between authoritative updates.
    // Rewinding it to a delayed snapshot makes orbit/terrain effects flicker.
    this.run.simTime = previousSnapshot
      ? Math.max(this.run.simTime, snapshot.time)
      : snapshot.time;
    this.world.nearby = snapshot.structures;
    this.world.chunks.clear();
    for (const s of snapshot.structures) {
      const { cx, cy } = this.world.chunkCoords(s.x, s.y),
        key = this.world.chunkKey(cx, cy);
      let ch = this.world.chunks.get(key);
      if (!ch) {
        ch = { cx, cy, key, structures: [] };
        this.world.chunks.set(key, ch);
      }
      ch.structures.push(s);
    }
    this.world.interactive = this.world.findInteractive(own.x, own.y, 70);
    this.snapshotCount++;
    for (const e of snapshot.upsert)
      if (e.kind === "enemy" && (e.type === "boss" || e.type === "final"))
        this.sound.play("boss");
    for (const e of snapshot.patch) if (e.phase) this.sound.play("boss");
    this.snapshot = snapshot;
    this.syncScene(authoritativeBefore, elapsedMs, receivedAt);
    this.syncRemotePlayers(snapshot, previousSnapshot, elapsedMs, receivedAt);
    this.ui.updateHUD();
    recordMetric(diagnostics.snapshotApply, performance.now() - applyStarted);
  }
  private syncRemotePlayers(
    snapshot: Snapshot,
    previousSnapshot: Snapshot | undefined,
    elapsedMs: number,
    receivedAt: number,
  ) {
    const previous = new Map(
      previousSnapshot?.players.map((player) => [player.id, player]) || [],
    );
    const active = new Set<string>();
    for (const other of snapshot.players) {
      if (other.id === this.userId) continue;
      active.add(other.id);
      let player = this.remotePlayers.get(other.id);
      if (!player) {
        player = new Player(other.character);
        player.x = other.x;
        player.y = other.y;
        this.remotePlayers.set(other.id, player);
      }
      const motion = this.remoteMotions.get(other.id);
      const current = motion ? sampleMotion(motion, receivedAt) : player;
      this.remoteMotions.set(
        other.id,
        beginMotion(
          current,
          other,
          previous.get(other.id),
          elapsedMs,
          receivedAt,
          this.snapshotTiming!.delay,
        ),
      );
      player.character = other.character;
      player.dx = other.dx;
      player.dy = other.dy;
      player.cosmetics = other.cosmetics || {};
      player.health = other.hp;
      player.maxHealth = other.maxHp;
    }
    for (const id of this.remotePlayers.keys())
      if (!active.has(id)) {
        this.remotePlayers.delete(id);
        this.remoteMotions.delete(id);
      }
  }
  private syncScene(
    authoritativeBefore: Map<string, Vec>,
    elapsedMs: number,
    receivedAt: number,
  ) {
    for (const [id, visual] of this.visuals)
      if (!this.entities.has(id)) this.removeVisual(id, visual);
    this.enemies.length = 0;
    this.bullets.items.length = 0;
    this.areas.length = 0;
    this.pickups.length = 0;
    this.gems.length = 0;
    for (const e of this.entities.values()) {
      let visual = this.visuals.get(e.id);
      if (visual && this.sceneKinds.get(e.id) !== e.kind) {
        this.removeVisual(e.id, visual);
        visual = undefined;
      }
      if (!visual) {
        visual = this.createVisual(e);
        if (!visual) continue;
        this.visuals.set(e.id, visual);
        this.sceneKinds.set(e.id, e.kind);
        this.motions.set(
          e.id,
          beginMotion(visual, e, undefined, elapsedMs, receivedAt, this.snapshotTiming!.delay),
        );
      } else {
        const motion = this.motions.get(e.id);
        const current = motion ? sampleMotion(motion, receivedAt) : visual;
        // Every accepted snapshot confirms a position, including an unchanged
        // delta. Reset velocity when authority stops instead of extrapolating
        // the last movement forever beyond its target.
        if (motion)
          authoritativeBefore.set(e.id, { x: motion.targetX, y: motion.targetY });
        if (!motion || motion.targetX !== e.x || motion.targetY !== e.y ||
            motion.velocityX !== 0 || motion.velocityY !== 0)
          this.motions.set(
            e.id,
            beginMotion(
              current,
              e,
              authoritativeBefore.get(e.id),
              elapsedMs,
              receivedAt,
              this.snapshotTiming!.delay,
            ),
          );
      }
      this.updateVisual(e, visual);
      if (e.kind === "enemy") this.enemies.push(visual as Enemy);
      else if (e.kind === "bullet") this.bullets.items.push(visual as Bullet);
      else if (e.kind === "area") this.areas.push(visual as Area);
      else if (e.kind === "pickup") this.pickups.push(visual as Pickup);
      else this.gems.push(visual as Gem);
    }
  }
  private removeVisual(id: string, visual: SceneVisual) {
    if (this.sceneKinds.get(id) === "bullet") {
      this.bullets.free.push(visual as Bullet);
      this.bulletVisuals--;
    }
    this.visuals.delete(id);
    this.motions.delete(id);
    this.sceneKinds.delete(id);
    this.statusKeys.delete(id);
  }
  private createVisual(entity: NetEntity): SceneVisual | undefined {
    if (entity.kind === "enemy") {
      const def = ENEMY_DEFINITIONS[entity.type];
      if (!def) return undefined;
      return {
        ...def,
        type: entity.type,
        id: Number(entity.id.slice(1)),
        x: entity.x,
        y: entity.y,
        hp: entity.hp || 0,
        maxHp: entity.maxHp || 1,
        name: entity.name || def.name,
        pattern: entity.pattern || "ring",
        bossEventIndex: null,
        dead: false,
        kx: 0,
        ky: 0,
        flash: 0,
        attack: 1,
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
    }
    if (entity.kind === "bullet") {
      if (this.bulletVisuals >= this.bullets.limit) return undefined;
      const bullet = this.bullets.free.pop() || this.bullets.factory();
      bullet.hitIds.clear();
      bullet.x = entity.x;
      bullet.y = entity.y;
      bullet.px = entity.x;
      bullet.py = entity.y;
      bullet.vx = 0;
      bullet.vy = 0;
      bullet.source = null;
      bullet.age = 0;
      this.bulletVisuals++;
      return bullet;
    }
    if (entity.kind === "area")
      return {
        x: entity.x, y: entity.y, r: entity.r, damage: 0, w: null, life: 1,
        delay: 0, kind: entity.type, tick: 0, armed: false, enemy: false,
      };
    if (entity.kind === "pickup")
      return { x: entity.x, y: entity.y, type: entity.type, value: 1, life: 1 };
    return { x: entity.x, y: entity.y, value: 1, key: entity.id, magnet: false };
  }
  private updateVisual(entity: NetEntity, visual: SceneVisual) {
    if (entity.kind === "enemy") {
      const enemy = visual as Enemy;
      enemy.hp = entity.hp || 0;
      enemy.maxHp = entity.maxHp || 1;
      enemy.name = entity.name || enemy.name;
      enemy.pattern = entity.pattern || "ring";
      enemy.wind = entity.wind || 0;
      enemy.charge = entity.charge || 0;
      enemy.aimX = entity.aimX || 0;
      enemy.aimY = entity.aimY || 0;
      enemy.bossPhase = entity.phase || 1;
      enemy.burrow = entity.burrow || 0;
      enemy.shield = entity.shield || 0;
      enemy.lastHitWeapon = entity.lastHitWeapon;
      enemy.lastHitOwner = entity.lastHitOwner;
      const key = (entity.statuses || []).join("|");
      if (this.statusKeys.get(entity.id) !== key) {
        this.statusKeys.set(entity.id, key);
        for (const status of Object.keys(enemy.statuses)) delete enemy.statuses[status];
        for (const status of entity.statuses || [])
          enemy.statuses[status] = {
            duration: 1, magnitude: 1, stacks: 1, tick: 0, source: null,
          } satisfies Status;
      }
      return;
    }
    if (entity.kind === "bullet") {
      const bullet = visual as Bullet;
      bullet.r = entity.r;
      bullet.color = entity.color || "#eee";
      bullet.enemy = entity.enemy || false;
      bullet.kind = entity.type;
      bullet.vx = 0;
      bullet.vy = 0;
      return;
    }
    if (entity.kind === "area") {
      const area = visual as Area;
      area.r = entity.r;
      area.delay = entity.delay || 0;
      area.kind = entity.type;
      area.armed = entity.armed || false;
      area.enemy = entity.enemy || false;
      return;
    }
    if (entity.kind === "pickup") {
      const pickup = visual as Pickup;
      pickup.type = entity.type;
      pickup.value = entity.value || 1;
      pickup.itemId = entity.itemId;
      return;
    }
    (visual as Gem).value = entity.value || 1;
  }
  override frame(now: number) {
    if (this.abort.signal.aborted) return;
    if (this.dpr !== Math.min(window.devicePixelRatio || 1, 2)) this.resize();
    const dt = this.lastFrame
      ? Math.min(0.1, (now - this.lastFrame) / 1000)
      : 0;
    recordFrame(this.lastFrame ? now - this.lastFrame : 0);
    this.lastFrame = now;
    if (dt > 0) this.fps = this.fps * 0.96 + Math.min(240, 1 / dt) * 0.04;
    const s = this.snapshot;
    if (s && this.active) {
      const own = s.players.find((p) => p.id === this.userId)!;
      this.sendClock += dt;
      while (this.sendClock >= 1 / TICK_HZ) {
        this.sendClock -= 1 / TICK_HZ;
        const focused = ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName || "",
        );
        const move =
          own.state === "alive" && this.state === "playing" && !focused
            ? this.input.vector()
            : { x: 0, y: 0 };
        const input = { sequence: ++this.sequence, move, dt: 1 / TICK_HZ };
        this.pending.push(input);
        if (this.pending.length > 250) this.pending.shift();
        this.prediction = predictMove(
          this.prediction || own,
          move,
          own.speed * (own.inWater ? 0.88 : 1),
          1 / TICK_HZ,
          s.structures,
        );
        this.packetCount++;
        this.sendMessage({
          type: "INPUT",
          sequence: input.sequence,
          moveX: move.x,
          moveY: move.y,
          interact: !focused && this.input.keys.has("KeyE"),
        });
      }
      if (this.prediction) {
        const focus = ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName || "",
        );
        const visual = predictMove(
          this.prediction,
          own.state === "alive" && this.state === "playing" && !focus
            ? this.input.vector()
            : { x: 0, y: 0 },
          own.speed * (own.inWater ? 0.88 : 1),
          this.sendClock,
          s.structures,
        );
        const decay = Math.exp(-dt * 22);
        this.visualOffset.x *= decay;
        this.visualOffset.y *= decay;
        this.player.x = visual.x + this.visualOffset.x;
        this.player.y = visual.y + this.visualOffset.y;
      }
      this.camera.x = this.player.x;
      this.camera.y = this.player.y;
      this.run.simTime += dt;
      for (const [id, visual] of this.visuals) {
        const motion = this.motions.get(id);
        if (!motion) continue;
        const sampled = sampleMotion(motion, now, this.motionSample);
        visual.x = sampled.x;
        visual.y = sampled.y;
        if (this.sceneKinds.get(id) === "bullet")
          (visual as Bullet).age = now / 1000;
        if (sampled.extrapolating && !motion.extrapolated) {
          motion.extrapolated = true;
          diagnostics.extrapolations++;
        }
      }
      this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt);
      this.fx =
        this.save.settings.particles === "off" ? 0 : Math.min(1, this.fps / 60);
      this.updateEffects(dt);
      const renderStarted = performance.now();
      this.renderer.draw(now / 1000);
      const c = this.ctx;
      c.setTransform(
        this.dpr * this.zoom,
        0,
        0,
        this.dpr * this.zoom,
        (this.width * this.dpr) / 2 - this.camera.x * this.dpr * this.zoom,
        (this.height * this.dpr) / 2 - this.camera.y * this.dpr * this.zoom,
      );
      for (const other of s.players) {
        if (other.id === this.userId) continue;
        const p = this.remotePlayers.get(other.id);
        const motion = this.remoteMotions.get(other.id);
        if (!p || !motion) continue;
        const sampled = sampleMotion(motion, now, this.motionSample);
        p.x = sampled.x;
        p.y = sampled.y;
        if (sampled.extrapolating && !motion.extrapolated) {
          motion.extrapolated = true;
          diagnostics.extrapolations++;
        }
        p.dx = other.dx;
        p.dy = other.dy;
        if (other.orbit)
          this.renderer.drawOrbit(
            p.x,
            p.y,
            other.orbit.area,
            other.orbit.amount,
            other.orbit.evolved,
            this.run.simTime,
          );
        p.cosmetics = other.cosmetics || {};
        this.renderer.player(p, this.run.simTime);
        c.strokeStyle = other.color;
        this.renderer.circle(p.x, p.y, 23);
        c.stroke();
        c.fillStyle = other.color;
        c.font = "12px system-ui";
        c.fillText(other.name, p.x - 20, p.y - 28);
        if (!this.renderer.visible(p.x, p.y)) {
          const x = Math.max(
              this.camera.x - this.viewW / 2 + 30,
              Math.min(this.camera.x + this.viewW / 2 - 50, p.x),
            ),
            y = Math.max(
              this.camera.y - this.viewH / 2 + 140,
              Math.min(this.camera.y + this.viewH / 2 - 100, p.y),
            );
          c.fillText("◆ " + other.name, x, y);
        }
      }
      recordMetric(diagnostics.render, performance.now() - renderStarted);
    } else this.renderer?.draw(now / 1000);
    if (now - this.metricsAt >= 1000) {
      const seconds = (now - this.metricsAt) / 1000;
      this.packetRate = this.packetCount / seconds;
      this.snapshotRate = this.snapshotCount / seconds;
      this.packetCount = 0;
      this.snapshotCount = 0;
      this.metricsAt = now;
    }
    if (this.debug.stats) {
      const node = document.getElementById("debug");
      if (node) {
        node.hidden = false;
        node.textContent = `FPS ${Math.round(this.fps)} · RTT ${Math.round(this.rtt)} ms\nInput ${this.packetRate.toFixed(1)}/s · Snapshot ${this.snapshotRate.toFixed(1)}/s\nCorreções ${this.corrections} · Entidades ${this.entities.size} · Players ${s?.players.length || 0}\nBuffer ${Math.round(diagnostics.interpolationDelay)} ms · Extrapolações ${diagnostics.extrapolations}\nSala ${s?.room || ""} · Tick ${s?.tick || 0}`;
      }
    }
    diagnostics.entities = this.entities.size;
    diagnostics.corrections = this.corrections;
    diagnostics.rtt = this.rtt;
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
  }
}
