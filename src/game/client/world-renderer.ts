import {
  CHARACTER_DEFINITIONS,
  CHUNK_SIZE,
  STRUCTURE_DEFINITIONS,
  WEAPON_DEFINITIONS,
} from "../content/catalog";
import { cosmeticVisual } from "../content/cosmetics";
import { TAU, clamp, hashString } from "../core/math";
import type { Player } from "../core/entities";
import type { World } from "../core/world";
import type * as T from "../core/types";
export interface WorldRenderContext {
  ctx: CanvasRenderingContext2D;
  camera: T.Vec;
  viewW: number;
  viewH: number;
  world?: Pick<World, "map" | "mapId" | "isWater" | "chunks" | "profile">;
  run: Pick<T.RunState, "worldSeed" | "simTime">;
  player: Player;
  debug: {
    chunks: boolean;
    structureIds: boolean;
    collisions: boolean;
    hitboxes: boolean;
  };
}
/** Shared world, character and weapon art for offline, co-op and competitive layers. */
export class WorldRenderer<G extends WorldRenderContext = WorldRenderContext> {
  c: CanvasRenderingContext2D;
  floor: CanvasPattern | null = null;
  waterMask: HTMLCanvasElement | null = null;
  waterKey = "";
  constructor(public g: G) {
    this.c = g.ctx;
  }
  drawOrbit(
    x: number,
    y: number,
    area: number,
    amount: number,
    evolved: boolean,
    time: number,
  ) {
    const c = this.c,
      n = amount + 1;
    for (let ring = 0; ring < (evolved ? 2 : 1); ring++)
      for (let i = 0; i < n; i++) {
        const a = time * (ring ? -2.5 : 2.5) + (i / n) * TAU,
          r = (ring ? 115 : 65) * area;
        c.fillStyle = WEAPON_DEFINITIONS.orbit.color;
        this.polygon(x + Math.cos(a) * r, y + Math.sin(a) * r, 10 * area, 3, a);
        c.fill();
      }
  }

  visible(x: number, y: number, r = 40) {
    const g = this.g;

    return (
      Math.abs(x - g.camera.x) < g.viewW / 2 + r &&
      Math.abs(y - g.camera.y) < g.viewH / 2 + r
    );
  }

  polygon(x: number, y: number, r: number, sides: number, angle = 0) {
    const c = this.c;
    c.beginPath();

    for (let i = 0; i < sides; i++) {
      const a = angle + (i / sides) * TAU;

      if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }

    c.closePath();
  }

  circle(x: number, y: number, r: number) {
    const c = this.c;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
  }

