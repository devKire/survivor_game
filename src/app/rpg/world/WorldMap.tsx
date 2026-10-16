"use client";
import { WORLD_ZONES } from "../../../game/content/rpg/world-zones";
import { WORLD_REFUGE as REFUGE } from "../../../game/content/rpg/world-refuge";
import type { WorldSnapshot } from "../../../game/network/world";
import type { ExplorationNode } from "../../../game/core/rpg/exploration/types";
export default function WorldMap({
  snapshot,
  nodes,
  discovered,
  large = false,
}: {
  snapshot: WorldSnapshot;
  nodes: readonly ExplorationNode[];
  discovered: readonly string[];
  large?: boolean;
}) {
  const zone = WORLD_ZONES[snapshot.zoneId],
    b = zone.bounds;
  return (
    <svg
      role="img"
      aria-label={`Mapa: ${zone.name}`}
      viewBox={`${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`}
      width={large ? "100%" : 140}
      height={large ? 400 : 110}
    >
      <rect
        x={b.minX}
        y={b.minY}
        width={b.maxX - b.minX}
        height={b.maxY - b.minY}
        fill="#122724"
        stroke="#8c805b"
        strokeWidth={10}
      />
      {snapshot.zoneId === "obelisk-refuge" &&
        REFUGE.npcs.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={large ? 14 : 23} fill="#d2bc77" />
            {large && (
              <text x={n.x + 20} y={n.y} fontSize={24} fill="#e7e0c8">
                {n.name}
              </text>
            )}
          </g>
        ))}
      {snapshot.zoneId === "ruins-outskirts" &&
        nodes
          .filter((n) => n.kind === "POI" && discovered.includes(n.id))
          .map((n) => (
            <circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={large ? 12 : 23}
              fill="#bbab78"
            />
          ))}
      {zone.portals.map((p) => (
        <g key={p.id}>
          <rect
            x={p.x - 20}
            y={p.y - 20}
            width={40}
            height={40}
            fill="#84d9c3"
          />
          {large && (
            <text x={p.x + 25} y={p.y} fontSize={24} fill="#e7e0c8">
              {p.name}
            </text>
          )}
        </g>
      ))}
      {snapshot.players.map((p) => (
        <g key={p.id}>
          <circle
            cx={p.x}
            cy={p.y}
            r={p.id === snapshot.selfId ? 22 : 16}
            fill={p.id === snapshot.selfId ? "#ffe7a2" : "#b4d2e9"}
          />
          {p.id === snapshot.selfId && (
            <path
              d={`M${p.x} ${p.y} l${p.dx * 45} ${p.dy * 45}`}
              stroke="#fff"
              strokeWidth={9}
            />
          )}
        </g>
      ))}
    </svg>
  );
}
