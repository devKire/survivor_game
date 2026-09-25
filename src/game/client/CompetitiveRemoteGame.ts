import { BrowserGame } from "./browser";
import { freshSave } from "../core/save";
import { Player, Weapon } from "../core/entities";
import { ENEMY_DEFINITIONS, MAP_DEFINITIONS } from "../content/catalog";
import { PVP_CHARACTER_BUILDS, type PvpCharacter } from "../content/pvp";
import { predictMove } from "../network/movement";
import { TICK_HZ, type ClientMessage } from "../network/protocol";
import type { ArenaSnapshot, PvpInput } from "../core/pvp";
import { World } from "../core/world";
import type { Area, Bullet, Enemy, Line, Pickup, Structure, Vec } from "../core/types";

type PendingInput = Pick<PvpInput, "sequence" | "moveX" | "moveY">;

const TEAM_COLORS = ["#83ccb7", "#dd9c92"] as const;

/** Competitive snapshots drive the familiar PvE renderer; only movement is predicted locally. */
export class CompetitiveRemoteGame extends BrowserGame {
  snapshot: ArenaSnapshot | null = null;
  sequence = 0;
  pending: PendingInput[] = [];
  prediction: Vec | null = null;
  correction = 0;
  sendClock = 0;
  private renderPositions = new Map<string, Vec>();
  private visualPlayers = new Map<string, Player>();
  private playerHealth = new Map<string, number>();
  private buildRevisions = new Map<string, number>();
  private face = { x: 1, y: 0 };
  private virtualDash = false;
  constructor(
    canvas: HTMLCanvasElement,
    readonly userId: string,
    private readonly sendMessage: (message: ClientMessage) => void,
    private readonly placement: () => "TORRE" | "BARRICADA" | null,
    private readonly placeAt: (kind: "TORRE" | "BARRICADA", point: Vec) => void,
    private readonly cancelPlacement: () => void,
  ) {
    const save = freshSave();
    save.unlocked = ["nara", "orin", "ivo", "sena"];
    save.settings.shake = false;
    super(canvas, save);
    this.persist = () => true;
    this.saveSnapshot = () => false;
    this.checkAchievements = () => {};
    this.useItem = () => {};
    this.interact = () => {};
    this.pause = () => {};
    this.resume = () => {};
    this.ui.hide();
    this.debugKey = (key: string) => {
      if (key === "F7") this.debug.hitboxes = !this.debug.hitboxes;
    };
    canvas.addEventListener("pointerdown", this.onPointerDown, {
      signal: this.abort.signal,
    });
    window.addEventListener("keydown", this.onKeyDown, {
      signal: this.abort.signal,
    });
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape" && this.placement()) this.cancelPlacement();
  };

  setVirtualMove(x: number, y: number) {
    const own = this.snapshot?.players.find((player) => player.id === this.userId);
    if (!own || own.hp <= 0) {
      this.input.clearVirtualMove();
      return;
    }
    this.input.setVirtualMove(x, y);
  }

  clearVirtualMove() {
    this.input.clearVirtualMove();
  }

  setVirtualDash(pressed: boolean) {
    this.virtualDash = pressed;
  }