  terrain() {
    const g = this.g,
      c = this.c;
    const left = g.camera.x - g.viewW / 2 - 30,
      top = g.camera.y - g.viewH / 2 - 30;
    const map = g.world?.map;
    c.fillStyle = map?.palette?.floor || map?.floor || this.floor || "#101e24";
    c.fillRect(left, top, g.viewW + 60, g.viewH + 60);

    if (map?.water && g.world?.profile) {
      const profile = g.world.profile,
        key = `${g.run.worldSeed}:${g.world.mapId}:${profile.width}`;
      if (!this.waterMask || this.waterKey !== key) {
        this.waterKey = key;
        this.waterMask = document.createElement("canvas");
        this.waterMask.width = profile.width;
        this.waterMask.height = profile.height;
        const water = this.waterMask.getContext("2d")!;
        water.fillStyle = (map.palette.water || "#153b40") + "99";
        // Nine divides the 180-unit cells and 27-unit dry paths: visible mask matches movement.
        for (let y = 0; y < profile.height; y += 9)
          for (let x = 0; x < profile.width; x += 9)
            if (g.world.isWater(x + 4.5, y + 4.5)) water.fillRect(x, y, 9, 9);
      }
      c.drawImage(this.waterMask, 0, 0);
    } else if (map?.water) {
      const cell = 220;
      const minX = Math.floor(left / cell) - 1,
        maxX = Math.ceil((left + g.viewW + 60) / cell) + 1;
      const minY = Math.floor(top / cell) - 1,
        maxY = Math.ceil((top + g.viewH + 60) / cell) + 1;
      for (let cy = minY; cy <= maxY; cy++)
        for (let cx = minX; cx <= maxX; cx++) {
          const x = cx * cell,
            y = cy * cell;
          if (
            !g.world!.isWater(x + cell * 0.2, y + cell * 0.2) &&
            !g.world!.isWater(x + cell * 0.8, y + cell * 0.8)
          )
            continue;
          c.fillStyle = (map.palette?.water || "#153b40") + "45";
          c.fillRect(x, y, cell, cell);
          const hash = hashString(`${g.run.worldSeed}|water|${cx}|${cy}`);
          if (hash % 3 === 0) {
            c.strokeStyle = "#6fa3a31d";
            c.lineWidth = 1;
            c.beginPath();
            const rippleY =
              y +
              cell * 0.52 +
              Math.sin(g.run.simTime * 0.55 + (hash % 17)) * 4;
            c.moveTo(x + 45, rippleY);
            c.lineTo(
              x + cell - 45,
              rippleY + Math.cos(g.run.simTime * 0.45 + cy) * 3,
            );
            c.stroke();
          }
        }
    }

    const cell = 560;
    const density = map?.terrainDensity ?? 0.5;
    const minX = Math.floor(left / cell) - 1,
      maxX = Math.ceil((left + g.viewW + 60) / cell) + 1;
    const minY = Math.floor(top / cell) - 1,
      maxY = Math.ceil((top + g.viewH + 60) / cell) + 1;
    for (let cy = minY; cy <= maxY; cy++)
      for (let cx = minX; cx <= maxX; cx++) {
        const hash = hashString(
          `${g.run?.worldSeed || "menu"}|terrain|${g.world?.mapId || "ruins"}|${cx}|${cy}`,
        );
        if (hash % 100 >= Math.round(18 * density)) continue;
        const px = cx * cell + 90 + ((hash >>> 4) % (cell - 180));
        const py = cy * cell + 90 + ((hash >>> 12) % (cell - 180));
        const kind = (hash >>> 20) % 3;
        c.save();
        c.globalAlpha = map?.water ? 0.18 : 0.22;
        c.strokeStyle = map?.palette?.accent || "#71998b";
        c.fillStyle = "#26383b";
        c.lineWidth = 1;
        if (kind === 0) {
          c.beginPath();
          c.ellipse(px, py, 48, 17, (hash % 31) / 31, 0, TAU);
          c.stroke();
          c.beginPath();
          c.ellipse(px + 8, py - 2, 25, 8, (hash % 19) / 19, 0, TAU);
          c.stroke();
        } else if (kind === 1) {
          this.polygon(px, py, 22, 4, Math.PI / 4);
          c.stroke();
          this.polygon(px + 34, py + 10, 11, 5, 0);
          c.stroke();
        } else {
          c.beginPath();
          c.moveTo(px - 34, py + 12);
          c.lineTo(px - 7, py - 14);
          c.lineTo(px + 18, py + 3);
          c.lineTo(px + 43, py - 18);
          c.stroke();
        }
        c.restore();
      }

    if (g.debug.chunks && g.world) {
      c.strokeStyle = "#8fd0b755";
      c.lineWidth = 1;
      c.font = "11px monospace";
      c.fillStyle = "#bfe6d0";
      for (const ch of g.world.chunks.values()) {
        const x = ch.cx * CHUNK_SIZE,
          y = ch.cy * CHUNK_SIZE;
        c.strokeRect(x, y, CHUNK_SIZE, CHUNK_SIZE);
        c.fillText(`${ch.cx},${ch.cy}`, x + 8, y + 16);
      }
    }
  }

