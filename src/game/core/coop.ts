import { GameSimulation } from "./simulation";
import { Player, Weapon } from "./entities";
import { freshSave } from "./save";
import {
  CHARACTER_DEFINITIONS,
  STRUCTURE_DEFINITIONS,
} from "../content/catalog";
import { telemetry, xpNeed } from "./progression";
import type {
  GameInput,
  InventorySlot,
  SaveData,
  Upgrade,
  Structure,
  RunState,
  Vec,
} from "./types";
import { removeAt } from "./math";
export const COOP_SCALING = [
  { hp: 1, spawn: 1, cap: 1, elite: 1, boss: 1, formation: 1, xp: 1 },
  {
    hp: 1.2,
    spawn: 1.5,
    cap: 1.35,
    elite: 1.15,
    boss: 1.65,
    formation: 1.3,
    xp: 1.6,
  },
  {
    hp: 1.35,
    spawn: 1.9,
    cap: 1.65,
    elite: 1.3,
    boss: 2.2,
    formation: 1.5,
    xp: 2.1,
  },
  {
    hp: 1.5,
    spawn: 2.25,
    cap: 1.85,
    elite: 1.4,
    boss: 2.7,
    formation: 1.7,
    xp: 2.5,
  },
  {
    hp: 1.65,
    spawn: 2.6,
    cap: 2,
    elite: 1.5,
    boss: 3.1,
    formation: 1.9,
    xp: 2.9,
  },
] as const;
export const PARTY_COLORS = [
  "#9edcc1",
  "#ffac75",
  "#c6b7ff",
  "#fa9ba0",
  "#ffe69d",
];
type PersonalRun = Pick<
  RunState,
  "banned" | "evolutions" | "structuresUsed" | "itemsUsed" | "usedExchange"
