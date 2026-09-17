import type { Snapshot } from '../network/protocol';
import type { RemoteGame } from './RemoteGame';
export type CombatUi = {
  players: Snapshot['players'];
  votes: Snapshot['votes'];
  own: Pick<Snapshot['own'], 'weapons'|'choices'|'decision'|'pending'|'rerolls'|'banishments'|'skips'>;
};
/** Ordered simulation transport stays outside React. Only a compact UI projection
 * is published, at most 4 Hz (decisions are immediate). */
export class OnlineSession {
  game: RemoteGame | null = null;
  room = '';
  private queue: Snapshot[] = [];
  private listeners = new Set<() => void>();
  private ui: CombatUi | null = null;
  private key = '';
  private publishedAt = 0;
  getSnapshot = () => this.ui;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  begin(room: string) {
    if (this.room === room) return;
    this.room = room;
    this.queue = [];
    this.ui = null;
    this.key = '';
  }
  bind(game: RemoteGame) {
    this.game = game;
    for (const s of this.queue) game.apply(s);
    this.queue = [];
    return () => { if (this.game === game) this.game = null; };
  }
  receive(snapshot: Snapshot) {
    if (snapshot.room !== this.room) return;
    if (this.game) this.game.apply(snapshot);
    else {
      if (snapshot.full) this.queue = [];
      this.queue.push(snapshot);
      // Before mount, retain an ordered chain. A later full replaces it.
      if (this.queue.length > 200) this.queue = this.queue.slice(-200);
    }
    const now = performance.now();
    if (this.ui && snapshot.own.decision === this.ui.own.decision &&
        snapshot.own.pending === this.ui.own.pending && now - this.publishedAt < 250) return;
    const ui: CombatUi = {
      players: snapshot.players.map(p => ({...p, hp: Math.ceil(p.hp / p.maxHp * 100), maxHp:100,
        x:0,y:0,dx:0,dy:0,ack:0,buff:0,invulnerable:0,revive:Math.round(p.revive*10)/10,orbit:undefined})),
      votes: snapshot.votes,
      own: {
        weapons: snapshot.own.weapons.map(w => ({...w, timer:0, shots:0, hits:0, damageDealt:0, kills:0})),
        choices: snapshot.own.choices, decision:snapshot.own.decision, pending:snapshot.own.pending,
        rerolls:snapshot.own.rerolls, banishments:snapshot.own.banishments, skips:snapshot.own.skips,
      },
    };
    const key = JSON.stringify(ui);
    this.publishedAt = now;
    if (key === this.key) return;
    this.key = key;
    this.ui = ui;
    for(const listener of this.listeners) listener();
  }
}
