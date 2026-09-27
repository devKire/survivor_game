import { assetUrl, resolveCharacterArt } from "./character-art";
import type { Player } from "../core/entities";

export const CHARACTER_SPRITE = {
  cellSize: 256,
  worldSize: 96,
  footX: 128,
  footY: 220,
  groundOffsetY: 16,
  walkFps: 8,
  attackFps: 14,
  enterMoveSpeed: 8,
  exitMoveSpeed: 4,
  moveHoldSeconds: 0.1,
  vectorDeadzone: 0.08,
  vectorExitDeadzone: 0.04,
} as const;

const ATTACK_ROWS = [5, 6, 7] as const;
// Nara/Ivo's canonical walk3 duplicates walk2; retain the four-row atlas format.
export const CHARACTER_ANIMATION_CONFIG = {
  nara: { walkRows: [1, 2, 3], attackRows: ATTACK_ROWS },
  orin: { walkRows: [1, 2, 3, 4], attackRows: ATTACK_ROWS },
  ivo: { walkRows: [1, 2, 3], attackRows: ATTACK_ROWS },
  sena: { walkRows: [1, 2, 3, 4], attackRows: ATTACK_ROWS },
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
  lastDrawAt: number;
  moving: boolean;
  movingUntil: number;
  walkStartedAt: number;
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
  walkStartedAt = 0,
  walkRows: readonly number[] = CHARACTER_ANIMATION_CONFIG.orin.walkRows,
): SpriteFrame {
  if (attackUntil > time) {
    const duration = ATTACK_ROWS.length / CHARACTER_SPRITE.attackFps;
    const elapsed = Math.max(0, duration - (attackUntil - time));
    return {
      column: facing,
      row: ATTACK_ROWS[
        Math.min(2, Math.floor(elapsed * CHARACTER_SPRITE.attackFps + 1e-9))
      ],
    };
  }
  if (!moving) return { column: facing, row: 0 };
  return {
    column: facing,
    row: walkRows[
      Math.floor(
        Math.max(0, time - walkStartedAt) * CHARACTER_SPRITE.walkFps + 1e-9,
      ) % walkRows.length
    ],
  };
}

function getImage(url: string): SpriteAssetState {
  const cached = imageCache.get(url);
  if (cached) return cached;
  if (typeof Image === "undefined") return { status: "failed" };
  const image = new Image() as SpriteImage;
  const state: SpriteAssetState = { status: "loading" };
  imageCache.set(url, state);
  const loaded = () => {
    if (imageCache.get(url)?.status !== "loading") return;
    if (image.naturalWidth === 2048 && image.naturalHeight === 2048) {
      imageCache.set(url, { status: "ready", image });
    } else {
      imageCache.set(url, { status: "failed" });
      if (process.env.NODE_ENV === "development")
        console.warn(
          `[character-sprite] Expected 2048x2048 source, received ${image.naturalWidth}x${image.naturalHeight}: ${url}. Using legacy fallback.`,
        );
    }
  };
  image.onload = loaded;
  image.onerror = () => imageCache.set(url, { status: "failed" });
  image.src = url;
  if (image.complete) loaded();
  return imageCache.get(url)!;
}

/** One image per base character; visual state belongs to each Player instance. */
export class CharacterSpriteRenderer {
  private visualStates = new WeakMap<Player, VisualState>();
  private authoritativeSequences = new WeakMap<Player, number>();
  private motions = new WeakMap<Player, { x: number; y: number }>();

  /** Visual input only: never write direction/position back to the Player. */
  setMotion(player: Player, motion: { x: number; y: number }) {
    this.motions.set(player, { x: motion.x, y: motion.y });
  }

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
    this.updateMotion(player, visual, time);
    this.updateAttack(visual, attackSequence, time);
    const asset = resolveCharacterArt(player.character)?.source;
    if (!asset) return false;
    const url = assetUrl(asset);
    const imageState = getImage(url);
    if (imageState.status !== "ready") return false;
    const frame = frameForAnimation(
      visual.moving,
      time,
      visual.attackUntil,
      visual.facing,
      visual.walkStartedAt,
      CHARACTER_ANIMATION_CONFIG[
        player.character as keyof typeof CHARACTER_ANIMATION_CONFIG
      ]?.walkRows,
    );
    const scale = CHARACTER_SPRITE.worldSize / CHARACTER_SPRITE.cellSize;
    const size = CHARACTER_SPRITE.worldSize;
    const x = player.x - CHARACTER_SPRITE.footX * scale;
    const groundY = player.y + CHARACTER_SPRITE.groundOffsetY;
    const y = groundY - CHARACTER_SPRITE.footY * scale;
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
    if (!state || time < state.lastDrawAt) {
      state = {
        facing: directionFromVector(player.dx, player.dy),
        x: player.x,
        y: player.y,
        lastDrawAt: time,
        moving: false,
        movingUntil: time,
        walkStartedAt: time,
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

  private updateMotion(player: Player, state: VisualState, time: number) {
    const motion = this.motions.get(player);
    const dx = motion?.x ?? player.dx;
    const dy = motion?.y ?? player.dy;
    const vectorMagnitude = Math.hypot(dx, dy);
    const elapsed = time - state.lastDrawAt;
    const deltaX = player.x - state.x;
    const deltaY = player.y - state.y;
    // Player.dx/dy persist at rest (also used by weapons). Local input is a
    // reliable movement signal; remote players without it need this fallback.
    // Speed, unlike pixels-per-draw, is independent of render frequency.
    const magnitude = motion
      ? vectorMagnitude
      : elapsed > 0
        ? Math.hypot(deltaX, deltaY) / elapsed
        : 0;
    const threshold = motion
      ? state.moving
        ? CHARACTER_SPRITE.vectorExitDeadzone
        : CHARACTER_SPRITE.vectorDeadzone
      : state.moving
        ? CHARACTER_SPRITE.exitMoveSpeed
        : CHARACTER_SPRITE.enterMoveSpeed;
    if (magnitude > threshold)
      state.movingUntil = time + CHARACTER_SPRITE.moveHoldSeconds;
    const moving = time < state.movingUntil;
    if (moving && !state.moving) state.walkStartedAt = time;
    if (
      Number.isFinite(vectorMagnitude) &&
      vectorMagnitude >= CHARACTER_SPRITE.vectorDeadzone
    ) {
      state.facing = directionFromVector(dx, dy, state.facing);
    } else if (!motion && magnitude > threshold) {
      // Only use displacement for facing when there is no usable direction.
      state.facing = directionFromVector(deltaX, deltaY, state.facing, 0);
    }
    state.moving = moving;
    state.x = player.x;
    state.y = player.y;
    state.lastDrawAt = time;
  }

  private updateAttack(state: VisualState, sequence: number, time: number) {
    if (sequence > state.attackSequence) {
      state.attackSequence = sequence;
      // A new shot must not keep resetting an in-flight attack to row 5.
      if (time >= state.attackUntil)
        state.attackUntil =
          time + ATTACK_ROWS.length / CHARACTER_SPRITE.attackFps;
    }
  }
}

export function resetCharacterSpriteImageCacheForTests() {
  imageCache.clear();
}