>;
export interface Participant {
  personal: PersonalRun;
  id: string;
  name: string;
  player: Player;
  progress: SaveData;
  input: GameInput;
  lastInput: number;
  connected: boolean;
  disconnectAt: number;
  downed: boolean;
  revive: number;
  inventory: (InventorySlot | null)[];
  gold: number;
  synergies: string[];
  rerolls: number;
  banishments: number;
  skips: number;
  choices: Upgrade[];
  pending: number;
  decision: number;
  personalStructures: Set<string>;
  damageAt: number;
  color: string;
}
export class CoopSimulation extends GameSimulation {
  readonly members = new Map<string, Participant>();
  readonly partySizeAtStart: number;
  teamXp = 0;
  teamLevel = 1;
  manual = 0;
  nextEntity = 1;
  votes = new Map<
    string,
    { structure: Structure; accept: Set<string>; expires: number }
  >();
  ended = false;
  activeMember?: Participant;
  constructor(
    players: {
      id: string;
      name: string;
      character: string;
      progress: SaveData;
    }[],
    mode: string,
    mapId: string,
    seed: string,
    expeditionLength = 1800,
  ) {
    if (players.length < 1 || players.length > 5)
      throw new Error("Equipe deve ter 1–5 jogadores.");
    super(freshSave());
    this.partySizeAtStart = players.length;
    super.start("nara", mode, mapId, seed, expeditionLength);
    this.run.telemetry = telemetry(players.length);
    this.fx = 0;
    this.ui = {
      ...this.ui,
      goal: () => {
        this.finish(true);
      },
      itemOverflow: () => {
        const item = this.pendingItem;
        this.pendingItem = null;
        if (item && this.activeMember)
          this.pushPickup({
            type: "item",
            itemId: item.id,
            value: item.qty,
            x: this.player.x + 48,
            y: this.player.y,
            life: 120,
            ownerId: this.activeMember.id,
          });
      },
      levelup: () => {},
    };
    players.forEach((data, i) => {
      const p = new Player(data.character, data.progress.upgrades);
      const w = new Weapon(CHARACTER_DEFINITIONS[data.character].weapon);
      w.ownerId = data.id;
      p.weapons.push(w);
      p.x = i * 28;
      this.members.set(data.id, {
        personal: {
          banned: [],
          evolutions: 0,
          structuresUsed: 0,
          itemsUsed: 0,
          usedExchange: false,
        },
        id: data.id,
        name: data.name,
        player: p,
        progress: data.progress,
        input: { moveX: 0, moveY: 0, sequence: 0, interact: false },
        lastInput: 0,
        connected: true,
        disconnectAt: 0,
        downed: false,
        revive: 0,
        inventory: [null, null, null, null],
        gold: 0,
        synergies: [],
        rerolls: 2,
        banishments: 2,
        skips: 1,
        choices: [],
        pending: 0,
        decision: 0,
        personalStructures: new Set(),
        damageAt: -1,
        color: PARTY_COLORS[i],
      });
    });
    this.activate(this.members.values().next().value!);
    this.world.update();
    for (const m of this.members.values())
      if (!m.progress.discovered.maps.includes(mapId))
        m.progress.discovered.maps.push(mapId);
  }
  override playersForWorld() {
    return [...this.members.values()].map((m) => m.player);
  }
  override combatPlayers() {
    return [...this.members.values()]
      .filter((m) => !m.downed)
      .map((m) => m.player);
  }
  override ownerOf(w: Weapon | null) {
    return (w?.ownerId && this.members.get(w.ownerId)?.player) || this.player;
  }
  override hasSynergy(id: string) {
    return (
      [...this.members.values()]
        .find((m) => m.player === this.player)
        ?.synergies.includes(id) || false
    );
  }
  override modeScaling(time = this.run?.time || 0) {
    const s = super.modeScaling(time),
      c = COOP_SCALING[(this.partySizeAtStart || 1) - 1];
    return {
      ...s,
      hp: s.hp * c.hp,
      spawn: s.spawn * c.spawn,
      cap: s.cap * c.cap,
      elite: s.elite * c.elite,
      bossHp: s.bossHp * c.boss,
      formation: s.formation * c.formation,
    };
  }
  activate(m: Participant) {
    this.activeMember = m;
    this.player = m.player;
    this.save = m.progress;
    this.run.inventory = m.inventory;
    this.run.gold = m.gold;
    this.run.synergies = m.synergies;
    this.run.rerolls = m.rerolls;
    this.run.banishments = m.banishments;
    this.run.skips = m.skips;
    this.choices = m.choices;
    Object.assign(this.run, m.personal);
  }
  capture(m: Participant) {
    m.personal = {
      banned: this.run.banned,
      evolutions: this.run.evolutions,
      structuresUsed: this.run.structuresUsed,
      itemsUsed: this.run.itemsUsed,
      usedExchange: this.run.usedExchange,
    };
    m.inventory = this.run.inventory;
    m.gold = this.run.gold;
    m.synergies = this.run.synergies;
    m.rerolls = this.run.rerolls;
    m.banishments = this.run.banishments;
    m.skips = this.run.skips;
    m.choices = this.choices;
    for (const w of m.player.weapons) w.ownerId = m.id;
  }
  override setState(s: string) {
    if (s === "result") {
      this.state = s;
      return;
    }
    this.state = "playing";
  }
  override saveSnapshot() {
    return false;
  }
  override maybeLevelUp() {}
  override checkAchievements() {} // evaluated against each authoritative result during settlement
  override hurtPlayer(damage: number, p = this.player) {
    const m = [...this.members.values()].find((m) => m.player === p);
    if (!m || m.downed || p.invulnerable > 0) return;
    const hp = p.health;
    super.hurtPlayer(damage, p);
    if (p.health < hp) {
      m.damageAt = this.run.time;
      m.revive = 0;
    }
    if (p.health <= 0) {
      m.downed = true;
      m.input.moveX = 0;
      m.input.moveY = 0;
    }
  }
  override finish(victory = false) {
    if (victory) {
      this.run.completed = true;
      this.ended = true;
    } else if (
      this.members.size &&
      [...this.members.values()].every((m) => m.downed)
    ) {
      this.run.telemetry!.teamWipes++;
      this.ended = true;
    }
    if (this.ended) {
      this.run.settled = true;
      this.state = "result";
    }
  }
  override collectsDrop(point: Vec & { ownerId?: string }) {
    return point.ownerId
      ? this.activeMember?.id === point.ownerId
      : this.nearestPlayer(point) === this.player;
  }
  override grantGold(value: number) {
    for (const m of this.members.values()) m.gold += value;
    this.run.gold = this.activeMember!.gold;
  }
  override openChest(item: { value: number }) {
    const current = this.activeMember!;
    for (const m of this.members.values()) {
      this.activate(m);
      const w = this.eligibleEvolution();
      if (w) {
        w.evolved = true;
        this.run.evolutions++;
        this.run.telemetry!.firstEvolution ??= this.run.time;
      } else {
        const choices = this.candidates(true);
        if (choices.length) this.applyUpgrade(choices[0]);
      }
      this.run.gold += item.value;
      this.capture(m);
    }
    this.run.telemetry!.chests++;
    this.activate(current);
  }
  disconnect(id: string) {
    const m = this.members.get(id);
    if (m) {
      m.connected = false;
      m.disconnectAt = this.run.time;
      m.input.moveX = 0;
      m.input.moveY = 0;
      m.input.interact = false;
      this.run.telemetry!.disconnects++;
    }
  }
  reconnect(id: string) {
    const m = this.members.get(id);
    if (
      !m ||
      (!m.connected && this.run.time - m.disconnectAt > 60) ||
      this.ended
    )
      return false;
    if (!m.connected) m.input.sequence = 0;
    m.connected = true;
    return true;
  }
  acceptInput(id: string, input: GameInput) {
    const m = this.members.get(id);
    if (!m || !m.connected || input.sequence <= m.input.sequence) return;
    const d = Math.max(1, Math.hypot(input.moveX, input.moveY));
    m.input = { ...input, moveX: input.moveX / d, moveY: input.moveY / d };
    m.lastInput = this.run.time;
  }
  use(id: string, slot: number) {
    const m = this.members.get(id);
    if (!m || m.downed) return;
    this.activate(m);
    super.useItem(slot);
    this.capture(m);
  }
  choose(
    id: string,
    decision: number,
    index: number,
    action: "pick" | "banish" | "reroll" | "skip",
  ) {
    const m = this.members.get(id);
    if (!m || m.decision !== decision || !m.choices.length) return;
    this.activate(m);
    if (action === "pick") {
      const choice = m.choices[index];
      if (!choice) return;
      this.applyUpgrade(choice);
      m.pending--;
      this.choices = [];
    } else if (action === "reroll" && m.rerolls > 0) {
      this.run.rerolls--;
      this.choices = this.rollChoices();
    } else if (action === "banish" && m.banishments > 0) {
      const choice = m.choices[index];
      if (!choice || !["weapon", "passive"].includes(choice.kind)) return;
      this.run.banned.push(`${choice.kind}:${choice.id}`);
      this.run.banishments--;
      this.choices = this.rollChoices();
    } else if (action === "skip" && m.skips > 0) {
      this.run.skips--;
      m.pending--;
      this.choices = [];
    } else return;
    this.capture(m);
    m.decision++;
    if (m.pending && !m.choices.length) {
      this.choices = this.rollChoices();
    }
    this.capture(m);
  }
  interactOnline(id: string, structureId: string, accept: boolean) {
    const m = this.members.get(id);
    if (!m || m.downed) return;
    this.activate(m);
    const s = this.world.nearby.find((s) => s.id === structureId);
    if (!s || s.destroyed) return;
    const existingVote = this.votes.get(s.id);
    if (!existingVote && Math.hypot(s.x - m.player.x, s.y - m.player.y) > 70)
      return;
    if (["rift_altar", "silence"].includes(s.type)) {
      if (s.used) return;
      let vote = this.votes.get(s.id);
      if (!vote) {
        vote = { structure: s, accept: new Set(), expires: this.run.time + 15 };
        this.votes.set(s.id, vote);
      }
      if (accept) vote.accept.add(id);
      else vote.accept.delete(id);
      if (vote.accept.size > this.partySizeAtStart / 2) {
        super.resolveStructure(s, true);
        this.capture(m);
        this.votes.delete(s.id);
      }
      return;
    }
    if (m.personalStructures.has(s.id) || !accept) return;
    // Personal use is tracked independently; structure remains discoverable by teammates.
    const old = { used: s.used, opened: s.opened };
    s.used = false;
    s.opened = false;
    const before = this.run.structuresUsed,
      oldXp = m.player.xp,
      oldDrops = new Set(this.pickups);
    super.resolveStructure(s, true);
    this.addTeamXp((m.player.xp - oldXp) / m.player.stats.growth);
    m.player.xp = oldXp;
    for (const drop of this.pickups) if (!oldDrops.has(drop)) drop.ownerId = id;
    if (this.run.structuresUsed > before) m.personalStructures.add(s.id);
    s.used = old.used;
    s.opened = old.opened;
    delete this.world.changes[s.id];
    this.capture(m);
  }
  addTeamXp(base: number) {
    const growth = Math.min(
      0.15,
      [...this.members.values()].reduce(
        (sum, m) => sum + Math.max(0, m.player.stats.growth - 1),
        0,
      ) / this.partySizeAtStart,
    );
    this.teamXp +=
      (base * (1 + growth)) / COOP_SCALING[this.partySizeAtStart - 1].xp;
  }
  override update(dt: number) {
    if (this.ended) return;
    this.run.time += dt * this.clockRate;
    this.run.simTime += dt;
    this.run.eventTime = Math.max(0, this.run.eventTime - dt);
    this.run.silenceTime = Math.max(0, this.run.silenceTime - dt);
    this.run.surgeTime = Math.max(0, this.run.surgeTime - dt);
    for (const m of this.members.values()) {
      this.activate(m);
      const p = m.player;
      if (!m.connected && this.run.time - m.disconnectAt > 60) {
        m.downed = true;
        p.health = 0;
      }
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      p.buff = Math.max(0, p.buff - dt);
      p.luckBuff = Math.max(0, p.luckBuff - dt);
      p.hurtFlash = Math.max(0, p.hurtFlash - dt);
      if (m.downed) continue;
      p.health = Math.min(p.maxHealth, p.health + p.stats.recovery * dt);
      const input =
        this.run.time - m.lastInput < 0.25
          ? m.input
          : { moveX: 0, moveY: 0, interact: false };
      this.movePlayer(p, { x: input.moveX, y: input.moveY }, dt);
      p.inWater = this.world.isWater(p.x, p.y);
      if (
        Math.floor(this.run.time * 2) !== Math.floor((this.run.time - dt) * 2)
      )
        this.world.query(p.x, p.y, 60, (s) => {
          if (
            STRUCTURE_DEFINITIONS[s.type]?.hazard &&
            Math.hypot(p.x - s.x, p.y - s.y) < p.r + s.r * 0.75
          )
            this.hurtPlayer(s.type === "rift" ? 8 : 5, p);
        });
      if (
        input.interact &&
        Math.hypot(input.moveX, input.moveY) < 0.01 &&
        this.run.time - m.damageAt > 0.5
      ) {
        const target = [...this.members.values()].find(
          (t) =>
            t.downed && Math.hypot(t.player.x - p.x, t.player.y - p.y) < 65,
        );
        if (target) {
          m.revive += dt;
          if (m.revive >= 3) {
            target.downed = false;
            target.player.health = target.player.maxHealth * 0.35;
            target.player.invulnerable = 2;
            m.revive = 0;
            this.run.telemetry!.revives++;
          }
        } else m.revive = 0;
      } else m.revive = 0;
    }
    this.world.update();
    this.updateMapEvents(dt);
    const alive = [...this.members.values()].filter((m) => !m.downed);
    if (!alive.length) {
      this.finish(false);
      return;
    }
    const anchor = alive[Math.floor(this.run.time) % alive.length];
    this.activate(anchor);
    this.camera = { x: anchor.player.x, y: anchor.player.y };
    this.director.update(this, dt);
    this.updateEnemies(dt);
    this.grid.rebuild(this.enemies);
    for (const m of this.members.values())
      for (const e of this.enemies)
        if (!m.progress.discovered.enemies.includes(e.type))
          m.progress.discovered.enemies.push(e.type);
    for (const m of alive) {
      this.activate(m);
      for (const w of m.player.weapons) w.update(this, dt);
      this.capture(m);
    }
    this.updateBullets(dt);
    this.updateAreas(dt);
    let gained = 0;
    for (const m of alive) {
      this.activate(m);
      const before = m.player.xp;
      this.updateDrops(dt, dt / alive.length);
      gained += (m.player.xp - before) / m.player.stats.growth;
      m.player.xp = before;
      this.capture(m);
    }
    this.addTeamXp(gained);
    if (
      this.teamXp >= xpNeed(this.teamLevel) &&
      ((this.manual >= 26 &&
        this.run.time - (this.run.lastDecisionAt ?? -100) >= 20) ||
        (this.manual < 26 &&
          this.run.time >= (this.expeditionProfile.decisionSchedule[this.manual] ?? Infinity)))
    ) {
      this.teamXp -= xpNeed(this.teamLevel++);
      const manual = this.manual++ < 26;
      if (manual) {
        this.run.telemetry!.levelUps.push(this.run.time);
        this.run.manualDecisions = (this.run.manualDecisions || 0) + 1;
      }
      this.run.lastDecisionAt = this.run.time;
      for (const m of this.members.values()) {
        this.activate(m);
        m.player.level = this.teamLevel;
        m.player.recalculate();
        if (manual) {
          m.pending++;
          if (!m.choices.length) {
            this.choices = this.rollChoices();
            m.decision++;
          }
        } else {
          m.player.health = Math.min(m.player.maxHealth, m.player.health + 3);
          this.run.gold += 3;
        }
        this.capture(m);
      }
    }
    for (const m of this.members.values()) {
      m.player.xp = this.teamXp;
      m.player.xpToNextLevel = xpNeed(this.teamLevel);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--)
      if (this.enemies[i].dead) removeAt(this.enemies, i);
    this.particles.clear();
    this.floats.clear();
    this.lines.length = 0;
    this.hitstop = 0;
    for (const [id, v] of this.votes)
      if (v.expires < this.run.time) this.votes.delete(id);
    for (const minute of [5, 10, 15, 20, 25, 30])
      if (
        this.run.time >= minute * 60 &&
        this.run.telemetry!.levels[minute] === undefined
      )
        this.run.telemetry!.levels[minute] = this.teamLevel;
    if (this.mode !== "endless" && this.run.time >= this.expeditionProfile.duration) this.finish(true);
  }
}