  private onPointerDown = (event: PointerEvent) => {
    const kind = this.placement();
    const snapshot = this.snapshot;
    if (!kind || !snapshot || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const point = {
      x:
        this.camera.x +
        ((event.clientX - rect.left) / rect.width - 0.5) * this.viewW,
      y:
        this.camera.y +
        ((event.clientY - rect.top) / rect.height - 0.5) * this.viewH,
    };
    this.placeAt(kind, point);
  };

  apply(snapshot: ArenaSnapshot) {
    if (this.snapshot && snapshot.tick <= this.snapshot.tick) return;
    if (!this.active) this.startMatch(snapshot);

    const own = snapshot.players.find((player) => player.id === this.userId);
    if (!own) return;
    const oldHealth = this.playerHealth;
    this.playerHealth = new Map(snapshot.players.map((player) => [player.id, player.hp]));
    for (const player of snapshot.players) {
      const visual = player.id === this.userId
        ? this.player
        : this.visualPlayer(player.id, player.character);
      this.syncCompetitiveBuild(
        visual,
        player.id,
        player.weapons,
        player.buildRevision,
        player.id === this.userId ? snapshot.war?.passives : undefined,
      );
      const previous = oldHealth.get(player.id);
      if (previous !== undefined && player.hp < previous) {
        const visual = this.visualPlayer(player.id, player.character);
        this.spark(player.x, player.y, TEAM_COLORS[player.team as 0 | 1], 5);
        if (this.save.settings.numbers)
          this.float(player.x, player.y, Math.ceil(previous - player.hp), TEAM_COLORS[player.team as 0 | 1]);
        visual.hurtFlash = 0.14;
      }
      if (!this.renderPositions.has(player.id))
        this.renderPositions.set(player.id, { x: player.x, y: player.y });
    }
    for (const id of this.renderPositions.keys())
      if (!snapshot.players.some((player) => player.id === id)) {
        this.renderPositions.delete(id);
        this.visualPlayers.delete(id);
      }

    this.snapshot = snapshot;
    this.pending = this.pending.filter((input) => input.sequence > snapshot.own.ack);
    this.sequence = Math.max(this.sequence, snapshot.own.ack);
    let next = { x: own.x, y: own.y };
    for (const input of this.pending)
      next = predictMove(
        next,
        { x: input.moveX, y: input.moveY },
        own.speed,
        1 / TICK_HZ,
        snapshot.structures,
      );
    next.x = Math.max(20, Math.min(snapshot.width - 20, next.x));
    next.y = Math.max(20, Math.min(snapshot.height - 20, next.y));
    this.correction = this.prediction
      ? Math.hypot(this.prediction.x - next.x, this.prediction.y - next.y)
      : 0;
    this.prediction = next;

    this.world.nearby = [
      ...snapshot.structures,
      ...(snapshot.war?.structures.map((structure) => this.warStructure(structure)) || []),
    ];
    this.enemies = (snapshot.war?.minions || []).map((minion) => {
      const definition = ENEMY_DEFINITIONS.husk;
      return {
        ...definition,
        id: 1_000_000 + minion.id,
        type: "husk",
        name: minion.kind,
        x: minion.x,
        y: minion.y,
        hp: minion.hp,
        maxHp: minion.maxHp,
        r: minion.kind === "TANQUE" ? 16 : 10,
        color: TEAM_COLORS[minion.team as 0 | 1],
        dead: minion.hp <= 0,
        pattern: "",
        bossEventIndex: null,
        kx: 0,
        ky: 0,
        flash: 0,
        attack: 0,
        wind: 0,
        charge: 0,
        aimX: 0,
        aimY: 0,
        bossPhase: 0,
        phase: 0,
        statuses: {},
        burrow: 0,
        shield: 0,
        buffAura: 0,
        specialClock: 0,
        resist: 1,
        controlImmunity: {},
      } satisfies Enemy;
    });
    this.pickups = snapshot.pickups.map(
      (pickup) =>
        ({ ...pickup, type: "heal", life: 1, value: pickup.value } satisfies Pickup),
    );
    this.areas = snapshot.areas.map(
      (area) =>
        ({
          ...area,
          damage: 0,
          w: new Weapon(area.weapon),
          life: 1,
          kind: area.weapon,
          tick: 0,
          enemy: area.team !== own.team,
        }) satisfies Area,
    );
    this.lines = snapshot.lines as Line[];
    this.bullets.items = snapshot.bullets.map(
      (bullet) =>
        ({
          hitIds: new Set<number>(),
          x: bullet.x,
          y: bullet.y,
          px: bullet.x,
          py: bullet.y,
          vx: bullet.vx,
          vy: bullet.vy,
          originX: bullet.x,
          originY: bullet.y,
          r: bullet.r,
          life: 1,
          age: bullet.age,
          damage: 0,
          pierce: 0,
          source: null,
          enemy: bullet.team !== own.team,
          color: bullet.color,
          kind: bullet.kind,
          returned: false,
          knock: 0,
          blast: 0,
        }) satisfies Bullet,
    );

    this.player.x = next.x;
    this.player.y = next.y;
    this.player.health = own.hp;
    this.player.maxHealth = own.maxHp;
    this.player.speed = own.speed;
    this.player.dx = own.dx;
    this.player.dy = own.dy;
    this.player.cosmetics = own.cosmetics;
    this.player.invulnerable = own.protected ? 1 : 0;
    this.run.time = snapshot.time;
    this.run.simTime = Math.max(this.run.simTime, snapshot.time);
    this.ui.updateHUD();
    const modeLabel = document.getElementById("wave");
    if (modeLabel)
      modeLabel.textContent = snapshot.war ? "GUERRA DO LIMIAR" : "DUELO COMPETITIVO";
  }

  private startMatch(snapshot: ArenaSnapshot) {
    const own = snapshot.players.find((player) => player.id === this.userId);
    if (!own) return;
    this.start(own.character, "normal", snapshot.mapId, snapshot.seed);
    const profile = MAP_DEFINITIONS[snapshot.mapId].profiles?.[snapshot.profile];
    if (!profile) throw new Error(`Perfil PvP ausente: ${snapshot.profile}`);
    this.world = new World(this, snapshot.mapId, snapshot.seed, {}, profile);
    for (let y = 0; y < snapshot.height; y += 640)
      for (let x = 0; x < snapshot.width; x += 640)
        this.world.ensureChunkAt(x, y);
    this.player = this.createPlayer(own.character as PvpCharacter, own.cosmetics);
    this.player.maxHealth = own.maxHp;
    this.player.health = own.hp;
    this.player.speed = own.speed;
    this.player.x = own.x;
    this.player.y = own.y;
    this.run.mapId = snapshot.mapId;
    this.run.worldSeed = snapshot.seed;
    this.run.time = snapshot.time;
    this.run.simTime = snapshot.time;
    this.camera.x = own.x;
    this.camera.y = own.y;
    this.state = "playing";
    this.active = true;
    this.ui.hide();
    this.ui.hud(true);
  }

  private createPlayer(character: PvpCharacter, cosmetics: Record<string, string>) {
    const player = new Player(character, {}, "PVP");
    const build = PVP_CHARACTER_BUILDS[character];
    player.passives = { ...build.passives };
    player.recalculate();
    player.weapons = build.weapons.map((config) => {
      const weapon = new Weapon(config.id);
      weapon.level = config.level;
      weapon.path = config.path || null;
      weapon.pathLevel = config.path ? 1 : 0;
      weapon.ruleset = "PVP";
      return weapon;
    });
    player.cosmetics = cosmetics;
    return player;
  }

  private syncCompetitiveBuild(
    player: Player,
    id: string,
    build: ArenaSnapshot["players"][number]["weapons"],
    revision: number,
    passives?: Record<string, number>,
  ) {
    if (this.buildRevisions.get(id) === revision) return;
    if (passives) {
      player.passives = { ...passives };
      player.recalculate();
    }
    player.weapons = build.map((config) => {
      const weapon = new Weapon(config.id);
      weapon.level = config.level;
      weapon.evolved = config.evolved;
      weapon.path = config.path;
      weapon.pathLevel = config.pathLevel;
      weapon.ownerId = id;
      weapon.ruleset = "PVP";
      return weapon;
    });
    this.buildRevisions.set(id, revision);
  }

  private visualPlayer(id: string, character: string) {
    let player = this.visualPlayers.get(id);
    if (!player) {
      player = this.createPlayer(character as PvpCharacter, {});
      this.visualPlayers.set(id, player);
    }
    return player;
  }

  private warStructure(structure: NonNullable<ArenaSnapshot["war"]>["structures"][number]): Structure {
    return {
      id: structure.id,
      type: structure.kind === "CORE" ? "obelisk" : structure.kind === "TORRE" ? "column" : "wall",
      x: structure.x,
      y: structure.y,
      r: structure.r,
      hp: structure.hp,
      maxHp: structure.maxHp,
      used: false,
      destroyed: structure.hp <= 0,
      opened: false,
      angle: 0,
      variant: 0,
    };
  }

  override frame(now: number) {
    if (this.abort.signal.aborted) return;
    if (this.dpr !== Math.min(window.devicePixelRatio || 1, 2)) this.resize();
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    this.fps = dt > 0 ? this.fps * 0.96 + Math.min(240, 1 / dt) * 0.04 : this.fps;
    const snapshot = this.snapshot;
    if (snapshot && this.active) {
      const own = snapshot.players.find((player) => player.id === this.userId);
      if (own) {
        const focused = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "");
        const move = own.hp > 0 && snapshot.intermission <= 0 && !focused
          ? this.input.vector()
          : { x: 0, y: 0 };
        const magnitude = Math.hypot(move.x, move.y);
        if (magnitude > 0.01) this.face = { x: move.x / magnitude, y: move.y / magnitude };
        this.sendClock += dt;
        while (this.sendClock >= 1 / TICK_HZ) {
          this.sendClock -= 1 / TICK_HZ;
          const input: PvpInput = {
            sequence: ++this.sequence,
            moveX: move.x,
            moveY: move.y,
            aimX: this.face.x,
            aimY: this.face.y,
            ability: !focused && own.hp > 0 && (this.input.keys.has("Space") || this.virtualDash) ? "dash" : "none",
            seenTick: snapshot.tick,
          };
          this.pending.push(input);
          if (this.pending.length > 250) this.pending.shift();
          this.sendMessage({ type: "ARENA_INPUT", ...input });
          this.prediction = predictMove(
            this.prediction || own,
            { x: input.moveX, y: input.moveY },
            own.speed,
            1 / TICK_HZ,
            snapshot.structures,
          );
        }
        if (this.prediction) {
          this.player.x = this.prediction.x;
          this.player.y = this.prediction.y;
        }
        this.player.dx = own.dx;
        this.player.dy = own.dy;
        this.camera.x = this.player.x;
        this.camera.y = this.player.y;
      }
      this.run.simTime = Math.max(this.run.simTime, snapshot.time) + dt;
      for (const bullet of this.bullets.items) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.age += dt;
      }
      for (const player of snapshot.players) {
        if (player.id === this.userId) continue;
        const position = this.renderPositions.get(player.id)!;
        if (Math.hypot(position.x - player.x, position.y - player.y) > 180) {
          position.x = player.x;
          position.y = player.y;
        } else {
          const blend = 1 - Math.exp(-dt * 18);
          position.x += (player.x - position.x) * blend;
          position.y += (player.y - position.y) * blend;
        }
        const visual = this.visualPlayer(player.id, player.character);
        visual.x = position.x;
        visual.y = position.y;
        visual.dx = player.dx;
        visual.dy = player.dy;
        visual.health = player.hp;
        visual.maxHealth = player.maxHp;
        visual.cosmetics = player.cosmetics;
        visual.invulnerable = player.protected ? 1 : 0;
      }
      this.fx = this.save.settings.particles === "off" ? 0 : Math.min(1, this.fps / 60);
      this.updateEffects(dt);
      this.renderer.draw(now / 1000);
      this.drawCompetitiveOverlay(snapshot);
    } else this.renderer.draw(now / 1000);
    this.frameHandle = requestAnimationFrame((time) => this.frame(time));
  }

  private drawCompetitiveOverlay(snapshot: ArenaSnapshot) {
    const context = this.ctx;
    context.setTransform(
      this.dpr * this.zoom,
      0,
      0,
      this.dpr * this.zoom,
      (this.width * this.dpr) / 2 - this.camera.x * this.dpr * this.zoom,
      (this.height * this.dpr) / 2 - this.camera.y * this.dpr * this.zoom,
    );
    for (const player of snapshot.players) {
      const own = player.id === this.userId;
      const visual = own ? this.player : this.visualPlayer(player.id, player.character);
      const pos = own ? this.player : visual;
      visual.x = pos.x;
      visual.y = pos.y;
      visual.cosmetics = player.cosmetics;
      if (!own && visual.weapons.some((weapon) => weapon.id === "orbit"))
        this.renderer.drawOrbit(visual.x, visual.y, visual.weapons.find((weapon) => weapon.id === "orbit")!.values(visual).area, visual.weapons.find((weapon) => weapon.id === "orbit")!.values(visual).amount, false, this.run.simTime);
      if (!own) this.renderer.player(visual, this.run.simTime);
      context.strokeStyle = TEAM_COLORS[player.team as 0 | 1];
      context.lineWidth = own ? 2.5 : 2;
      context.beginPath();
      context.arc(pos.x, pos.y + 8, 21, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = "#0b171dd9";
      context.fillRect(pos.x - 25, pos.y - 34, 50, 5);
      context.fillStyle = TEAM_COLORS[player.team as 0 | 1];
      context.fillRect(pos.x - 25, pos.y - 34, 50 * Math.max(0, player.hp / player.maxHp), 5);
      context.fillStyle = "#e4e9dc";
      context.font = "11px system-ui";
      context.textAlign = "center";
      const state = player.isBot ? " [BOT]" : player.botControlled ? " [BOT temporário]" : !player.connected ? " · reconectando" : "";
      context.fillText(player.name + state, pos.x, pos.y - 42);
    }
    for (const structure of snapshot.war?.structures || []) {
      const visual = this.warStructure(structure);
      context.globalAlpha = structure.hp > 0 ? 1 : 0.25;
      context.strokeStyle = TEAM_COLORS[structure.team as 0 | 1];
      context.lineWidth = 3;
      context.beginPath();
      context.arc(structure.x, structure.y, structure.r + 3, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = TEAM_COLORS[structure.team as 0 | 1];
      context.fillRect(structure.x - structure.r, structure.y - structure.r - 8, 2 * structure.r * Math.max(0, structure.hp / structure.maxHp), 4);
      void visual;
    }
    for (const minion of snapshot.war?.minions || []) {
      context.fillStyle = TEAM_COLORS[minion.team as 0 | 1];
      context.fillRect(minion.x - 9, minion.y - 11, 18 * Math.max(0, minion.hp / minion.maxHp), 3);
    }
    if (snapshot.war) {
      context.strokeStyle = snapshot.war.objective.owner === null
        ? "#c9b877"
        : TEAM_COLORS[snapshot.war.objective.owner as 0 | 1];
      context.lineWidth = 3;
      context.beginPath();
      context.arc(1300, 700, 110, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.textAlign = "left";
  }
}
