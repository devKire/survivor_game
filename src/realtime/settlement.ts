import { economyTransaction, grantCurrency, lockProgress, persistSave } from "../server/economy";
import { achievementAmount, achievementCurrency, completionGold, pveGems } from "../game/core/economy";
import { json } from "../server/progress";
import { ACHIEVEMENTS } from "../game/content/catalog";
import type { CoopSimulation } from "../game/core/coop";
export async function settle(sessionId: string, g: CoopSimulation) {
  return economyTransaction(
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
        const { save } = await lockProgress(tx, m.id);
        const reward = pveGems(m.gems, g.run.completed, g.modeDef.rewardMultiplier, g.expeditionProfile.completionBase);
        await grantCurrency(tx, save, { userId: m.id, currency: "GEMS", amount: reward,
          source: "pve-run", referenceId: `match:${sessionId}` });
        await grantCurrency(tx, save, { userId: m.id, currency: "GOLD",
          amount: completionGold(g.run.completed, g.run.expeditionLength),
          source: "pve-completion", referenceId: `match:${sessionId}` });
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
            await grantCurrency(tx, save, { userId: m.id, currency: achievementCurrency(a.id),
              amount: achievementAmount(a.id, a.reward), source: "achievement", referenceId: `achievement:${a.id}` });
            if (a.character && !save.unlocked.includes(a.character))
              save.unlocked.push(a.character);
          }
        }
        for (const [category, ids] of Object.entries(m.progress.discovered))
          save.discovered[category] = [
            ...new Set([...(save.discovered[category] || []), ...ids]),
          ];
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
        await persistSave(tx, m.id, save);
        await tx.gameSessionMember.update({
          where: { sessionId_userId: { sessionId, userId: m.id } },
          data: {
            reward,
            survived: !m.downed,
            result: json({
              rewardCurrency: "GEMS",
              goldReward: completionGold(g.run.completed, g.run.expeditionLength),
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
  );
}
