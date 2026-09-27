"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  portraitUrl,
  resolveCharacterArt,
} from "../../game/client/character-art";
import { Player, Weapon } from "../../game/core/entities";
import { cosmeticVisual } from "../../game/content/cosmetics";
import { WorldRenderer } from "../../game/client/world-renderer";
import { CHARACTER_DEFINITIONS } from "../../game/content/catalog";

export default function CharacterPreview({
  character,
  cosmetics = {},
  size = 180,
  animation = true,
  direction = 1,
  presentation = "sprite",
}: {
  character: string;
  cosmetics?: Record<string, string>;
  size?: number;
  animation?: boolean;
  direction?: number;
  presentation?: "sprite" | "portrait";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  const portrait = resolveCharacterArt(character)?.portrait;
  const source = portrait ? portraitUrl(portrait) : null;
  const showPortrait =
    presentation === "portrait" && portrait && failedPortrait !== source;
  const key = JSON.stringify(cosmetics);
  useEffect(() => {
    const element = canvas.current,
      ctx = element?.getContext("2d");
    if (!element || !ctx || !CHARACTER_DEFINITIONS[character]) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    element.width = element.height = size * dpr;
    const player = new Player(character, {}, "PVP");
    player.cosmetics = JSON.parse(key);
    player.dx = direction;
    player.dy = 0;
    const visuals = cosmeticVisual(player.cosmetics);
    if (visuals.evolution) {
      const weapon = new Weapon(CHARACTER_DEFINITIONS[character].weapon);
      weapon.evolved = true;
      player.weapons = [weapon];
    }
    if (visuals.death) player.health = 0;
    const renderer = new WorldRenderer({
      ctx,
      camera: { x: 0, y: 0 },
      viewW: size,
      viewH: size,
      player,
      run: { worldSeed: "preview", simTime: 0 },
      debug: {
        chunks: false,
        structureIds: false,
        collisions: false,
        hitboxes: false,
      },
    });
    let frame = 0,
      visible = true;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(element);
    const draw = (time: number) => {
      if (visible) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        ctx.translate(size / 2, size * 0.58);
        const scale = size / 85;
        ctx.scale(scale, scale);
        const clock = animation && !reduced ? time / 1000 : 0;
        renderer.player(player, clock % 2);
        if (visuals.projectile)
          renderer.projectile(
            {
              x: Math.sin(clock * 2) * 23,
              y: 24,
              vx: 120,
              vy: 0,
              r: 4,
              kind: "ember",
              age: clock,
            },
            visuals.projectile.color,
          );
      }
      if (animation && !reduced) frame = requestAnimationFrame(draw);
    };
    draw(0);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [character, key, size, animation, direction, showPortrait]);
  if (showPortrait)
    return (
      <Image
        src={portrait}
        alt={`Retrato de ${CHARACTER_DEFINITIONS[character]?.name || character}`}
        width={size}
        height={size}
        unoptimized
        className="character-preview character-portrait"
        style={{
          width: size,
          height: size,
          maxWidth: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
        }}
        onError={() => setFailedPortrait(source)}
      />
    );
  return (
    <canvas
      ref={canvas}
      className="character-preview"
      style={{ width: size, height: size, maxWidth: "100%" }}
      role="img"
      aria-label={`Prévia de ${CHARACTER_DEFINITIONS[character]?.name || character}`}
    />
  );
}
