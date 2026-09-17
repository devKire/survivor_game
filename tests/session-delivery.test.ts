import { expect, it } from 'vitest';
import { OnlineSession } from '../src/game/client/OnlineSession';
import type { Snapshot } from '../src/game/network/protocol';
import { CoopSimulation } from '../src/game/core/coop';
import { freshSave } from '../src/game/core/save';
import { SnapshotStream } from '../src/realtime/snapshots';
import type { RemoteGame } from '../src/game/client/RemoteGame';
it('V16 transports every delta even when React has not mounted yet', () => {
  const g = new CoopSimulation([{id:'p',name:'P',character:'nara',progress:freshSave()}],'normal','ruins','X');
  const stream = new SnapshotStream(), session = new OnlineSession();
  session.begin('room');
  for(const tick of [1,4,6,9]) session.receive({...stream.build(g,g.members.get('p')!,tick,tick===1),room:'room'});
  const seen:number[]=[];
  session.bind({apply:(s: Snapshot) => { seen.push(s.tick); }} as unknown as RemoteGame);
  expect(seen).toEqual([1,4,6,9]);
});
it('V17 keeps the UI snapshot stable when only simulation coordinates change', () => {
  const g = new CoopSimulation([{id:'p',name:'P',character:'nara',progress:freshSave()}],'normal','ruins','X');
  const stream = new SnapshotStream(), session = new OnlineSession();
  session.begin('room');
  session.receive({...stream.build(g,g.members.get('p')!,1,true),room:'room'});
  const first = session.getSnapshot();
  g.members.get('p')!.player.x = 200;
  session.receive({...stream.build(g,g.members.get('p')!,4),room:'room'});
  expect(session.getSnapshot()).toBe(first);
});
