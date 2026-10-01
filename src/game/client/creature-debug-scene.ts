import { CompetitiveRemoteGame } from "./CompetitiveRemoteGame";
import { WarSimulation } from "../core/war";
import { BOSS_EVENTS, ENEMY_DEFINITIONS } from "../content/catalog";
import { resolveCreatureArt } from "./creature-art";
import type { BrowserGame } from "./browser";

/** Development-only contact scene using the real spawn, F7 and world renderer. */
export function showCreatureDebugScene(game: BrowserGame, scene: string) {
  if (process.env.NODE_ENV === "production") return;
  game.persist = () => true;
  game.saveSnapshot = () => false;
  game.start("nara", "normal", "ruins", "creature-portraits");
  game.setState("paused");
  game.ui.hide();
  game.ui.hud(false);
  game.debug.stats = false;
  game.debugKey("F7");
  game.debug.god = true;
  game.enemies = [];
  game.player.weapons = [];
  const bosses = scene.startsWith("boss");
  const phase = Math.min(
    3,
    Math.max(1, Number(new URLSearchParams(location.search).get("phase")) || 1),
  );
  const entries = bosses
    ? [
        { type: "boss", name: ENEMY_DEFINITIONS.boss.name, event: null },
        ...BOSS_EVENTS.map((event) => ({
          type: "boss",
          name: event.name,
          event,
        })),
        { type: "final", name: ENEMY_DEFINITIONS.final.name, event: null },
      ].slice(scene === "boss2" ? 6 : 0, scene === "boss2" ? 12 : 6)
    : Object.entries(ENEMY_DEFINITIONS)
        .filter(([type]) => type !== "boss" && type !== "final")
        .map(([type, d]) => ({ type, name: d.name, event: null }));
  const cols = bosses ? 3 : 5;
  const camera = { ...game.camera };
  game.player.x = camera.x - 610;
  game.player.y = camera.y - 280;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const x = camera.x + ((i % cols) - (cols - 1) / 2) * (bosses ? 420 : 265);
    const y =
      camera.y -
      (bosses ? 75 : 155) +
      Math.floor(i / cols) * (bosses ? 345 : 200);
    const e = game.spawnAt(entry.type, x, y, entry.event)!;
    e.bossPhase = phase;
    e.hp = e.maxHp * 0.7;
    if (scene === "effects" || phase > 1) {
      game.enemyHazard(e.x, e.y, e.r + 24, 0, 3, 0.4);
      e.shield = 1;
      e.charge = 1;
      e.wind = 1;
      e.aimX = 0.5;
      e.aimY = 0.5;
      e.statuses = {
        burn: { duration: 5, magnitude: 1, stacks: 1, source: null, tick: 1 },
        mark: { duration: 5, magnitude: 1, stacks: 1, source: null, tick: 1 },
      };
    }
  }
  const draw = game.renderer.draw.bind(game.renderer);
  game.renderer.draw = (time) => {
    game.camera = camera;
    draw(time);
    const c = game.ctx;
    c.save();
    c.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    c.fillStyle = "#f4ecd7";
    c.font = "14px monospace";
    c.textAlign = "center";
    c.fillText(
      `PORTRAITS / ${scene} / F7 hitboxes / fase ${phase}`,
      game.width / 2,
      38,
    );
    for (const e of game.enemies) {
      const art = resolveCreatureArt(e)!;
      const x = game.width / 2 + (e.x - camera.x) * game.zoom;
      const y =
        game.height / 2 +
        (e.y -
          camera.y +
          Math.max(
            e.r + 24,
            art.worldHeight * (1 - art.footY) + art.groundOffsetY + 20,
          )) *
          game.zoom;
      c.fillText(e.name, x, y);
      c.fillText(`r=${e.r} · h=${art.worldHeight}`, x, y + 18);
    }
    c.restore();
  };
}

/** Real authoritative War snapshot through the production competitive adapter. */
export function showWarCreatureDebugScene(canvas: HTMLCanvasElement) {
  const war = new WarSimulation(
    Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      character: "nara",
      cosmetics: {},
      team: i < 5 ? 0 : 1,
      role: "SOLDADO",
      isBot: i > 1,
    })),
  );
  const boss = war.neutrals.enemies.find((e) => e.type === "boss")!;
  const player = war.fighters.get("p0")!.player;
  player.x = boss.x;
  player.y = boss.y + 180;
  const game = new CompetitiveRemoteGame(
    canvas,
    "p0",
    () => {},
    () => null,
    () => {},
    () => {},
  );
  game.apply(war.snapshot("p0"));
  game.debugKey("F7");
  game.debug.stats = false;
  game.setState("paused");
  game.ui.hide();
  return () => game.dispose();
}
