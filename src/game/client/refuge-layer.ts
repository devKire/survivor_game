import type { RefugeTarget, RefugeDefinition } from "../core/rpg/refuge/types";
import { REFUGE } from "../content/rpg/refuge";
import { TileRenderer, tileImageGeneration } from "./tile-renderer";
import { resolveGroundAtlas } from "./tile-art";

/** Shared static refuge art. No input, RAF, position or authority. */
export class RefugeLayer {
  constructor(private readonly definition: RefugeDefinition = REFUGE) {}
  readonly tiles = new TileRenderer();
  private terrain?: HTMLCanvasElement;
  private terrainGeneration = -1;
  terrainRaster() {
    if (this.terrain && this.terrainGeneration === tileImageGeneration())
      return this.terrain;
    this.terrain ??= document.createElement("canvas");
    this.terrain.width = this.definition.bounds.width;
    this.terrain.height = this.definition.bounds.height;
    const c = this.terrain.getContext("2d")!;
    for (let y = 0; y < 900; y += 100)
      for (let x = 0; x < 1200; x += 100) {
        const path =
          Math.abs(x + 50 - 600) < 120 ||
          (y >= 400 && y < 600) ||
          (y >= 600 && y < 700 && x >= 200 && x < 1000);
        c.fillStyle = path ? "#344346" : "#24352d";
        c.fillRect(x, y, 100, 100);
        this.tiles.drawGround(
          c,
          resolveGroundAtlas(path ? "ruins" : "forest"),
          (x / 100 + (y / 100) * 3) % 16,
          x,
          y,
          100,
          0.55,
        );
      }
    this.terrainGeneration = tileImageGeneration();
    return this.terrain;
  }
  drawTarget(
    ctx: CanvasRenderingContext2D,
    t: RefugeTarget,
    selected?: string,
  ) {
    const c = ctx,
      active = selected === t.id;
    c.fillStyle = "#0006";
    c.beginPath();
    c.ellipse(t.x, t.y + 5, t.collisionRadius + 8, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.translate(t.x, t.y);
    if (t.visual === "obelisk") {
      c.fillStyle = "#425b60";
      c.fillRect(-31, -12, 62, 17);
      c.fillStyle = "#26363f";
      c.beginPath();
      c.moveTo(-20, -15);
      c.lineTo(-14, -105);
      c.lineTo(0, -132);
      c.lineTo(18, -107);
      c.lineTo(23, -15);
      c.closePath();
      c.fill();
      c.fillStyle = "#8eedc7";
      c.fillRect(-3, -99, 5, 66);
      c.fillRect(-10, -60, 20, 4);
    } else if (t.visual === "forge") {
      // Pixel fallback: aged metal/anvil and a stone hearth with embers.
      c.fillStyle = "#27333b"; c.fillRect(-36, -39, 72, 42);
      c.fillStyle = "#53616a"; c.fillRect(-38, -42, 76, 9); c.fillRect(-24, -33, 9, 30); c.fillRect(23, -33, 9, 30);
      c.fillStyle = "#120f11"; c.fillRect(-9, -29, 26, 25);
      c.fillStyle = "#c7532d"; c.fillRect(-7, -17, 22, 12);
      c.fillStyle = "#edb35e"; c.fillRect(-4, -15, 7, 5); c.fillRect(6, -19, 6, 10);
      c.fillStyle = "#92918a"; c.fillRect(-21, -53, 39, 9); c.fillRect(-10, -44, 14, 6);
      c.fillStyle = "#8dd7bd"; c.fillRect(26, -57, 6, 12);
    } else if (t.visual === "refinery") {
      c.fillStyle = "#4e4940"; c.fillRect(-32, -32, 64, 35);
      c.fillStyle = "#81705b"; c.fillRect(-35, -38, 70, 9);
      c.fillStyle = "#9aa9a4"; c.fillRect(-22, -48, 19, 11); c.fillRect(-18, -57, 11, 9);
      c.fillStyle = "#87cbbd"; c.fillRect(7, -54, 12, 16); c.fillRect(10, -63, 6, 9);
      c.fillStyle = "#c2ab79"; c.fillRect(-24, -22, 6, 16); c.fillRect(21, -22, 6, 16);
    } else if (t.visual === "npc") {
      c.fillStyle = "#abc4b2";
      c.fillRect(-7, -40, 14, 13);
      c.fillStyle = "#476d76";
      c.beginPath();
      c.moveTo(-9, -26);
      c.lineTo(9, -26);
      c.lineTo(15, 0);
      c.lineTo(-15, 0);
      c.closePath();
      c.fill();
      c.fillStyle = "#d3b888";
      c.fillRect(14, -27, 3, 30);
    } else if (t.visual === "portal") {
      c.strokeStyle = "#97e7d0";
      c.lineWidth = 6;
      c.beginPath();
      c.ellipse(0, -30, 23, 37, 0, Math.PI, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#699898";
      c.fillRect(-32, -25, 10, 30);
      c.fillRect(22, -25, 10, 30);
    } else {
      c.fillStyle = "#635c4b";
      c.fillRect(-28, -35, 56, 30);
      c.fillStyle = "#a08c61";
      c.fillRect(-30, -39, 60, 7);
      c.fillStyle = "#b0cab0";
      if (t.visual === "stash") {
        c.fillRect(-3, -25, 6, 10);
        c.strokeStyle = "#a08c61";
        c.strokeRect(-28, -35, 56, 30);
      } else if (t.visual === "board") {
        c.fillRect(-19, -30, 36, 20);
        c.fillStyle = "#635c4b";
        c.fillRect(-20, -20, 4, 28);
        c.fillRect(18, -20, 4, 28);
      } else if (t.visual === "arsenal") {
        c.fillRect(-2, -63, 5, 40);
        c.fillRect(-12, -32, 25, 5);
      } else {
        c.beginPath();
        c.arc(0, -30, 12, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    c.font = "12px monospace";
    c.textAlign = "center";
    const text = t.visual === "npc" && !active ? "" : t.name;
    if (!text) return;
    const width = c.measureText(text).width + 12;
    c.fillStyle = "#09161ae8";
    c.fillRect(t.x - width / 2, t.y + 17, width, 22);
    c.fillStyle = active ? "#f5df9c" : "#e0e7da";
    c.fillText(text, t.x, t.y + 32);
    if (active) {
      c.strokeStyle = "#f5df9c";
      c.lineWidth = 2;
      c.strokeRect(t.x - width / 2, t.y + 17, width, 22);
    }
  }
  dispose() {
    if (this.terrain) {
      this.terrain.width = 1;
      this.terrain.height = 1;
      this.terrain = undefined;
    }
  }
}
