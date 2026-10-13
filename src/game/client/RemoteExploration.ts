import { RemoteGame } from "./RemoteGame";
import { EXPLORATION_RUINS as region } from "../content/rpg/exploration-regions";
import { explorationResource } from "../content/rpg/exploration-resources";
import { generateExploration } from "../core/rpg/exploration/generation";
import type { ExplorationNode } from "../core/rpg/exploration/types";
import type { Snapshot, ServerMessage } from "../network/protocol";
import { TileRenderer } from "./tile-renderer";
import { resolvePropAtlas } from "./tile-art";
export type ExplorationState = Extract<
  ServerMessage,
  { type: "EXPLORATION_STATE" }
>;
/** Existing remote input/prediction/reconciliation, renderer and RAF; only activity presentation differs. */
export class RemoteExploration extends RemoteGame {
  nodes: readonly ExplorationNode[] = [];
  exploration?: ExplorationState;
  private tiles = new TileRenderer();
  private target?: ExplorationNode;
  private lastInteraction = 0;
  onPause: (paused: boolean) => void = () => {};
  onTarget: (node: ExplorationNode | undefined) => void = () => {};
  constructor(...args: ConstructorParameters<typeof RemoteGame>) {
    super(...args);
    this.ui.hud = () => {
      document.getElementById("hud")!.hidden = true;
    };
    this.ui.updateHUD = () => {};
    this.renderer.draw = () => this.drawExploration();
  }
  override apply(snapshot: Snapshot) {
    super.apply(snapshot);
    if (!this.world || this.snapshot !== snapshot) return;
    if (!this.nodes.length)
      this.nodes = generateExploration(region, this.world);
    const own = snapshot.players.find((p) => p.id === this.userId)!;
    this.canvas.dataset.x = own.x.toFixed(1);
    this.canvas.dataset.y = own.y.toFixed(1);
    this.canvas.dataset.character = own.character;
    const target = [...this.nodes]
      .filter(
        (n) =>
          n.kind === "RESOURCE" &&
          Math.hypot(own.x - n.x, own.y - n.y) <= n.radius,
      )
      .sort(
        (a, b) =>
          Math.hypot(own.x - a.x, own.y - a.y) -
          Math.hypot(own.x - b.x, own.y - b.y),
      )[0];
    if (target?.id !== this.target?.id) {
      this.target = target;
      this.onTarget(target);
    }
    this.canvas.dataset.target = target?.id ?? "";
  }
  override interact() {
    if (
      !this.target ||
      !this.exploration ||
      performance.now() - this.lastInteraction < 500
    )
      return;
    this.lastInteraction = performance.now();
    this.sendMessage({
      type: "GATHER_START",
      nodeId: this.target.id,
      requestId: crypto.randomUUID(),
      expectedRevision: this.exploration.revision,
    });
  }
  override dispose() {
    if (this.abort.signal.aborted) return;
    super.dispose();
    this.renderer.worldTiles.dispose();
    this.world?.chunks.clear();
    this.nodes = [];
    const debug = window as typeof window & { limiarRemoteGame?: RemoteGame };
    if (debug.limiarRemoteGame === this) delete debug.limiarRemoteGame;
  }
  override useItem() {}
  override pause() {
    this.input.clear();
    this.state = "paused";
    this.onPause(true);
  }
  override resume() {
    this.state = "playing";
    this.onPause(false);
  }
  private drawExploration() {
    const c = this.ctx;
    c.setTransform(
      this.dpr * this.zoom,
      0,
      0,
      this.dpr * this.zoom,
      (this.width * this.dpr) / 2 - this.camera.x * this.dpr * this.zoom,
      (this.height * this.dpr) / 2 - this.camera.y * this.dpr * this.zoom,
    );
    // Exploration has no boss corruption schedule. Preserve authoritative time elsewhere.
    const time = this.run?.time;
    if (this.run) this.run.time = 0;
    this.renderer.terrain();
    if (this.run) this.run.time = time;
    for (const structure of this.world?.nearby ?? [])
      if (this.renderer.visible(structure.x, structure.y, 100))
        this.renderer.structure(structure, this.run.simTime);
    for (const node of this.nodes) {
      if (!this.renderer.visible(node.x, node.y, 100)) continue;
      const resource =
        node.kind === "RESOURCE"
          ? explorationResource(node.definitionId)
          : null;
      const depleted = this.exploration?.depleted.includes(node.id),
        discovered = this.exploration?.discovered.includes(node.id);
      const family =
        resource?.category === "MINERAL"
          ? "rocks"
          : resource?.category === "VEGETAL"
            ? "swamp"
            : resource
              ? "crystals"
              : "ruins";
      const height = resource ? 48 : 80;
      const drawn = this.tiles.drawProp(
        c,
        resolvePropAtlas(family, 0),
        0,
        node.x,
        node.y,
        height,
        depleted ? 0.3 : 1,
      );
      c.strokeStyle = depleted ? "#85918d" : resource ? "#efce8d" : "#a4dbd1";
      c.fillStyle = c.strokeStyle;
      c.lineWidth = 2;
      if (!drawn) {
        c.fillRect(node.x - 12, node.y - 24, 24, 24);
      }
      this.renderer.circle(node.x, node.y, 22);
      c.stroke();
      c.font = "12px system-ui";
      c.textAlign = "center";
      c.fillText(
        resource
          ? depleted
            ? "Esgotado"
            : resource.name
          : discovered
            ? "Local descoberto"
            : "Vestígios",
        node.x,
        node.y + 32,
      );
      c.textAlign = "left";
    }
    const b = region.bounds;
    c.strokeStyle = "#eac785";
    c.lineWidth = 4;
    c.strokeRect(
      b.minChunkX * 640,
      b.minChunkY * 640,
      (b.maxChunkX - b.minChunkX + 1) * 640,
      (b.maxChunkY - b.minChunkY + 1) * 640,
    );
    c.fillStyle = "#b8eee2";
    c.font = "14px system-ui";
    c.fillText("REFÚGIO · retorno pelo menu", -100, -55);
    if (this.player) this.renderer.player(this.player, this.run.simTime, 0);
  }
}
