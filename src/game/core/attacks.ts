import type { Weapon } from "./entities";
import { TAU, rand } from "./math";
import type { GameSimulation } from "./simulation";
import type * as T from "./types";
export const ATTACKS: Record<
  string,
  (g: GameSimulation, w: Weapon, v: T.WeaponValues) => void
> = {
  ember(g, w, v) {
    const p = g.player;
    const target = g.grid.nearest(p.x, p.y, 850);
    if (!target) return;

    const a = Math.atan2(target.y - p.y, target.x - p.x);
    const n = v.amount;

    for (let i = 0; i < n; i++) {
      const angle = a + (i - (n - 1) / 2) * 0.12;

      g.projectile(w, p.x, p.y, Math.cos(angle) * 365, Math.sin(angle) * 365, {
        damage: v.damage,
        r: (w.evolved ? 11 : 6) * v.area,
        life: 2.6,
        blast: (w.evolved ? 90 : 0) * v.area * (v.mods.blast || 1),
        pierce: v.mods.pierce || 0,
      });
    }
  },

  orbit(g, w, v) {
    const p = g.player;
    const n = v.amount + 1;
    const rings = w.evolved ? 2 : 1;

    w.shots += n * rings;

    for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < n; i++) {
        const a = g.run.simTime * (ring ? -2.5 : 2.5) + (i / n) * TAU;
        const r = (ring ? 115 : 65) * v.area;
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;

        g.grid.query(x, y, 22 * v.area + 68, (e) => {
          if ((e.x - x) ** 2 + (e.y - y) ** 2 < (e.r + 18 * v.area) ** 2) {
            g.damageEnemy(e, v.damage, w, 65);
            if (w.path === "fracture" && Math.random() < 0.18)
              g.blast(e.x, e.y, 24 * v.area, v.damage * 0.28, w, 0, 0, {
                noStructure: true,
              });
          }
        });
      }
    }
  },

  spear(g, w, v) {
    const p = g.player;
    const base = Math.atan2(p.dy, p.dx);
    const n = w.evolved ? 8 + v.amount : v.amount;

    for (let i = 0; i < n; i++) {
      const a = w.evolved
        ? base + (i / n) * TAU
        : base + (i - (n - 1) / 2) * 0.14 * (v.mods.spread || 1);

      g.projectile(w, p.x, p.y, Math.cos(a) * 560, Math.sin(a) * 560, {
        damage: v.damage,
        r: 5 * v.area,
        pierce: w.evolved
          ? 50
          : 2 + Math.floor(w.level / 2) + (v.mods.pierce || 0),
        life: 1.25 * v.duration,
        kind: "needle",
        knock: 85,
      });
    }
  },

  frost(g, w, v) {
    w.shots++;

    const slow = w.path === "rime" ? 2.7 : 1.5;
    const freeze = w.evolved
      ? 0.65
      : w.path === "crystal" && Math.random() < 0.28
        ? 0.48
        : 0;
    g.blast(
      g.player.x,
      g.player.y,
      (w.evolved ? 135 : 76) * v.area,
      v.damage,
      w,
      slow,
      freeze,
    );
  },

  chain(g, w, v) {
    const p = g.player;
    const hit = new Set<number>();

    let x = p.x;
    let y = p.y;
    let count = Math.max(
      1,
      2 + v.amount + (w.evolved ? 5 : 0) + (v.mods.jumps || 0),
    );

    w.shots++;

    while (count-- > 0) {
      const e = g.grid.nearest(
        x,
        y,
        hit.size ? 240 * v.area * (v.mods.chainRange || 1) : 750,
        hit,
      );

      if (!e) break;

      hit.add(e.id);

      if (g.lines.length < 100) {
        g.lines.push({
          kind: "lightning",
          x,
          y,
          tx: e.x,
          ty: e.y,
          color: w.definition.color,
          life: 0.22,
          max: 0.22,
        });
      }

      g.damageEnemy(e, v.damage, w, 15);

      if (w.evolved) {
        g.blast(e.x, e.y, 42 * v.area, v.damage * 0.35, w);
      }

      x = e.x;
      y = e.y;
    }
  },

  well(g, w, v) {
    const p = g.player;

    for (let i = 0; i < v.amount; i++) {
      const target = g.grid.nearest(
        p.x + rand(-180, 180),
        p.y + rand(-180, 180),
        650,
      );

      const x = target?.x ?? p.x + rand(-100, 100);
      const y = target?.y ?? p.y + rand(-100, 100);

      g.area(
        x,
        y,
        (w.evolved ? 93 : 60) * v.area,
        v.damage,
        w,
        3.2 * v.duration,
      );

      w.shots++;
    }
  },

  disc(g, w, v) {
    const p = g.player;
    const target = g.grid.nearest(p.x, p.y, 750);

    const a = target
      ? Math.atan2(target.y - p.y, target.x - p.x)
      : Math.atan2(p.dy, p.dx);

    const n = v.amount + (w.evolved ? 3 : 0);

    for (let i = 0; i < n; i++) {
      const angle = a + (i - (n - 1) / 2) * 0.3;

      g.projectile(
        w,
        p.x,
        p.y,
        Math.cos(angle) * 310 * (v.mods.speed || 1),
        Math.sin(angle) * 310 * (v.mods.speed || 1),
        {
          damage: v.damage,
          r: 11 * v.area,
          life: 3.4 * v.duration,
          kind: "disc",
          pierce: 100,
          blast: w.evolved ? 85 * v.area : 0,
        },
      );
    }
  },

  meteor(g, w, v) {
    const p = g.player;
    const n = v.amount * (w.evolved ? 3 : 1);

    for (let i = 0; i < n; i++) {
      const target = g.grid.nearest(
        p.x + rand(-260, 260),
        p.y + rand(-260, 260),
        800,
      );

      if (!target) continue;

      g.area(
        target.x + rand(-25, 25),
        target.y + rand(-25, 25),
        70 * v.area,
        v.damage,
        w,
        0.01,
        0.65 + i * 0.12,
        "meteor",
      );

      w.shots++;
    }
  },
};
