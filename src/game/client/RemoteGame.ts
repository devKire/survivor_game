import { diagnostics, recordFrame } from "./diagnostics";
import { BrowserGame } from "./browser";
import { freshSave } from "../core/save";
import { Player, Weapon } from "../core/entities";
import { ENEMY_DEFINITIONS, WEAPON_DEFINITIONS } from "../content/catalog";
import type { NetEntity, Snapshot, ClientMessage } from "../network/protocol";
import { predictMove, lerp } from "../network/movement";
import type { Vec } from "../core/types";
import { TICK_HZ } from "../network/protocol";
export class RemoteGame extends BrowserGame {
  snapshot?: Snapshot;
  previousSnapshot?: Snapshot;
  entities = new Map<string, NetEntity>();
  before = new Map<string, NetEntity>();
  visuals = new Map<string, Vec>();
  remotePlayers = new Map<string, Player>();
  receivedAt = 0;
  sequence = 0;
  pending: { sequence: number; move: Vec; dt: number }[] = [];
  prediction?: Vec;
  awaitingResync = false;
  visualOffset: Vec = { x: 0, y: 0 };
  corrections = 0;
  sendClock = 0;
  rtt = 0;
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
    this.before = new Map([...this.entities].map(([id, e]) => {
      const visual = this.visuals.get(id);
      return [id, visual ? { ...e, x: visual.x, y: visual.y } : e];
    }));
    if (snapshot.full) {
      this.entities.clear();
      this.awaitingResync = false;
    }
    for (const id of snapshot.remove) this.entities.delete(id);
    for (const entity of snapshot.upsert) this.entities.set(entity.id, entity);
    for (const patch of snapshot.patch) {
      const entity = this.entities.get(patch.id);
      if (entity) this.entities.set(patch.id, { ...entity, ...patch });
    }
    for (const e of this.entities.values()) {
      const old = this.before.get(e.id);
      if (
        e.kind !== "enemy" ||
        !old ||
        e.hp === undefined ||
        old.hp === undefined ||
        e.hp >= old.hp
      )
        continue;
      const weapon = e.lastHitWeapon
          ? WEAPON_DEFINITIONS[e.lastHitWeapon]
          : undefined,
        color = weapon?.color || "#dbe5df";
      this.spark(e.x, e.y, color, 3);
      if (this.save.settings.numbers)
        this.float(e.x, e.y, Math.ceil(old.hp - e.hp), color);
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
    this.run.gold = snapshot.own.gold;
    this.run.time = snapshot.time;
    this.run.simTime = snapshot.time;
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
    this.previousSnapshot = this.snapshot && {
      ...this.snapshot,
      players: this.snapshot.players.map(p => {
        const visual = this.remotePlayers.get(p.id);
        return visual ? {...p, x: visual.x, y: visual.y} : p;
      }),
    };
    this.snapshot = snapshot;
    this.receivedAt = performance.now();
    this.syncScene();
    this.ui.updateHUD();
  }
  syncScene() {
    const now = performance.now();
      this.visuals.clear();
      this.enemies = [];
      this.bullets.clear();
      this.areas = [];
      this.pickups = [];
      this.gems = [];
      for (const e of this.entities.values()) {
        const old = this.before.get(e.id) || e;
        const x = old.x, y = old.y;
        if (e.kind === "enemy") {
          const def = ENEMY_DEFINITIONS[e.type];
          if (def) {
            const enemy = {
              ...def,
              type: e.type,
              id: Number(e.id.slice(1)),
              x,
              y,
              hp: e.hp || 0,
              maxHp: e.maxHp || 1,
              name: e.name || def.name,
              pattern: e.pattern || "ring",
              bossEventIndex: null,
              dead: false,
              kx: 0,
              ky: 0,
              flash: 0,
              attack: 1,
              wind: e.wind || 0,
              charge: e.charge || 0,
              aimX: e.aimX || 0,
              aimY: e.aimY || 0,
              bossPhase: e.phase || 1,
              phase: 0,
              statuses: Object.fromEntries(
                (e.statuses || []).map((id) => [
                  id,
                  {
                    duration: 1,
                    magnitude: 1,
                    stacks: 1,
                    tick: 0,
                    source: null,
                  },
                ]),
              ),
              burrow: e.burrow || 0,
              shield: e.shield || 0,
              buffAura: 0,
              specialClock: 0,
            };
            this.enemies.push(enemy);
            this.visuals.set(e.id, enemy);
          }
        }
        if (e.kind === "bullet") {
          const b = this.bullets.take();
          if (b) {
            this.visuals.set(e.id, b);
            Object.assign(b, {
              x,
              y,
              r: e.r,
              color: e.color || "#eee",
              enemy: e.enemy,
              kind: e.type,
              vx: 0,
              vy: 0,
              age: now / 1000,
            });
          }
        }
        if (e.kind === "area") {
          const value = {
            x,
            y,
            r: e.r,
            damage: 0,
            w: null,
            life: 1,
            delay: e.delay || 0,
            kind: e.type,
            tick: 0,
            armed: e.armed || false,
            enemy: e.enemy || false,
          };
          this.areas.push(value);
          this.visuals.set(e.id, value);
        }
        if (e.kind === "pickup") {
          const value = {
            x,
            y,
            type: e.type,
            value: e.value || 1,
            life: 1,
            itemId: e.itemId,
          };
          this.pickups.push(value);
          this.visuals.set(e.id, value);
        }
        if (e.kind === "gem") {
          const value = {
            x,
            y,
            value: e.value || 1,
            key: e.id,
            magnet: false,
          };
          this.gems.push(value);
          this.visuals.set(e.id, value);
        }
      }
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
      this.camera = { x: this.player.x, y: this.player.y };
      this.run.simTime += dt;
      const blend = Math.min(1, (now - this.receivedAt) / 100);
      for (const [id, visual] of this.visuals) {
        const e = this.entities.get(id)!;
        const old = this.before.get(id) || e;
        visual.x = lerp(old.x, e.x, blend);
        visual.y = lerp(old.y, e.y, blend);
      }
      this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt);
      this.fx =
        this.save.settings.particles === "off" ? 0 : Math.min(1, this.fps / 60);
      this.updateEffects(dt);
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
        const old =
          this.previousSnapshot?.players.find((p) => p.id === other.id) ||
          other;
        let p = this.remotePlayers.get(other.id);
        if (!p) { p = new Player(other.character); this.remotePlayers.set(other.id, p); }
        p.x = lerp(old.x, other.x, blend);
        p.y = lerp(old.y, other.y, blend);
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
        node.textContent = `FPS ${Math.round(this.fps)} · RTT ${Math.round(this.rtt)} ms\nInput ${this.packetRate.toFixed(1)}/s · Snapshot ${this.snapshotRate.toFixed(1)}/s\nCorreções ${this.corrections} · Entidades ${this.entities.size} · Players ${s?.players.length || 0}\nSala ${s?.room || ""} · Tick ${s?.tick || 0}`;
      }
    }
    diagnostics.entities = this.entities.size;
    diagnostics.corrections = this.corrections;
    diagnostics.rtt = this.rtt;
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
  }
}
