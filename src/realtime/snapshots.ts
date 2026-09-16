import type { CoopSimulation, Participant } from "../game/core/coop";
import type {
  NetEntity,
  Snapshot,
  EntityPatch,
} from "../game/network/protocol";
export class SnapshotStream {
  previous = new Map<string, NetEntity>();
  lastTick = 0;
  ids = new WeakMap<object, string>();
  next = 1;
  identity(object: object, prefix: string) {
    let id = this.ids.get(object);
    if (!id) {
      id = prefix + this.next++;
      this.ids.set(object, id);
    }
    return id;
  }
  build(
    g: CoopSimulation,
    m: Participant,
    tick: number,
    full = false,
  ): Snapshot {
    const p = m.player,
      entities: NetEntity[] = [];
    const near = (x: number, y: number) =>
      Math.abs(x - p.x) < 1000 && Math.abs(y - p.y) < 800;
    const round = (n: number) => Math.round(n * 10) / 10;
    for (const e of g.enemies)
      if (
        !e.dead &&
        (near(e.x, e.y) || e.type === "boss" || e.type === "final")
      )
        entities.push({
          id: "e" + e.id,
          kind: "enemy",
          x: round(e.x),
          y: round(e.y),
          r: e.r,
          type: e.type,
          name: e.name,
          charge: round(e.charge),
          burrow: round(e.burrow),
          shield: round(e.shield),
          lastHitWeapon: e.lastHitWeapon,
          lastHitOwner: e.lastHitOwner,
          pattern: e.pattern,
          statuses: Object.keys(e.statuses),
          hp: Math.ceil(e.hp),
          maxHp: Math.ceil(e.maxHp),
          phase: e.bossPhase,
          wind: round(e.wind),
          aimX: round(e.aimX),
          aimY: round(e.aimY),
        });
    for (const b of g.bullets.items)
      if (near(b.x, b.y))
        entities.push({
          id: "b" + b.id,
          kind: "bullet",
          x: round(b.x),
          y: round(b.y),
          r: b.r,
          type: b.kind,
          color: b.color,
          enemy: b.enemy,
        });
    for (const a of g.areas)
      if (near(a.x, a.y))
        entities.push({
          id: this.identity(a, "a"),
          kind: "area",
          x: round(a.x),
          y: round(a.y),
          r: a.r,
          type: a.kind,
          color: a.w?.definition.color,
          enemy: a.enemy,
          delay: round(a.delay),
          armed: a.armed,
        });
    for (const o of g.pickups)
      if ((!o.ownerId || o.ownerId === m.id) && near(o.x, o.y))
        entities.push({
          id: this.identity(o, "p"),
          kind: "pickup",
          x: round(o.x),
          y: round(o.y),
          r: 16,
          type: o.type,
          value: o.value,
          itemId: o.itemId,
        });
    for (const o of g.gems)
      if (near(o.x, o.y))
        entities.push({
          id: this.identity(o, "g"),
          kind: "gem",
          x: round(o.x),
          y: round(o.y),
          r: 4,
          type: "xp",
          value: o.value,
        });
    const now = new Map<string, NetEntity>(),
      upsert: NetEntity[] = [],
      patch: EntityPatch[] = [];
    for (const e of entities) {
      now.set(e.id, e);
      const previous = this.previous.get(e.id);
      if (full || !previous) upsert.push(e);
      else {
        const fields = Object.entries(e).filter(([key, value]) => {
          const old = previous[key as keyof NetEntity];
          return Array.isArray(value) && Array.isArray(old)
            ? value.length !== old.length || value.some((v, i) => v !== old[i])
            : value !== old;
        });
        if (fields.length)
          patch.push({ id: e.id, ...Object.fromEntries(fields) });
      }
    }
    const remove = [...this.previous.keys()].filter((id) => !now.has(id));
    const base = full ? 0 : this.lastTick;
    this.lastTick = tick;
    this.previous = now;
    return {
      type: "SNAPSHOT",
      room: "",
      tick,
      time: g.run.time,
      full,
      base,
      players: [...g.members.values()].map((t) => ({
        orbit: (() => {
          const w = t.player.weapons.find((w) => w.id === "orbit");
          if (!w) return undefined;
          const v = w.values(t.player);
          return { area: v.area, amount: v.amount, evolved: w.evolved };
        })(),
        buff: round(t.player.buff),
        invulnerable: round(t.player.invulnerable),
        id: t.id,
        name: t.name,
        color: t.color,
        character: t.player.character,
        x: round(t.player.x),
        y: round(t.player.y),
        dx: t.player.dx,
        dy: t.player.dy,
        hp: t.player.health,
        maxHp: t.player.maxHealth,
        speed: t.player.speed,
        inWater: t.player.inWater,
        state: t.downed ? "downed" : t.connected ? "alive" : "disconnected",
        ack: t.input.sequence,
        revive: t.revive,
      })),
      upsert,
      patch,
      remove,
      structures: g.world.nearby
        .filter((s) => near(s.x, s.y))
        .map((s) => ({ ...s, used: s.used || m.personalStructures.has(s.id) })),
      own: {
        stats: p.stats,
        kills: g.run.kills,
        synergies: m.synergies,
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
        passives: p.passives,
        inventory: m.inventory,
        choices: m.choices,
        decision: m.decision,
        pending: m.pending,
        gold: m.gold,
        rerolls: m.rerolls,
        banishments: m.banishments,
        skips: m.skips,
      },
      seed: g.run.worldSeed,
      mapId: g.run.mapId,
      mode: g.mode,
      ended: g.ended,
      votes: [...g.votes].map(([id, v]) => ({
        id,
        count: v.accept.size,
        needed: Math.floor(g.partySizeAtStart / 2) + 1,
      })),
    };
  }
}
