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
it('V8 reconnect continues above the authoritative acknowledgement', () => {
  const {g,remote,snap} = fixture();
  g.members.get('p')!.input.sequence = 9000;
  remote.apply(snap(2400,true));
  expect(remote.sequence).toBe(9000);
});
