import { PROGRESSION, telemetry } from "./progression";
import {
  ACHIEVEMENTS,
  BOSS_EVENTS,
  BOSS_PHASES,
  CHARACTER_DEFINITIONS,
  CHUNK_SIZE,
  ENEMY_DEFINITIONS,
  ITEM_DEFINITIONS,
  MAP_DEFINITIONS,
  MAX_ACTIVE_ENEMIES,
  MAX_PRIORITY_ENEMIES,
  MAX_WORLD_PICKUPS,
  MODE_DEFINITIONS,
  PASSIVE_DEFINITIONS,
  RUN_INVENTORY_SLOTS,
  SAVE_SCHEMA,
  STATUS_DEFINITIONS,
  STRUCTURE_DEFINITIONS,
  SYNERGY_DEFINITIONS,
  WAVE_TABLE,
  WEAPON_DEFINITIONS,
  WEAPON_PATHS,
  getModeDefinition,
  getModeScaling,
} from "../content/catalog";
import { Pool, SpatialGrid } from "./collections";
import { WaveDirector } from "./director";
import { getExpeditionProfile } from "../content/catalog";
import type { FxEvent } from "../network/protocol";
import { Player, Weapon } from "./entities";
import {
  MAX_PASSIVES,
  MAX_WEAPONS,
  TAU,
  choose,
  clamp,
  clock,
  hashString,
  makeWorldSeed,
  rand,
  removeAt,
  segmentDistance2,
  weighted,
  xpNeed,
} from "./math";
import { validateRunSnapshot } from "./save";
import { applyStatus, hasStatus } from "./status";
import type * as T from "./types";
import { World } from "./world";
export const DEBUG = process.env.NODE_ENV !== "production";
export const VERSION = "2.0.0";
export class GameSimulation {
  playersForWorld(): Player[] {
    return this.player ? [this.player] : [];
  }
  combatPlayers(): Player[] {
    return this.playersForWorld().filter((p) => p.health > 0);
  }
  nearestPlayer(point: T.Vec): Player {
    const players = this.combatPlayers();
    return players.reduce(
      (best, p) =>
        Math.hypot(p.x - point.x, p.y - point.y) <
        Math.hypot(best.x - point.x, best.y - point.y)
          ? p
          : best,
      players[0] || this.player,
    );
  }
  ownerOf(w: Weapon | null): Player {
    void w;
    return this.player;
  }
  state = "menu";
  active = false;
  storageAvailable = true;
  player!: Player;
  run!: T.RunState;
  world!: World;
  director = new WaveDirector();
  enemies: T.Enemy[] = [];
  pickups: T.Pickup[] = [];
  gems: T.Gem[] = [];
  gemCells = new Map<string, T.Gem>();
  areas: T.Area[] = [];
  lines: T.Line[] = [];
  enemyId = 0;
  projectileId = 0;
  hitstop = 0;
  grid = new SpatialGrid();
  bullets = new Pool<T.Bullet>(
    () => ({
      hitIds: new Set(),
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      originX: 0,
      originY: 0,
      r: 6,
      life: 0,
      age: 0,
      damage: 0,
      pierce: 0,
      source: null,
      enemy: false,
      color: "",
      kind: "bolt",
      returned: false,
      knock: 0,
      blast: 0,
    }),
    1100,
  );
  particles = new Pool<T.Particle>(
    () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, color: "", r: 0 }),
    850,
  );
  floats = new Pool<T.FloatText>(
    () => ({ x: 0, y: 0, text: "", color: "", size: 0, life: 0 }),
    160,
  );
  sound: T.SoundPort = { play() {}, unlock() {} };
  input: T.InputPort = {
    clear() {},
    vector: () => ({ x: 0, y: 0 }),
    touch: { active: false, id: null, x: 0, y: 0, dx: 0, dy: 0 },
  };
  ui: T.UiPort = {
    main() {},
    hide() {},
    hud() {},
    updateHUD() {},
    pause() {},
    toast() {},
    itemOverflow() {},
    structureInteraction() {},
    levelup() {},
    goal() {},
    chest() {},
    result() {},
  };
  camera = { x: 0, y: 0 };
  mode = "normal";
  modeDef = getModeDefinition("normal");
  clockRate = 1;
  accumulator = 0;
  lastFrame = 0;
  fps = 60;
  fx = 1;
  shake = 0;
  debug = {
    god: false,
    hitboxes: false,
    stats: false,
    chunks: false,
    structureIds: false,
    collisions: false,
  };
  hudClock = 0;
  fxEvents: FxEvent[] = [];
  fxSequence = 0;
  expeditionProfile = getExpeditionProfile();
  viewW = 1200;
  viewH = 800;
  choices: T.Upgrade[] = [];
  chestReward: T.ChestReward | null = null;
  pendingItem: T.InventorySlot | null = null;
  banishMode = false;
  pathSelection = false;
  lastChoiceKey = "";

  constructor(
    public save: T.SaveData,
    public persist: () => boolean = () => true,
  ) {}
  setState(s: string) {
    this.state = s;
    this.accumulator = 0;
    this.input.clear();
  }

  start(
    character: string = this.save.selected,
    mode: string = "normal",
    mapId: string = this.save.selectedMap,
    seed: string | null = null,
    expeditionLength = this.save.selectedExpeditionLength || 1800,
  ) {
    if (!Object.hasOwn(CHARACTER_DEFINITIONS, character)) character = "nara";
    if (!this.save.unlocked.includes(character)) character = "nara";
    if (!Object.hasOwn(MAP_DEFINITIONS, mapId)) mapId = "ruins";

    this.active = true;
    this.setState("playing");
    this.mode = Object.hasOwn(MODE_DEFINITIONS, mode) ? mode : "normal";
    this.modeDef = getModeDefinition(this.mode);
    this.expeditionProfile = getExpeditionProfile(expeditionLength);
    this.clockRate = this.modeDef.clockRate;

    this.player = new Player(character, this.save.upgrades);
    this.player.weapons.push(
      new Weapon(CHARACTER_DEFINITIONS[character].weapon),
    );

    this.run = {
      schemaVersion: SAVE_SCHEMA,
      gameVersion: VERSION,
      time: 0,
      simTime: 0,
      kills: 0,
      gold: 0,
      totalDamage: 0,
      bossKills: 0,
      evolutions: 0,
      completed: false,
      settled: false,
      completionGold: null,
      mapId,
      expeditionLength: this.expeditionProfile.duration,
      worldSeed: String(seed || makeWorldSeed()),
      worldVersion: 3,
      worldChanges: {},
      inventory: Array(RUN_INVENTORY_SLOTS).fill(null),
      rerolls: 2,
      banishments: 2,
      skips: 1,
      banned: [],
      structuresBroken: 0,
      urnsBroken: 0,
      structuresUsed: 0,
      itemsUsed: 0,
      synergies: [],
      usedExchange: false,
      phase3BossKills: 0,
      event: null,
      eventTime: 0,
      silenceTime: 0,
      surgeTime: 0,
      endlessAnnounced: false,
      autosave: 20,
      bossHistory: [],
      telemetry: telemetry(),
      manualDecisions: 0,
      lastDecisionAt: -100,
      restUntil: 0,
    };

    this.world = new World(
      this,
      mapId,
      this.run.worldSeed,
      this.run.worldChanges,
    );
    this.resetTransientRunState();
    this.director = new WaveDirector();
    this.camera.x = 0;
    this.camera.y = 0;
    this.shake = 0;
    this.hudClock = 0;
    this.hitstop = 0;
    this.world.update();

    this.save.selected = character;
    this.save.selectedMap = mapId;
    if (!this.save.discovered.maps.includes(mapId))
      this.save.discovered.maps.push(mapId);
    this.persist();

    this.ui.hide();
    this.ui.hud(true);
    this.ui.updateHUD();
    this.saveSnapshot(true);

    this.announce(
      MAP_DEFINITIONS[mapId].name,
      this.mode === "test"
        ? `TESTE • relógio 5× • seed ${this.run.worldSeed}`
        : `${this.modeDef.name} · seed ${this.run.worldSeed} · explore, lute e atravesse a névoa.`,
    );
  }

  modeScaling(time: number = this.run?.time || 0) {
    return getModeScaling(this.mode, time);
  }

  currentEnemyCap(
    wave: T.WaveDefinition = WAVE_TABLE[this.director?.index || 0],
    scale = this.modeScaling(),
  ) {
    return Math.min(
      MAX_ACTIVE_ENEMIES,
      Math.max(1, Math.floor(wave.cap * scale.cap)),
    );
  }

  canSpawnPriority() {
    return this.enemies.length < MAX_ACTIVE_ENEMIES + MAX_PRIORITY_ENEMIES;
  }

  pushPickup(item: T.Pickup) {
    if (this.pickups.length >= MAX_WORLD_PICKUPS) {
      const replace = this.pickups.findIndex(
        (p) => p.type !== "chest" && p.type !== "item",
      );
      if (replace >= 0) this.pickups[replace] = item;
      return replace >= 0;
    }
    this.pickups.push(item);
    return true;
  }

  resetTransientRunState() {
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.gems.length = 0;
    this.areas.length = 0;
    this.lines.length = 0;
    this.gemCells.clear();
    this.bullets.clear();
    this.particles.clear();
    this.floats.clear();
    this.grid.rebuild([]);
    this.enemyId = 0;
    this.choices = [];
    this.chestReward = null;
  }

  serializeRun(): T.RunSnapshot | null {
    if (!this.run || !this.player || this.run.settled) return null;
    const p = this.player;
    const enemies = this.enemies
      .filter(
        (e) =>
          !e.dead &&
          ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 1300 ** 2 ||
            e.type === "boss" ||
            e.type === "final"),
      )
      .slice(0, 320)
      .map((e) => ({
        type: e.type,
        id: e.id,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        speed: e.speed,
        damage: e.damage,
        name: e.name,
        pattern: e.pattern,
        attack: e.attack,
        wind: e.wind,
        charge: e.charge,
        aimX: e.aimX,
        aimY: e.aimY,
        bossPhase: e.bossPhase || 1,
        bossEventIndex: e.bossEventIndex ?? null,
        statuses: Object.fromEntries(
          Object.entries(e.statuses || {}).map(([id, status]) => [
            id,
            {
              duration: status.duration,
              magnitude: status.magnitude,
              stacks: status.stacks,
              tick: status.tick,
              sourceId: status.source?.id || null,
            },
          ]),
        ),
      }));
    return {
      telemetry: this.run.telemetry,
      manualDecisions: this.run.manualDecisions,
      lastDecisionAt: this.run.lastDecisionAt,
      restUntil: this.run.restUntil,
      pending: {
        state: this.state,
        choices: this.choices,
        pathSelection: this.pathSelection,
        chestReward: this.chestReward,
        pendingItem: this.pendingItem,
      },
      schemaVersion: SAVE_SCHEMA,
      gameVersion: VERSION,
      mapId: this.run.mapId,
      expeditionLength: this.run.expeditionLength,
      worldSeed: this.run.worldSeed,
      worldVersion: this.run.worldVersion,
      mode: this.mode,
      time: this.run.time,
      simTime: this.run.simTime,
      completed: this.run.completed === true,
      completionGold: this.run.completionGold,
      character: p.character,
      x: p.x,
      y: p.y,
      health: p.health,
      maxHealth: p.maxHealth,
      level: p.level,
      xp: p.xp,
      xpToNextLevel: p.xpToNextLevel,
      weapons: p.weapons.map((w) => ({
        id: w.id,
        level: w.level,
        evolved: w.evolved,
        path: w.path,
        pathLevel: w.pathLevel,
        damageDealt: w.damageDealt,
        kills: w.kills,
        shots: w.shots,
        hits: w.hits,
        timer: w.timer,
      })),
      passives: { ...p.passives },
      inventory: this.run.inventory.map((x) => (x ? { ...x } : null)),
      rerolls: this.run.rerolls,
      banishments: this.run.banishments,
      skips: this.run.skips,
      banned: [...this.run.banned],
      gold: this.run.gold,
      kills: this.run.kills,
      totalDamage: this.run.totalDamage,
      bossKills: this.run.bossKills,
      evolutions: this.run.evolutions,
      structuresBroken: this.run.structuresBroken,
      urnsBroken: this.run.urnsBroken || 0,
      structuresUsed: this.run.structuresUsed,
      itemsUsed: this.run.itemsUsed,
      synergies: [...this.run.synergies],
      usedExchange: this.run.usedExchange === true,
      phase3BossKills: this.run.phase3BossKills || 0,
      worldChanges: { ...this.run.worldChanges },
      event: this.run.event,
      eventTime: this.run.eventTime,
      nextMapEvent: this.run.nextMapEvent,
      silenceTime: this.run.silenceTime,
      surgeTime: this.run.surgeTime,
      silenceAfter: this.run.silenceAfter || 0,
      riftPending: this.run.riftPending ? { ...this.run.riftPending } : null,
      endlessAnnounced: this.run.endlessAnnounced === true,
      director: {
        index: this.director.index,
        spawnClock: this.director.spawnClock,
        eliteClock: this.director.eliteClock,
        formationClock: this.director.formationClock,
        eventIndex: this.director.eventIndex,
        nextEndlessBossAt: this.director.nextEndlessBossAt,
        endlessBossIndex: this.director.endlessBossIndex,
      },
      enemies,
      pickups: this.pickups
        .filter((o) => o.type === "chest" || o.type === "item")
        .slice(0, 80)
        .map((o) => ({ ...o })),
      bossHistory: [...(this.run.bossHistory || [])],
    };
  }

  saveSnapshot(force: boolean = false) {
    if (!this.modeDef?.savesProgress || !this.run || this.run.settled)
      return false;
    if (!force && this.run.autosave > 0) return false;
    const snap = this.serializeRun();
    if (!snap) return false;
    this.save.activeRun = snap;
    this.run.autosave = 20;
    return this.persist();
  }

  continueRun() {
    const s = this.save.activeRun;
    this.active = true;
    if (!validateRunSnapshot(s, false)) {
      this.save.activeRun = null;
      this.persist();
      this.ui.main();
      return;
    }
    this.mode =
      Object.hasOwn(MODE_DEFINITIONS, s.mode) && s.mode !== "test"
        ? s.mode
        : "normal";
    this.modeDef = getModeDefinition(this.mode);
    this.clockRate = this.modeDef.clockRate;
    this.player = new Player(s.character, this.save.upgrades);
    const p = this.player;
    p.x = s.x;
    p.y = s.y;
    p.level = s.level;
    p.xp = s.xp;
    p.xpToNextLevel = s.xpToNextLevel || xpNeed(s.level);
    p.passives = { ...s.passives };
    p.recalculate();
    p.health = clamp(s.health, 1, p.maxHealth);
    p.weapons = s.weapons.map((o) => {
      const w = new Weapon(o.id);
      Object.assign(w, o);
      return w;
    });
    this.run = {
      telemetry: s.telemetry || telemetry(),
      manualDecisions:
        s.manualDecisions ?? Math.min(26, Math.max(0, s.level - 1)),
      lastDecisionAt: s.lastDecisionAt ?? s.time,
      restUntil: s.restUntil || 0,
      schemaVersion: SAVE_SCHEMA,
      gameVersion: VERSION,
      time: s.time,
      simTime: s.simTime || s.time,
      kills: s.kills || 0,
      gold: s.gold || 0,
      totalDamage: s.totalDamage || 0,
      bossKills: s.bossKills || 0,
      evolutions: s.evolutions || 0,
      completed: s.completed === true,
      settled: false,
      completionGold: Number.isFinite(s.completionGold)
        ? s.completionGold
        : null,
      mapId: s.mapId,
      expeditionLength: s.expeditionLength ?? 1800,
      worldSeed: s.worldSeed,
      worldVersion: s.worldVersion ?? s.schemaVersion,
      worldChanges: { ...(s.worldChanges || {}) },
      inventory: s.inventory.map((x) => (x ? { ...x } : null)),
      rerolls: s.rerolls ?? 2,
      banishments: s.banishments ?? 2,
      skips: s.skips ?? 1,
      banned: [...(s.banned || [])],
      structuresBroken: s.structuresBroken || 0,
      urnsBroken: s.urnsBroken || 0,
      structuresUsed: s.structuresUsed || 0,
      itemsUsed: s.itemsUsed || 0,
      synergies: [...(s.synergies || [])],
      usedExchange: s.usedExchange === true,
      phase3BossKills: s.phase3BossKills || 0,
      event: s.event || null,
      eventTime: s.eventTime || 0,
      nextMapEvent: s.nextMapEvent,
      silenceTime: s.silenceTime || 0,
      surgeTime: s.surgeTime || 0,
      silenceAfter: s.silenceAfter || 0,
      riftPending: s.riftPending ? { ...s.riftPending } : null,
      endlessAnnounced: s.endlessAnnounced === true,
      autosave: 20,
      bossHistory: [...(s.bossHistory || [])],
    };
    this.resetTransientRunState();
    this.world = new World(this, s.mapId, s.worldSeed, this.run.worldChanges);
    this.director = new WaveDirector();
    Object.assign(this.director, s.director || {});
    for (const o of s.enemies || []) {
      if (!Object.hasOwn(ENEMY_DEFINITIONS, o.type || "")) continue;
      const statuses = Object.fromEntries(
        Object.entries(o.statuses || {}).map(([id, v]) => [
          id,
          { ...v, source: p.weapons.find((w) => w.id === v.sourceId) || null },
        ]),
      );
      const e = this.spawnAt(o.type!, o.x!, o.y!, null, { ...o, statuses });
      if (e) this.enemyId = Math.max(this.enemyId, e.id || 0);
    }
    for (const o of s.pickups || []) {
      if (
        ["chest", "item"].includes(o.type) &&
        Number.isFinite(o.x) &&
        Number.isFinite(o.y)
      )
        this.pushPickup({ ...o });
    }
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.world.update();
    this.setState("playing");
    this.ui.hide();
    this.ui.hud(true);
    this.ui.updateHUD();
    if (s.pending) {
      this.choices = s.pending.choices;
      this.pathSelection = s.pending.pathSelection;
      this.chestReward = s.pending.chestReward;
      this.pendingItem = s.pending.pendingItem;
      if (s.pending.state === "levelup" && this.choices.length) {
        this.setState("levelup");
        this.ui.levelup();
      }
      if (s.pending.state === "chest" && this.chestReward) {
        this.setState("chest");
        this.ui.chest();
      }
      if (s.pending.state === "inventory" && this.pendingItem) {
        this.setState("inventory");
        this.ui.itemOverflow();
      }
    }
    this.announce(
      "Expedição retomada",
      `${MAP_DEFINITIONS[s.mapId].name} · ${clock(s.time)}`,
    );
  }

  pause() {
    if (this.state !== "playing") return;
    this.saveSnapshot(true);
    this.setState("paused");
    this.ui.pause();
  }

  resume() {
    this.setState("playing");
    this.ui.hide();
  }

  menu() {
    this.setState("menu");
    this.active = false;
    this.ui.hud(false);
    this.ui.main();
  }

  announce(title: string, sub: string = "") {
    this.ui.toast(title, sub);
  }
  updateMapEvents(dt: number) {
    const r = this.run;
    if (!r) return;
    if (r.nextMapEvent === undefined || !Number.isFinite(r.nextMapEvent))
      r.nextMapEvent = 300 + (hashString(r.worldSeed) % 90);
    if (r.eventTime <= 0 && r.event) {
      if (r.event === "deep_fog")
        this.announce("A névoa recua", "A visão volta ao normal.");
      r.event = null;
    }
    if (r.silenceAfter && r.silenceAfter > 0) {
      r.silenceAfter -= dt;
      if (r.silenceAfter <= 0) {
        r.surgeTime = Math.max(r.surgeTime, 18);
        this.announce(
          "O silêncio se rompe",
          "Uma onda intensa atravessa o limiar.",
        );
      }
    }
    if (r.time >= r.nextMapEvent) {
      const event =
        hashString(`${r.worldSeed}|event|${Math.floor(r.nextMapEvent)}`) & 1
          ? "sky_split"
          : "deep_fog";
      r.event = event;
      r.eventTime = 45;
      r.nextMapEvent +=
        330 + (hashString(`${r.worldSeed}|${r.nextMapEvent}`) % 100);
      if (event === "sky_split") {
        r.surgeTime = Math.max(r.surgeTime, 45);
        this.announce(
          "O céu se parte",
          "Mais elites e mais ouro por 45 segundos.",
        );
      } else {
        this.announce(
          "Névoa profunda",
          "A visão se fecha; cristais concedem mais experiência.",
        );
      }
    }
  }

  hasSynergy(id: string) {
    return this.run?.synergies?.includes(id);
  }

  discoverSynergies() {
    if (!this.run || !this.player) return;
    const ids = new Set(this.player.weapons.map((w) => w.id));
    for (const [id, s] of Object.entries(SYNERGY_DEFINITIONS)) {
      if (
        s.weapons.every((w) => ids.has(w)) &&
        !this.run.synergies.includes(id)
      ) {
        this.run.synergies.push(id);
        if (!this.save.discovered.synergies.includes(id))
          this.save.discovered.synergies.push(id);
        this.announce("Sinergia descoberta • " + s.name, s.text);
        this.sound.play("evolve");
        this.saveSnapshot(true);
      }
    }
  }

  weightedItem() {
    const luck = this.player?.stats.luck || 1;
    const list = Object.entries(ITEM_DEFINITIONS).map(([id, d]) => ({
      id,
      ...d,
    }));
    return weighted(
      list,
      (o) =>
        o.weight *
        (o.rarity === "rare"
          ? luck
          : o.rarity === "arcane"
            ? Math.sqrt(luck)
            : 1),
    );
  }

  dropItemWeighted(x: number, y: number, itemId: string | null = null) {
    const d = itemId ? ITEM_DEFINITIONS[itemId] : this.weightedItem();
    const id = itemId || d?.id;
    if (
      !id ||
      !ITEM_DEFINITIONS[id] ||
      this.pickups.length >= MAX_WORLD_PICKUPS
    )
      return;
    this.pushPickup({ type: "item", itemId: id, x, y, value: 1, life: 120 });
  }

  addItem(id: string, qty: number = 1) {
    const d = ITEM_DEFINITIONS[id];
    if (!d || !this.run) return false;
    if (!this.save.discovered.items.includes(id))
      this.save.discovered.items.push(id);
    let remaining = Math.max(1, Math.floor(qty));
    for (const slot of this.run.inventory) {
      if (slot?.id === id && slot.qty < d.maxStack) {
        const add = Math.min(remaining, d.maxStack - slot.qty);
        slot.qty += add;
        remaining -= add;
        if (!remaining) {
          this.sound.play("item");
          this.ui.updateHUD();
          this.saveSnapshot(true);
          return true;
        }
      }
    }
    while (remaining > 0) {
      const empty = this.run.inventory.findIndex((s) => !s);
      if (empty < 0) {
        this.pendingItem = { id, qty: remaining };
        this.setState("inventory");
        this.ui.itemOverflow();
        return false;
      }
      const add = Math.min(remaining, d.maxStack);
      this.run.inventory[empty] = { id, qty: add };
      remaining -= add;
    }
    this.sound.play("item");
    this.ui.updateHUD();
    this.saveSnapshot(true);
    return true;
  }

  replaceInventorySlot(index: number) {
    if (this.state !== "inventory" || !this.pendingItem) return;
    const pending = this.pendingItem;
    this.pendingItem = null;
    if (index >= 0 && index < RUN_INVENTORY_SLOTS)
      this.run.inventory[index] = null;
    this.setState("playing");
    this.ui.hide();
    this.addItem(pending.id, pending.qty);
    this.ui.updateHUD();
    this.saveSnapshot(true);
  }

  discardPendingItem() {
    if (this.state !== "inventory") return;
    this.pendingItem = null;
    this.resume();
    this.announce(
      "Item deixado para trás",
      "O inventário permanece inalterado.",
    );
  }

  consumeItem(id: string, qty: number = 1) {
    for (let i = 0; i < this.run.inventory.length; i++) {
      const s = this.run.inventory[i];
      if (s?.id !== id) continue;
      s.qty -= qty;
      if (s.qty <= 0) this.run.inventory[i] = null;
      return true;
    }
    return false;
  }

  useItem(index: number) {
    if (this.state !== "playing" || !this.run?.inventory[index]) return;
    const slot = this.run.inventory[index],
      d = ITEM_DEFINITIONS[slot.id],
      p = this.player;
    if (!d) return;
    if (d.use === "heal" && p.health >= p.maxHealth) {
      this.announce(d.name, "Sua vitalidade já está completa.");
      return;
    }
    if (d.use === "key") {
      this.announce(d.name, "Ela reage apenas diante de um cofre basáltico.");
      return;
    }
    if (d.use === "heal") {
      const n = Math.ceil(p.maxHealth * 0.38);
      p.health = Math.min(p.maxHealth, p.health + n);
      this.float(p.x, p.y, "+" + n, "#89edba", 20);
    }
    if (d.use === "bomb") {
      this.blast(
        p.x,
        p.y,
        Math.max(this.viewW, this.viewH) * 0.72,
        300 * p.stats.damage,
        null,
      );
      this.shake = 12;
    }
    if (d.use === "slow") {
      for (const e of this.enemies)
        if (!e.dead) applyStatus(e, "slow", 6, 0.68, null);
    }
    if (d.use === "buff") p.buff = Math.max(p.buff, 14);
    if (d.use === "veil") p.invulnerable = Math.max(p.invulnerable, 4);
    if (d.use === "magnet") for (const gem of this.gems) gem.magnet = true;
    if (d.use === "luck") p.luckBuff = Math.max(p.luckBuff, 30);
    this.consumeItem(slot.id, 1);
    this.run.itemsUsed++;
    this.sound.play("item");
    this.spark(p.x, p.y, d.rarity === "arcane" ? "#f0cb82" : "#9edcc1", 14);
    this.announce(d.name, d.text);
    this.ui.updateHUD();
    this.saveSnapshot(true);
  }

  interact() {
    if (this.state !== "playing" || !this.world?.interactive) return;
    this.ui.structureInteraction(this.world.interactive);
  }

  resolveStructure(s: T.Structure, accept: boolean = true) {
    if (!s || s.destroyed || s.used || s.opened) {
      this.resume();
      return;
    }
    const p = this.player,
      r = this.run;
    const used = () => {
      this.world.mark(s, { used: true });
      r.structuresUsed++;
      if (r.telemetry) r.telemetry.structures++;
      if (!this.save.discovered.structures.includes(s.type))
        this.save.discovered.structures.push(s.type);
      this.sound.play("interact");
      this.saveSnapshot(true);
    };
    if (!accept) {
      this.resume();
      return;
    }

    if (s.type === "fountain") {
      p.health = Math.min(p.maxHealth, p.health + p.maxHealth * 0.42);
      used();
      this.announce(
        "Fonte de Seiva",
        "A água escurece depois de restaurar sua vitalidade.",
      );
    } else if (s.type === "exchange") {
      r.usedExchange = true;
      const cost = Math.max(1, Math.floor(p.health * 0.25));
      p.health = Math.max(1, p.health - cost);
      used();
      const roll = Math.random();
      if (roll < 0.3) {
        r.rerolls++;
        this.announce(
          "Troca selada",
          "O altar devolveu uma nova chance de reroll.",
        );
      } else if (roll < 0.55) {
        r.banishments++;
        this.announce(
          "Troca selada",
          "O altar concedeu um banimento adicional.",
        );
      } else if (roll < 0.8) {
        const item = this.weightedItem();
        this.dropItemWeighted(p.x + 24, p.y, item.id);
        this.announce(
          "Troca selada",
          `${item.name} foi deixado diante do altar.`,
        );
      } else {
        p.buff = Math.max(p.buff, 35);
        p.luckBuff = Math.max(p.luckBuff, 35);
        this.announce(
          "Troca selada",
          "Âmbar prolongado fortalece dano e fortuna no próximo trecho.",
        );
      }
    } else if (s.type === "memory") {
      if (r.gold < 35) {
        this.announce("Altar da Memória", "São necessários 35 ecos de ouro.");
        this.resume();
        return;
      }
      r.gold -= 35;
      p.xp += p.xpToNextLevel * 0.55;
      used();
      this.announce("Memória comprada", "Ouro se converte em experiência.");
    } else if (s.type === "rift_altar") {
      used();
      r.riftPending = { id: s.id, count: 4, x: s.x, y: s.y };
      for (let i = 0; i < 4; i++) {
        const e = this.spawn("elite", rand(0, TAU));
        if (e) e.riftSource = s.id;
      }
      this.announce(
        "A fenda responde",
        "Quatro arautos precisam cair para liberar a recompensa.",
      );
    } else if (s.type === "silence") {
      used();
      r.silenceTime = 20;
      r.silenceAfter = 20;
      this.announce(
        "O mundo se cala",
        "Menos aparições por 20 s. Depois, a dívida chega.",
      );
    } else if (s.type === "chest") {
      if (!this.consumeItem("basalt_key", 1)) {
        this.announce("Cofre Basáltico", "Uma Chave Basáltica é necessária.");
        this.resume();
        return;
      }
      this.world.mark(s, { opened: true, used: true });
      r.structuresUsed++;
      if (r.telemetry) r.telemetry.structures++;
      r.gold += 80;
      r.rerolls++;
      this.dropItemWeighted(p.x + 22, p.y, this.weightedItem().id);
      this.dropItemWeighted(p.x - 22, p.y, this.weightedItem().id);
      this.announce(
        "Cofre aberto",
        "80 ouro, um reroll e duas relíquias foram reveladas.",
      );
    } else if (s.type === "obelisk") {
      used();
      r.rerolls++;
      p.luckBuff = Math.max(p.luckBuff, 45);
      this.announce(
        "Obelisco Fraturado",
        "Sua rota ressoa: +1 reroll e fortuna temporária.",
      );
    }
    this.resume();
    this.ui.updateHUD();
    this.saveSnapshot(true);
    this.maybeLevelUp();
  }

  currentInteractionText() {
    const s = this.world?.interactive;
    return s ? STRUCTURE_DEFINITIONS[s.type]?.name || "INTERAGIR" : "";
  }

  movePlayer(p: Player, move: T.Vec, dt: number) {
    const oldX = p.x,
      oldY = p.y;
    const moveSpeed = p.speed * (p.inWater ? 0.88 : 1);
    let nx = p.x + move.x * moveSpeed * dt;
    let ny = p.y + move.y * moveSpeed * dt;
    if (this.world)
      ({ x: nx, y: ny } = this.world.resolvePlayerMove(
        oldX,
        oldY,
        nx,
        ny,
        p.r,
      ));
    p.x = nx;
    p.y = ny;

    if (Math.hypot(move.x, move.y) > 0.05) {
      const d = Math.hypot(move.x, move.y);
      p.dx = move.x / d;
      p.dy = move.y / d;
    }
  }

  update(dt: number) {
    if (this.state !== "playing" || !this.player) return;

    const p = this.player;
    const r = this.run;

    r.time += dt * this.clockRate;
    r.simTime += dt;
    r.telemetry ??= telemetry();
    for (const minute of [5, 10, 15, 20, 25, 30])
      if (r.time >= minute * 60 && r.telemetry.levels[minute] === undefined)
        r.telemetry.levels[minute] = p.level;

    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.buff = Math.max(0, p.buff - dt);
    p.luckBuff = Math.max(0, p.luckBuff - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.health = Math.min(p.maxHealth, p.health + p.stats.recovery * dt);
    r.autosave -= dt;
    r.eventTime = Math.max(0, r.eventTime - dt);
    r.silenceTime = Math.max(0, r.silenceTime - dt);
    r.surgeTime = Math.max(0, r.surgeTime - dt);

    this.movePlayer(p, this.input.vector(), dt);

    this.camera.x = p.x;
    this.camera.y = p.y;
    this.shake = Math.max(0, this.shake - dt * 28);
    this.world?.update();
    this.world?.updateHazards(dt);
    this.updateMapEvents(dt);
    if (r.autosave <= 0) this.saveSnapshot();

    this.director.update(this, dt);
    this.updateEnemies(dt);

    if (this.state !== "playing") return;

    this.grid.rebuild(this.enemies);

    for (const w of p.weapons) w.update(this, dt);

    this.updateBullets(dt);
    if (this.state !== "playing") return;

    this.updateAreas(dt);
    if (this.state !== "playing") return;

    this.updateDrops(dt);
    if (this.state !== "playing") return;
    this.updateEffects(dt);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) removeAt(this.enemies, i);
    }

    this.hudClock -= dt;

    if (this.hudClock <= 0) {
      this.hudClock = 0.12;
      this.ui.updateHUD();
      this.checkAchievements();
    }

    if (this.state !== "playing") return;

    const duration = this.modeDef.endless ? null : this.expeditionProfile.duration;
    if (
      this.modeDef.endless &&
      r.time >= this.modeDef.endlessStart &&
      !r.endlessAnnounced
    ) {
      r.endlessAnnounced = true;
      this.announce("ALÉM DO LIMIAR", "A névoa já não conhece limites.");
      this.sound.play("phase");
      this.saveSnapshot(true);
    } else if (
      !this.modeDef.endless &&
      duration != null &&
      r.time >= duration &&
      !r.completed
    ) {
      r.completed = true;
      r.completionGold = r.gold;
      this.spawn("final");
      this.checkAchievements();
      this.setState("goal");
      this.sound.play("boss");
      this.ui.goal();
      return;
    }

    this.maybeLevelUp();
  }

  findValidSpawnPosition(angle: number | null = null) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = angle ?? rand(0, TAU);
      const hw = this.viewW / 2 + 95,
        hh = this.viewH / 2 + 95;
      const distance =
        Math.min(
          hw / (Math.abs(Math.cos(a)) || 0.0001),
          hh / (Math.abs(Math.sin(a)) || 0.0001),
        ) + rand(20, 100);
      const x = this.camera.x + Math.cos(a) * distance,
        y = this.camera.y + Math.sin(a) * distance;
      this.world?.ensureChunkAt(x, y);
      let blocked = false;
      this.world?.query(x, y, 42, (s) => {
        if (STRUCTURE_DEFINITIONS[s.type]?.collidable) blocked = true;
      });
      if (!blocked) return { x, y, a };
    }
    return { x: this.camera.x + this.viewW / 2 + 120, y: this.camera.y, a: 0 };
  }

  spawn(
    type: string,
    angle: number | null = null,
    event: T.BossEvent | null = null,
  ) {
    if (!Object.hasOwn(ENEMY_DEFINITIONS, type)) return null;
    const pos = this.findValidSpawnPosition(angle);
    return this.spawnAt(type, pos.x, pos.y, event);
  }

  spawnAt(
    type: string,
    x: number,
    y: number,
    event: T.BossEvent | null = null,
    restore: Partial<T.Enemy> | null = null,
  ) {
    const d = ENEMY_DEFINITIONS[type];
    if (!d) return null;
    const priority = type === "boss" || type === "final" || type === "elite";
    if (
      (!priority && this.enemies.length >= MAX_ACTIVE_ENEMIES) ||
      (priority && !this.canSpawnPriority())
    )
      return null;
    const min = this.run.time / 60;
    const modeScale = this.modeScaling();
    const temporalMinute = this.modeDef.endless ? Math.min(min, 30) : min;
    const temporalHp =
      (1 + 0.1 * temporalMinute + 0.006 * temporalMinute * temporalMinute) *
      (this.world?.map.waveModifiers?.hp || 1);
    const bossLike = type === "boss" || type === "final";
    const elite = type === "elite";
    const hpMode = bossLike
      ? modeScale.bossHp
      : elite
        ? modeScale.hp * modeScale.eliteHp
        : modeScale.hp;
    const damageMode = bossLike
      ? modeScale.bossDamage
      : elite
        ? modeScale.damage * modeScale.eliteDamage
        : modeScale.damage;
    const hpScale = (type === "final" ? 1 : temporalHp) * hpMode;
    const e: T.Enemy = {
      ...d,
      type,
      id: restore?.id || ++this.enemyId,
      x,
      y,
      hp: d.hp * hpScale,
      maxHp: d.hp * hpScale,
      speed:
        d.speed *
        (1 + Math.min(0.32, temporalMinute * 0.007)) *
        modeScale.speed,
      damage: d.damage * (1 + temporalMinute * 0.04) * damageMode,
      name: event?.name || d.name,
      pattern: event?.pattern || "ring",
      bossEventIndex: event?.eventIndex ?? null,
      dead: false,
      kx: 0,
      ky: 0,
      flash: 0,
      attack: rand(1.5, 3.5),
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
      specialClock: rand(1.2, 3.5),
    };
    if (restore)
      Object.assign(e, restore, {
        dead: false,
        statuses: restore.statuses || {},
      });
    this.enemies.push(e);
    if (!this.save.discovered.enemies.includes(type))
      this.save.discovered.enemies.push(type);
    return e;
  }

  updateStatusEffects(e: T.Enemy, dt: number) {
    for (const [id, s] of Object.entries(e.statuses || {})) {
      s.duration -= dt;
      if ((id === "burn" || id === "poison") && s.duration > 0) {
        s.tick = (s.tick || 0) - dt;
        if (s.tick <= 0) {
          s.tick = STATUS_DEFINITIONS[id].tick || 0.5;
          const source = s.source;
          const base =
            (id === "burn" ? 4.5 : 3.2) *
            Math.max(1, s.stacks) *
            Math.max(0.5, s.magnitude || 1);
          this.damageEnemy(
            e,
            base *
              (source?.values
                ? source.values(this.ownerOf(source)).damage /
                  Math.max(1, source.definition.damage)
                : 1),
            source,
            0,
            false,
            { status: id },
          );
          if (e.dead) return;
        }
      }
      if (s.duration <= 0) delete e.statuses[id];
    }
  }

  updateBossPhase(e: T.Enemy) {
    if (e.type !== "boss" && e.type !== "final") return;
    const ratio = e.hp / Math.max(1, e.maxHp);
    const phase = ratio <= 0.3 ? 3 : ratio <= 0.6 ? 2 : 1;
    if (phase <= e.bossPhase) return;
    e.bossPhase = phase;
    e.wind = Math.max(e.wind, 0.8);
    e.attack = Math.max(e.attack, 0.8);
    this.shake = Math.max(this.shake, 10);
    this.hitstop = 0.035;
    this.spark(e.x, e.y, e.color, 30);
    this.ring(e.x, e.y, e.r * 2.2, "#f0c5b8");
    this.sound.play("phase");
    const names = BOSS_PHASES[e.name] || BOSS_PHASES.default;
    this.announce(e.name, names[phase - 1]);
    this.saveSnapshot(true);
  }

  updateEnemies(dt: number) {
    const far = Math.max(this.viewW, this.viewH) * 2.2 + 600;
    const heralds = this.enemies.filter(
      (e) => !e.dead && e.behavior === "herald",
    );

    for (const e of this.enemies) {
      if (e.dead) continue;
      const p = this.nearestPlayer(e);
      const dx = p.x - e.x,
        dy = p.y - e.y,
        d = Math.hypot(dx, dy) || 1;
      const special = e.type === "boss" || e.type === "final";
      if (d > far && !special && e.type !== "elite") {
        e.dead = true;
        continue;
      }

      e.flash = Math.max(0, e.flash - dt);
      this.updateStatusEffects(e, dt);
      if (e.dead) continue;
      this.updateBossPhase(e);

      const frozen = hasStatus(e, "freeze");
      const slow = hasStatus(e, "slow")
        ? clamp(e.statuses.slow.magnitude || 0.48, 0.12, 0.9)
        : 1;
      if (frozen) continue;

      let speed = e.speed * slow;
      if (
        this.world?.map.water &&
        this.world.isWater(e.x, e.y) &&
        !["burrow", "weaver"].includes(e.behavior)
      )
        speed *= 0.94;
      let mx = dx / d,
        my = dy / d;
      if (
        heralds.some(
          (h) => h !== e && (h.x - e.x) ** 2 + (h.y - e.y) ** 2 < 190 ** 2,
        )
      )
        speed *= 1.18;

      if (e.behavior === "ranged") {
        e.attack -= dt;
        if (e.attack <= 0.55 && e.wind === 0) {
          e.wind = 0.55;
          e.aimX = mx;
          e.aimY = my;
        }
        if (e.attack <= 0) {
          this.hostile(e, e.aimX, e.aimY, 155);
          e.attack = 3.2;
          e.wind = 0;
        }
        if (d < 255) {
          mx = -mx;
          my = -my;
        } else if (d < 340) {
          mx = (-dy / d) * 0.3;
          my = (dx / d) * 0.3;
        }
      }

      if (e.behavior === "burrow") {
        e.specialClock -= dt;
        if (e.specialClock < 0.65 && e.burrow === 0) {
          e.burrow = 1;
          e.wind = 0.65;
          e.aimX = mx;
          e.aimY = my;
        }
        if (e.specialClock <= 0) {
          const a = rand(0, TAU),
            dist = rand(120, 190);
          e.x = p.x + Math.cos(a) * dist;
          e.y = p.y + Math.sin(a) * dist;
          e.specialClock = rand(4.5, 6);
          e.burrow = 0;
          e.wind = 0;
          this.ring(e.x, e.y, 36, "#bca69c");
        }
        if (e.burrow) speed *= 0.05;
      }

      if (e.behavior === "sentinel") {
        e.specialClock -= dt;
        if (e.specialClock <= 0) {
          e.shield = e.shield > 0 ? 0 : 2.2;
          e.specialClock = e.shield ? 4.8 : 2.3;
        }
        e.shield = Math.max(0, e.shield - dt);
        if (d < 180) speed *= 0.65;
      }

      if (e.behavior === "herald") {
        e.specialClock -= dt;
        if (e.specialClock <= 0) {
          e.specialClock = 4.2;
          this.ring(e.x, e.y, 190, "#d0af77");
          for (const other of this.enemies)
            if (
              !other.dead &&
              other !== e &&
              (other.x - e.x) ** 2 + (other.y - e.y) ** 2 < 190 ** 2
            )
              applyStatus(other, "shock", 1.2, 0.35, null);
        }
        if (d < 270) {
          mx = -mx * 0.45;
          my = -my * 0.45;
        }
      }

      if (e.behavior === "charger") {
        e.attack -= dt;
        if (e.attack <= 0.72 && e.wind === 0 && e.charge <= 0) {
          e.wind = 0.72;
          e.aimX = mx;
          e.aimY = my;
        }
        if (e.attack <= 0 && e.charge <= 0) {
          e.charge = 0.72;
          e.wind = 0;
          e.attack = 3.8;
        }
        if (e.charge > 0) {
          e.charge -= dt;
          mx = e.aimX;
          my = e.aimY;
          speed = 355;
        }
      }

      if (e.behavior === "weaver") {
        e.specialClock -= dt;
        if (e.specialClock < 0.75 && e.wind === 0) e.wind = 0.75;
        if (e.specialClock <= 0) {
          this.enemyHazard(
            p.x + rand(-90, 90),
            p.y + rand(-90, 90),
            48,
            e.damage * 0.55,
            4.5,
            0.65,
            "web",
          );
          e.specialClock = rand(4.5, 6);
          e.wind = 0;
        }
        if (d < 300) {
          mx = (-dy / d) * 0.45;
          my = (dx / d) * 0.45;
        }
      }

      if (special) {
        e.attack -= dt * this.modeScaling().bossAttack;
        if (e.type === "final")
          speed += Math.min(280, Math.max(0, this.run.time - 1800) * 0.6);
        const windTime = e.bossPhase >= 3 ? 0.48 : 0.65;
        if (e.attack < windTime && e.wind === 0) {
          e.wind = windTime;
          e.aimX = dx / d;
          e.aimY = dy / d;
        }
        if (e.attack <= 0) {
          e.wind = 0;
          e.phase++;
          const phase = e.bossPhase || 1;
          if (e.pattern === "charge") {
            e.charge = phase >= 2 ? 1.25 : 1;
            e.attack = phase >= 3 ? 2.5 : 4.1;
          } else {
            const base =
              e.pattern === "spiral" ? 9 : e.pattern === "pulse" ? 22 : 14;
            const n = base + (phase - 1) * 4;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU + e.phase * 0.31;
              this.hostile(
                e,
                Math.cos(a),
                Math.sin(a),
                (e.pattern === "pulse" ? 140 : 112) * (1 + 0.12 * (phase - 1)),
              );
            }
            if (
              phase >= 2 &&
              (e.name === "A Catedral Errante" || e.pattern === "pulse")
            ) {
              for (let i = 0; i < phase; i++)
                this.enemyHazard(
                  p.x + rand(-180, 180),
                  p.y + rand(-180, 180),
                  55,
                  e.damage * 0.45,
                  3.5,
                  0.8,
                  "rift",
                );
            }
            if (e.pattern === "summon" || e.type === "final" || phase >= 3) {
              const count = phase >= 3 ? 9 : 7;
              for (
                let i = 0;
                i < count && this.enemies.length < this.currentEnemyCap();
                i++
              )
                this.spawn(phase >= 3 && i % 3 === 0 ? "charger" : "swarm");
            }
            e.attack =
              e.type === "final"
                ? 1.9
                : e.pattern === "spiral"
                  ? phase >= 3
                    ? 1.15
                    : 1.7
                  : phase >= 3
                    ? 2.6
                    : 4.4;
          }
        }
        if (e.wind > 0) speed *= 0.15;
        if (e.charge > 0) {
          e.charge -= dt;
          mx = e.aimX;
          my = e.aimY;
          speed = 330 * (1 + 0.12 * (e.bossPhase - 1));
        }
      }

      const avoid = this.world?.avoidEnemy(e, mx, my) || { x: mx, y: my };
      mx = avoid.x;
      my = avoid.y;
      e.x += (mx * speed + e.kx) * dt;
      e.y += (my * speed + e.ky) * dt;
      e.kx *= Math.exp(-9 * dt);
      e.ky *= Math.exp(-9 * dt);
      if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (p.r + e.r) ** 2)
        this.hurtPlayer(e.damage * (e.behavior === "herald" ? 1.05 : 1), p);
      if (this.state !== "playing") return;
      e.wind = Math.max(0, e.wind - dt);
    }
  }

  hostile(e: T.Enemy, dx: number, dy: number, speed: number) {
    this.projectile(null, e.x, e.y, dx * speed, dy * speed, {
      enemy: true,
      damage: e.damage,
      r: 6,
      life: 6,
      color: "#e49ead",
    });
  }

  projectile(
    w: Weapon | null,
    x: number,
    y: number,
    vx: number,
    vy: number,
    o: Partial<T.Bullet> = {},
  ) {
    const b = this.bullets.take();
    if (!b) return;

    b.id = ++this.projectileId;
    b.hitIds.clear();

    Object.assign(
      b,
      {
        x,
        y,
        px: x,
        py: y,
        vx,
        vy,
        originX: x,
        originY: y,
        r: 6,
        life: 2,
        age: 0,
        damage: 1,
        pierce: 0,
        source: w,
        enemy: false,
        color: w?.definition.color || "#eee",
        kind: "bolt",
        returned: false,
        knock: 50,
        blast: 0,
      },
      o,
    );

    if (w) w.shots++;
    return b;
  }

  updateBullets(dt: number) {
    for (let i = this.bullets.items.length - 1; i >= 0; i--) {
      const b = this.bullets.items[i];
      const p = this.ownerOf(b.source);

      b.age += dt;
      b.life -= dt;
      b.px = b.x;
      b.py = b.y;

      if (b.kind === "disc" && b.age > 0.65) {
        if (!b.returned) {
          b.id = ++this.projectileId;
          b.hitIds.clear();
          b.returned = true;
        }

        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.hypot(dx, dy) || 1;

        b.vx = (dx / d) * 390;
        b.vy = (dy / d) * 390;

        if (d < 22) {
          if (b.blast) {
            this.blast(b.x, b.y, b.blast, b.damage, b.source);
          }
          b.life = 0;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (!b.enemy && b.source)
        this.world?.damageBreakablesAt(b.x, b.y, b.r + 3, b.damage * 0.22);

      if (b.enemy) {
        for (const target of this.combatPlayers())
          if (
            segmentDistance2(target.x, target.y, b.px, b.py, b.x, b.y) <
            (target.r + b.r) ** 2
          ) {
            this.hurtPlayer(b.damage, target);
            b.life = 0;
            break;
          }
      } else if (b.life > 0) {
        const mx = (b.x + b.px) / 2;
        const my = (b.y + b.py) / 2;
        const reach = Math.hypot(b.x - b.px, b.y - b.py) / 2 + b.r + 68;

        this.grid.query(mx, my, reach, (e) => {
          if (b.life <= 0 || b.hitIds.has(e.id)) return;

          if (
            segmentDistance2(e.x, e.y, b.px, b.py, b.x, b.y) <
            (e.r + b.r) ** 2
          ) {
            b.hitIds.add(e.id);
            const hitDamage =
              b.kind === "disc" && b.returned && b.source?.path === "mirror"
                ? b.damage * 1.6
                : b.damage;
            this.damageEnemy(e, hitDamage, b.source, b.knock);

            if (b.blast && b.kind !== "disc") {
              this.blast(b.x, b.y, b.blast, b.damage * 0.65, b.source);
            }

            if (--b.pierce < 0) b.life = 0;
          }
        });
      }

      if (
        b.life <= 0 ||
        this.playersForWorld().every(
          (target) =>
            Math.abs(b.x - target.x) > this.viewW + 450 ||
            Math.abs(b.y - target.y) > this.viewH + 450,
        )
      ) {
        this.bullets.remove(i);
      }
    }
  }

  damageEnemy(
    e: T.Enemy,
    damage: number,
    w: Weapon | null,
    knock = 0,
    allowCrit = true,
    opts: { status?: string; area?: boolean; synergy?: boolean } = {},
  ): boolean {
    const previous = this.player;
    this.player = this.ownerOf(w);
    try {
      return this.applyDamage(e, damage, w, knock, allowCrit, opts);
    } finally {
      this.player = previous;
    }
  }

  applyDamage(
    e: T.Enemy,
    damage: number,
    w: Weapon | null,
    knock: number = 0,
    allowCrit: boolean = true,
    opts: { status?: string; area?: boolean; synergy?: boolean } = {},
  ) {
    if (e.dead || e.hp <= 0) return false;
    let dealt = damage;
    if (e.behavior === "sentinel" && e.shield > 0 && !opts.status && !opts.area)
      dealt *= 0.42;
    const markCrit =
      w?.id === "spear" && w.path === "omen" && hasStatus(e, "mark");
    const critical =
      allowCrit &&
      (Math.random() <
        this.player.stats.critChance + (this.player.luckBuff > 0 ? 0.05 : 0) ||
        markCrit);
    const amount = Math.min(e.hp, dealt * (critical ? 1.8 : 1));
    if (w) {
      e.lastHitWeapon = w.id;
      e.lastHitOwner = w.ownerId || undefined;
    }
    e.hp -= amount;
    e.flash = 0.085;
    this.run.totalDamage += amount;
    if (w) {
      w.damageDealt += amount;
      w.hits++;
    }

    if (w && !opts.status) {
      const mods = w.path ? WEAPON_PATHS[w.id]?.[w.path]?.mods || {} : {};
      if (mods.burn) applyStatus(e, "burn", 3.6, 1, w);
      if (mods.mark) applyStatus(e, "mark", 4, 1, w);
      if (w.id === "orbit" && this.hasSynergy("ember_orbit"))
        applyStatus(e, "burn", 2, 0.6, w);
      if (
        w.id === "chain" &&
        w.path === "storm" &&
        Object.keys(e.statuses).length &&
        !opts.synergy
      ) {
        this.damageEnemy(e, amount * 0.32, w, 0, false, { synergy: true });
      }
      if (
        w.id === "chain" &&
        hasStatus(e, "freeze") &&
        this.hasSynergy("frozen_current") &&
        !opts.synergy
      ) {
        this.damageEnemy(e, amount * 0.38, w, 0, false, { synergy: true });
        this.ring(e.x, e.y, 30, "#d6f5ff");
      }
      if (
        w.id === "chain" &&
        hasStatus(e, "mark") &&
        this.hasSynergy("marked_void") &&
        !opts.synergy
      ) {
        this.damageEnemy(e, amount * 0.28, w, 0, false, { synergy: true });
      }
      if (
        w.id === "disc" &&
        hasStatus(e, "slow") &&
        (this.hasSynergy("nacre_rime") || w.path === "hail") &&
        !opts.synergy
      ) {
        const other = this.grid.nearest(e.x, e.y, 105, new Set([e.id]));
        if (other) {
          this.damageEnemy(other, amount * 0.24, w, 0, false, {
            synergy: true,
          });
          applyStatus(other, "slow", 1.4, 0.55, w);
        }
        if (Math.random() < 0.12) applyStatus(e, "freeze", 0.32, 1, w);
      }
      if (
        w.id === "meteor" &&
        w.path === "comet" &&
        hasStatus(e, "freeze") &&
        !opts.synergy
      ) {
        this.damageEnemy(e, amount * 0.3, w, 0, false, { synergy: true });
        this.ring(e.x, e.y, 42, "#bfeaff");
      }
      if (
        w.id === "ember" &&
        hasStatus(e, "mark") &&
        this.hasSynergy("ember_orbit") &&
        !opts.synergy
      ) {
        this.blast(e.x, e.y, 34, amount * 0.22, w, 0, 0, {
          noStructure: true,
          synergy: true,
        });
      }
    }

    if (knock && e.resist < 1) {
      const dx = e.x - this.player.x,
        dy = e.y - this.player.y,
        d = Math.hypot(dx, dy) || 1;
      const mult = w?.path === "bastion" ? 1.8 : 1;
      e.kx += (dx / d) * knock * (1 - e.resist) * mult;
      e.ky += (dy / d) * knock * (1 - e.resist) * mult;
    }

    const numberChance =
      this.enemies.length >= 600
        ? 0.12
        : this.enemies.length >= 350
          ? 0.2
          : 0.35;
    if (
      this.save.settings.numbers &&
      Math.random() < (critical ? 1 : numberChance)
    ) {
      this.float(
        e.x,
        e.y,
        Math.ceil(amount),
        critical ? "#ffe399" : "#dbe5df",
        critical ? 18 : 12,
      );
    }
    this.spark(e.x, e.y, w?.definition.color || "#ffdfb2", critical ? 4 : 2);
    this.sound.play("hit");
    if (critical && (amount > 80 || e.type === "boss"))
      this.hitstop = Math.max(this.hitstop, 0.022);

    if (e.dead) return true; // A secondary synergy hit may already have settled this enemy.
    if (e.hp <= 0) {
      const wasFrozen = hasStatus(e, "freeze");
      e.dead = true;
      this.run.kills++;
      if (w) w.kills++;
      this.dropXP(e.x, e.y, e.xp);

      if (
        e.behavior === "splitter" &&
        this.enemies.length < MAX_ACTIVE_ENEMIES
      ) {
        for (
          let i = 0;
          i < 3 && this.enemies.length < MAX_ACTIVE_ENEMIES;
          i++
        ) {
          const a = (i / 3) * TAU + rand(-0.2, 0.2);
          this.spawnAt(
            "shardling",
            e.x + Math.cos(a) * 18,
            e.y + Math.sin(a) * 18,
          );
        }
      }

      if (
        wasFrozen &&
        w &&
        ((w.id === "frost" && w.path === "rupture") ||
          (w.id === "meteor" && this.hasSynergy("shattered_sky")))
      ) {
        this.blast(e.x, e.y, 64, Math.max(14, amount * 0.45), w, 1.2, 0, {
          noStructure: true,
        });
      }

      if (e.riftSource && this.run.riftPending?.id === e.riftSource) {
        this.run.riftPending.count--;
        if (this.run.riftPending.count <= 0) {
          this.pushPickup({
            type: "chest",
            x: e.x,
            y: e.y,
            value: 180,
            life: Infinity,
            worldReward: true,
          });
          this.run.riftPending = null;
          this.announce(
            "A fenda se fecha",
            "Um baú enriquecido permaneceu no chão.",
          );
          this.saveSnapshot(true);
        }
      } else if (e.type === "boss" || e.type === "final") {
        this.pushPickup({
          type: "chest",
          x: e.x,
          y: e.y,
          value: 100,
          life: Infinity,
        });
        {
          this.run.bossKills++;
          this.run.restUntil = this.run.time + PROGRESSION.bossRest;
          this.run.telemetry ??= telemetry();
          this.run.telemetry.bossKills.push(this.run.time);
          if ((e.bossPhase || 1) >= 3)
            this.run.phase3BossKills = (this.run.phase3BossKills || 0) + 1;
          if (
            e.bossEventIndex != null &&
            !this.run.bossHistory.includes(e.bossEventIndex)
          )
            this.run.bossHistory.push(e.bossEventIndex);
        }
        this.spark(e.x, e.y, "#f4d69e", 28);
        this.saveSnapshot(true);
      } else {
        const luck =
          this.player.stats.luck *
          (this.player.luckBuff > 0 ? 1.45 : 1) *
          (this.run.surgeTime > 0 ? 1.15 : 1);
        const goldChance = clamp(
          0.055 * luck * this.modeScaling().goldDrop,
          0,
          0.12,
        );
        if (Math.random() < goldChance)
          this.drop(
            "gold",
            e.x + 9,
            e.y,
            Math.ceil(rand(1, 3) * (this.run.surgeTime > 0 ? 1.5 : 1)),
          );
        const roll = Math.random() / luck;
        if (roll < 0.0045) this.dropItemWeighted(e.x, e.y);
        else if (roll < 0.011) this.drop("heal", e.x - 8, e.y, 25);
        else if (roll < 0.013) this.drop("magnet", e.x, e.y);
        else if (roll < 0.0145) this.drop("bomb", e.x, e.y);
        else if (roll < 0.017) this.drop("buff", e.x, e.y);
      }

      if (w?.evolved && w.id === "well")
        this.player.health = Math.min(
          this.player.maxHealth,
          this.player.health + 0.35,
        );
      return true;
    }
    return false;
  }

  hurtPlayer(damage: number, p: Player = this.player) {
    if (p.invulnerable > 0 || this.debug.god || this.state !== "playing") {
      return;
    }

    const loss = Math.max(1, damage - p.armor);

    p.health = Math.max(0, p.health - loss);
    p.invulnerable = 0.55;
    p.hurtFlash = 0.16;
    this.shake = 7;

    this.float(p.x, p.y - 22, "−" + Math.ceil(loss), "#ff9297", 20);
    this.sound.play("hurt");

    if (p.health <= 0) this.finish(false);
  }

  blast(
    x: number,
    y: number,
    r: number,
    damage: number,
    w: Weapon | null,
    slow: number = 0,
    freeze: number = 0,
    opts: { noStructure?: boolean; synergy?: boolean } = {},
  ) {
    if (w) {
      this.fxEvents.push({ id: `${this.run.simTime.toFixed(3)}-${++this.fxSequence}`, tick: Math.floor(this.run.simTime * 25), ownerId: w.ownerId || null, weapon: w.id, x, y, radius: r, variant: w.evolved ? "evolved" : "normal" });
      if (this.fxEvents.length > 256) this.fxEvents.splice(0, this.fxEvents.length - 256);
    }
    this.grid.query(x, y, r + 68, (e) => {
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.r) ** 2) {
        this.damageEnemy(e, damage, w, 110, true, {
          area: true,
          synergy: opts.synergy,
        });
        if (slow > 0)
          applyStatus(
            e,
            "slow",
            slow,
            w?.id === "frost" && w.path === "rime" ? 0.32 : 0.48,
            w,
          );
        if (
          freeze > 0 &&
          e.type !== "boss" &&
          e.type !== "elite" &&
          e.type !== "final"
        )
          applyStatus(e, "freeze", freeze, 1, w);
      }
    });
    if (!opts.noStructure) this.world?.damageBreakablesAt(x, y, r, damage);
    this.ring(x, y, r, w?.definition.color || "#fff0b6");
    this.spark(x, y, w?.definition.color || "#fff0b6", 12);
  }

  ring(x: number, y: number, r: number, color: string) {
    if (this.lines.length < 100) {
      this.lines.push({
        kind: "ring",
        x,
        y,
        r,
        color,
        life: 0.32,
        max: 0.32,
      });
    }
  }

  area(
    x: number,
    y: number,
    r: number,
    damage: number,
    w: Weapon | null,
    life: number,
    delay: number = 0,
    kind: string = "pool",
  ) {
    if (this.areas.length >= 80) return;
    this.areas.push({
      x,
      y,
      r,
      damage,
      w,
      life,
      delay,
      kind,
      tick: 0,
      armed: delay <= 0,
      enemy: false,
    });
  }

  enemyHazard(
    x: number,
    y: number,
    r: number,
    damage: number,
    life: number = 3,
    delay: number = 0.6,
    kind: string = "rift",
  ) {
    if (this.areas.length >= 80) return;
    this.areas.push({
      x,
      y,
      r,
      damage,
      w: null,
      life,
      delay,
      kind,
      tick: 0,
      armed: delay <= 0,
      enemy: true,
    });
  }

  updateAreas(dt: number) {
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      if (!a.armed) {
        a.delay -= dt;
        if (a.delay <= 0) {
          a.armed = true;
          if (a.enemy) {
            a.tick = 0;
            this.ring(a.x, a.y, a.r, a.kind === "web" ? "#78b7aa" : "#c07395");
          } else {
            this.blast(a.x, a.y, a.r, a.damage, a.w);
            this.shake = Math.max(this.shake, 3);
            if (a.w?.evolved) {
              a.kind = "pool";
              a.life = 2.8;
              a.damage *= 0.17;
            } else a.life = 0;
          }
        }
      } else {
        a.life -= dt;
        a.tick -= dt;
        if (a.enemy) {
          if (a.tick <= 0 && a.life > 0) {
            a.tick = 0.5;
            for (const p of this.combatPlayers())
              if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 < (p.r + a.r) ** 2) {
                if (a.kind === "web") {
                  this.hurtPlayer(a.damage * 0.55, p);
                } else this.hurtPlayer(a.damage, p);
                if (this.state !== "playing") return;
              }
          }
        } else {
          if (a.tick <= 0 && a.life > 0) {
            a.tick = 0.45;
            this.grid.query(a.x, a.y, a.r + 68, (e) => {
              if ((e.x - a.x) ** 2 + (e.y - a.y) ** 2 < (a.r + e.r) ** 2) {
                this.damageEnemy(e, a.damage, a.w, 0, false, { area: true });
                if (a.w?.id === "well") {
                  const mods = a.w.path
                    ? WEAPON_PATHS.well[a.w.path]?.mods || {}
                    : {};
                  if (mods.burn || this.hasSynergy("burning_garden"))
                    applyStatus(e, "burn", 2.4, mods.burn ? 1 : 0.7, a.w);
                }
              }
            });
          }
          if (a.w?.id === "well" && (a.w.evolved || a.w?.path === "gravity")) {
            this.grid.query(a.x, a.y, a.r + 90, (e) => {
              const dx = a.x - e.x,
                dy = a.y - e.y,
                d = Math.hypot(dx, dy) || 1;
              if (d > 15 && d < a.r + 90) {
                const pull = a.w?.path === "gravity" ? 95 : 65;
                e.x += (dx / d) * pull * (1 - e.resist) * dt;
                e.y += (dy / d) * pull * (1 - e.resist) * dt;
              }
            });
          }
        }
      }
      if (a.armed && a.life <= 0) removeAt(this.areas, i);
    }
  }

  drop(type: string, x: number, y: number, value: number = 1) {
    if (this.pickups.length < MAX_WORLD_PICKUPS) {
      this.pickups.push({ type, x, y, value, life: 100 });
    }
  }

  dropXP(x: number, y: number, value: number) {
    const key = Math.floor(x / 60) + "," + Math.floor(y / 60);
    const old = this.gemCells.get(key);

    if (old && !old.magnet) {
      old.value += value;
      return;
    }

    /* O limite compacta valores, preservando toda a XP gerada. */
    if (this.gems.length >= 1200) {
      this.gems[this.run.kills % this.gems.length].value += value;
      return;
    }

    const gem = { x, y, value, key, magnet: false };
    this.gems.push(gem);
    this.gemCells.set(key, gem);
  }

  collectsDrop(point: T.Vec & { ownerId?: string }) {
    void point;
    return true;
  }
  grantGold(value: number) {
    this.run.gold += value;
  }
  updateDrops(dt: number, lifetimeDt = dt) {
    const p = this.player;

    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      if (!this.collectsDrop(gem)) continue;
      const dx = p.x - gem.x;
      const dy = p.y - gem.y;
      const d = Math.hypot(dx, dy) || 0.001;

      if (d < p.stats.pickupRange) gem.magnet = true;

      if (gem.magnet) {
        const step = Math.min(d, (280 + 850 / (1 + d / 80)) * dt);
        gem.x += (dx / d) * step;
        gem.y += (dy / d) * step;
      }

      if (d < 20) {
        p.xp +=
          gem.value *
          p.stats.growth *
          this.modeDef.xpMultiplier *
          (this.run.event === "deep_fog" ? 1.25 : 1);

        if (this.gemCells.get(gem.key) === gem) {
          this.gemCells.delete(gem.key);
        }

        removeAt(this.gems, i);
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      item.life -= lifetimeDt;

      if (item.life <= 0) {
        removeAt(this.pickups, i);
        continue;
      }

      if (!this.collectsDrop(item)) continue;
      if ((item.x - p.x) ** 2 + (item.y - p.y) ** 2 > 30 ** 2) continue;

      removeAt(this.pickups, i);

      switch (item.type) {
        case "gold":
          this.grantGold(item.value);
          break;

        case "heal":
          p.health = Math.min(p.maxHealth, p.health + item.value);
          this.float(p.x, p.y, "+" + item.value, "#89edba", 18);
          break;

        case "magnet":
          for (const gem of this.gems) gem.magnet = true;
          this.announce(
            "Ressonância",
            "Todos os cristais deixados serão atraídos.",
          );
          break;

        case "bomb":
          this.blast(
            p.x,
            p.y,
            Math.max(this.viewW, this.viewH),
            220 * p.stats.damage,
            null,
          );
          this.shake = 10;
          break;

        case "buff":
          p.buff = 12;
          this.announce(
            "Pulso de âmbar",
            "+40% de dano e ataques mais rápidos por 12 s.",
          );
          break;

        case "item":
          this.addItem(item.itemId!, item.value || 1);
          if (this.state !== "playing") return;
          break;

        case "chest":
          this.openChest(item);
          return;
      }
    }
  }

  choiceKey(item: T.Upgrade) {
    return `${item.kind}:${item.weaponId || ""}:${item.id}`;
  }

  candidates(existingOnly: boolean = false) {
    const p = this.player,
      result: T.Upgrade[] = [];
    const banned = new Set(this.run?.banned || []);
    for (const [id, d] of Object.entries(WEAPON_DEFINITIONS)) {
      const w = p.weapons.find((w) => w.id === id),
        key = `weapon:${id}`;
      if (banned.has(key)) continue;
      if (w && w.level < 8 && !w.evolved)
        result.push({ kind: "weapon", id, weight: d.weight * 2.8 });
      else if (!w && !existingOnly && p.weapons.length < MAX_WEAPONS)
        result.push({ kind: "weapon", id, weight: d.weight });
    }
    for (const [id, d] of Object.entries(PASSIVE_DEFINITIONS)) {
      const level = p.passives[id] || 0,
        key = `passive:${id}`;
      if (banned.has(key)) continue;
      if (level > 0 && level < d.max)
        result.push({ kind: "passive", id, weight: d.weight * 2.2 });
      else if (
        !level &&
        !existingOnly &&
        Object.keys(p.passives).length < MAX_PASSIVES
      )
        result.push({ kind: "passive", id, weight: d.weight });
    }
    if (!existingOnly && this.run.time >= this.expeditionProfile.pathTiming)
      for (const w of p.weapons)
        if (w.level >= 4 && !w.path)
          result.push(
            ...this.pathChoices(w).map((c) => ({ ...c, weight: 30 })),
          );
    return result;
  }

  rollChoices(avoidKey = "") {
    let out: T.Upgrade[] = [],
      key = "";
    const optionCount =
      this.player.stats.luck >= 1.45 || this.player.luckBuff > 0 ? 4 : 3;
    const hasAlternatives = this.candidates().length > optionCount;
    for (let attempt = 0; attempt < 6; attempt++) {
      const pool = this.candidates();
      out = [];
      // One relevant offer keeps a focused build viable without forcing the choice.
      const focus = [...this.player.weapons].sort(
        (a, b) => b.level - a.level,
      )[0];
      const guided =
        pool.find((c) => c.kind === "path" && c.weaponId === focus?.id) ||
        pool.find((c) => c.kind === "weapon" && c.id === focus?.id) ||
        pool.find(
          (c) => c.kind === "passive" && c.id === focus?.definition.passive,
        );
      if (guided) {
        out.push(guided);
        pool.splice(pool.indexOf(guided), 1);
      }
      while (pool.length && out.length < optionCount) {
        const choiceLuck =
          this.player.stats.luck * (this.player.luckBuff > 0 ? 1.3 : 1);
        const selected = weighted(
          pool,
          (x) => x.weight * (x.weight < 9 ? choiceLuck : 1),
        );
        out.push(selected);
        pool.splice(pool.indexOf(selected), 1);
      }
      for (const id of ["heal", "gold", "buff", "magnet"])
        if (out.length < optionCount)
          out.push({ kind: "bonus", id, weight: 1 });
      key = out
        .map((o) => this.choiceKey(o))
        .sort()
        .join("|");
      if (!avoidKey || key !== avoidKey || !hasAlternatives) break;
    }
    this.lastChoiceKey = key;
    return out;
  }

  pathChoices(w: Weapon): T.Upgrade[] {
    return Object.entries(WEAPON_PATHS[w.id] || {}).map(([id, d]) => ({
      kind: "path",
      id,
      weaponId: w.id,
      weight: 1,
      name: d.name,
    }));
  }

  maybeLevelUp() {
    const p = this.player,
      r = this.run;
    if (this.state !== "playing" || p.xp < p.xpToNextLevel) return;
    const manual = r.manualDecisions || 0;
    const automatic =
      manual >= PROGRESSION.maxManual || !this.candidates().length;
    if (automatic && r.time - (r.lastDecisionAt ?? -100) < 20) return;
    if (
      !automatic &&
      (r.time < (this.expeditionProfile.decisionSchedule[manual] ?? Infinity) ||
        r.time - (r.lastDecisionAt ?? -100) < PROGRESSION.decisionGap)
    )
      return;
    p.xp -= p.xpToNextLevel;
    p.level++;
    p.xpToNextLevel = xpNeed(p.level);
    p.recalculate();
    if (automatic) {
      r.lastDecisionAt = r.time;
      p.health = Math.min(p.maxHealth, p.health + p.maxHealth * 0.04);
      r.gold += 3;
      return;
    }
    r.telemetry ??= telemetry();
    r.telemetry.levelUps.push(r.time);
    r.manualDecisions = manual + 1;
    this.pathSelection = false;
    this.choices = this.rollChoices();
    this.setState("levelup");
    this.sound.play("level");
    this.checkAchievements();
    this.ui.levelup();
    this.saveSnapshot(true);
  }

  applyUpgrade(item: T.Upgrade) {
    const p = this.player;
    if (item.kind === "path") {
      const w = p.weapons.find((w) => w.id === item.weaponId);
      if (w && !w.path && WEAPON_PATHS[w.id]?.[item.id]) {
        w.path = item.id;
        w.pathLevel = 1;
        this.run.telemetry ??= telemetry();
        this.run.telemetry.firstPath ??= this.run.time;
        this.sound.play("evolve");
        this.announce(
          `${w.name} · ${WEAPON_PATHS[w.id][item.id].name}`,
          WEAPON_PATHS[w.id][item.id].text,
        );
      }
      return null;
    }
    if (item.kind === "weapon") {
      let w = p.weapons.find((w) => w.id === item.id);
      if (w) {
        if (w.level < 8 && !w.evolved) w.level = Math.min(8, w.level + 2);
      } else if (p.weapons.length < MAX_WEAPONS) {
        w = new Weapon(item.id);
        p.weapons.push(w);
      }
      this.discoverSynergies();
    } else if (item.kind === "passive") {
      const d = PASSIVE_DEFINITIONS[item.id];
      if (
        (p.passives[item.id] || 0) < d.max &&
        ((p.passives[item.id] || 0) > 0 ||
          Object.keys(p.passives).length < MAX_PASSIVES)
      )
        p.passives[item.id] = Math.min(d.max, (p.passives[item.id] || 0) + 2);
      p.recalculate();
    } else if (item.id === "heal")
      p.health = Math.min(p.maxHealth, p.health + 35);
    else if (item.id === "buff") p.buff = 12;
    else if (item.id === "magnet")
      for (const gem of this.gems) gem.magnet = true;
    else this.run.gold += 25;
    return null;
  }

  pickUpgrade(index: number) {
    if (this.state !== "levelup" || !this.choices[index]) return;
    if (this.banishMode) {
      this.banishMode = false;
      this.banishChoice(index);
      return;
    }
    const item = this.choices[index];
    this.run.lastDecisionAt = this.run.time;
    const pending = this.applyUpgrade(item);
    if (this.pathSelection) {
      this.pathSelection = false;
      this.choices = [];
      this.resume();
      this.ui.updateHUD();
      this.saveSnapshot(true);
      this.maybeLevelUp();
      return;
    }
    if (pending) {
      this.pathSelection = true;
      this.choices = this.pathChoices(pending);
      this.ui.levelup();
      return;
    }
    this.choices = [];
    this.resume();
    this.ui.updateHUD();
    this.saveSnapshot(true);
    this.maybeLevelUp();
  }

  rerollChoices() {
    if (this.state !== "levelup" || this.pathSelection || this.run.rerolls <= 0)
      return;
    this.run.rerolls--;
    const old = this.lastChoiceKey;
    this.choices = this.rollChoices(old);
    this.ui.levelup();
    this.saveSnapshot(true);
  }

  banishChoice(index: number) {
    if (
      this.state !== "levelup" ||
      this.pathSelection ||
      this.run.banishments <= 0
    )
      return;
    const item = this.choices[index];
    if (!item || !["weapon", "passive"].includes(item.kind)) return;
    const key = `${item.kind}:${item.id}`;
    if (!this.run.banned.includes(key)) this.run.banned.push(key);
    this.run.banishments--;
    this.choices = this.rollChoices();
    this.ui.levelup();
    this.saveSnapshot(true);
  }

  skipLevelUp() {
    if (this.state !== "levelup" || this.pathSelection || this.run.skips <= 0)
      return;
    this.run.skips--;
    this.run.gold += 8;
    this.choices = [];
    this.resume();
    this.announce(
      "Eco recusado",
      "+8 ouro pela escolha de seguir sem melhoria.",
    );
    this.ui.updateHUD();
    this.saveSnapshot(true);
    this.maybeLevelUp();
  }

  eligibleEvolution() {
    if (this.run.time < this.expeditionProfile.evolutionTiming) return undefined;
    return this.player.weapons.find(
      (w) =>
        w.level === 8 &&
        !w.evolved &&
        (this.player.passives[w.definition.passive] || 0) > 0,
    );
  }

  openChest(item: T.Pickup) {
    const eligible = this.eligibleEvolution();
    const options = this.candidates(true);

    this.chestReward = eligible
      ? { kind: "evolution", id: eligible.id, gold: item.value }
      : {
          kind: "reward",
          upgrade: options.length ? weighted(options) : null,
          gold: item.value,
        };

    this.setState("chest");
    this.sound.play("chest");
    this.run.telemetry ??= telemetry();
    this.run.telemetry.chests++;
    this.claimChest();
  }

  claimChest() {
    if (this.state !== "chest" || !this.chestReward) return;

    const reward = this.chestReward;
    this.chestReward = null;
    this.run.gold += reward.gold;

    if (reward.kind === "evolution") {
      const w = this.player.weapons.find((w) => w.id === reward.id);
      if (!w) return;
      w.evolved = true;
      this.run.evolutions++;
      this.run.telemetry ??= telemetry();
      this.run.telemetry.firstEvolution ??= this.run.time;
      this.sound.play("evolve");
      this.announce(
        w.name,
        w.definition.evolvedDescription +
          (w.path ? ` · Caminho: ${WEAPON_PATHS[w.id][w.path].name}` : ""),
      );
    } else if (reward.upgrade) {
      const pending = this.applyUpgrade(reward.upgrade);
      if (pending) {
        this.pathSelection = true;
        this.choices = this.pathChoices(pending);
        this.setState("levelup");
        this.ui.updateHUD();
        this.saveSnapshot(true);
        this.ui.levelup();
        return;
      }
    }

    this.checkAchievements();
    this.resume();
    this.ui.updateHUD();
    this.saveSnapshot(true);
    this.maybeLevelUp();
  }

  checkAchievements() {
    if (this.mode === "test") return;
    let changed = false;

    for (const a of ACHIEVEMENTS) {
      if (a.modes && !a.modes.includes(this.mode)) continue;
      if (!this.save.achievements.includes(a.id) && a.check(this)) {
        this.save.achievements.push(a.id);

        if (a.character && !this.save.unlocked.includes(a.character)) {
          this.save.unlocked.push(a.character);
        }

        if (a.reward) this.save.gold += a.reward;

        this.announce(
          "Conquista • " + a.name,
          a.character
            ? CHARACTER_DEFINITIONS[a.character].name + " disponível"
            : a.reward
              ? `+${a.reward} ouro permanente`
              : a.text,
        );

        changed = true;
      }
    }

    if (changed) this.persist();
  }

  finish(victory: boolean = false, abandoned: boolean = false) {
    if (!this.run || this.run.settled) return;

    if (victory) this.run.completed = true;
    this.checkAchievements();

    this.run.settled = true;
    this.run.abandoned = abandoned;
    const baseBonus = this.run.completed ? this.modeDef.completionBase : 0;
    const rewardGold =
      this.run.completionGold !== null &&
      Number.isFinite(this.run.completionGold)
        ? this.run.completionGold
        : this.run.gold;
    const difficultyBonus =
      this.run.completed && this.modeDef.rewardMultiplier > 1
        ? Math.floor(rewardGold * (this.modeDef.rewardMultiplier - 1))
        : 0;
    this.run.bonus = baseBonus + difficultyBonus;
    this.run.difficultyBonus = difficultyBonus;

    this.run.score = Math.floor(
      this.run.kills * 10 +
        this.run.time +
        this.run.totalDamage / 100 +
        this.run.gold * 5 +
        (this.run.completed ? 10000 : 0),
    );

    if (this.modeDef.savesProgress) {
      this.save.activeRun = null;
      this.save.gold += this.run.gold + this.run.bonus;
      this.save.runs++;

      if (this.run.completed) this.save.completed++;

      this.save.highScore = Math.max(this.save.highScore, this.run.score);
      this.save.bestTime = Math.max(
        this.save.bestTime,
        Math.floor(this.run.time),
      );
      this.save.bestKills = Math.max(this.save.bestKills, this.run.kills);

      this.persist();
    }

    this.setState("result");
    this.sound.play("end");
    this.ui.hud(false);
    this.ui.result();
  }

  spark(x: number, y: number, color: string, count: number) {
    count = Math.floor(count * this.fx);

    for (let i = 0; i < count; i++) {
      const p = this.particles.take();
      if (!p) break;

      const a = rand(0, TAU);
      const speed = rand(20, 130);

      Object.assign(p, {
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rand(0.15, 0.5),
        max: 0.5,
        color,
        r: rand(1, 3),
      });
    }
  }

  float(
    x: number,
    y: number,
    text: string | number,
    color: string,
    size: number = 13,
  ) {
    const f = this.floats.take();

    if (f) {
      Object.assign(f, {
        x,
        y,
        text: String(text),
        color,
        size,
        life: 0.7,
      });
    }
  }

  updateEffects(dt: number) {
    for (let i = this.particles.items.length - 1; i >= 0; i--) {
      const p = this.particles.items[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.life <= 0) this.particles.remove(i);
    }

    for (let i = this.floats.items.length - 1; i >= 0; i--) {
      const f = this.floats.items[i];
      f.life -= dt;
      f.y -= 35 * dt;

      if (f.life <= 0) this.floats.remove(i);
    }

    for (let i = this.lines.length - 1; i >= 0; i--) {
      this.lines[i].life -= dt;
      if (this.lines[i].life <= 0) removeAt(this.lines, i);
    }
  }

  debugSpawnStructure(type: string) {
    if (!DEBUG || !this.world || !STRUCTURE_DEFINITIONS[type]) return;
    const p = this.player,
      { cx, cy } = this.world.chunkCoords(p.x, p.y),
      key = this.world.chunkKey(cx, cy);
    let ch = this.world.chunks.get(key);
    if (!ch) {
      ch = this.world.createChunk(cx, cy);
      this.world.chunks.set(key, ch);
    }
    const id = `${cx}:${cy}:${type}:debug${Date.now()}`;
    ch.structures.push({
      id,
      type,
      x: p.x + 80,
      y: p.y,
      r: STRUCTURE_DEFINITIONS[type].r,
      hp: STRUCTURE_DEFINITIONS[type].hp || 0,
      maxHp: STRUCTURE_DEFINITIONS[type].hp || 0,
      used: false,
      destroyed: false,
      opened: false,
      angle: 0,
      variant: 0,
    });
    this.world.update();
  }

  teleportChunk(cx: number, cy: number) {
    if (!DEBUG || !this.player || !Number.isFinite(cx) || !Number.isFinite(cy))
      return;
    this.player.x = (Math.floor(cx) + 0.5) * CHUNK_SIZE;
    this.player.y = (Math.floor(cy) + 0.5) * CHUNK_SIZE;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.world?.update();
  }

  debugBossPhase(phase = 3) {
    if (!DEBUG) return;
    const b = this.enemies.find((e) => !e.dead && e.type === "boss");
    if (!b) return;
    const target = phase >= 3 ? 0.28 : phase === 2 ? 0.58 : 0.95;
    b.hp = Math.min(b.hp, b.maxHp * target);
    this.updateBossPhase(b);
  }

  debugKey(key: string) {
    if (!DEBUG || !this.run || this.run.settled) return;
    if (key === "F1") this.run.gold += 1000;
    if (key === "F2") {
      this.player.xp += this.player.xpToNextLevel * 3;
      this.maybeLevelUp();
    }
    if (key === "F3")
      this.spawn("boss", null, { ...choose(BOSS_EVENTS), eventIndex: 999 });
    if (key === "F4") {
      this.clockRate = this.clockRate === 1 ? 5 : this.clockRate === 5 ? 20 : 1;
      this.announce("Relógio " + this.clockRate + "×");
    }
    if (key === "F6") this.debug.god = !this.debug.god;
    if (key === "F7") this.debug.hitboxes = !this.debug.hitboxes;
    if (key === "F8") this.debug.stats = !this.debug.stats;
    if (key === "F9") this.addItem(this.weightedItem().id, 3);
    if (key === "F10") this.debugSpawnStructure("exchange");
    if (key === "F11") this.debugSpawnStructure("urn");
    if (key === "F12") {
      this.saveSnapshot(true);
      this.announce("DEBUG", "Snapshot salvo.");
    }
  }
}
