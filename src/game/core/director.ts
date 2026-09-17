import { BOSS_EVENTS, ENEMY_DEFINITIONS, WAVE_TABLE } from "../content/catalog";
import { TAU, rand, weighted } from "./math";
import type { GameSimulation } from "./simulation";
import type * as T from "./types";
export class WaveDirector {
  constructor() {
    this.index = 0;
    this.spawnClock = 0;
    this.eliteClock = 80;
    this.formationClock = 24;
    this.eventIndex = 0;
    this.nextEndlessBossAt = 1920;
    this.endlessBossIndex = 0;
  }

  wavePool(g: GameSimulation, wave: T.WaveDefinition): [string, number][] {
    const allowed = new Set(
      g.world?.map.enemyPool || Object.keys(ENEMY_DEFINITIONS),
    );
    const pool = wave.enemies.filter(([id]) => allowed.has(id));
    const t = g.run.time;
    const additions: [string, number][] = (
      [
        ["burrower", t > 120 ? 1.5 : 0],
        ["sentinel", t > 210 ? 1.2 : 0],
        ["herald", t > 300 ? 1 : 0],
        ["charger", t > 240 ? 1.35 : 0],
        ["splitter", t > 360 ? 1.1 : 0],
        ["weaver", t > 420 ? 1 : 0],
      ] as [string, number][]
    ).filter(([id, w]) => w > 0 && allowed.has(id));
    return [...pool, ...additions].length
      ? [...pool, ...additions]
      : [["husk", 1]];
  }

  spawnEndlessBosses(g: GameSimulation, t: number) {
    const mode = g.modeDef;
    if (!mode.endless || t < mode.endlessStart) return;
    if (
      !Number.isFinite(this.nextEndlessBossAt) ||
      this.nextEndlessBossAt < mode.endlessStart + mode.bossInterval
    ) {
      this.nextEndlessBossAt = mode.endlessStart + mode.bossInterval;
    }
    while (t >= this.nextEndlessBossAt) {
      const mapBosses = g.world?.map.bosses || BOSS_EVENTS.map((_, i) => i);
      const bossIndex = mapBosses[this.endlessBossIndex % mapBosses.length];
      const base = BOSS_EVENTS[bossIndex] || BOSS_EVENTS[0];
      const count = t >= mode.doubleBossAfter ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const alternate =
          BOSS_EVENTS[
            mapBosses[(this.endlessBossIndex + i) % mapBosses.length]
          ] || base;
        g.spawn("boss", i ? Math.PI : null, {
          ...alternate,
          eventIndex: null,
          endless: true,
        });
      }
      if (t >= mode.bossEscortAfter) {
        const escorts = t >= mode.doubleBossAfter ? 2 : 1;
        for (let i = 0; i < escorts; i++) g.spawn("elite");
      }
      this.endlessBossIndex += count;
      this.nextEndlessBossAt += mode.bossInterval;
      g.announce(
        base.name,
        t >= mode.doubleBossAfter
          ? "Dois custódios atravessam a névoa."
          : "Outro custódio responde ao chamado.",
      );
      g.sound.play("boss");
    }
  }

  update(g: GameSimulation, dt: number) {
    const t = g.run.time;
    const schedule = g.expeditionProfile.bossSchedule;
    while (
      this.index < WAVE_TABLE.length - 1 &&
      t >= WAVE_TABLE[this.index].end
    )
      this.index++;
    const wave = WAVE_TABLE[this.index];
    const scale = g.modeScaling(t);
    const cap = g.currentEnemyCap(wave, scale);

    while (
      this.eventIndex < schedule.length &&
      t >= schedule[this.eventIndex] &&
      t >= (g.run.restUntil || 0) &&
      !g.enemies.some(
        (e) => !e.dead && (e.type === "boss" || e.type === "final"),
      )
    ) {
      const mapBosses = g.world?.map.bosses || BOSS_EVENTS.map((_, i) => i);
      const bossIndex = mapBosses[this.eventIndex % mapBosses.length];
      const base = BOSS_EVENTS[bossIndex] || BOSS_EVENTS[this.eventIndex];
      const event = { ...base, eventIndex: this.eventIndex };
      this.eventIndex++;
      if (!(g.run.bossHistory || []).includes(event.eventIndex)) {
        g.spawn("boss", null, event);
        g.announce(event.name, "Um custódio atravessou a névoa.");
        g.sound.play("boss");
      }
    }
    this.spawnEndlessBosses(g, t);

    const mapMods = g.world?.map.waveModifiers || {};
    const eventRate =
      (g.run.restUntil || 0) > t
        ? 0.2
        : g.run.silenceTime > 0
          ? 0.32
          : g.run.surgeTime > 0
            ? 1.6
            : 1;
    this.spawnClock +=
      dt *
      wave.rate *
      (mapMods.rate || 1) *
      eventRate *
      (t < 12 ? 0.45 : 1) *
      scale.spawn;
    let budget = Math.min(24, Math.max(14, Math.ceil(14 * scale.spawn)));
    const pool = this.wavePool(g, wave);
    while (this.spawnClock >= 1 && budget-- > 0) {
      this.spawnClock--;
      if (g.enemies.length < cap) g.spawn(weighted(pool, (x) => x[1])[0]);
    }

    this.eliteClock -=
      dt *
      ((g.run.restUntil || 0) > t ? 0 : 1) *
      g.clockRate *
      (g.run.surgeTime > 0 ? 1.5 : 1) *
      scale.elite;
    if (this.eliteClock <= 0) {
      this.eliteClock = wave.elite / Math.max(0.25, mapMods.elite || 1);
      if (g.enemies.length < cap) g.spawn("elite");
    }

    this.formationClock -=
      (dt * ((g.run.restUntil || 0) > t ? 0 : 1) * g.clockRate) /
      Math.max(0.2, scale.formationInterval);
    if (this.formationClock <= 0) {
      this.formationClock = rand(26, 40);
      const count = Math.min(
        28,
        Math.ceil(Math.min(18, 4 + Math.floor(t / 110)) * scale.formation),
      );
      const angle = rand(0, TAU);
      for (let i = 0; i < count && g.enemies.length < cap; i++) {
        const a =
          wave.formation === "ring"
            ? (i / count) * TAU
            : angle + (i - count / 2) * 0.07;
        const id =
          wave.formation === "swarm" && g.world.map.enemyPool.includes("swarm")
            ? "swarm"
            : weighted(pool, (x) => x[1])[0];
        g.spawn(id, a);
      }
    }
  }

  index!: number;
  spawnClock!: number;
  eliteClock!: number;
  formationClock!: number;
  eventIndex!: number;
  nextEndlessBossAt!: number;
  endlessBossIndex!: number;
}
