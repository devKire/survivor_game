import {
  ACTIVE_CHUNK_RADIUS,
  CHUNK_SIZE,
  MAP_DEFINITIONS,
  STRUCTURE_DEFINITIONS,
} from "../content/catalog";
import {
  TAU,
  clamp,
  hashString,
  makeWorldSeed,
  mulberry32,
  rand,
} from "./math";
import type { GameSimulation } from "./simulation";
import type * as T from "./types";
const LEGACY_POI_WEIGHTS: Record<string, number> = {
  fountain: 4,
  exchange: 2.3,
  memory: 1.8,
  rift_altar: 1.1,
  silence: 1.1,
  chest: 2.2,
  obelisk: 0.65,
};
export class World {
  constructor(
    g: GameSimulation,
    mapId: string,
    seed: string,
    changes: Record<string, T.StructureChange> = {},
  ) {
    this.g = g;
    this.mapId = Object.hasOwn(MAP_DEFINITIONS, mapId) ? mapId : "ruins";
    this.map = MAP_DEFINITIONS[this.mapId];
    this.seed = String(seed || makeWorldSeed());
    this.changes = changes && typeof changes === "object" ? changes : {};
    this.chunks = new Map();
    this.nearby = [];
    this.interactive = null;
    this.hazardClock = 0;
  }

  chunkKey(cx: number, cy: number) {
    return `${cx},${cy}`;
  }

  chunkCoords(x: number, y: number) {
    return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
  }

  createChunk(cx: number, cy: number) {
    const key = this.chunkKey(cx, cy);
    const rng = mulberry32(
      hashString(`${this.seed}|${this.mapId}|${cx}|${cy}`),
    );
    const structures: T.Structure[] = [];
    const allowedStructures = new Set(
      this.map.structures || Object.keys(STRUCTURE_DEFINITIONS),
    );
    const entries = Object.entries(STRUCTURE_DEFINITIONS).filter(([id]) =>
      allowedStructures.has(id),
    );
    if ((this.g.run.worldVersion ?? 3) < 3)
      for (const entry of entries)
        if (LEGACY_POI_WEIGHTS[entry[0]] !== undefined)
          entry[1] = { ...entry[1], weight: LEGACY_POI_WEIGHTS[entry[0]] };
    const totalWeight = entries.reduce((a, [, d]) => a + d.weight, 0);
    const count = Math.max(
      2,
      Math.floor((4 + rng() * 7) * this.map.structureDensity),
    );

    for (let i = 0; i < count; i++) {
      let roll = rng() * totalWeight,
        chosen = entries[0];
      for (const e of entries) {
        roll -= e[1].weight;
        if (roll <= 0) {
          chosen = e;
          break;
        }
      }
      const [type, d] = chosen;
      const x = cx * CHUNK_SIZE + 55 + rng() * (CHUNK_SIZE - 110);
      const y = cy * CHUNK_SIZE + 55 + rng() * (CHUNK_SIZE - 110);
      if (Math.hypot(x, y) < 125) continue;
      if (
        structures.some(
          (o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + d.r + 28) ** 2,
        )
      )
        continue;
      const id = `${cx}:${cy}:${type}:${i}`;
      const changed = this.changes[id] || {};
      const s = {
        id,
        type,
        x,
        y,
        r: d.r,
        hp: d.hp || 0,
        maxHp: d.hp || 0,
        used: false,
        destroyed: false,
        opened: false,
        angle: rng() * TAU,
        variant: Math.floor(rng() * 4),
        ...changed,
      };
      structures.push(s);
    }
    return { cx, cy, key, structures };
  }

  ensureChunkAt(x: number, y: number) {
    const { cx, cy } = this.chunkCoords(x, y),
      key = this.chunkKey(cx, cy);
    if (!this.chunks.has(key)) this.chunks.set(key, this.createChunk(cx, cy));
    return this.chunks.get(key)!;
  }

  update() {
    const p = this.g.player;
    if (!p) return;
    const keep = new Set<string>();
    for (const center of this.g.playersForWorld()) {
      const { cx, cy } = this.chunkCoords(center.x, center.y);
      for (
        let y = cy - ACTIVE_CHUNK_RADIUS;
        y <= cy + ACTIVE_CHUNK_RADIUS;
        y++
      ) {
        for (
          let x = cx - ACTIVE_CHUNK_RADIUS;
          x <= cx + ACTIVE_CHUNK_RADIUS;
          x++
        ) {
          const key = this.chunkKey(x, y);
          keep.add(key);
          if (!this.chunks.has(key))
            this.chunks.set(key, this.createChunk(x, y));
        }
      }
    }
    for (const key of this.chunks.keys())
      if (!keep.has(key)) this.chunks.delete(key);
    this.nearby = [];
    for (const ch of this.chunks.values())
      for (const s of ch.structures) if (!s.destroyed) this.nearby.push(s);
    this.interactive = this.findInteractive(p.x, p.y, 70);
  }

  mark(s: T.Structure, patch: T.StructureChange) {
    Object.assign(s, patch);
    this.changes[s.id] = { ...(this.changes[s.id] || {}), ...patch };
    if (this.g.run) this.g.run.worldChanges = this.changes;
  }