  structure(s: T.Structure, time: number) {
    const g = this.g,
      c = this.c,
      d = STRUCTURE_DEFINITIONS[s.type];
    if (!d) return;
    if (!this.visible(s.x, s.y, s.r + 30)) {
      if (!d.rare) return;
      const x = clamp(
        s.x,
        g.camera.x - g.viewW / 2 + 42,
        g.camera.x + g.viewW / 2 - 42,
      );
      const y = clamp(
        s.y,
        g.camera.y - g.viewH / 2 + 125,
        g.camera.y + g.viewH / 2 - 90,
      );
      c.fillStyle = "#e9d093";
      c.font = "13px Georgia";
      c.textAlign = "center";
      c.fillText("◇", x, y);
      c.font = "9px system-ui";
      c.fillText(
        `${Math.round(Math.hypot(s.x - g.player.x, s.y - g.player.y))}m`,
        x,
        y + 12,
      );
      c.textAlign = "left";
      return;
    }
    c.save();
    c.translate(s.x, s.y);
    c.rotate((s.angle || 0) + (s.type === "rift" ? time * 0.08 : 0));
    const gameplayAlpha =
      d.kind === "HAZARD"
        ? 1
        : d.interactive
          ? 0.95
          : d.destructible
            ? 0.76
            : s.type === "platform"
              ? 0.58
              : d.collidable
                ? 0.56
                : 0.38;
    c.globalAlpha = s.used || s.opened ? gameplayAlpha * 0.46 : gameplayAlpha;
    c.fillStyle = "#07111688";
    c.beginPath();
    c.ellipse(5, s.r * 0.7, s.r * 0.9, s.r * 0.35, 0, 0, TAU);
    c.fill();
    c.strokeStyle = d.color;
    c.fillStyle = d.color;
    c.lineWidth = 1.5;
    if (s.type === "urn") {
      c.beginPath();
      c.moveTo(-10, -12);
      c.quadraticCurveTo(-17, 4, -11, 15);
      c.lineTo(11, 15);
      c.quadraticCurveTo(17, 4, 10, -12);
      c.closePath();
      c.fill();
      c.fillStyle = "#1b2b2c";
      c.fillRect(-8, -15, 16, 5);
    } else if (["column", "wall", "stone", "ruin"].includes(s.type)) {
      this.polygon(0, 0, s.r, s.type === "wall" ? 4 : 6, s.angle || 0);
      c.fill();
      c.stroke();
      c.fillStyle = "#1b3033";
      this.polygon(-3, -5, s.r * 0.55, 5, 0);
      c.fill();
    } else if (s.type === "tree") {
      c.fillStyle = "#263d36";
      c.fillRect(-4, -5, 8, 25);
      c.fillStyle = d.color;
      this.polygon(0, -16, s.r, 5, time * 0.03 + s.variant);
      c.fill();
    } else if (s.type === "platform") {
      c.fillStyle = "#405456aa";
      c.strokeStyle = "#71868877";
      c.beginPath();
      c.ellipse(0, 0, s.r * 1.25, s.r * 0.72, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = "#88aaa655";
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(-s.r, i * 12);
        c.lineTo(s.r, i * 12);
        c.stroke();
      }
    } else if (s.type === "fountain") {
      c.strokeStyle = d.color;
      c.lineWidth = 3;
      this.circle(0, 0, s.r);
      c.stroke();
      c.fillStyle = s.used ? "#293b39" : "#4e9a8277";
      this.circle(0, 0, s.r * 0.67);
      c.fill();
      c.fillStyle = "#d8f4db";
      c.font = "18px Georgia";
      c.textAlign = "center";
      c.fillText(s.used ? "·" : "✚", 0, 6);
    } else if (
      ["exchange", "memory", "rift_altar", "silence"].includes(s.type)
    ) {
      this.polygon(0, 0, s.r, 6, Math.PI / 6);
      c.fill();
      c.stroke();
      c.fillStyle = "#14252c";
      this.polygon(0, 0, s.r * 0.68, 6, 0);
      c.fill();
      c.fillStyle = d.color;
      c.font = "20px Georgia";
      c.textAlign = "center";
      c.fillText(
        s.type === "exchange"
          ? "↔"
          : s.type === "memory"
            ? "◈"
            : s.type === "rift_altar"
              ? "✧"
              : "○",
        0,
        7,
      );
    } else if (s.type === "chest") {
      c.fillStyle = "#493e33";
      c.fillRect(-18, -10, 36, 24);
      c.strokeRect(-18, -10, 36, 24);
      c.fillStyle = d.color;
      c.fillRect(-3, -3, 6, 9);
      c.beginPath();
      c.arc(0, -10, 18, Math.PI, TAU);
      c.stroke();
    } else if (s.type === "obelisk") {
      c.fillStyle = "#34514d";
      c.beginPath();
      c.moveTo(0, -38);
      c.lineTo(17, 19);
      c.lineTo(0, 29);
      c.lineTo(-17, 19);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = "#9edcc177";
      c.beginPath();
      c.moveTo(0, -26);
      c.lineTo(0, 13);
      c.stroke();
    } else if (s.type === "rift" || s.type === "thorn") {
      c.globalAlpha = 0.35 + 0.15 * Math.sin(time * 4 + s.variant);
      c.fillStyle = d.color;
      this.circle(0, 0, s.r);
      c.fill();
      c.globalAlpha = 0.9;
      c.strokeStyle = d.color;
      this.circle(0, 0, s.r * (0.72 + 0.08 * Math.sin(time * 5)));
      c.stroke();
      if (s.type === "thorn") {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          c.beginPath();
          c.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
          c.lineTo(Math.cos(a) * s.r, Math.sin(a) * s.r);
          c.stroke();
        }
      }
    }
    c.restore();
    if (g.debug.structureIds) {
      c.fillStyle = "#fff";
      c.font = "9px monospace";
      c.fillText(s.id, s.x - s.r, s.y - s.r - 6);
    }
    if (g.debug.collisions && d.collidable) {
      c.strokeStyle = "#ff8a8a";
      this.circle(s.x, s.y, s.r);
      c.stroke();
    }
  }

  player(p: Player, time: number) {
    const c = this.c,
      g = this.g,
      def = CHARACTER_DEFINITIONS[p.character],
      visuals = cosmeticVisual(p.cosmetics),
      color = visuals.skin?.color || def.color;
    const moving = Math.abs(p.dx) + Math.abs(p.dy) > 0.01;
    const bob = moving ? Math.sin(time * 10) * 1.8 : Math.sin(time * 3) * 0.8;
    c.fillStyle = "#020b10aa";
    c.beginPath();
    c.ellipse(p.x, p.y + 16, 18, 8, 0, 0, TAU);
    c.fill();
    if (p.invulnerable > 0 && Math.floor(time * 16) % 2 === 0)
      c.globalAlpha = 0.45;
    if (p.hurtFlash > 0) c.globalAlpha = 0.58;
    if (p.buff > 0) {
      c.strokeStyle = "#f6d093";
      c.lineWidth = 2;
      this.circle(p.x, p.y, 25 + Math.sin(time * 6) * 3);
      c.stroke();
    }
    c.save();
    c.translate(p.x, p.y + bob);
    if (visuals.trail && moving) {
      c.strokeStyle = visuals.trail.color;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-p.dx * 18, -p.dy * 18);
      c.lineTo(-p.dx * 38, -p.dy * 38);
      c.stroke();
    }
    if (visuals.weapon) {
      c.strokeStyle = visuals.weapon.color;
      this.circle(0, 0, 21);
      c.stroke();
    }
    if (visuals.spawn && time < 3) {
      c.strokeStyle = visuals.spawn.color;
      this.circle(0, 0, 28 + time * 5);
      c.stroke();
    }
    if (visuals.evolution && p.weapons.some((w) => w.evolved)) {
      c.strokeStyle = visuals.evolution.color;
      this.circle(0, 0, 25 + Math.sin(time * 2) * 2);
      c.stroke();
    }
    if (visuals.death && p.health <= 0) {
      c.fillStyle = visuals.death.color;
      c.fillText(visuals.death.glyph, -8, -28);
    }
    if (visuals.emote && time % 20 < 2) {
      c.fillStyle = visuals.emote.color;
      c.fillText(visuals.emote.glyph, 18, -28);
    }
    if (visuals.icon) {
      c.fillStyle = visuals.icon.color;
      c.fillText(visuals.icon.glyph, -6, -32);
    }
    if (visuals.frame) {
      c.strokeStyle = visuals.frame.color;
      c.strokeRect(-11, -44, 22, 20);
    }

    c.fillStyle = "#19353a";
    c.strokeStyle = color;
    c.lineWidth = 2;
    if (p.character === "nara") {
      c.beginPath();
      c.moveTo(0, -18);
      c.lineTo(15, 15);
      c.lineTo(0, 9);
      c.lineTo(-15, 15);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      this.polygon(0, -9, 9, 4, Math.PI / 4);
      c.fill();
      c.strokeStyle = "#ffbd86";
      c.beginPath();
      c.moveTo(-11, 8);
      c.quadraticCurveTo(-18, 3 + Math.sin(time * 6) * 3, -12, -8);
      c.stroke();
    } else if (p.character === "orin") {
      c.beginPath();
      c.arc(0, -3, 14, Math.PI * 0.1, Math.PI * 0.9);
      c.lineTo(11, 15);
      c.lineTo(-11, 15);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = color;
      for (let i = 0; i < 3; i++) {
        this.circle(0, -4, 7 + i * 5 + Math.sin(time * 2 + i));
        c.stroke();
      }
    } else if (p.character === "ivo") {
      c.beginPath();
      c.moveTo(0, -19);
      c.lineTo(13, -2);
      c.lineTo(9, 16);
      c.lineTo(-9, 16);
      c.lineTo(-13, -2);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      this.polygon(0, -7, 8, 6, time * 0.5);
      c.fill();
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(-17, -2);
      c.lineTo(-9, -2);
      c.moveTo(9, -2);
      c.lineTo(17, -2);
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(0, -20);
      c.lineTo(14, 12);
      c.lineTo(0, 17);
      c.lineTo(-14, 12);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = color;
      this.circle(0, -7, 9);
      c.stroke();
      c.fillStyle = color;
      for (let i = 0; i < 3; i++) {
        const a = time * 0.45 + (i / 3) * TAU;
        this.circle(Math.cos(a) * 11, -7 + Math.sin(a) * 6, 2.2);
        c.fill();
      }
    }
    c.fillStyle = "#13242d";
    c.fillRect(-5, -10, 10, 5);
    c.fillStyle = "#ffedca";
    c.fillRect(-4 + p.dx * 2, -9, 3, 2);
    c.fillRect(2 + p.dx * 2, -9, 3, 2);
    c.restore();
    c.globalAlpha = 1;
    if (g.debug.hitboxes) {
      c.strokeStyle = "#fff";
      this.circle(p.x, p.y, p.r);
      c.stroke();
      c.strokeStyle = "#7ecab4";
      this.circle(p.x, p.y, p.stats.pickupRange);
      c.stroke();
    }
  }

  projectile(
    b: Pick<T.Bullet, "x" | "y" | "vx" | "vy" | "r" | "kind" | "age">,
    projectileColor: string,
  ) {
    const c = this.c;
    c.strokeStyle = projectileColor;
    c.fillStyle = projectileColor;
    c.globalAlpha = 0.35;
    c.lineWidth = b.r * (b.kind === "needle" ? 1.2 : 0.8);

    c.beginPath();
    c.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.globalAlpha = 1;

    if (b.kind === "disc") {
      this.polygon(b.x, b.y, b.r, 6, b.age * 15);
      c.lineWidth = 2;
      c.stroke();
      this.circle(b.x, b.y, 3);
      c.fill();
    } else if (b.kind === "needle") {
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
      c.lineTo(b.x, b.y);
      c.stroke();
    } else {
      this.circle(b.x, b.y, b.r);
      c.fill();
      c.fillStyle = "#fff2d8";
      this.circle(b.x - 1, b.y - 1, b.r * 0.35);
      c.fill();
    }
  }
  area(a: {
    x: number;
    y: number;
    r: number;
    armed: boolean;
    delay: number;
    enemy?: boolean;
    kind?: string;
    color?: string;
  }) {
    const c = this.c,
      g = this.g;
    const areaColor = a.enemy
      ? a.kind === "web"
        ? "#79b7aa"
        : "#c07395"
      : a.color || "#d7a2da";
    c.fillStyle = areaColor;
    c.strokeStyle = areaColor;

    if (!a.armed) {
      c.globalAlpha = 0.25;
      c.lineWidth = 2;
      this.circle(a.x, a.y, a.r);
      c.stroke();

      this.circle(a.x, a.y, a.r * clamp(1 - a.delay / 0.8, 0.05, 1));

      c.globalAlpha = 0.15;
      c.fill();
      c.globalAlpha = 1;
      c.font = "22px Georgia";
      c.fillText("✦", a.x - 10, a.y + 8);
    } else {
      c.globalAlpha = 0.12;
      this.circle(a.x, a.y, a.r);
      c.fill();

      c.globalAlpha = 0.5;
      c.lineWidth = 1.5;

      this.circle(a.x, a.y, a.r * (0.85 + 0.07 * Math.sin(g.run.simTime * 4)));

      c.stroke();
    }

    c.globalAlpha = 1;
  }
  line(l: T.Line) {
    const c = this.c;
    c.globalAlpha = clamp(l.life / l.max, 0, 1);
    c.strokeStyle = l.color;
    c.lineWidth = 2;

    if (l.kind === "ring") {
      this.circle(l.x, l.y, (l.r || 0) * (1.05 - (l.life / l.max) * 0.3));
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(l.x, l.y);

      const dx = (l.tx || 0) - l.x;
      const dy = (l.ty || 0) - l.y;

      for (let j = 1; j < 5; j++) {
        const offset = j % 2 ? 8 : -8;

        c.lineTo(
          l.x + (dx * j) / 5 - (dy * 0.03 * offset) / 8,
          l.y + (dy * j) / 5 + (dx * 0.03 * offset) / 8,
        );
      }

      c.lineTo(l.tx || 0, l.ty || 0);
      c.stroke();
    }
  }
}
