from pathlib import Path
s=Path('baseline/v1.3.0/game.js').read_text()
def part(a,b): return s[s.index(a):s.index(b)]
def put(name,text): Path(name).write_text(text)
content=part('const WEAPON_DEFINITIONS','function weighted(')
# save constants shared, no persistence in content
content=content.replace('check:g=>','check:(g: AchievementContext)=>')
import re
content=re.sub(r'^const (\w+)',r'export const \1',content,flags=re.M)
content=content.replace('function getMode','export function getMode')
put('src/game/content/catalog.ts', 'import type { AchievementContext, WeaponDefinition, PassiveDefinition, CharacterDefinition, EnemyDefinition, WaveDefinition, ModeDefinition, MetaDefinition, ItemDefinition, StructureDefinition, MapDefinition, PathDefinition, StatusDefinition, BossEvent, AchievementDefinition } from "../core/types";\n'+content)
math=part('const TAU','/* Conteúdo configurável. */')
math=math.replace('const SAVE_KEY = "limiar.save.v1"; // chave preservada para migrar saves 1.0','')
math+=part('function weighted(','/* Persistência centralizada')+part('function hashString(','function applyStatus(')+part('/* Colisão varrida','class Sound')
math=re.sub(r'^(const|function) ',r'export \1 ',math,flags=re.M)
put('src/game/core/math.ts', math)
baseimports='import * as C from "../content/catalog";\nimport { '+','.join(re.findall(r'export (?:const|function) (\w+)',math))+' } from "./math";\nimport type * as T from "./types";\n'
constants=re.findall(r'export const (\w+)', content)
imports='import { '+','.join(constants)+',getModeDefinition,getModeScaling } from "../content/catalog";\n'
put('src/game/core/collections.ts',re.sub(r'^class ', 'export class ',part('class Pool','function hashString('),flags=re.M).replace('removeAt(this.items,i);','this.items[i]=this.items[this.items.length-1]; this.items.pop();'))
world=part('class World','/* Colisão varrida')
world=world.replace('class World','export class World')
put('src/game/core/world.ts',imports+baseimports+'import type { GameSimulation } from "./simulation";\n'+world)
entities=part('class Player','class Input')
entities=entities.replace('class Player','export class Player').replace('class Weapon','export class Weapon')
entities=entities.replace('constructor(character) {','constructor(character: string, readonly meta: Record<string, number> = {}) {').replace('save.upgrades[k]','this.meta[k]')
put('src/game/core/entities.ts',imports+baseimports+'import type { GameSimulation } from "./simulation";\nimport { ATTACKS } from "./attacks";\n'+entities)
put('src/game/core/director.ts',imports+baseimports+'import type { GameSimulation } from "./simulation";\n'+part('class WaveDirector','class Game').replace('class WaveDirector','export class WaveDirector'))
put('src/game/core/attacks.ts',imports+baseimports+'import type { GameSimulation } from "./simulation";\nimport type { Weapon } from "./entities";\nimport { applyStatus } from "./status";\n'+part('const ATTACKS','class UI').replace('const ATTACKS =','export const ATTACKS: Record<string, (g: GameSimulation, w: Weapon, v: T.WeaponValues) => void> ='))
put('src/game/core/status.ts',imports+'import { clamp } from "./math";\nimport type * as T from "./types";\n'+part('function applyStatus','class World').replace('function ', 'export function '))
# Only mechanical extraction here. Browser ports preserve calls while headless defaults perform no I/O.
game=part('class Game','/* Estratégias independentes')
ctor=game[game.index('  constructor()'):game.index('  setState(')]
body=game[game.index('  setState('):]
body=re.sub(r'\bsave\b','this.save',body)
body=body.replace('saveGame()', 'this.persist()').replace('storageAvailable','this.storageAvailable')
body=body.replace('new Player(character)','new Player(character,this.save.upgrades)').replace('new Player(s.character)','new Player(s.character,this.save.upgrades)')
body=body.replace('    this.player = null;','    this.active = false;')
body=body.replace('    this.setState("playing");\n    this.mode=', '    this.active=true;\n    this.setState("playing");\n    this.mode=',1)
body=body.replace('    const s=this.save.activeRun;', '    const s=this.save.activeRun;\n    this.active=true;')
newctor='''export class GameSimulation {
  constructor(public save: T.SaveData, public persist: () => boolean = () => true) {}
'''
put('src/game/core/simulation.ts',imports+baseimports+'''import { Pool, SpatialGrid } from "./collections";
import { Player, Weapon } from "./entities";
import { World } from "./world";
import { WaveDirector } from "./director";
import { applyStatus, hasStatus } from "./status";
import { validateRunSnapshot } from "./save";
export const DEBUG = false;
export const VERSION = "1.3.0";
'''+newctor+body)
# browser adapter still uses the original UI and renderer; core contains no browser globals
client=part('class Sound','class Player')+part('class Input','class WaveDirector')+part('class UI','/* Inicialização com mensagem')
client=re.sub(r'\bsave\b','this.g.save',client)
client=client.replace('saveGame()', 'this.g.persist()').replace('storageAvailable','this.g.storageAvailable')
client=client.replace('resetSave();','this.g.save=freshSave();this.g.persist();')
client=client.replace('safeFileStamp()','new Date().toISOString().slice(0,10)')
client=client.replace('  constructor() {\n    this.context', '  constructor(public g: BrowserGame) {\n    this.context')
# setState remains in core; frame/resize are browser-only
browserctor=ctor.replace('constructor() {','constructor(canvas: HTMLCanvasElement, save: T.SaveData) {\n    super(save);\n    this.persist=()=> { try { localStorage.setItem("limiar.save.v1",JSON.stringify(this.save)); return true; } catch { this.storageAvailable=false; return false; } };')
browserctor=browserctor.replace('document.getElementById("game")','canvas').replace('    this.player = null;','').replace('    this.run = null;','')
browserctor=browserctor.replace('new Sound()','new Sound(this)').replace('this.save.settings','this.save.settings').replace('save.settings','this.save.settings')
browserctor=browserctor.replace('    window.addEventListener("resize",()=>this.resize());','    window.addEventListener("resize",()=>this.resize(), {signal:this.abort.signal});').replace('    window.addEventListener("beforeunload",()=>this.saveSnapshot(true));','    window.addEventListener("beforeunload",()=>this.saveSnapshot(true), {signal:this.abort.signal});')
browserctor=browserctor.replace('requestAnimationFrame(t=>this.frame(t))','this.frameHandle=requestAnimationFrame(t=>this.frame(t))')
browserctor=browserctor.replace('  frame(now) {','  frame(now: number) {\n    if(this.abort.signal.aborted) return;')
client=client.replace('const p = g.player;','const p = g.active ? g.player : null;') # only renderer needs nullable; other spots fix later
put('src/game/client/browser.ts',imports.replace('../content','../content')+baseimports.replace('"./math"','"../core/math"').replace('"./types"','"../core/types"')+'''import { GameSimulation, DEBUG, VERSION } from "../core/simulation";
import { Player, Weapon } from "../core/entities";
import { Pool, SpatialGrid } from "../core/collections";
import { hasStatus } from "../core/status";
import { freshSave, migrateSave, validateRunSnapshot, validateImportEnvelope } from "../core/save";
export class BrowserGame extends GameSimulation {
  abort = new AbortController();
  frameHandle = 0;
  dispose() { this.saveSnapshot(true); this.abort.abort(); cancelAnimationFrame(this.frameHandle); this.sound.context?.close(); }
'''+browserctor+'}\n'+client)
