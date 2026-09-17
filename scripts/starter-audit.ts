import { writeFileSync } from 'node:fs';
import { GameSimulation } from '../src/game/core/simulation';
import { freshSave } from '../src/game/core/save';
import { mulberry32 } from '../src/game/core/math';
import { Weapon } from '../src/game/core/entities';
const candidates: Record<string,string[]> = {nara:['ember'],orin:['orbit','frost','well'],ivo:['spear','disc','ember'],sena:['meteor','chain','well']};
const results = [];
for(const [character,weapons] of Object.entries(candidates)) for(const weapon of weapons) for(const seed of [17,29,43]) {
  Math.random = mulberry32(seed);
  const save = freshSave(); save.unlocked = Object.keys(candidates);
  const g = new GameSimulation(save);
  g.start(character,'normal','ruins','STARTER-'+seed); g.fx=0;
  g.player.weapons = [new Weapon(weapon)];
  g.maybeLevelUp = () => {}; // isolate level-one starter; no meta or upgrade lottery
  let damageTaken=0; const hurt=g.hurtPlayer.bind(g);
  g.hurtPlayer = (n, p=g.player) => { const before=p.health; hurt(n,p); damageTaken += Math.max(0,before-p.health); };
  const checkpoints=[];
  for(let step=1;step<=4500;step++) {
    const p=g.player;
    let x=Math.cos(g.run.time*.12)*.5, y=Math.sin(g.run.time*.12)*.5;
    for(const e of g.enemies) {
      const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);
      if(d<180) { const f=(180-d)/180; x+=dx/Math.max(d,1)*f*2; y+=dy/Math.max(d,1)*f*2; }
    }
    const n=Math.max(1,Math.hypot(x,y));g.input.vector=()=>({x:x/n,y:y/n});
    // Continue the DPS/control sample after a death, record actual first survival.
    if(g.state==='result') break;
    if(g.state==='chest') { g.chestReward=null; g.state='playing'; }
    if(g.state==='item') {g.pendingItem=null; g.state='playing';}
    g.update(.04); g.particles.clear();g.floats.clear();g.lines.length=0;
    if([1500,2250,4500].includes(step)) checkpoints.push({seconds:step*.04,kills:g.run.kills,damage:g.run.totalDamage,hp:g.player.health,damageTaken,enemies:g.enemies.length});
  }
  results.push({character,weapon,seed,survivedSeconds:g.run.time,checkpoints});
}
writeFileSync('docs/starter-audit.json',JSON.stringify({method:'3 fixed seeds, no meta, level-one weapon, same reactive avoidance bot; no invulnerability. Measures simulation, not human readability.',results},null,2));
for(const [character,weapons] of Object.entries(candidates)) for(const weapon of weapons) {
 const rows=results.filter(r=>r.character===character&&r.weapon===weapon);
 console.log(character,weapon,JSON.stringify({survival:rows.map(r=>Math.round(r.survivedSeconds)),kills90:rows.map(r=>r.checkpoints.find(c=>c.seconds===90)?.kills),damage90:rows.map(r=>Math.round(r.checkpoints.find(c=>c.seconds===90)?.damage||0))}));
}
