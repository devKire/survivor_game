import { RemoteGame } from "./RemoteGame";
import { CoopSimulation } from "../core/coop";
import { freshSave } from "../core/save";
import { SnapshotStream } from "../../realtime/snapshots";
import type { BrowserGame } from "./browser";
import { WORLD_BIOMES, type VisualBiome } from "../content/world-biomes";
import { PROP_FAMILIES } from "../content/tile-types";
import { resolvePropAtlas } from "./tile-art";
/** Loaded only by the development route; never persists a QA run. */
export function showTileDebugScene(
  game: BrowserGame,
  scene: string,
  remote = false,
) {
  if (process.env.NODE_ENV !== "development") return;
  game.persist = () => true;
  game.saveSnapshot = () => false;
  if (!remote)
    game.start(
      "nara",
      "normal",
      scene === "gardens" ? "gardens" : "ruins",
      "tiles-qa",
    );
  game.setState("paused");
  game.ui.hide();
  game.ui.hud(false);
  document.getElementById("toast")?.classList.remove("visible");
  game.debug.stats = false;
  game.debug.hitboxes = true;
  game.debug.collisions = true;
  game.enemies = [];
  game.player.weapons = [];
  const query = new URLSearchParams(location.search);
  game.run.time = Number(query.get("time")) || 0;
  const camera = {
    x: Number(query.get("x")) || 900,
    y: Number(query.get("y")) || 900,
  };
  game.player.x = camera.x;
  game.player.y = camera.y;
  if (!remote) game.world!.update();
  if (scene in WORLD_BIOMES && scene !== "ruins")
    game.renderer.worldTiles.previewBiome = scene as VisualBiome;
  if (scene === "combat")
    for (let i = 0; i < 500; i++)
      game.spawnAt(
        "husk",
        camera.x + ((i % 25) - 12) * 42,
        camera.y + (Math.floor(i / 25) - 10) * 38,
      );
  const timings: number[] = [];
  const draw = game.renderer.draw.bind(game.renderer);
  game.renderer.draw = (time) => {
    game.camera = camera;
    const start = performance.now();
    draw(time);
    timings.push(performance.now() - start);
    if (timings.length > 300) timings.shift();
    const c = game.ctx;
    c.save();
    c.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    c.fillStyle = "#fff";
    c.font = "16px monospace";
    c.fillText(
      `TILES QA / ${scene} / time=${game.run.time} / hitboxes`,
      24,
      32,
    );
    if (scene === "props")
      PROP_FAMILIES.forEach((family, i) => {
        const x = 120 + (i % 5) * 240,
          y = 200 + Math.floor(i / 5) * 220;
        game.renderer.worldTiles.tiles.drawProp(
          c,
          resolvePropAtlas(family),
          0,
          x,
          y,
          150,
        );
        c.fillStyle = "#fff";
        c.fillText(family, x - 80, y + 30);
        c.strokeStyle = "#ff75cc";
        c.strokeRect(x - 3, y - 3, 6, 6);
      });
    c.restore();
  };
  Object.assign(window, { limiarTileQA: { game, timings } });
}

/** Exercises the real snapshot adapter, including its independently reconstructed world.chunks. */
export function showRemoteTileDebugScene(canvas: HTMLCanvasElement) {
  const simulation = new CoopSimulation(
    [{ id: "qa", name: "QA", character: "nara", progress: freshSave() }],
    "normal",
    "ruins",
    "tiles-qa",
  );
  const member = simulation.members.get("qa")!;
  member.player.x = 900;
  member.player.y = 900;
  simulation.world.update();
  const snapshot = new SnapshotStream().build(simulation, member, 1, true);
  const game = new RemoteGame(
    canvas,
    "qa",
    () => {},
    () => {},
  );
  game.apply(snapshot);
  showTileDebugScene(game, "remote", true);
  return () => game.dispose();
}
