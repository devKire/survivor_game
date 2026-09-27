import { assetUrl, resolveCharacterArt } from "./character-art";
import type { Player } from "../core/entities";

export const CHARACTER_SPRITE = {
  cellSize: 256,
  worldSize: 96,
  footX: 128,
  footY: 220,
  walkFps: 8,
  attackFps: 14,
  movementDeadzone: 0.75,
  vectorDeadzone: 0.08,
} as const;

const imageCache = new Map<string, SpriteAssetState>();
type SpriteImage = HTMLImageElement & CanvasImageSource;
type SpriteAssetState =
  | { status: "loading" }
  | { status: "ready"; image: SpriteImage }
  | { status: "failed" };
export type SpriteFrame = { column: number; row: number };
type VisualState = {
  facing: number;
  x: number;
  y: number;
  moving: boolean;
  attackSequence: number;
  attackUntil: number;
};

/** Direction columns are clockwise from south in the canonical atlas. */
export function directionFromVector(
  dx: number,
  dy: number,
  lastDirection = 0,
  deadzone: number = CHARACTER_SPRITE.vectorDeadzone,
) {
  if (Math.hypot(dx, dy) < deadzone) return lastDirection;
  const octant = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  return (octant + 6) % 8;
}

export function frameForAnimation(
  moving: boolean,
  time: number,
  attackUntil: number,
  facing = 0,
): SpriteFrame {
  if (attackUntil > time) {
    const duration = 3 / CHARACTER_SPRITE.attackFps;
    const elapsed = Math.max(0, duration - (attackUntil - time));
    return {
      column: facing,
      row: 5 + Math.min(2, Math.floor(elapsed * CHARACTER_SPRITE.attackFps)),
    };
  }
  if (!moving) return { column: facing, row: 0 };
  return {
    column: facing,
    row: 1 + (Math.floor(time * CHARACTER_SPRITE.walkFps) % 4),
  };
}

function getImage(url: string): SpriteAssetState {
  const cached = imageCache.get(url);
  if (cached) return cached;
  if (typeof Image === "undefined") return { status: "failed" };
  const image = new Image() as SpriteImage;
  const state: SpriteAssetState = { status: "loading" };
  imageCache.set(url, state);
  image.onload = () => {
    imageCache.set(
      url,
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? { status: "ready", image }
        : { status: "failed" },
    );
  };
  image.onerror = () => imageCache.set(url, { status: "failed" });
  image.src = url;
  if (image.complete && image.naturalWidth > 0)
    imageCache.set(url, { status: "ready", image });
  return imageCache.get(url)!;
}

/** One image per base character; visual state belongs to each Player instance. */
export class CharacterSpriteRenderer {
  private visualStates = new WeakMap<Player, VisualState>();
  private authoritativeSequences = new WeakMap<Player, number>();

  setAttackSequence(player: Player, sequence: number) {
    this.authoritativeSequences.set(player, sequence);
  }

  isMoving(player: Player) {
    return this.visualStates.get(player)?.moving || false;
  }

  draw(
    context: CanvasRenderingContext2D,
    player: Player,
    time: number,
    attackSequence = this.authoritativeSequences.get(player) ??
      player.weapons.reduce((sum, weapon) => sum + weapon.shots, 0),
  ) {
    const visual = this.state(player, time, attackSequence);
    const distance = Math.hypot(player.x - visual.x, player.y - visual.y);
    if (distance >= CHARACTER_SPRITE.movementDeadzone) {
      visual.facing = directionFromVector(
        player.x - visual.x,
        player.y - visual.y,
        visual.facing,
        CHARACTER_SPRITE.movementDeadzone,
      );
    }
    const moving = distance >= CHARACTER_SPRITE.movementDeadzone;
    visual.moving = moving;
    visual.x = player.x;
    visual.y = player.y;
    this.updateAttack(visual, attackSequence, time);
    const asset = resolveCharacterArt(player.character)?.source;
    if (!asset) return false;
    const url = assetUrl(asset);
    const imageState = getImage(url);
    if (imageState.status !== "ready") return false;
    const frame = frameForAnimation(
      moving,
      time,
      visual.attackUntil,
      visual.facing,
    );
    const scale = CHARACTER_SPRITE.worldSize / CHARACTER_SPRITE.cellSize;
    const size = CHARACTER_SPRITE.worldSize;
    const x = player.x - CHARACTER_SPRITE.footX * scale;
    const y = player.y - CHARACTER_SPRITE.footY * scale;
    const wasSmoothing = context.imageSmoothingEnabled;
    context.imageSmoothingEnabled = false;
    try {
      context.drawImage(
        imageState.image,
        frame.column * CHARACTER_SPRITE.cellSize,
        frame.row * CHARACTER_SPRITE.cellSize,
        CHARACTER_SPRITE.cellSize,
        CHARACTER_SPRITE.cellSize,
        x,
        y,
        size,
        size,
      );
    } catch {
      imageCache.set(url, { status: "failed" });
      context.imageSmoothingEnabled = wasSmoothing;
      return false;
    }
    context.imageSmoothingEnabled = wasSmoothing;
    return true;
  }

  private state(player: Player, time: number, attackSequence: number) {
    let state = this.visualStates.get(player);
    if (!state) {
      state = {
        facing: directionFromVector(player.dx, player.dy),
        x: player.x,
        y: player.y,
        moving: false,
        attackSequence,
        attackUntil: 0,
      };
      this.visualStates.set(player, state);
    } else if (attackSequence < state.attackSequence) {
      state.attackSequence = attackSequence;
      state.attackUntil = 0;
    }
    return state;
  }

  private updateAttack(state: VisualState, sequence: number, time: number) {
    if (sequence > state.attackSequence) {
      state.attackSequence = sequence;
      state.attackUntil = time + 3 / CHARACTER_SPRITE.attackFps;
    }
  }
}

export function resetCharacterSpriteImageCacheForTests() {
  imageCache.clear();
}
