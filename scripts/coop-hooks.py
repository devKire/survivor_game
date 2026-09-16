from pathlib import Path
p=Path('src/game/core/entities.ts');s=p.read_text().replace('export class Weapon {','export class Weapon {\n  ownerId: string|null = null;');p.write_text(s)
p=Path('src/game/core/simulation.ts');s=p.read_text();s=s.replace('  state = "menu";','''  playersForWorld(): Player[] { return this.player?[this.player]:[]; }
  combatPlayers(): Player[] { return this.playersForWorld().filter(p=>p.health>0); }
  nearestPlayer(point:T.Vec):Player {return this.combatPlayers().reduce((best,p)=>Math.hypot(p.x-point.x,p.y-point.y)<Math.hypot(best.x-point.x,best.y-point.y)?p:best,this.player);}
  ownerOf(w:Weapon|null):Player {void w;return this.player;}
  state = "menu";''',1)
# One reusable movement operation for local simulation, authoritative co-op, and prediction collision.
a=s.index('    const move = this.input.vector();',s.index('  update(dt'));b=s.index('\n    this.camera.x = p.x;',a);movement=s[a:b].replace('const move = this.input.vector();','')
s=s[:a]+'    this.movePlayer(p,this.input.vector(),dt);\n'+s[b:]
pos=s.index('  update(dt');s=s[:pos]+'  movePlayer(p:Player,move:T.Vec,dt:number) {\n'+movement+'\n  }\n\n'+s[pos:]
s=s.replace('    const p=this.player;\n    const far=', '    const far=')
s=s.replace('      const dx=p.x-e.x,dy=p.y-e.y,d=', '      const p=this.nearestPlayer(e);\n      const dx=p.x-e.x,dy=p.y-e.y,d=')
s=s.replace('this.hurtPlayer(e.damage*(e.behavior==="herald"?1.05:1))','this.hurtPlayer(e.damage*(e.behavior==="herald"?1.05:1),p)')
s=s.replace('  hurtPlayer(damage: number) {\n    const p = this.player;','  hurtPlayer(damage: number,p:Player=this.player) {')
s=s.replace('    const p = this.player;\n\n    for (let i=this.bullets','    for (let i=this.bullets')
s=s.replace('      const b = this.bullets.items[i];','      const b = this.bullets.items[i];\n      const p=this.ownerOf(b.source);')
a=s.index('      if (b.enemy) {',s.index('  updateBullets'));b=s.index('      } else if (b.life>0) {',a)
s=s[:a]+'''      if (b.enemy) {
        for(const target of this.combatPlayers())if(segmentDistance2(target.x,target.y,b.px,b.py,b.x,b.y)<(target.r+b.r)**2){this.hurtPlayer(b.damage,target);b.life=0;break;}
'''+s[b:]
s=s.replace('  damageEnemy(e:', '''  damageEnemy(e:T.Enemy,damage:number,w:Weapon|null,knock=0,allowCrit=true,opts:{status?:string;area?:boolean;synergy?:boolean}={}):boolean {
    const previous=this.player;this.player=this.ownerOf(w);
    try{return this.applyDamage(e,damage,w,knock,allowCrit,opts);}finally{this.player=previous;}
  }

  applyDamage(e:''',1)
s=s.replace('            const p=this.player;\n            if ((p.x-a.x)', '            for(const p of this.combatPlayers())if ((p.x-a.x)')
s=s.replace('this.hurtPlayer(a.damage*.55)','this.hurtPlayer(a.damage*.55,p)').replace('this.hurtPlayer(a.damage);','this.hurtPlayer(a.damage,p);')
# fix existing web hazard: granting invulnerability before damage nullifies it
s=s.replace('                p.invulnerable=Math.max(p.invulnerable,.08);\n','')
p.write_text(s)
p=Path('src/game/core/world.ts');s=p.read_text();s=s.replace('    const {cx,cy}=this.chunkCoords(p.x,p.y);\n    const keep=new Set();','    const keep=new Set<string>();\n    for(const center of this.g.playersForWorld()){\n    const {cx,cy}=this.chunkCoords(center.x,center.y);')
s=s.replace('    for (const key of this.chunks.keys()) if (!keep.has(key))','    }\n    for (const key of this.chunks.keys()) if (!keep.has(key))')
p.write_text(s)
