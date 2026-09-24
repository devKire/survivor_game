import { describe, expect, it, vi } from 'vitest';
import { GameSimulation } from '../src/game/core/simulation';
import { freshSave } from '../src/game/core/save';
import { CoopSimulation } from '../src/game/core/coop';
import { SnapshotStream } from '../src/realtime/snapshots';
import type { SaveData } from '../src/game/core/types';
import type { ClientMessage } from '../src/game/network/protocol';
vi.mock('../src/game/client/browser', () => ({
  BrowserGame: class extends GameSimulation {
    abort = new AbortController();
    constructor(_canvas: HTMLCanvasElement, save: SaveData) { super(save); }
    dispose() { this.abort.abort(); }
  },
}));
import { RemoteGame } from '../src/game/client/RemoteGame';
import { sampleMotion } from '../src/game/client/interpolation';
function fixture() {
  const g = new CoopSimulation([{id:'p', name:'P', character:'nara', progress:freshSave()}], 'normal','ruins','REMOTE');
  const stream = new SnapshotStream();
  const sent: ClientMessage[] = [];
  const remote = new RemoteGame({} as HTMLCanvasElement, 'p', m => sent.push(m), () => {});
  const snap = (tick: number, full = false) => stream.build(g, g.members.get('p')!, tick, full);
  return { g, remote, sent, snap };
}
describe('V16 snapshot delivery', () => {
  it('ignores repeated delta without resync (RTT/React replay regression)', () => {
    const {remote,sent,snap} = fixture();
    remote.apply(snap(1,true));
    const delta = snap(4);
    remote.apply(delta);
    remote.apply(delta);
    expect(sent).toEqual([]);
  });
  it('preserves unacknowledged inputs on a full resync', () => {
    const {remote,snap} = fixture();
    remote.apply(snap(1,true));
    remote.pending.push({sequence:1,move:{x:1,y:0},dt:0.04});
    remote.apply(snap(4,true));
    expect(remote.pending).toHaveLength(1);
    expect(remote.prediction!.x).toBeGreaterThan(0);
  });
  it('keeps scene and requests only one full snapshot for a broken delta chain', () => {
    const {g,remote,sent,snap} = fixture();
    g.spawnAt('tank',100,0);
    remote.apply(snap(1,true));
    snap(4);
    remote.apply(snap(6));
    remote.apply(snap(9));
    expect(remote.entities.size).toBeGreaterThan(0);
    expect(sent).toEqual([{type:'RESYNC'}]);
  });
});
it('V18 keeps entities through the snapshot interest hysteresis margin', () => {
  const {g,snap} = fixture();
  const enemy = g.spawnAt('husk', 990, 0)!;
  const first = snap(1, true);
  enemy.x = 1080;
  const retained = snap(4);
  enemy.x = 1130;
  const removed = snap(6);
  expect(first.upsert.some((e) => e.id === 'e' + enemy.id)).toBe(true);
  expect(retained.remove).not.toContain('e' + enemy.id);
  expect(removed.remove).toContain('e' + enemy.id);
});
it('V18 retains remote visual instances across deltas', () => {
  const {g,remote,snap} = fixture();
  const enemy = g.spawnAt('husk', 40, 0)!;
  remote.apply(snap(1, true));
  const visual = remote.visuals.get('e' + enemy.id);
  enemy.x = 120;
  remote.apply(snap(4));
  expect(remote.visuals.get('e' + enemy.id)).toBe(visual);
  expect(remote.motions.get('e' + enemy.id)?.targetX).toBe(120);
});
it('V8 reconnect continues above the authoritative acknowledgement', () => {
  const {g,remote,snap} = fixture();
  g.members.get('p')!.input.sequence = 9000;
  remote.apply(snap(2400,true));
  expect(remote.sequence).toBe(9000);
});
it('stops extrapolation when an unchanged delta confirms an entity stopped', () => {
  const {g, remote, snap} = fixture();
  const enemy = g.spawnAt('husk', 40, 0)!;
  remote.apply(snap(1, true));
  enemy.x = 120;
  remote.apply(snap(4));
  remote.apply(snap(6));
  const motion = remote.motions.get('e' + enemy.id)!;
  expect(motion.velocityX).toBe(0);
  expect(sampleMotion(motion, motion.receivedAt + 1000).x).toBe(120);
});
it('removes visual and motion state when authority removes an entity', () => {
  const {g, remote, snap} = fixture();
  const enemy = g.spawnAt('husk', 40, 0)!;
  remote.apply(snap(1, true));
  enemy.dead = true;
  remote.apply(snap(4));
  expect(remote.visuals.has('e' + enemy.id)).toBe(false);
  expect(remote.motions.has('e' + enemy.id)).toBe(false);
  expect(remote.enemies).toHaveLength(0);
});