  query(x: number, y: number, r: number, fn: (s: T.Structure) => void) {
    const min = this.chunkCoords(x - r, y - r),
      max = this.chunkCoords(x + r, y + r);
    for (let cy = min.cy; cy <= max.cy; cy++)
      for (let cx = min.cx; cx <= max.cx; cx++) {
        const ch = this.chunks.get(this.chunkKey(cx, cy));
        if (!ch) continue;
        for (const s of ch.structures)
          if (!s.destroyed && (s.x - x) ** 2 + (s.y - y) ** 2 < (r + s.r) ** 2)
            fn(s);
      }
  }

  findInteractive(x: number, y: number, r: number): T.Structure | null {
    let best: T.Structure | null = null,
      dist = r * r;
    this.query(x, y, r, (s) => {
      const d = STRUCTURE_DEFINITIONS[s.type];
      if (!d?.interactive || s.used || s.opened) return;
      const dd = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (dd < dist) {
        dist = dd;
        best = s;
      }
    });
    return best;
  }

  resolvePlayerMove(
    oldX: number,
    oldY: number,
    newX: number,
    newY: number,
    r: number,
  ) {
    let x = newX,
      y = newY,
      blocked = false;
    this.query(newX, newY, r + 45, (s) => {
      const d = STRUCTURE_DEFINITIONS[s.type];
      if (!d?.collidable || s.destroyed) return;
      const dx = x - s.x,
        dy = y - s.y,
        dist = Math.hypot(dx, dy) || 0.001,
        min = r + s.r;
      if (dist < min) {
        blocked = true;
        const nx = dx / dist,
          ny = dy / dist;
        x = s.x + nx * min;
        y = s.y + ny * min;
      }
    });
    if (blocked && !Number.isFinite(x + y)) return { x: oldX, y: oldY };
    return { x, y };
  }

  avoidEnemy(e: T.Enemy, mx: number, my: number) {
    if (["burrow", "weaver"].includes(e.behavior)) return { x: mx, y: my };
    let ax = 0,
      ay = 0;
    this.query(e.x + mx * 28, e.y + my * 28, e.r + 32, (s) => {
      const d = STRUCTURE_DEFINITIONS[s.type];
      if (!d?.collidable) return;
      const dx = e.x - s.x,
        dy = e.y - s.y,
        dist = Math.hypot(dx, dy) || 1;
      const force = clamp((e.r + s.r + 28 - dist) / 50, 0, 1);
      ax += (dx / dist) * force;
      ay += (dy / dist) * force;
    });
    const d = Math.hypot(mx + ax, my + ay) || 1;
    return { x: (mx + ax) / d, y: (my + ay) / d };
  }

  damageBreakablesAt(x: number, y: number, r: number, damage: number) {
    this.query(x, y, r, (s) => {
      const d = STRUCTURE_DEFINITIONS[s.type];
      if (!d?.destructible || s.destroyed) return;
      s.hp -= damage;
      if (s.hp <= 0) this.breakStructure(s);
    });
  }

  breakStructure(s: T.Structure) {
    if (s.destroyed) return;
    this.mark(s, { destroyed: true, hp: 0 });
    const g = this.g,
      p = g.player;
    g.spark(s.x, s.y, "#c7b58d", 10);
    g.sound.play("break");
    g.run.structuresBroken = (g.run.structuresBroken || 0) + 1;
    if (s.type === "urn") {
      g.run.urnsBroken = (g.run.urnsBroken || 0) + 1;
      const r =
        Math.random() / Math.max(1, p.stats.luck * (p.luckBuff > 0 ? 1.45 : 1));
      if (r < 0.13) g.dropItemWeighted(s.x, s.y);
      else if (r < 0.28) g.drop("heal", s.x, s.y, 18);
      else if (r < 0.63) g.drop("gems", s.x, s.y, Math.ceil(rand(2, 6)));
      else g.dropXP(s.x, s.y, 4 + Math.floor(rand(0, 8)));
    }
    g.saveSnapshot(true);
  }

  isWater(x: number, y: number) {
    if (!this.map.water) return false;
    for (const s of this.nearby)
      if (
        s.type === "platform" &&
        (s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + 38) ** 2
      )
        return false;
    const cell = 180,
      cx = Math.floor(x / cell),
      cy = Math.floor(y / cell);
    const h = hashString(`${this.seed}|water|${cx}|${cy}`) % 100;
    const localX = ((x % cell) + cell) % cell,
      localY = ((y % cell) + cell) % cell;
    const path = Math.min(
      Math.abs(localX - cell / 2),
      Math.abs(localY - cell / 2),
    );
    return h < 58 && path > 27;
  }

  updateHazards(dt: number) {
    const g = this.g,
      p = g.player;
    if (!p) return;
    p.inWater = this.isWater(p.x, p.y);
    this.hazardClock -= dt;
    if (this.hazardClock > 0) return;
    this.hazardClock = 0.45;
    this.query(p.x, p.y, p.r + 45, (s) => {
      const d = STRUCTURE_DEFINITIONS[s.type];
      if (!d?.hazard) return;
      if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < (p.r + s.r * 0.75) ** 2) {
        g.hurtPlayer(s.type === "rift" ? 8 : 5);
      }
    });
  }

  countInteractive() {
    return this.nearby.reduce(
      (n, s) =>
        n +
        (STRUCTURE_DEFINITIONS[s.type]?.interactive && !s.used && !s.opened
          ? 1
          : 0),
      0,
    );
  }

  g!: GameSimulation;
  mapId!: string;
  map!: T.MapDefinition;
  seed!: string;
  changes!: Record<string, T.StructureChange>;
  chunks!: Map<string, T.Chunk>;
  nearby!: T.Structure[];
  interactive!: T.Structure | null;
  hazardClock!: number;
}
