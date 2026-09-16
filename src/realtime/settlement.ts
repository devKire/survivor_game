import { db } from "../server/db";
import { json } from "../server/progress";
import { migrateSave } from "../game/core/save";
import { ACHIEVEMENTS } from "../game/content/catalog";
import type { CoopSimulation } from "../game/core/coop";
export async function settle(sessionId: string, g: CoopSimulation) {
  return db().$transaction(
    async (tx) => {
      const claimed = await tx.gameSession.updateMany({
        where: { id: sessionId, status: "RUNNING" },
        data: {
          status: "COMPLETED",
          endedAt: new Date(),
          result: json({
            time: g.run.time,
            kills: g.run.kills,
            bosses: g.run.bossKills,
            completed: g.run.completed,
            partySize: g.partySizeAtStart,
            telemetry: g.run.telemetry,
          }),
        },
      });
      if (!claimed.count) return false;
      for (const m of g.members.values()) {
        const row = await tx.userProgress.findUniqueOrThrow({
            where: { userId: m.id },
          }),
          save = migrateSave(row.data);
        let reward =
          Math.floor(
            m.gold * (g.run.completed ? g.modeDef.rewardMultiplier : 1),
          ) + (g.run.completed ? g.modeDef.completionBase : 0);
        for (const a of ACHIEVEMENTS) {
          if (a.modes && !a.modes.includes(g.mode)) continue;
          if (
            !save.achievements.includes(a.id) &&
            a.check({
              run: { ...g.run, ...m.personal, synergies: m.synergies },
              player: m.player,
            })
          ) {
            save.achievements.push(a.id);
            reward += a.reward || 0;
            if (a.character && !save.unlocked.includes(a.character))
              save.unlocked.push(a.character);
          }
        }
        for (const [category, ids] of Object.entries(m.progress.discovered))
          save.discovered[category] = [
            ...new Set([...(save.discovered[category] || []), ...ids]),
          ];
        save.gold += reward;
        save.runs++;
        save.completed += Number(g.run.completed);
        save.bestTime = Math.max(save.bestTime, Math.floor(g.run.time));
        save.bestKills = Math.max(save.bestKills, g.run.kills);
        save.highScore = Math.max(
          save.highScore,
          Math.floor(
            g.run.kills * 10 + g.run.time + (g.run.completed ? 10000 : 0),
          ),
        );
        await tx.userProgress.update({
          where: { userId: m.id },
          data: { data: json(save), version: { increment: 1 } },
        });
        await tx.gameSessionMember.update({
          where: { sessionId_userId: { sessionId, userId: m.id } },
          data: {
            reward,
            survived: !m.downed,
            result: json({
              level: m.player.level,
              weapons: m.player.weapons.map((w) => ({
                id: w.id,
                level: w.level,
                path: w.path,
                evolved: w.evolved,
              })),
              time: g.run.time,
            }),
          },
        });
      }
      const session = await tx.gameSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      await tx.team.update({
        where: { id: session.teamId },
        data: { status: "LOBBY", expiresAt: new Date(Date.now() + 3600000) },
      });
      await tx.teamMember.updateMany({
        where: { teamId: session.teamId },
        data: { ready: false },
      });
      return true;
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}
