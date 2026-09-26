import { WAR } from "../../game/content/war";
import { WAR_NEUTRAL_CAMPS } from "../../game/content/war-neutrals";
import type { ArenaSnapshot } from "../../game/core/pvp";

export default function WarMinimap({
  snapshot,
  userId,
}: {
  snapshot: ArenaSnapshot;
  userId: string;
}) {
  const war = snapshot.war;
  if (!war) return null;
  const color = (team: number) => (team === 0 ? "#83ccb7" : "#dd9c92");
  return (
    <svg
      className="war-minimap"
      viewBox={`0 0 ${snapshot.width} ${snapshot.height}`}
      role="img"
      aria-label="Minimapa da Guerra: posições conhecidas pelo servidor"
    >
      <rect
        width={snapshot.width}
        height={snapshot.height}
        fill="#08151b"
        stroke="#c9b877"
        strokeWidth="35"
      />
      {WAR.lanes.map((y) => (
        <path
          key={y}
          d={`M 0 ${y} H ${snapshot.width}`}
          stroke="#78918444"
          strokeWidth="65"
        />
      ))}
      {WAR_NEUTRAL_CAMPS.map((camp) => (
        <circle
          key={camp.id}
          cx={camp.x}
          cy={camp.y}
          r={camp.boss ? 60 : 32}
          fill="none"
          stroke="#c9b87777"
          strokeWidth="15"
        >
          <title>
            {camp.boss
              ? "Área de boss — presença desconhecida"
              : "Camp — presença desconhecida"}
          </title>
        </circle>
      ))}
      {war.neutrals.map((enemy) => (
        <circle
          key={enemy.id}
          cx={enemy.x}
          cy={enemy.y}
          r={enemy.type === "boss" ? 50 : 20}
          fill="#e6c583"
        />
      ))}
      {war.structures
        .filter((s) => s.hp > 0)
        .map((s) => (
          <rect
            key={s.id}
            x={s.x - 45}
            y={s.y - 45}
            width={s.kind === "CORE" ? 130 : 90}
            height={s.kind === "CORE" ? 130 : 90}
            fill={color(s.team)}
          />
        ))}
      {war.minions
        .filter((u) => u.hp > 0)
        .map((u) => (
          <circle key={u.id} cx={u.x} cy={u.y} r="18" fill={color(u.team)} />
        ))}
      <circle
        cx={snapshot.width / 2}
        cy={snapshot.height / 2}
        r="85"
        fill={
          war.objective.owner === null ? "#c9b877" : color(war.objective.owner)
        }
      />
      {snapshot.players
        .filter((p) => p.hp > 0)
        .map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.id === userId ? 65 : 45}
            fill={color(p.team)}
            stroke={p.id === userId ? "white" : "#08151b"}
            strokeWidth="18"
          />
        ))}
    </svg>
  );
}
