/** Browser QA only. Uses the real authenticated server, clock and SnapshotStream.
 * No test command is exposed to clients; only explicitly named fixture accounts
 * receive load and invulnerability. Not used by npm run realtime or deployment. */
import { rooms } from '../src/realtime/server';
const initialized = new Set<string>();
const timer = setInterval(() => {
  for (const room of rooms.values()) {
    const members = [...room.game.members.values()];
    if (!members.every(m => m.name.startsWith('stability_'))) continue;
    const g = room.game;
    if (!initialized.has(room.id)) {
      initialized.add(room.id);

    }
    for (const m of members) { m.player.health = m.player.maxHealth = 1e8; m.downed = false; }
    const count = Number(process.env.QA_ENEMIES || 100);
    for (let i = g.enemies.length; i < count; i++) {
      const angle = i * 2.399963;
      const radius = 100 + (i % 20) * 22;
      const e = g.spawnAt('husk', Math.cos(angle)*radius, Math.sin(angle)*radius);
      if (e) e.hp = e.maxHp = 1e8;
    }
  }
}, 100);
timer.unref();
