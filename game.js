(() => {
"use strict";

const DEBUG = false;
const VERSION = "1.0.0";
const TAU = Math.PI * 2;
const SAVE_KEY = "limiar.save.v1";
const MAX_WEAPONS = 6;
const MAX_PASSIVES = 6;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rand = (a, b) => a + Math.random() * (b - a);
const choose = a => a[Math.floor(Math.random() * a.length)];
const clock = t =>
  `${Math.floor(t / 60).toString().padStart(2, "0")}:${Math.floor(t % 60).toString().padStart(2, "0")}`;
const fmt = n => Math.floor(n).toLocaleString("pt-BR");
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const removeAt = (a, i) => {
  a[i] = a[a.length - 1];
  a.pop();
};
const xpNeed = level => 6 + level * 2 + Math.floor(level ** 1.4);

/* Conteúdo configurável. */
const WEAPON_DEFINITIONS = {
  ember: {
    name:"Brasa de Vidro", icon:"◆", color:"#ffac75", type:"ember",
    damage:21, cooldown:1.05, weight:12,
    passive:"might", evolution:"Aurora Incandescente",
    description:"Lança uma brasa na direção do alvo mais próximo.",
    evolvedDescription:"Brasas maiores explodem e atingem grupos inteiros."
  },
  orbit: {
    name:"Anéis de Estilhaço", icon:"◈", color:"#78e5ca", type:"orbit",
    damage:11, cooldown:0.28, weight:10,
    passive:"area", evolution:"Órbitas Gêmeas",
    description:"Estilhaços giram ao seu redor.",
    evolvedDescription:"Dois anéis giram em sentidos opostos."
  },
  spear: {
    name:"Agulha do Vazio", icon:"➶", color:"#c6b7ff", type:"spear",
    damage:27, cooldown:1.15, weight:11,
    passive:"duration", evolution:"Tear Abissal",
    description:"Perfura na última direção de movimento.",
    evolvedDescription:"Oito direções de agulhas atravessam a horda."
  },
  frost: {
    name:"Sopro de Sal", icon:"❄", color:"#a8dfff", type:"frost",
    damage:10, cooldown:0.8, weight:10,
    passive:"armor", evolution:"Inverno Imóvel",
    description:"Pulsos próximos causam dano e lentidão.",
    evolvedDescription:"Uma grande zona congela inimigos comuns."
  },
  chain: {
    name:"Fio de Tempestade", icon:"ϟ", color:"#ffe69d", type:"chain",
    damage:25, cooldown:1.65, weight:8,
    passive:"luck", evolution:"Rede Fulgurante",
    description:"Um arco elétrico salta entre alvos.",
    evolvedDescription:"Mais saltos, cada um com uma descarga em área."
  },
  well: {
    name:"Jardim de Cinzas", icon:"✿", color:"#d7a2da", type:"well",
    damage:13, cooldown:2.7, weight:9,
    passive:"recovery", evolution:"Jardim Devorador",
    description:"Cria campos de dano persistente.",
    evolvedDescription:"Campos atraem inimigos e drenam vida nas baixas."
  },
  disc: {
    name:"Disco de Nácar", icon:"◉", color:"#ffcda4", type:"disc",
    damage:19, cooldown:1.55, weight:10,
    passive:"amount", evolution:"Coroa Errante",
    description:"Discos retornam e podem acertar duas vezes.",
    evolvedDescription:"Leques de discos explodem ao retornar."
  },
  meteor: {
    name:"Sino Celeste", icon:"✦", color:"#fa9ba0", type:"meteor",
    damage:72, cooldown:3.4, weight:7,
    passive:"growth", evolution:"Constelação Cadente",
    description:"Marca alvos antes de um impacto celeste.",
    evolvedDescription:"Chuvas de impactos deixam campos ardentes."
  }
};

const PASSIVE_DEFINITIONS = {
  might: {
    name:"Selo da Fornalha", icon:"♨", max:5, weight:12,
    text:"+10% de dano por nível."
  },
  speed: {
    name:"Passo de Pluma", icon:"»", max:5, weight:10,
    text:"+7% de movimento por nível."
  },
  vitality: {
    name:"Frasco de Seiva", icon:"♥", max:5, weight:11,
    text:"+15% de vida máxima por nível."
  },
  recovery: {
    name:"Musgo de Âmbar", icon:"✚", max:5, weight:9,
    text:"+0,25 de vida por segundo por nível."
  },
  haste: {
    name:"Ampulheta Fendida", icon:"⌛", max:5, weight:9,
    text:"−5% de intervalo entre ataques por nível."
  },
  area: {
    name:"Compasso Lunar", icon:"◎", max:5, weight:10,
    text:"+10% de área por nível."
  },
  duration: {
    name:"Fita do Crepúsculo", icon:"∞", max:5, weight:10,
    text:"+15% de duração por nível."
  },
  amount: {
    name:"Prisma Partido", icon:"⋈", max:2, weight:4,
    text:"+1 projétil / estilhaço por nível."
  },
  pickup: {
    name:"Bússola de Ecos", icon:"⌖", max:5, weight:11,
    text:"+25% de alcance de coleta por nível."
  },
  growth: {
    name:"Página Viva", icon:"▤", max:5, weight:10,
    text:"+10% de experiência por nível."
  },
  armor: {
    name:"Casca Basáltica", icon:"⬡", max:5, weight:10,
    text:"+1 de armadura por nível."
  },
  luck: {
    name:"Olho de Opala", icon:"◌", max:5, weight:8,
    text:"+12% de sorte e +1% de crítico por nível."
  }
};

const CHARACTER_DEFINITIONS = {
  nara: {
    name:"Nara", title:"A guardiã das brasas",
    weapon:"ember", icon:"◆", color:"#ffac75",
    bonus:"+10% de movimento. +3% de dano a cada 10 níveis.",
    condition:"Disponível desde o início."
  },
  orin: {
    name:"Orin", title:"O geômetra exilado",
    weapon:"orbit", icon:"◈", color:"#78e5ca",
    bonus:"+20% de área. Regenera 0,3 de vida por segundo.",
    condition:"Sobreviva 5 minutos no modo padrão."
  },
  ivo: {
    name:"Ivo", title:"O portador de prismas",
    weapon:"spear", icon:"⋈", color:"#c6b7ff",
    bonus:"+1 projétil. −15% de vida máxima.",
    condition:"Derrote 1.000 inimigos em uma partida padrão."
  },
  sena: {
    name:"Sena", title:"A leitora do céu",
    weapon:"meteor", icon:"✦", color:"#fa9ba0",
    bonus:"+25% de experiência. +8% de dano.",
    condition:"Evolua uma arma no modo padrão."
  }
};

const ENEMY_DEFINITIONS = {
  husk: {
    name:"Errante de Xisto", hp:24, speed:56, damage:12,
    r:13, xp:2, color:"#718d83", shape:5,
    behavior:"chase", resist:0.1
  },
  dart: {
    name:"Rasante", hp:20, speed:108, damage:9,
    r:10, xp:3, color:"#bd9fa5", shape:3,
    behavior:"chase", resist:0
  },
  tank: {
    name:"Muralha Oca", hp:145, speed:40, damage:23,
    r:24, xp:10, color:"#8898b5", shape:6,
    behavior:"chase", resist:0.85
  },
  swarm: {
    name:"Cisco Vivo", hp:11, speed:88, damage:6,
    r:7, xp:1, color:"#cdbd8c", shape:4,
    behavior:"chase", resist:0
  },
  ranged: {
    name:"Cantor de Fendas", hp:62, speed:59, damage:15,
    r:16, xp:6, color:"#c38dc0", shape:4,
    behavior:"ranged", resist:0.25
  },
  elite: {
    name:"Arauto de Basalto", hp:360, speed:63, damage:27,
    r:28, xp:40, color:"#e9ba7e", shape:6,
    behavior:"chase", resist:0.8
  },
  boss: {
    name:"Custódio", hp:1080, speed:43, damage:31,
    r:46, xp:110, color:"#e8958e", shape:8,
    behavior:"boss", resist:0.95
  },
  final: {
    name:"A Boca do Firmamento", hp:1000000, speed:148, damage:95,
    r:64, xp:500, color:"#eff5dc", shape:9,
    behavior:"final", resist:1
  }
};

const WAVE_TABLE = [
  {
    start:0, end:90, rate:1.2, cap:85,
    enemies:[["husk",10]], elite:100,
    formation:"scatter", name:"O despertar"
  },
  {
    start:90, end:300, rate:2.7, cap:170,
    enemies:[["husk",8],["dart",2]], elite:90,
    formation:"flank", name:"Passos na névoa"
  },
  {
    start:300, end:600, rate:4.5, cap:270,
    enemies:[["husk",5],["dart",4],["tank",1]], elite:75,
    formation:"ring", name:"Pedra e nervo"
  },
  {
    start:600, end:900, rate:7, cap:400,
    enemies:[["husk",3],["dart",2],["tank",2],["swarm",6],["ranged",1]],
    elite:65, formation:"swarm", name:"O coro das fendas"
  },
  {
    start:900, end:1200, rate:9, cap:540,
    enemies:[["dart",4],["tank",3],["swarm",5],["ranged",3]],
    elite:55, formation:"flank", name:"Maré de estilhaços"
  },
  {
    start:1200, end:1500, rate:12, cap:680,
    enemies:[["husk",2],["dart",4],["tank",4],["swarm",6],["ranged",3]],
    elite:45, formation:"ring", name:"A ruína respira"
  },
  {
    start:1500, end:1800, rate:16, cap:820,
    enemies:[["dart",5],["tank",5],["swarm",7],["ranged",4]],
    elite:35, formation:"swarm", name:"Antes do silêncio"
  },
  {
    start:1800, end:Infinity, rate:22, cap:900,
    enemies:[["dart",5],["tank",5],["swarm",7],["ranged",4]],
    elite:25, formation:"ring", name:"Além do limiar"
  }
];

const BOSS_EVENTS = [
  {at:300, name:"O Sineiro de Pedra", pattern:"ring"},
  {at:600, name:"A Corça de Cobre", pattern:"charge"},
  {at:900, name:"Mãe das Fendas", pattern:"summon"},
  {at:1200, name:"O Cartógrafo Cego", pattern:"spiral"},
  {at:1500, name:"A Catedral Errante", pattern:"pulse"}
];

const META_DEFINITIONS = {
  might:{name:"Potência", text:"+5% de dano", base:45},
  speed:{name:"Agilidade", text:"+4% de movimento", base:40},
  armor:{name:"Proteção", text:"+1 de armadura", base:65},
  vitality:{name:"Vitalidade", text:"+6% de vida", base:40},
  recovery:{name:"Recuperação", text:"+0,15 vida / s", base:55},
  growth:{name:"Aprendizado", text:"+5% de XP", base:55},
  pickup:{name:"Alcance", text:"+10% de coleta", base:35},
  luck:{name:"Fortuna", text:"+8% de sorte", base:40}
};

const ACHIEVEMENTS = [
  {
    id:"survive", name:"Ainda há luz", text:"Sobreviva 5 minutos.",
    character:"orin", check:g=>g.run.time>=300
  },
  {
    id:"thousand", name:"Mil ecos",
    text:"Derrote 1.000 inimigos em uma partida.",
    character:"ivo", check:g=>g.run.kills>=1000
  },
  {
    id:"evolve", name:"Outra forma de arder", text:"Evolua uma arma.",
    character:"sena", check:g=>g.run.evolutions>0
  },
  {
    id:"level", name:"Uma página adiante", text:"Alcance o nível 30.",
    reward:100, check:g=>g.player.level>=30
  },
  {
    id:"boss", name:"O sino se cala", text:"Derrote um chefe.",
    reward:80, check:g=>g.run.bossKills>0
  },
  {
    id:"complete", name:"Limiar atravessado", text:"Sobreviva aos 30 minutos.",
    reward:200, check:g=>g.run.completed
  }
];

function weighted(items, weight = x => x.weight) {
  let n = Math.random() *
    items.reduce((s, x) => s + Math.max(0, weight(x)), 0);

  for (const x of items) {
    n -= Math.max(0, weight(x));
    if (n < 0) return x;
  }

  return items[items.length - 1];
}

/* Persistência centralizada e validação de dados. */
function freshSave() {
  return {
    version:1,
    gold:0,
    upgrades:{},
    unlocked:["nara"],
    achievements:[],
    selected:"nara",
    tutorial:false,
    highScore:0,
    bestTime:0,
    bestKills:0,
    runs:0,
    completed:0,
    settings:{
      volume:0.35,
      sounds:true,
      mute:false,
      shake:true,
      numbers:true,
      particles:"auto"
    }
  };
}

let storageAvailable = true;

function loadSave() {
  const result = freshSave();

  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!raw || typeof raw !== "object" || raw.version !== 1) return result;

    for (const k of ["gold","highScore","bestTime","bestKills","runs","completed"]) {
      if (Number.isFinite(raw[k])) {
        result[k] = Math.floor(clamp(raw[k], 0, 1e9));
      }
    }

    for (const k of Object.keys(META_DEFINITIONS)) {
      result.upgrades[k] = Number.isFinite(raw.upgrades?.[k])
        ? Math.floor(clamp(raw.upgrades[k], 0, 5))
        : 0;
    }

    if (Array.isArray(raw.unlocked)) {
      result.unlocked = [...new Set([
        "nara",
        ...raw.unlocked.filter(k=>Object.hasOwn(CHARACTER_DEFINITIONS,k))
      ])];
    }

    if (Array.isArray(raw.achievements)) {
      result.achievements = [...new Set(
        raw.achievements.filter(k=>ACHIEVEMENTS.some(a=>a.id===k))
      )];
    }

    if (result.unlocked.includes(raw.selected)) result.selected = raw.selected;
    result.tutorial = raw.tutorial === true;

    if (raw.settings && typeof raw.settings === "object") {
      for (const k of ["sounds","mute","shake","numbers"]) {
        if (typeof raw.settings[k] === "boolean") {
          result.settings[k] = raw.settings[k];
        }
      }

      if (Number.isFinite(raw.settings.volume)) {
        result.settings.volume = clamp(raw.settings.volume,0,1);
      }

      if (["auto","low","high","off"].includes(raw.settings.particles)) {
        result.settings.particles = raw.settings.particles;
      }
    }
  } catch (e) {
    if (!(e instanceof SyntaxError)) storageAvailable = false;
  }

  return result;
}

let save = loadSave();

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    storageAvailable = true;
    return true;
  } catch {
    storageAvailable = false;
    return false;
  }
}

function resetSave() {
  save = freshSave();
  return saveGame();
}

/* Pools mantêm objetos reutilizáveis; remoção por troca evita filter por frame. */
class Pool {
  constructor(factory, limit) {
    this.factory = factory;
    this.limit = limit;
    this.free = [];
    this.items = [];
  }

  take() {
    if (this.items.length >= this.limit) return null;
    const item = this.free.pop() || this.factory();
    this.items.push(item);
    return item;
  }

  remove(i) {
    this.free.push(this.items[i]);
    removeAt(this.items,i);
  }

  clear() {
    while (this.items.length) this.free.push(this.items.pop());
  }
}

class SpatialGrid {
  constructor(size=96) {
    this.size = size;
    this.cells = new Map();
    this.spare = [];
  }

  rebuild(enemies) {
    for (const a of this.cells.values()) {
      a.length = 0;
      this.spare.push(a);
    }

    this.cells.clear();

    for (const e of enemies) {
      if (e.dead) continue;

      const key =
        Math.floor(e.x/this.size) + "," + Math.floor(e.y/this.size);

      let cell = this.cells.get(key);

      if (!cell) {
        cell = this.spare.pop() || [];
        this.cells.set(key,cell);
      }

      cell.push(e);
    }
  }

  query(x,y,r,fn) {
    const s = this.size;

    for (let a=Math.floor((x-r)/s); a<=Math.floor((x+r)/s); a++) {
      for (let b=Math.floor((y-r)/s); b<=Math.floor((y+r)/s); b++) {
        const cell = this.cells.get(a+","+b);

        if (cell) {
          for (let i=0; i<cell.length; i++) {
            if (!cell[i].dead) fn(cell[i]);
          }
        }
      }
    }
  }

  nearest(x,y,r,excluded) {
    let best = null;
    let d = r*r;

    this.query(x,y,r,e=>{
      if (excluded?.has(e.id)) return;

      const dd = (e.x-x)**2 + (e.y-y)**2;

      if (dd < d) {
        d = dd;
        best = e;
      }
    });

    return best;
  }
}

/* Colisão varrida: projéteis rápidos não atravessam alvos entre passos. */
function segmentDistance2(px,py,ax,ay,bx,by) {
  const dx = bx-ax;
  const dy = by-ay;
  const t = clamp(
    ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy || 1),
    0,1
  );

  return (px-ax-t*dx)**2 + (py-ay-t*dy)**2;
}

class Sound {
  constructor() {
    this.context = null;
    this.last = 0;
  }

  unlock() {
    try {
      if (!this.context) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (C) this.context = new C();
      }

      if (this.context?.state === "suspended") {
        this.context.resume().catch(()=>{});
      }
    } catch {
      this.context = null;
    }
  }

  play(type) {
    const c = this.context;
    const s = save.settings;
    const now = performance.now();

    if (!c || c.state!=="running" || s.mute || !s.sounds || s.volume<=0) {
      return;
    }

    if (type==="hit" && now-this.last<75) return;
    if (type==="hit") this.last = now;

    const tones = {
      hit:[330,90,.07],
      hurt:[130,45,.22],
      level:[420,900,.32],
      chest:[550,1300,.5],
      boss:[100,45,.65],
      end:[270,55,.8]
    };

    const [from,to,duration] = tones[type] || tones.hit;

    try {
      const o = c.createOscillator();
      const gain = c.createGain();
      const t = c.currentTime;

      o.type = type==="hit" ? "triangle" : "sine";
      o.frequency.setValueAtTime(from,t);
      o.frequency.exponentialRampToValueAtTime(to,t+duration);

      gain.gain.setValueAtTime(Math.max(.0001,s.volume*.12),t);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);

      o.connect(gain);
      gain.connect(c.destination);
      o.start(t);
      o.stop(t+duration);

      o.onended = ()=>{
        o.disconnect();
        gain.disconnect();
      };
    } catch {
      /* Áudio opcional: a simulação continua sem dispositivo. */
    }
  }
}

class Player {
  constructor(character) {
    this.character = character;
    this.x = 0;
    this.y = 0;
    this.r = 13;
    this.speed = 195;
    this.health = 110;
    this.maxHealth = 110;
    this.armor = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = xpNeed(1);
    this.weapons = [];
    this.passives = {};
    this.stats = {};
    this.dx = 1;
    this.dy = 0;
    this.invulnerable = 0;
    this.buff = 0;

    this.recalculate();
    this.health = this.maxHealth;
  }

  get position() {
    return {x:this.x,y:this.y};
  }

  recalculate() {
    const p = k=>this.passives[k]||0;
    const m = k=>save.upgrades[k]||0;
    const c = this.character;
    const old = this.maxHealth;

    this.maxHealth = Math.round(
      110 * (1+.15*p("vitality")+.06*m("vitality")) *
      (c==="ivo" ? .85 : 1)
    );

    this.health = clamp(this.health+this.maxHealth-old,0,this.maxHealth);

    this.speed =
      195 * (1+.07*p("speed")+.04*m("speed")) *
      (c==="nara" ? 1.1 : 1);

    this.armor = p("armor")+m("armor");

    this.stats = {
      damage:
        (1+.10*p("might")+.05*m("might")) *
        (c==="sena" ? 1.08 : 1) *
        (c==="nara" ? 1+.03*Math.min(10,Math.floor(this.level/10)) : 1),

      area:(1+.1*p("area"))*(c==="orin"?1.2:1),
      cooldown:Math.max(.4,1-.05*p("haste")),
      duration:1+.15*p("duration"),
      amount:p("amount")+(c==="ivo"?1:0),
      pickupRange:76*(1+.25*p("pickup")+.1*m("pickup")),
      growth:(1+.1*p("growth")+.05*m("growth"))*(c==="sena"?1.25:1),
      luck:1+.12*p("luck")+.08*m("luck"),
      critChance:.07+.01*p("luck")+.005*m("luck"),
      recovery:.25*p("recovery")+.15*m("recovery")+(c==="orin"?.3:0)
    };
  }
}

class Weapon {
  constructor(id) {
    this.id = id;
    this.level = 1;
    this.evolved = false;
    this.timer = .25;
    this.damageDealt = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
  }

  get definition() {
    return WEAPON_DEFINITIONS[this.id];
  }

  get name() {
    return this.evolved ? this.definition.evolution : this.definition.name;
  }

  values(p) {
    return {
      damage:
        this.definition.damage *
        (1+.23*(this.level-1)) *
        p.stats.damage *
        (this.evolved?1.65:1) *
        (p.buff>0?1.4:1),

      cooldown:
        this.definition.cooldown *
        (1-.035*(this.level-1)) *
        p.stats.cooldown *
        (p.buff>0?.75:1),

      area:p.stats.area*(1+.045*(this.level-1)),
      amount:1+Math.floor(this.level/3)+p.stats.amount,
      duration:p.stats.duration*(1+.07*(this.level-1))
    };
  }

  update(g,dt) {
    this.timer -= dt;

    if (this.timer <= 0) {
      const v = this.values(g.player);
      this.timer += v.cooldown;
      ATTACKS[this.definition.type](g,this,v);
    }
  }
}

class Input {
  constructor(g) {
    this.keys = new Set();
    this.touch = {active:false,id:null,x:0,y:0,dx:0,dy:0};
    this.g = g;

    window.addEventListener("keydown",e=>{
      if (["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)) {
        return;
      }

      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
        e.preventDefault();
      }

      if (e.repeat) return;

      this.keys.add(e.code);
      g.sound.unlock();

      if (e.code==="Escape" || e.code==="KeyP") {
        if (g.state==="playing") g.pause();
        else if (g.state==="paused") g.resume();
      }

      if (g.state==="levelup" && /^Digit[1-4]$/.test(e.code)) {
        g.pickUpgrade(Number(e.code.slice(-1))-1);
      }

      if (DEBUG && e.code.startsWith("F")) {
        e.preventDefault();
        g.debugKey(e.code);
      }
    });

    window.addEventListener("keyup",e=>this.keys.delete(e.code));

    window.addEventListener("blur",()=>{
      this.clear();
      if (g.state==="playing") g.pause();
    });

    document.addEventListener("visibilitychange",()=>{
      if (document.hidden && g.state==="playing") g.pause();
    });

    g.canvas.addEventListener("pointerdown",e=>{
      g.sound.unlock();

      if (g.state!=="playing" || e.pointerType==="mouse" || this.touch.active) {
        return;
      }

      this.touch = {
        active:true,id:e.pointerId,
        x:e.clientX,y:e.clientY,dx:0,dy:0
      };

      g.canvas.setPointerCapture?.(e.pointerId);
    });

    g.canvas.addEventListener("pointermove",e=>{
      const t = this.touch;
      if (!t.active || t.id!==e.pointerId) return;

      const dx = e.clientX-t.x;
      const dy = e.clientY-t.y;
      const d = Math.hypot(dx,dy)||1;

      t.dx = dx/d*Math.min(1,d/48);
      t.dy = dy/d*Math.min(1,d/48);
    });

    const release = e=>{
      if (e.pointerId===this.touch.id) this.touch.active=false;
    };

    g.canvas.addEventListener("pointerup",release);
    g.canvas.addEventListener("pointercancel",release);
  }

  clear() {
    this.keys.clear();
    this.touch.active = false;
  }

  vector() {
    if (this.touch.active) {
      return {x:this.touch.dx,y:this.touch.dy};
    }

    const k = this.keys;

    let x =
      Number(k.has("KeyD")||k.has("ArrowRight")) -
      Number(k.has("KeyA")||k.has("ArrowLeft"));

    let y =
      Number(k.has("KeyS")||k.has("ArrowDown")) -
      Number(k.has("KeyW")||k.has("ArrowUp"));

    const d = Math.hypot(x,y);

    if (d > 1) {
      x /= d;
      y /= d;
    }

    return {x,y};
  }
}

class WaveDirector {
  constructor() {
    this.index = 0;
    this.spawnClock = 0;
    this.eliteClock = 80;
    this.formationClock = 24;
    this.eventIndex = 0;
  }

  update(g,dt) {
    const t = g.run.time;

    while (
      this.index < WAVE_TABLE.length-1 &&
      t >= WAVE_TABLE[this.index].end
    ) {
      this.index++;
    }

    const wave = WAVE_TABLE[this.index];

    while (
      this.eventIndex < BOSS_EVENTS.length &&
      t >= BOSS_EVENTS[this.eventIndex].at
    ) {
      const event = BOSS_EVENTS[this.eventIndex++];
      g.spawn("boss",null,event);
      g.announce(event.name,"Um custódio atravessou a névoa.");
      g.sound.play("boss");
    }

    this.spawnClock += dt*wave.rate*(t<12?.45:1);

    let budget = 14;

    while (this.spawnClock>=1 && budget-->0) {
      this.spawnClock--;

      if (g.enemies.length < wave.cap) {
        g.spawn(weighted(wave.enemies,x=>x[1])[0]);
      }
    }

    this.eliteClock -= dt*g.clockRate;

    if (this.eliteClock <= 0) {
      this.eliteClock = wave.elite;

      if (g.enemies.length < wave.cap) {
        g.spawn("elite");
      }
    }

    this.formationClock -= dt*g.clockRate;

    if (this.formationClock <= 0) {
      this.formationClock = rand(26,40);

      const count = Math.min(18,4+Math.floor(t/110));
      const angle = rand(0,TAU);

      for (let i=0; i<count && g.enemies.length<wave.cap; i++) {
        const a = wave.formation==="ring"
          ? i/count*TAU
          : angle+(i-count/2)*.07;

        g.spawn(
          wave.formation==="swarm"
            ? "swarm"
            : weighted(wave.enemies,x=>x[1])[0],
          a
        );
      }
    }
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas?.getContext("2d",{alpha:false});

    if (!this.ctx) {
      throw new Error("Este navegador não disponibilizou o Canvas 2D.");
    }

    this.state = "menu";
    this.player = null;
    this.run = null;
    this.enemies = [];
    this.pickups = [];
    this.gems = [];
    this.gemCells = new Map();
    this.areas = [];
    this.lines = [];
    this.enemyId = 0;

    this.grid = new SpatialGrid();
    this.bullets = new Pool(()=>({hitIds:new Set()}),1100);
    this.particles = new Pool(()=>({}),850);
    this.floats = new Pool(()=>({}),160);

    this.sound = new Sound();
    this.input = new Input(this);
    this.camera = {x:0,y:0};
    this.clockRate = 1;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.fps = 60;
    this.fx = 1;
    this.shake = 0;
    this.debug = {god:false,hitboxes:false,stats:DEBUG};
    this.hudClock = 0;

    this.ui = new UI(this);
    this.renderer = new Renderer(this);

    this.resize();
    window.addEventListener("resize",()=>this.resize());

    this.ui.main();
    requestAnimationFrame(t=>this.frame(t));
  }

  resize() {
    this.width = Math.max(280,window.innerWidth);
    this.height = Math.max(280,window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio||1,2);

    this.zoom = Math.max(
      this.width/1560,
      clamp(Math.min(this.width/920,this.height/660),.52,1)
    );

    this.viewW = this.width/this.zoom;
    this.viewH = this.height/this.zoom;

    this.canvas.width = Math.round(this.width*this.dpr);
    this.canvas.height = Math.round(this.height*this.dpr);
  }

  frame(now) {
    const raw = this.lastFrame
      ? Math.max(0,(now-this.lastFrame)/1000)
      : 0;

    this.lastFrame = now;

    if (raw > 0) {
      this.fps = this.fps*.96+Math.min(240,1/raw)*.04;
    }

    this.fx =
      save.settings.particles==="off" ? 0 :
      save.settings.particles==="low" ? .3 :
      save.settings.particles==="auto" && this.fps<43 ? .35 : 1;

    if (this.state==="playing") {
      this.accumulator += Math.min(raw,.25);
      let steps = 0;

      while (
        this.accumulator+1e-9 >= 1/60 &&
        steps++ < 15 &&
        this.state==="playing"
      ) {
        this.accumulator = Math.max(0,this.accumulator-1/60);
        this.update(1/60);
      }
    } else {
      this.accumulator = 0;
    }

    this.renderer.draw(now/1000);
    requestAnimationFrame(t=>this.frame(t));
  }

  setState(s) {
    this.state = s;
    this.accumulator = 0;
    this.input.clear();
  }

  start(character=save.selected,mode="normal") {
    if (!Object.hasOwn(CHARACTER_DEFINITIONS,character)) character="nara";
    if (!save.unlocked.includes(character)) character="nara";

    this.setState("playing");
    this.mode = mode;
    this.clockRate = mode==="test" ? 5 : 1;

    this.player = new Player(character);
    this.player.weapons.push(
      new Weapon(CHARACTER_DEFINITIONS[character].weapon)
    );

    this.run = {
      time:0,
      simTime:0,
      kills:0,
      gold:0,
      totalDamage:0,
      bossKills:0,
      evolutions:0,
      completed:false,
      settled:false
    };

    this.enemies.length = 0;
    this.pickups.length = 0;
    this.gems.length = 0;
    this.areas.length = 0;
    this.lines.length = 0;

    this.gemCells.clear();
    this.bullets.clear();
    this.particles.clear();
    this.floats.clear();
    this.grid.rebuild([]);

    this.enemyId = 0;
    this.director = new WaveDirector();
    this.camera.x = 0;
    this.camera.y = 0;
    this.shake = 0;
    this.hudClock = 0;

    this.ui.hide();
    this.ui.hud(true);
    this.ui.updateHUD();

    this.announce(
      "A névoa se move",
      mode==="test"
        ? "TESTE • relógio 5× • progresso temporário"
        : "Colete os cristais. Encontre sua primeira melhoria."
    );
  }

  pause() {
    if (this.state!=="playing") return;
    this.setState("paused");
    this.ui.pause();
  }

  resume() {
    this.setState("playing");
    this.ui.hide();
  }

  menu() {
    this.setState("menu");
    this.player = null;
    this.ui.hud(false);
    this.ui.main();
  }

  announce(title,sub="") {
    this.ui.toast(title,sub);
  }

  update(dt) {
    if (this.state!=="playing" || !this.player) return;

    const p = this.player;
    const r = this.run;

    r.time += dt*this.clockRate;
    r.simTime += dt;

    p.invulnerable = Math.max(0,p.invulnerable-dt);
    p.buff = Math.max(0,p.buff-dt);
    p.health = Math.min(p.maxHealth,p.health+p.stats.recovery*dt);

    const move = this.input.vector();

    p.x += move.x*p.speed*dt;
    p.y += move.y*p.speed*dt;

    if (Math.hypot(move.x,move.y) > .05) {
      const d = Math.hypot(move.x,move.y);
      p.dx = move.x/d;
      p.dy = move.y/d;
    }

    this.camera.x = p.x;
    this.camera.y = p.y;
    this.shake = Math.max(0,this.shake-dt*28);

    this.director.update(this,dt);
    this.updateEnemies(dt);

    if (this.state!=="playing") return;

    this.grid.rebuild(this.enemies);

    for (const w of p.weapons) w.update(this,dt);

    this.updateBullets(dt);
    if (this.state!=="playing") return;

    this.updateAreas(dt);
    if (this.state!=="playing") return;

    this.updateDrops(dt);
    this.updateEffects(dt);

    for (let i=this.enemies.length-1; i>=0; i--) {
      if (this.enemies[i].dead) removeAt(this.enemies,i);
    }

    this.hudClock -= dt;

    if (this.hudClock <= 0) {
      this.hudClock = .12;
      this.ui.updateHUD();
      this.checkAchievements();
    }

    if (this.state!=="playing") return;

    if (r.time>=1800 && !r.completed) {
      r.completed = true;
      this.spawn("final");
      this.checkAchievements();
      this.setState("goal");
      this.sound.play("boss");
      this.ui.goal();
      return;
    }

    this.maybeLevelUp();
  }

  spawn(type,angle=null,event=null) {
    const d = ENEMY_DEFINITIONS[type];
    const a = angle ?? rand(0,TAU);

    const hw = this.viewW/2+95;
    const hh = this.viewH/2+95;

    const distance = Math.min(
      hw/(Math.abs(Math.cos(a))||.0001),
      hh/(Math.abs(Math.sin(a))||.0001)
    ) + rand(0,70);

    const min = this.run.time/60;
    const hpScale = 1+.10*min+.006*min*min;

    const e = {
      ...d,
      type,
      id:++this.enemyId,
      x:this.camera.x+Math.cos(a)*distance,
      y:this.camera.y+Math.sin(a)*distance,
      hp:d.hp*(type==="final"?1:hpScale),
      maxHp:d.hp*(type==="final"?1:hpScale),
      speed:d.speed*(1+Math.min(.32,min*.007)),
      damage:d.damage*(1+min*.04),
      name:event?.name||d.name,
      pattern:event?.pattern||"ring",
      dead:false,
      kx:0,
      ky:0,
      slow:0,
      freeze:0,
      flash:0,
      attack:rand(1.5,3.5),
      wind:0,
      charge:0,
      aimX:0,
      aimY:0,
      phase:0
    };

    this.enemies.push(e);
    return e;
  }

  updateEnemies(dt) {
    const p = this.player;
    const far = Math.max(this.viewW,this.viewH)*2.2+600;

    for (const e of this.enemies) {
      if (e.dead) continue;

      const dx = p.x-e.x;
      const dy = p.y-e.y;
      const d = Math.hypot(dx,dy)||1;
      const special = e.type==="boss"||e.type==="final";

      if (d>far && !special && e.type!=="elite") {
        e.dead = true;
        continue;
      }

      e.flash = Math.max(0,e.flash-dt);
      e.slow = Math.max(0,e.slow-dt);
      e.freeze = Math.max(0,e.freeze-dt);

      if (e.freeze > 0) continue;

      let speed = e.speed*(e.slow>0?.48:1);
      let mx = dx/d;
      let my = dy/d;

      if (e.behavior==="ranged") {
        e.attack -= dt;

        if (e.attack<=.55 && e.wind===0) {
          e.wind = .55;
          e.aimX = mx;
          e.aimY = my;
        }

        if (e.attack<=0) {
          this.hostile(e,e.aimX,e.aimY,155);
          e.attack = 3.2;
          e.wind = 0;
        }

        if (d < 255) {
          mx = -mx;
          my = -my;
        } else if (d < 340) {
          mx = -dy/d*.3;
          my = dx/d*.3;
        }
      }

      if (special) {
        e.attack -= dt;

        if (e.type==="final") {
          speed += Math.min(280,Math.max(0,this.run.time-1800)*.6);
        }

        if (e.attack<.65 && e.wind===0) {
          e.wind = .65;
          e.aimX = dx/d;
          e.aimY = dy/d;
        }

        if (e.attack<=0) {
          e.wind = 0;
          e.phase++;

          if (e.pattern==="charge") {
            e.charge = 1;
            e.attack = 4.1;
          } else {
            const n =
              e.pattern==="spiral" ? 9 :
              e.pattern==="pulse" ? 22 : 14;

            for (let i=0; i<n; i++) {
              const a = i/n*TAU+e.phase*.31;

              this.hostile(
                e,
                Math.cos(a),
                Math.sin(a),
                e.pattern==="pulse"?140:112
              );
            }

            if (e.pattern==="summon" || e.type==="final") {
              for (let i=0; i<7 && this.enemies.length<900; i++) {
                this.spawn("swarm");
              }
            }

            e.attack =
              e.type==="final" ? 1.9 :
              e.pattern==="spiral" ? 1.7 : 4.4;
          }
        }

        if (e.wind>0) speed *= .15;

        if (e.charge>0) {
          e.charge -= dt;
          mx = e.aimX;
          my = e.aimY;
          speed = 330;
        }
      }

      e.x += (mx*speed+e.kx)*dt;
      e.y += (my*speed+e.ky)*dt;

      e.kx *= Math.exp(-9*dt);
      e.ky *= Math.exp(-9*dt);

      if ((p.x-e.x)**2+(p.y-e.y)**2 < (p.r+e.r)**2) {
        this.hurtPlayer(e.damage);
      }

      if (this.state!=="playing") return;
    }
  }

  hostile(e,dx,dy,speed) {
    this.projectile(null,e.x,e.y,dx*speed,dy*speed,{
      enemy:true,
      damage:e.damage,
      r:6,
      life:6,
      color:"#e49ead"
    });
  }

  projectile(w,x,y,vx,vy,o={}) {
    const b = this.bullets.take();
    if (!b) return;

    b.hitIds.clear();

    Object.assign(b,{
      x,y,px:x,py:y,vx,vy,
      originX:x,originY:y,
      r:6,
      life:2,
      age:0,
      damage:1,
      pierce:0,
      source:w,
      enemy:false,
      color:w?.definition.color||"#eee",
      kind:"bolt",
      returned:false,
      knock:50,
      blast:0
    },o);

    if (w) w.shots++;
    return b;
  }

  updateBullets(dt) {
    const p = this.player;

    for (let i=this.bullets.items.length-1; i>=0; i--) {
      const b = this.bullets.items[i];

      b.age += dt;
      b.life -= dt;
      b.px = b.x;
      b.py = b.y;

      if (b.kind==="disc" && b.age>.65) {
        if (!b.returned) {
          b.hitIds.clear();
          b.returned = true;
        }

        const dx = p.x-b.x;
        const dy = p.y-b.y;
        const d = Math.hypot(dx,dy)||1;

        b.vx = dx/d*390;
        b.vy = dy/d*390;

        if (d < 22) {
          if (b.blast) {
            this.blast(b.x,b.y,b.blast,b.damage,b.source);
          }
          b.life = 0;
        }
      }

      b.x += b.vx*dt;
      b.y += b.vy*dt;

      if (b.enemy) {
        if (
          segmentDistance2(p.x,p.y,b.px,b.py,b.x,b.y) <
          (p.r+b.r)**2
        ) {
          this.hurtPlayer(b.damage);
          b.life = 0;
          if (this.state!=="playing") return;
        }
      } else if (b.life>0) {
        const mx = (b.x+b.px)/2;
        const my = (b.y+b.py)/2;
        const reach = Math.hypot(b.x-b.px,b.y-b.py)/2+b.r+68;

        this.grid.query(mx,my,reach,e=>{
          if (b.life<=0 || b.hitIds.has(e.id)) return;

          if (
            segmentDistance2(e.x,e.y,b.px,b.py,b.x,b.y) <
            (e.r+b.r)**2
          ) {
            b.hitIds.add(e.id);
            this.damageEnemy(e,b.damage,b.source,b.knock);

            if (b.blast && b.kind!=="disc") {
              this.blast(b.x,b.y,b.blast,b.damage*.65,b.source);
            }

            if (--b.pierce < 0) b.life=0;
          }
        });
      }

      if (
        b.life<=0 ||
        Math.abs(b.x-p.x)>this.viewW+450 ||
        Math.abs(b.y-p.y)>this.viewH+450
      ) {
        this.bullets.remove(i);
      }
    }
  }

  damageEnemy(e,damage,w,knock=0,allowCrit=true) {
    if (e.dead) return false;

    const critical =
      allowCrit && Math.random()<this.player.stats.critChance;

    const amount = Math.min(e.hp,damage*(critical?1.8:1));

    e.hp -= amount;
    e.flash = .085;
    this.run.totalDamage += amount;

    if (w) {
      w.damageDealt += amount;
      w.hits++;
    }

    if (knock && e.resist<1) {
      const dx = e.x-this.player.x;
      const dy = e.y-this.player.y;
      const d = Math.hypot(dx,dy)||1;

      e.kx += dx/d*knock*(1-e.resist);
      e.ky += dy/d*knock*(1-e.resist);
    }

    if (
      save.settings.numbers &&
      Math.random() < (critical?1:.35)
    ) {
      this.float(
        e.x,e.y,Math.ceil(amount),
        critical?"#ffe399":"#dbe5df",
        critical?18:12
      );
    }

    this.spark(
      e.x,e.y,w?.definition.color||"#ffdfb2",
      critical?4:2
    );

    this.sound.play("hit");

    if (e.hp<=0) {
      e.dead = true;
      this.run.kills++;
      if (w) w.kills++;

      this.dropXP(e.x,e.y,e.xp);

      if (e.type==="elite" || e.type==="boss" || e.type==="final") {
        this.pickups.push({
          type:"chest",
          x:e.x,y:e.y,
          value:e.type==="elite"?35:100,
          life:Infinity
        });

        if (e.type!=="elite") this.run.bossKills++;
        this.spark(e.x,e.y,"#f4d69e",28);
      } else {
        if (Math.random()<.14*this.player.stats.luck) {
          this.drop("gold",e.x+9,e.y,Math.ceil(rand(1,3)));
        }

        const roll = Math.random()/this.player.stats.luck;

        if (roll<.007) this.drop("heal",e.x-8,e.y,25);
        else if (roll<.009) this.drop("magnet",e.x,e.y);
        else if (roll<.0105) this.drop("bomb",e.x,e.y);
        else if (roll<.013) this.drop("buff",e.x,e.y);
      }

      if (w?.evolved && w.id==="well") {
        this.player.health = Math.min(
          this.player.maxHealth,
          this.player.health+.35
        );
      }

      return true;
    }

    return false;
  }

  hurtPlayer(damage) {
    const p = this.player;

    if (
      p.invulnerable>0 ||
      this.debug.god ||
      this.state!=="playing"
    ) {
      return;
    }

    const loss = Math.max(1,damage-p.armor);

    p.health = Math.max(0,p.health-loss);
    p.invulnerable = .55;
    this.shake = 7;

    this.float(p.x,p.y-22,"−"+Math.ceil(loss),"#ff9297",20);
    this.sound.play("hurt");

    if (p.health<=0) this.finish(false);
  }

  blast(x,y,r,damage,w,slow=0,freeze=0) {
    this.grid.query(x,y,r+68,e=>{
      if ((e.x-x)**2+(e.y-y)**2 < (r+e.r)**2) {
        this.damageEnemy(e,damage,w,110);
        e.slow = Math.max(e.slow,slow);

        if (
          e.type!=="boss" &&
          e.type!=="elite" &&
          e.type!=="final"
        ) {
          e.freeze = Math.max(e.freeze,freeze);
        }
      }
    });

    this.ring(x,y,r,w?.definition.color||"#fff0b6");
    this.spark(x,y,w?.definition.color||"#fff0b6",12);
  }

  ring(x,y,r,color) {
    if (this.lines.length<100) {
      this.lines.push({
        kind:"ring",x,y,r,color,life:.32,max:.32
      });
    }
  }

  area(x,y,r,damage,w,life,delay=0,kind="pool") {
    if (this.areas.length>=64) return;

    this.areas.push({
      x,y,r,damage,w,life,delay,kind,
      tick:0,
      armed:delay<=0
    });
  }

  updateAreas(dt) {
    for (let i=this.areas.length-1; i>=0; i--) {
      const a = this.areas[i];

      if (!a.armed) {
        a.delay -= dt;

        if (a.delay<=0) {
          a.armed = true;
          this.blast(a.x,a.y,a.r,a.damage,a.w);
          this.shake = Math.max(this.shake,3);

          if (a.w.evolved) {
            a.kind = "pool";
            a.life = 2.8;
            a.damage *= .17;
          } else {
            a.life = 0;
          }
        }
      } else {
        a.life -= dt;
        a.tick -= dt;

        if (a.tick<=0 && a.life>0) {
          a.tick = .45;

          this.grid.query(a.x,a.y,a.r+68,e=>{
            if ((e.x-a.x)**2+(e.y-a.y)**2 < (a.r+e.r)**2) {
              this.damageEnemy(e,a.damage,a.w,0);
            }
          });
        }

        if (a.w.id==="well" && a.w.evolved) {
          this.grid.query(a.x,a.y,a.r+80,e=>{
            const dx = a.x-e.x;
            const dy = a.y-e.y;
            const d = Math.hypot(dx,dy)||1;

            if (d>15 && d<a.r+80) {
              e.x += dx/d*65*(1-e.resist)*dt;
              e.y += dy/d*65*(1-e.resist)*dt;
            }
          });
        }
      }

      if (a.armed && a.life<=0) removeAt(this.areas,i);
    }
  }

  drop(type,x,y,value=1) {
    if (this.pickups.length<260) {
      this.pickups.push({type,x,y,value,life:100});
    }
  }

  dropXP(x,y,value) {
    const key = Math.floor(x/60)+","+Math.floor(y/60);
    const old = this.gemCells.get(key);

    if (old && !old.magnet) {
      old.value += value;
      return;
    }

    /* O limite compacta valores, preservando toda a XP gerada. */
    if (this.gems.length>=1200) {
      this.gems[this.run.kills%this.gems.length].value += value;
      return;
    }

    const gem = {x,y,value,key,magnet:false};
    this.gems.push(gem);
    this.gemCells.set(key,gem);
  }

  updateDrops(dt) {
    const p = this.player;

    for (let i=this.gems.length-1; i>=0; i--) {
      const gem = this.gems[i];
      const dx = p.x-gem.x;
      const dy = p.y-gem.y;
      const d = Math.hypot(dx,dy)||.001;

      if (d<p.stats.pickupRange) gem.magnet=true;

      if (gem.magnet) {
        const step = Math.min(d,(280+850/(1+d/80))*dt);
        gem.x += dx/d*step;
        gem.y += dy/d*step;
      }

      if (d<20) {
        p.xp += gem.value*p.stats.growth*(this.mode==="test"?5:1);

        if (this.gemCells.get(gem.key)===gem) {
          this.gemCells.delete(gem.key);
        }

        removeAt(this.gems,i);
      }
    }

    for (let i=this.pickups.length-1; i>=0; i--) {
      const item = this.pickups[i];
      item.life -= dt;

      if (item.life<=0) {
        removeAt(this.pickups,i);
        continue;
      }

      if ((item.x-p.x)**2+(item.y-p.y)**2 > 30**2) continue;

      removeAt(this.pickups,i);

      switch (item.type) {
        case "gold":
          this.run.gold += item.value;
          break;

        case "heal":
          p.health = Math.min(p.maxHealth,p.health+item.value);
          this.float(p.x,p.y,"+"+item.value,"#89edba",18);
          break;

        case "magnet":
          for (const gem of this.gems) gem.magnet=true;
          this.announce(
            "Ressonância",
            "Todos os cristais deixados serão atraídos."
          );
          break;

        case "bomb":
          this.blast(
            p.x,p.y,
            Math.max(this.viewW,this.viewH),
            220*p.stats.damage,
            null
          );
          this.shake = 10;
          break;

        case "buff":
          p.buff = 12;
          this.announce(
            "Pulso de âmbar",
            "+40% de dano e ataques mais rápidos por 12 s."
          );
          break;

        case "chest":
          this.openChest(item);
          return;
      }
    }
  }

  candidates(existingOnly=false) {
    const p = this.player;
    const result = [];

    for (const [id,d] of Object.entries(WEAPON_DEFINITIONS)) {
      const w = p.weapons.find(w=>w.id===id);

      if (w && w.level<8 && !w.evolved) {
        result.push({kind:"weapon",id,weight:d.weight*2.8});
      } else if (!w && !existingOnly && p.weapons.length<MAX_WEAPONS) {
        result.push({kind:"weapon",id,weight:d.weight});
      }
    }

    for (const [id,d] of Object.entries(PASSIVE_DEFINITIONS)) {
      const level = p.passives[id]||0;

      if (level>0 && level<d.max) {
        result.push({kind:"passive",id,weight:d.weight*2.2});
      } else if (
        !level &&
        !existingOnly &&
        Object.keys(p.passives).length<MAX_PASSIVES
      ) {
        result.push({kind:"passive",id,weight:d.weight});
      }
    }

    return result;
  }

  rollChoices() {
    const pool = this.candidates();
    const out = [];

    while (pool.length && out.length<4) {
      const selected = weighted(
        pool,
        x=>x.weight*(x.weight<9?this.player.stats.luck:1)
      );

      out.push(selected);
      pool.splice(pool.indexOf(selected),1);
    }

    for (const id of ["heal","gold","buff","magnet"]) {
      if (out.length<4) out.push({kind:"bonus",id,weight:1});
    }

    return out;
  }

  maybeLevelUp() {
    const p = this.player;

    if (this.state!=="playing" || p.xp<p.xpToNextLevel) return;

    p.xp -= p.xpToNextLevel;
    p.level++;
    p.xpToNextLevel = xpNeed(p.level);
    p.recalculate();

    this.choices = this.rollChoices();
    this.setState("levelup");
    this.sound.play("level");
    this.checkAchievements();
    this.ui.levelup();
  }

  applyUpgrade(item) {
    const p = this.player;

    if (item.kind==="weapon") {
      const w = p.weapons.find(w=>w.id===item.id);

      if (w) {
        if (w.level<8 && !w.evolved) w.level++;
      } else if (p.weapons.length<MAX_WEAPONS) {
        p.weapons.push(new Weapon(item.id));
      }
    } else if (item.kind==="passive") {
      const d = PASSIVE_DEFINITIONS[item.id];

      if (
        (p.passives[item.id]||0)<d.max &&
        (p.passives[item.id]||Object.keys(p.passives).length<MAX_PASSIVES)
      ) {
        p.passives[item.id] = (p.passives[item.id]||0)+1;
      }

      p.recalculate();
    } else if (item.id==="heal") {
      p.health = Math.min(p.maxHealth,p.health+35);
    } else if (item.id==="buff") {
      p.buff = 12;
    } else if (item.id==="magnet") {
      for (const gem of this.gems) gem.magnet=true;
    } else {
      this.run.gold += 25;
    }
  }

  pickUpgrade(index) {
    if (this.state!=="levelup" || !this.choices[index]) return;

    this.applyUpgrade(this.choices[index]);
    this.choices = [];

    this.resume();
    this.ui.updateHUD();
    this.maybeLevelUp();
  }

  eligibleEvolution() {
    return this.player.weapons.find(w=>
      w.level===8 &&
      !w.evolved &&
      (this.player.passives[w.definition.passive]||0)>0
    );
  }

  openChest(item) {
    const eligible = this.eligibleEvolution();
    const options = this.candidates(true);

    this.chestReward = eligible
      ? {kind:"evolution",id:eligible.id,gold:item.value}
      : {
          kind:"reward",
          upgrade:options.length?weighted(options):null,
          gold:item.value
        };

    this.setState("chest");
    this.sound.play("chest");
    this.ui.chest();
  }

  claimChest() {
    if (this.state!=="chest" || !this.chestReward) return;

    const reward = this.chestReward;
    this.chestReward = null;
    this.run.gold += reward.gold;

    if (reward.kind==="evolution") {
      const w = this.player.weapons.find(w=>w.id===reward.id);
      w.evolved = true;
      this.run.evolutions++;
      this.announce(w.name,w.definition.evolvedDescription);
    } else if (reward.upgrade) {
      this.applyUpgrade(reward.upgrade);
    }

    this.checkAchievements();
    this.resume();
    this.ui.updateHUD();
    this.maybeLevelUp();
  }

  checkAchievements() {
    if (this.mode==="test") return;
    let changed = false;

    for (const a of ACHIEVEMENTS) {
      if (!save.achievements.includes(a.id) && a.check(this)) {
        save.achievements.push(a.id);

        if (a.character && !save.unlocked.includes(a.character)) {
          save.unlocked.push(a.character);
        }

        if (a.reward) save.gold+=a.reward;

        this.announce(
          "Conquista • "+a.name,
          a.character
            ? CHARACTER_DEFINITIONS[a.character].name+" disponível"
            : a.reward
              ? `+${a.reward} ouro permanente`
              : a.text
        );

        changed = true;
      }
    }

    if (changed) saveGame();
  }

  finish(victory=false,abandoned=false) {
    if (!this.run || this.run.settled) return;

    if (victory) this.run.completed=true;
    this.checkAchievements();

    this.run.settled = true;
    this.run.abandoned = abandoned;
    this.run.bonus = this.run.completed?250:0;

    this.run.score = Math.floor(
      this.run.kills*10 +
      this.run.time +
      this.run.totalDamage/100 +
      this.run.gold*5 +
      (this.run.completed?10000:0)
    );

    if (this.mode!=="test") {
      save.gold += this.run.gold+this.run.bonus;
      save.runs++;

      if (this.run.completed) save.completed++;

      save.highScore = Math.max(save.highScore,this.run.score);
      save.bestTime = Math.max(save.bestTime,Math.floor(this.run.time));
      save.bestKills = Math.max(save.bestKills,this.run.kills);

      saveGame();
    }

    this.setState("result");
    this.sound.play("end");
    this.ui.hud(false);
    this.ui.result();
  }

  spark(x,y,color,count) {
    count = Math.floor(count*this.fx);

    for (let i=0; i<count; i++) {
      const p = this.particles.take();
      if (!p) break;

      const a = rand(0,TAU);
      const speed = rand(20,130);

      Object.assign(p,{
        x,y,
        vx:Math.cos(a)*speed,
        vy:Math.sin(a)*speed,
        life:rand(.15,.5),
        max:.5,
        color,
        r:rand(1,3)
      });
    }
  }

  float(x,y,text,color,size=13) {
    const f = this.floats.take();

    if (f) {
      Object.assign(f,{
        x,y,text:String(text),color,size,life:.7
      });
    }
  }

  updateEffects(dt) {
    for (let i=this.particles.items.length-1; i>=0; i--) {
      const p = this.particles.items[i];
      p.life -= dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;

      if (p.life<=0) this.particles.remove(i);
    }

    for (let i=this.floats.items.length-1; i>=0; i--) {
      const f = this.floats.items[i];
      f.life -= dt;
      f.y -= 35*dt;

      if (f.life<=0) this.floats.remove(i);
    }

    for (let i=this.lines.length-1; i>=0; i--) {
      this.lines[i].life -= dt;
      if (this.lines[i].life<=0) removeAt(this.lines,i);
    }
  }

  debugKey(key) {
    if (!DEBUG || !this.run || this.run.settled) return;

    if (key==="F1") this.run.gold+=1000;

    if (key==="F2") {
      this.player.xp += this.player.xpToNextLevel*3;
      this.maybeLevelUp();
    }

    if (key==="F3") {
      this.spawn("boss",null,choose(BOSS_EVENTS));
    }

    if (key==="F4") {
      this.clockRate =
        this.clockRate===1 ? 5 :
        this.clockRate===5 ? 20 : 1;

      this.announce("Relógio "+this.clockRate+"×");
    }

    if (key==="F6") this.debug.god=!this.debug.god;
    if (key==="F7") this.debug.hitboxes=!this.debug.hitboxes;
    if (key==="F8") this.debug.stats=!this.debug.stats;
  }
}

/* Estratégias independentes para os oito comportamentos de ataque. */
const ATTACKS = {
  ember(g,w,v) {
    const p = g.player;
    const target = g.grid.nearest(p.x,p.y,850);
    if (!target) return;

    const a = Math.atan2(target.y-p.y,target.x-p.x);
    const n = v.amount;

    for (let i=0; i<n; i++) {
      const angle = a+(i-(n-1)/2)*.12;

      g.projectile(
        w,p.x,p.y,
        Math.cos(angle)*365,
        Math.sin(angle)*365,
        {
          damage:v.damage,
          r:(w.evolved?11:6)*v.area,
          life:2.6,
          blast:w.evolved?90*v.area:0,
          pierce:0
        }
      );
    }
  },

  orbit(g,w,v) {
    const p = g.player;
    const n = v.amount+1;
    const rings = w.evolved?2:1;

    w.shots += n*rings;

    for (let ring=0; ring<rings; ring++) {
      for (let i=0; i<n; i++) {
        const a = g.run.simTime*(ring?-2.5:2.5)+i/n*TAU;
        const r = (ring?115:65)*v.area;
        const x = p.x+Math.cos(a)*r;
        const y = p.y+Math.sin(a)*r;

        g.grid.query(x,y,22*v.area+68,e=>{
          if ((e.x-x)**2+(e.y-y)**2 < (e.r+18*v.area)**2) {
            g.damageEnemy(e,v.damage,w,65);
          }
        });
      }
    }
  },

  spear(g,w,v) {
    const p = g.player;
    const base = Math.atan2(p.dy,p.dx);
    const n = w.evolved ? 8+v.amount : v.amount;

    for (let i=0; i<n; i++) {
      const a = w.evolved
        ? base+i/n*TAU
        : base+(i-(n-1)/2)*.14;

      g.projectile(
        w,p.x,p.y,
        Math.cos(a)*560,
        Math.sin(a)*560,
        {
          damage:v.damage,
          r:5*v.area,
          pierce:w.evolved?50:2+Math.floor(w.level/2),
          life:1.25*v.duration,
          kind:"needle",
          knock:85
        }
      );
    }
  },

  frost(g,w,v) {
    w.shots++;

    g.blast(
      g.player.x,g.player.y,
      (w.evolved?135:76)*v.area,
      v.damage,w,
      1.5,
      w.evolved?.65:0
    );
  },

  chain(g,w,v) {
    const p = g.player;
    const hit = new Set();

    let x = p.x;
    let y = p.y;
    let count = 2+v.amount+(w.evolved?5:0);

    w.shots++;

    while (count-->0) {
      const e = g.grid.nearest(
        x,y,
        hit.size?240*v.area:750,
        hit
      );

      if (!e) break;

      hit.add(e.id);

      if (g.lines.length<100) {
        g.lines.push({
          kind:"lightning",
          x,y,tx:e.x,ty:e.y,
          color:w.definition.color,
          life:.22,max:.22
        });
      }

      g.damageEnemy(e,v.damage,w,15);

      if (w.evolved) {
        g.blast(e.x,e.y,42*v.area,v.damage*.35,w);
      }

      x = e.x;
      y = e.y;
    }
  },

  well(g,w,v) {
    const p = g.player;

    for (let i=0; i<v.amount; i++) {
      const target = g.grid.nearest(
        p.x+rand(-180,180),
        p.y+rand(-180,180),
        650
      );

      const x = target?.x ?? p.x+rand(-100,100);
      const y = target?.y ?? p.y+rand(-100,100);

      g.area(
        x,y,
        (w.evolved?93:60)*v.area,
        v.damage,w,
        3.2*v.duration
      );

      w.shots++;
    }
  },

  disc(g,w,v) {
    const p = g.player;
    const target = g.grid.nearest(p.x,p.y,750);

    const a = target
      ? Math.atan2(target.y-p.y,target.x-p.x)
      : Math.atan2(p.dy,p.dx);

    const n = v.amount+(w.evolved?3:0);

    for (let i=0; i<n; i++) {
      const angle = a+(i-(n-1)/2)*.3;

      g.projectile(
        w,p.x,p.y,
        Math.cos(angle)*310,
        Math.sin(angle)*310,
        {
          damage:v.damage,
          r:11*v.area,
          life:3.4*v.duration,
          kind:"disc",
          pierce:100,
          blast:w.evolved?85*v.area:0
        }
      );
    }
  },

  meteor(g,w,v) {
    const p = g.player;
    const n = v.amount*(w.evolved?3:1);

    for (let i=0; i<n; i++) {
      const target = g.grid.nearest(
        p.x+rand(-260,260),
        p.y+rand(-260,260),
        800
      );

      if (!target) continue;

      g.area(
        target.x+rand(-25,25),
        target.y+rand(-25,25),
        70*v.area,
        v.damage,w,
        .01,
        .65+i*.12,
        "meteor"
      );

      w.shots++;
    }
  }
};

class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById("screen");
    this.actions = {};
    this.mode = "normal";
    this.toastTimer = 0;
    this.slotKey = "";
    this.nodes = {};

    for (const id of [
      "hud","hp-fill","hp-text","xp-fill","level","timer",
      "wave","gold","kills","weapons","passives",
      "boss-hud","boss-name","boss-fill","debug","toast"
    ]) {
      this.nodes[id] = document.getElementById(id);
    }

    if (!this.root || Object.values(this.nodes).some(n=>!n)) {
      throw new Error(
        "O HTML está incompleto. Mantenha todos os arquivos da mesma versão."
      );
    }

    this.root.addEventListener("click",e=>{
      const b = e.target.closest("button[data-action]");
      if (!b || b.disabled) return;

      this.g.sound.unlock();
      this.actions[b.dataset.action]?.(b);
    });

    this.root.addEventListener("input",e=>this.onInput?.(e.target));

    document.getElementById("pause-button")
      .addEventListener("click",()=>g.pause());
  }

  show(html,actions={},wide=false) {
    this.actions = actions;
    this.onInput = null;

    this.root.innerHTML =
      `<section class="panel ${wide?"wide":""}">${html}</section>`;

    this.root.hidden = false;

    this.root.querySelector("button:not([disabled])")
      ?.focus({preventScroll:true});
  }

  hide() {
    this.root.hidden = true;
    this.actions = {};
    this.onInput = null;
  }

  hud(visible) {
    this.nodes.hud.hidden = !visible;
  }

  head(kicker,title,sub="") {
    return `
      <div class="eyebrow">${kicker}</div>
      <h1>${title}</h1>
      ${sub?`<p class="lede">${sub}</p>`:""}
    `;
  }

  button(action,text,primary=false) {
    return `
      <button data-action="${action}" class="${primary?"primary":""}">
        ${text}
      </button>
    `;
  }

  main() {
    const c = CHARACTER_DEFINITIONS[save.selected];

    this.show(`
      <div class="menu-top">
        <span class="eyebrow">ESTÚDIO DO LIMIAR · VOL. 01</span>
        <span class="gold">◈ ${fmt(save.gold)}</span>
      </div>

      <div class="hero">
        <div>
          <div class="eyebrow">UM SURVIVOR DE FANTASIA ARCANA</div>
          <h1 class="logo">LIMIAR<span>ECOS DO OBELISCO</span></h1>
          <p class="lede">
            A noite guarda o que você deixou para trás.<br>
            Quanto de você atravessa a névoa?
          </p>

          <div class="actions">
            ${this.button("play","INICIAR EXPEDIÇÃO ↗",true)}
          </div>

          <div class="menu-grid">
            ${this.button("characters","Personagens")}
            ${this.button("meta","Melhorias permanentes")}
            ${this.button("achievements","Conquistas")}
            ${this.button("settings","Configurações")}
          </div>
        </div>

        <aside class="hero-seal">
          <div class="obelisk"><i></i></div>
          <span class="eyebrow">SEU PRÓXIMO ECO</span>
          <h2>${c.name}</h2>
          <p>${c.title}</p>
          <span style="color:${c.color}">
            ${c.icon} ${WEAPON_DEFINITIONS[c.weapon].name}
          </span>
        </aside>
      </div>

      <div class="records">
        <span>RECORDE <b>${fmt(save.highScore)}</b></span>
        <span>MAIOR TEMPO <b>${clock(save.bestTime)}</b></span>
        <span>MAIS BAIXAS <b>${fmt(save.bestKills)}</b></span>
        <span>TRAVESSIAS <b>${save.completed}</b></span>
      </div>

      <div class="footer">
        ${this.button("codex","Arsenal e evoluções")}
        ${this.button("reset","Resetar progresso")}
        <small>
          v${VERSION} · WASD / SETAS ·
          ${storageAvailable
            ? "SALVAMENTO LOCAL"
            : "PROGRESSO TEMPORÁRIO: armazenamento indisponível"}
        </small>
      </div>
    `,{
      play:()=>this.characters(),
      characters:()=>this.characters(),
      meta:()=>this.meta(),
      achievements:()=>this.achievements(),
      settings:()=>this.settings(()=>this.main()),
      codex:()=>this.codex(()=>this.main()),
      reset:()=>this.confirm(
        "Resetar todo o progresso?",
        "O ouro, as conquistas e as melhorias deste navegador serão apagados.",
        ()=>{
          resetSave();
          this.main();
        },
        ()=>this.main()
      )
    },true);
  }

  characters() {
    this.show(
      this.head(
        "PREPARE A TRAVESSIA",
        "Escolha seu eco",
        "Cada viajante muda o começo da sua build."
      ) + `
      <div class="cards characters">
        ${Object.entries(CHARACTER_DEFINITIONS).map(([id,c])=>{
          const unlocked = save.unlocked.includes(id);

          return `
            <button
              data-action="select"
              data-id="${id}"
              class="card ${save.selected===id?"selected":""} ${unlocked?"":"locked"}"
              ${unlocked?"":"disabled"}
            >
              <span class="sigil" style="color:${c.color}">${c.icon}</span>
              <small>
                ${unlocked
                  ? (save.selected===id?"SELECIONADO":"DISPONÍVEL")
                  : "BLOQUEADO"}
              </small>
              <h2>${c.name}</h2>
              <p>${c.title}</p>
              <strong>${WEAPON_DEFINITIONS[c.weapon].name}</strong>
              <p>${c.bonus}</p>
              <small>${c.condition}</small>
            </button>
          `;
        }).join("")}
      </div>

      <div class="mode">
        <label for="run-mode">Expedição</label>
        <select id="run-mode">
          <option value="normal" ${this.mode==="normal"?"selected":""}>
            Padrão · 30 minutos
          </option>
          <option value="test" ${this.mode==="test"?"selected":""}>
            Teste · relógio 5× · sem salvar recompensas
          </option>
        </select>
      </div>

      <div class="actions">
        ${this.button("start","ATRAVESSAR A NÉVOA",true)}
        ${this.button("back","Voltar")}
      </div>
    `,{
      select:b=>{
        save.selected = b.dataset.id;
        saveGame();
        this.characters();
      },
      start:()=>this.begin(),
      back:()=>this.main()
    },true);

    this.onInput = t=>{
      if (t.id==="run-mode") this.mode=t.value;
    };
  }

  begin() {
    if (!save.tutorial) {
      this.show(
        this.head("ANTES DE ATRAVESSAR","Mova-se. O resto desperta.") + `
        <div class="tutorial">
          <p><kbd>W A S D</kbd> ou <kbd>↑ ← ↓ →</kbd> para mover.</p>
          <p>
            <b>Os ataques são automáticos.</b>
            Procure espaço entre os inimigos.
          </p>
          <p>
            Recolha <span class="mint">◆ cristais de XP</span>
            e escolha uma melhoria a cada nível.
          </p>
          <p>
            Chefes deixam baús.
            Arma nível 8 + passivo parceiro + baú = evolução.
          </p>
          <p>
            Sobreviva <b>30 minutos</b>.
            No touch, arraste o dedo sobre a arena.
          </p>
          <p>
            <kbd>Esc</kbd> / <kbd>P</kbd> pausa.
            <kbd>1–4</kbd> escolhe uma melhoria.
          </p>
        </div>
        <div class="actions">
          ${this.button("go","ESTOU PRONTO",true)}
          ${this.button("back","Voltar")}
        </div>
      `,{
        go:()=>{
          save.tutorial = true;
          saveGame();
          this.g.start(save.selected,this.mode);
        },
        back:()=>this.characters()
      });

      return;
    }

    this.g.start(save.selected,this.mode);
  }

  pause() {
    this.show(
      this.head(
        "O TEMPO ESPERA",
        "Travessia suspensa",
        `${clock(this.g.run.time)} · nível ${this.g.player.level}`
      ) + `
      <div class="stack">
        ${this.button("resume","Continuar",true)}
        ${this.button("settings","Configurações")}
        ${this.button("codex","Arsenal e evoluções")}
        ${this.button("quit","Voltar ao menu")}
      </div>
    `,{
      resume:()=>this.g.resume(),
      settings:()=>this.settings(()=>this.pause()),
      codex:()=>this.codex(()=>this.pause()),
      quit:()=>this.confirm(
        "Encerrar esta expedição?",
        "O ouro coletado será contabilizado. A build atual será encerrada.",
        ()=>{
          this.g.finish(false,true);
          this.g.menu();
        },
        ()=>this.pause()
      )
    });
  }

  confirm(title,text,yes,no) {
    this.show(
      this.head("CONFIRMAÇÃO",title,text) + `
      <div class="actions">
        ${this.button("no","Cancelar",true)}
        ${this.button("yes","Confirmar")}
      </div>
    `,{yes,no});
  }

  settings(back) {
    const s = save.settings;

    const toggle = (key,label)=>`
      <label class="setting">
        <span>${label}</span>
        <input data-setting="${key}" type="checkbox" ${s[key]?"checked":""}>
      </label>
    `;

    this.show(
      this.head("PREFERÊNCIAS","Ajuste a atmosfera") + `
      <div class="settings">
        <label class="setting">
          <span>Volume geral</span>
          <input data-setting="volume" type="range"
            min="0" max="1" step=".05" value="${s.volume}">
        </label>

        ${toggle("mute","Silenciar")}
        ${toggle("sounds","Efeitos sonoros")}
        ${toggle("shake","Tremor de tela")}
        ${toggle("numbers","Números de dano")}

        <label class="setting">
          <span>Partículas</span>
          <select data-setting="particles">
            ${[
              ["auto","Automática"],
              ["high","Alta"],
              ["low","Reduzida"],
              ["off","Desativadas"]
            ].map(([v,t])=>`
              <option value="${v}" ${s.particles===v?"selected":""}>
                ${t}
              </option>
            `).join("")}
          </select>
        </label>
      </div>

      <p class="muted">
        Na qualidade automática, os efeitos diminuem quando a taxa de
        quadros cai. A simulação permanece a mesma.
      </p>

      <div class="actions">
        ${this.button("back","Voltar",true)}
        ${this.button("sound","Testar som")}
      </div>
    `,{
      back,
      sound:()=>{
        this.g.sound.unlock();
        this.g.sound.play("level");
      }
    });

    this.onInput = t=>{
      const key = t.dataset.setting;
      if (!Object.hasOwn(s,key)) return;

      s[key] =
        t.type==="checkbox" ? t.checked :
        t.type==="range" ? Number(t.value) : t.value;

      saveGame();
    };
  }

  meta() {
    this.show(
      this.head(
        "O QUE PERMANECE",
        "Melhorias permanentes",
        `Seu ouro: <b class="gold">${fmt(save.gold)}</b>.
         Até cinco níveis por melhoria.`
      ) + `
      <div class="cards meta">
        ${Object.entries(META_DEFINITIONS).map(([id,d])=>{
          const level = save.upgrades[id]||0;
          const cost = Math.ceil(d.base*1.7**level);

          return `
            <div class="card">
              <small>NÍVEL ${level} / 5</small>
              <h2>${d.name}</h2>
              <p>${d.text} por nível.</p>
              <button data-action="buy" data-id="${id}"
                ${level>=5||save.gold<cost?"disabled":""}>
                ${level>=5?"COMPLETO":`◈ ${cost} · Melhorar`}
              </button>
            </div>
          `;
        }).join("")}
      </div>
      <div class="actions">${this.button("back","Voltar")}</div>
    `,{
      back:()=>this.main(),
      buy:b=>{
        const id = b.dataset.id;
        const d = META_DEFINITIONS[id];
        const level = save.upgrades[id]||0;
        const cost = Math.ceil(d.base*1.7**level);

        if (level>=5 || save.gold<cost) return;

        save.gold -= cost;
        save.upgrades[id] = level+1;
        saveGame();
        this.meta();
      }
    },true);
  }

  achievements() {
    this.show(
      this.head(
        "MEMÓRIAS DA NÉVOA",
        "Conquistas",
        `${save.achievements.length} de ${ACHIEVEMENTS.length}
         · somente no modo padrão`
      ) + `
      <div class="cards meta">
        ${ACHIEVEMENTS.map(a=>`
          <div class="card ${save.achievements.includes(a.id)?"selected":""}">
            <small>
              ${save.achievements.includes(a.id)?"✓ CONCLUÍDA":"A DESCOBRIR"}
            </small>
            <h2>${a.name}</h2>
            <p>${a.text}</p>
            <strong>
              ${a.character
                ? "Desbloqueia "+CHARACTER_DEFINITIONS[a.character].name
                : `+${a.reward} ouro`}
            </strong>
          </div>
        `).join("")}
      </div>
      <div class="actions">${this.button("back","Voltar")}</div>
    `,{back:()=>this.main()},true);
  }

  codex(back) {
    this.show(
      this.head(
        "O ARSENAL",
        "Oito formas de resistir",
        "Arma nível 8 + passivo indicado em qualquer nível + baú. " +
        "O baú evolui a primeira arma elegível na ordem dos slots."
      ) + `
      <div class="cards meta">
        ${Object.values(WEAPON_DEFINITIONS).map(d=>`
          <div class="card">
            <span class="sigil small" style="color:${d.color}">${d.icon}</span>
            <h2>${d.name}</h2>
            <p>${d.description}</p>
            <small>+ ${PASSIVE_DEFINITIONS[d.passive].name}</small>
            <h3>${d.evolution}</h3>
            <p>${d.evolvedDescription}</p>
          </div>
        `).join("")}
      </div>

      <p class="muted">
        Cada nível aumenta dano e área. Os intervalos diminuem e,
        nos níveis 3 e 6, os ataques compatíveis ganham mais unidades.
        Limite: seis armas e seis passivos.
      </p>

      <div class="actions">${this.button("back","Voltar")}</div>
    `,{back},true);
  }

  upgradeText(item) {
    const p = this.g.player;

    if (item.kind==="weapon") {
      const d = WEAPON_DEFINITIONS[item.id];
      const w = p.weapons.find(w=>w.id===item.id);

      return {
        title:d.name,
        icon:d.icon,
        color:d.color,
        tag:w?`ARMA · ${w.level} → ${w.level+1}`:"NOVA ARMA",
        text:w
          ? "Mais dano, área e frequência. " +
            ((w.level+1)%3===0
              ? "Ataques compatíveis ganham +1 unidade."
              : "")
          : d.description,
        foot:`Evolução: ${PASSIVE_DEFINITIONS[d.passive].name}`
      };
    }

    if (item.kind==="passive") {
      const d = PASSIVE_DEFINITIONS[item.id];
      const n = p.passives[item.id]||0;

      return {
        title:d.name,
        icon:d.icon,
        color:"#87d7bf",
        tag:n?`PASSIVO · ${n} → ${n+1}`:"NOVO PASSIVO",
        text:d.text,
        foot:`Máximo: nível ${d.max}`
      };
    }

    const alternatives = {
      heal:["Seiva fresca","♥","Recupere 35 de vida."],
      gold:["Bolsa de ecos","◈","Receba 25 de ouro."],
      buff:["Pulso de âmbar","✷","Fortaleça seus ataques por 12 segundos."],
      magnet:["Ressonância","⌖","Atraia todos os cristais no mundo."]
    };

    const a = alternatives[item.id];

    return {
      title:a[0],
      icon:a[1],
      color:"#e9c48b",
      tag:"RECOMPENSA",
      text:a[2],
      foot:"Efeito imediato"
    };
  }

  levelup() {
    this.show(
      this.head(
        `NÍVEL ${this.g.player.level}`,
        "Subiu de nível",
        "O próximo eco é uma escolha sua. A partida está pausada."
      ) + `
      <div class="cards choices">
        ${this.g.choices.map((o,i)=>{
          const d = this.upgradeText(o);

          return `
            <button class="card choice" data-action="pick" data-index="${i}">
              <small>${i+1} · ${d.tag}</small>
              <span class="sigil" style="color:${d.color}">${d.icon}</span>
              <h2>${d.title}</h2>
              <p>${d.text}</p>
              <footer>${d.foot}</footer>
            </button>
          `;
        }).join("")}
      </div>
      <p class="muted">Clique em uma opção ou use as teclas 1–4.</p>
    `,{
      pick:b=>this.g.pickUpgrade(Number(b.dataset.index))
    },true);
  }

  chest() {
    const r = this.g.chestReward;
    const d = r.kind==="evolution"?WEAPON_DEFINITIONS[r.id]:null;
    const upgrade = r.upgrade?this.upgradeText(r.upgrade):null;

    this.show(
      this.head(
        "RELÍQUIA RECUPERADA",
        d?"A forma desperta":"Algo resistiu ao tempo"
      ) + `
      <div class="chest-reveal">
        <span class="sigil">${d?d.icon:"⬡"}</span>
        <h2>${d?d.evolution:upgrade?upgrade.title:"Reserva de âmbar"}</h2>
        <p>
          ${d
            ? d.evolvedDescription
            : upgrade
              ? upgrade.text
              : "Seu arsenal está completo."}
        </p>
        <strong class="gold">+${r.gold} ouro</strong>
      </div>

      <div class="actions">
        ${this.button(
          "claim",
          d?"ACEITAR EVOLUÇÃO":"RECOLHER RECOMPENSA",
          true
        )}
      </div>
    `,{claim:()=>this.g.claimChest()});
  }

  goal() {
    this.show(
      this.head(
        "30:00 · OBJETIVO CONCLUÍDO",
        "Limiar atravessado",
        "Você resistiu à noite. A Boca do Firmamento acaba de chegar."
      ) + `
      <div class="chest-reveal">
        <span class="sigil">✧</span>
        <p>
          Encerre a expedição com vitória e <b>250 de ouro extra</b>,
          ou continue contra uma presença que fica mais veloz
          a cada segundo.
        </p>
        <p class="muted">
          A conclusão permanece válida mesmo se você cair no pós-limiar.
          As recompensas são contabilizadas ao encerrar.
        </p>
      </div>

      <div class="actions">
        ${this.button("finish","ENCERRAR COM VITÓRIA",true)}
        ${this.button("continue","Enfrentar o pós-limiar")}
      </div>
    `,{
      finish:()=>this.g.finish(true),
      continue:()=>this.g.resume()
    });
  }

  result() {
    const g = this.g;
    const r = g.run;
    const p = g.player;

    const ranking = [...p.weapons]
      .sort((a,b)=>b.damageDealt-a.damageDealt);

    const top = ranking[0];

    this.show(
      this.head(
        r.completed?"TRAVESSIA CONCLUÍDA":"O ECO PERMANECE",
        r.completed
          ? "Você atravessou."
          : r.abandoned
            ? "Até a próxima noite."
            : "A névoa o alcançou.",
        `${g.mode==="test"
          ? "MODO TESTE · recompensas e recordes não salvos"
          : "Expedição contabilizada"
        }${!storageAvailable?" · Armazenamento indisponível":""}`
      ) + `
      <div class="result-grid">
        <span>TEMPO<b>${clock(r.time)}</b></span>
        <span>NÍVEL<b>${p.level}</b></span>
        <span>INIMIGOS<b>${fmt(r.kills)}</b></span>
        <span>OURO<b>${fmt(r.gold+r.bonus)}</b></span>
        <span>DANO TOTAL<b>${fmt(r.totalDamage)}</b></span>
        <span>PONTUAÇÃO<b>${fmt(r.score)}</b></span>
      </div>

      <p class="muted">
        Arma com mais dano: <b>${top.name}</b>
        ${r.bonus?` · Bônus de conclusão: ${r.bonus} ouro`:""}.
      </p>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Arma</th><th>Dano</th><th>Baixas</th>
              <th>Ataques</th><th>Acertos</th>
            </tr>
          </thead>
          <tbody>
            ${ranking.map(w=>`
              <tr>
                <td>
                  <span style="color:${w.definition.color}">
                    ${w.definition.icon}
                  </span>
                  ${w.name}
                  <div class="damage-track">
                    <i style="
                      width:${100*w.damageDealt/Math.max(1,top.damageDealt)}%;
                      background:${w.definition.color}
                    "></i>
                  </div>
                </td>
                <td>${fmt(w.damageDealt)}</td>
                <td>${fmt(w.kills)}</td>
                <td>${fmt(w.shots)}</td>
                <td>${fmt(w.hits)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="actions">
        ${this.button("again","JOGAR NOVAMENTE",true)}
        ${this.button("menu","Menu principal")}
      </div>
    `,{
      again:()=>g.start(p.character,g.mode),
      menu:()=>g.menu()
    },true);
  }

  updateHUD() {
    const g = this.g;
    const p = g.player;
    const r = g.run;
    if (!p) return;

    const n = this.nodes;

    n["hp-fill"].style.width = `${100*p.health/p.maxHealth}%`;
    n["hp-text"].textContent = `${Math.ceil(p.health)} / ${p.maxHealth}`;
    n["xp-fill"].style.width =
      `${clamp(100*p.xp/p.xpToNextLevel,0,100)}%`;

    n.level.textContent = "NV. "+p.level;
    n.timer.textContent = clock(r.time);

    n.wave.textContent =
      (g.mode==="test"?"TESTE 5× · ":"") +
      WAVE_TABLE[g.director.index].name +
      (p.buff>0?" · ÂMBAR":"");

    n.gold.textContent = fmt(r.gold);
    n.kills.textContent = fmt(r.kills);

    const key =
      p.weapons.map(w=>`${w.id}:${w.level}:${w.evolved}`).join("|") +
      JSON.stringify(p.passives);

    if (this.slotKey!==key) {
      this.slotKey = key;

      n.weapons.innerHTML = Array.from({length:6},(_,i)=>{
        const w = p.weapons[i];

        return w
          ? `<span
              class="slot ${w.evolved?"evolved":""}"
              style="color:${w.definition.color}"
              title="${esc(w.name+" · "+(w.evolved?"Evoluída":"Nível "+w.level))}"
            >${w.definition.icon}<b>${w.evolved?"✦":w.level}</b></span>`
          : `<span class="slot empty">·</span>`;
      }).join("");

      const passives = Object.entries(p.passives);

      n.passives.innerHTML = Array.from({length:6},(_,i)=>{
        const o = passives[i];

        return o
          ? `<span class="slot passive"
              title="${esc(PASSIVE_DEFINITIONS[o[0]].name)}"
            >${PASSIVE_DEFINITIONS[o[0]].icon}<b>${o[1]}</b></span>`
          : `<span class="slot empty">·</span>`;
      }).join("");
    }

    const boss = g.enemies.find(e=>
      !e.dead && (e.type==="boss"||e.type==="final")
    );

    n["boss-hud"].hidden = !boss;

    if (boss) {
      n["boss-name"].textContent = boss.name;
      n["boss-fill"].style.width = `${100*boss.hp/boss.maxHp}%`;
    }

    n.debug.hidden = !g.debug.stats;

    if (g.debug.stats) {
      n.debug.textContent =
        `FPS ${Math.round(g.fps)} | Enemies ${g.enemies.length} | ` +
        `Projectiles ${g.bullets.items.length}\n` +
        `Particles ${g.particles.items.length} | ` +
        `Pickups ${g.gems.length+g.pickups.length} | ` +
        `${g.clockRate}× ${g.debug.god?"INVENCÍVEL":""}`;
    }
  }

  toast(title,sub) {
    clearTimeout(this.toastTimer);

    this.nodes.toast.innerHTML =
      `<b>${esc(title)}</b><span>${esc(sub)}</span>`;

    this.nodes.toast.classList.add("visible");

    this.toastTimer = setTimeout(
      ()=>this.nodes.toast.classList.remove("visible"),
      3800
    );
  }
}

/* O mundo usa coordenadas próprias; só o render aplica câmera e escala. */
class Renderer {
  constructor(g) {
    this.g = g;
    this.c = g.ctx;

    const tile = document.createElement("canvas");
    tile.width = 384;
    tile.height = 384;

    const t = tile.getContext("2d");

    t.fillStyle = "#101e24";
    t.fillRect(0,0,384,384);
    t.strokeStyle = "#192b31";
    t.lineWidth = 1;

    for (let x=0; x<384; x+=64) {
      for (let y=0; y<384; y+=64) {
        t.beginPath();
        t.moveTo(x+31,y+2);
        t.lineTo(x+63,y+32);
        t.lineTo(x+31,y+62);
        t.lineTo(x,y+32);
        t.closePath();
        t.stroke();

        if ((x+y)%192===0) {
          t.fillStyle = "#283b3c";
          t.fillRect(x+28,y+29,4,4);
        }
      }
    }

    for (let i=0; i<110; i++) {
      t.fillStyle = i%2?"#243439":"#15272d";
      t.fillRect((i*97)%384,(i*131)%384,2,2);
    }

    this.floor = this.c.createPattern(tile,"repeat");
  }

  visible(x,y,r=40) {
    const g = this.g;

    return (
      Math.abs(x-g.camera.x)<g.viewW/2+r &&
      Math.abs(y-g.camera.y)<g.viewH/2+r
    );
  }

  polygon(x,y,r,sides,angle=0) {
    const c = this.c;
    c.beginPath();

    for (let i=0; i<sides; i++) {
      const a = angle+i/sides*TAU;

      if (i) c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);
      else c.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);
    }

    c.closePath();
  }

  circle(x,y,r) {
    const c = this.c;
    c.beginPath();
    c.arc(x,y,r,0,TAU);
  }

  draw(realTime) {
    const g = this.g;
    const c = this.c;
    const p = g.player;

    c.setTransform(g.dpr,0,0,g.dpr,0,0);
    c.globalAlpha = 1;
    c.fillStyle = "#0c181d";
    c.fillRect(0,0,g.width,g.height);

    if (!p) {
      g.camera.x = Math.sin(realTime*.03)*80;
      g.camera.y = realTime*3;
    }

    const shake =
      p && g.state==="playing" && save.settings.shake
        ? g.shake
        : 0;

    c.setTransform(
      g.dpr*g.zoom,0,0,g.dpr*g.zoom,
      g.width*g.dpr/2 -
        g.camera.x*g.dpr*g.zoom +
        rand(-shake,shake)*g.dpr,
      g.height*g.dpr/2 -
        g.camera.y*g.dpr*g.zoom +
        rand(-shake,shake)*g.dpr
    );

    this.terrain();

    if (p) {
      for (const a of g.areas) {
        if (!this.visible(a.x,a.y,a.r)) continue;

        c.fillStyle = a.w.definition.color;
        c.strokeStyle = a.w.definition.color;

        if (!a.armed) {
          c.globalAlpha = .25;
          c.lineWidth = 2;
          this.circle(a.x,a.y,a.r);
          c.stroke();

          this.circle(
            a.x,a.y,
            a.r*clamp(1-a.delay/.8,.05,1)
          );

          c.globalAlpha = .15;
          c.fill();
          c.globalAlpha = 1;
          c.font = "22px Georgia";
          c.fillText("✦",a.x-10,a.y+8);
        } else {
          c.globalAlpha = .12;
          this.circle(a.x,a.y,a.r);
          c.fill();

          c.globalAlpha = .5;
          c.lineWidth = 1.5;

          this.circle(
            a.x,a.y,
            a.r*(.85+.07*Math.sin(g.run.simTime*4))
          );

          c.stroke();
        }

        c.globalAlpha = 1;
      }

      for (const gem of g.gems) {
        if (!this.visible(gem.x,gem.y,10)) continue;

        const r = gem.value>20?7:gem.value>5?5:3.5;

        c.fillStyle =
          gem.value>20 ? "#edb974" :
          gem.value>5 ? "#a8baff" : "#7cd4ba";

        this.polygon(gem.x,gem.y,r,4);
        c.fill();
      }

      for (const item of g.pickups) {
        this.pickup(item,g.run.simTime);
      }

      for (const e of g.enemies) {
        if (!e.dead && this.visible(e.x,e.y,e.r+20)) {
          this.enemy(e,g.run.simTime);
        }
      }

      for (const b of g.bullets.items) {
        if (!this.visible(b.x,b.y,b.r+10)) continue;

        c.strokeStyle = b.color;
        c.fillStyle = b.color;
        c.globalAlpha = .35;
        c.lineWidth = b.r*(b.kind==="needle"?1.2:.8);

        c.beginPath();
        c.moveTo(b.x-b.vx*.04,b.y-b.vy*.04);
        c.lineTo(b.x,b.y);
        c.stroke();
        c.globalAlpha = 1;

        if (b.kind==="disc") {
          this.polygon(b.x,b.y,b.r,6,b.age*15);
          c.lineWidth = 2;
          c.stroke();
          this.circle(b.x,b.y,3);
          c.fill();
        } else if (b.kind==="needle") {
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(b.x-b.vx*.028,b.y-b.vy*.028);
          c.lineTo(b.x,b.y);
          c.stroke();
        } else {
          this.circle(b.x,b.y,b.r);
          c.fill();
          c.fillStyle = "#fff2d8";
          this.circle(b.x-1,b.y-1,b.r*.35);
          c.fill();
        }
      }

      for (const w of p.weapons) {
        if (w.id!=="orbit") continue;

        const v = w.values(p);
        const n = v.amount+1;

        for (let ring=0; ring<(w.evolved?2:1); ring++) {
          for (let i=0; i<n; i++) {
            const a =
              g.run.simTime*(ring?-2.5:2.5)+i/n*TAU;

            const r = (ring?115:65)*v.area;
            const x = p.x+Math.cos(a)*r;
            const y = p.y+Math.sin(a)*r;

            c.fillStyle = w.definition.color;
            this.polygon(x,y,10*v.area,3,a);
            c.fill();
          }
        }
      }

      this.player(p,g.run.simTime);

      for (const l of g.lines) {
        c.globalAlpha = clamp(l.life/l.max,0,1);
        c.strokeStyle = l.color;
        c.lineWidth = 2;

        if (l.kind==="ring") {
          this.circle(l.x,l.y,l.r*(1.05-l.life/l.max*.3));
          c.stroke();
        } else {
          c.beginPath();
          c.moveTo(l.x,l.y);

          const dx = l.tx-l.x;
          const dy = l.ty-l.y;

          for (let j=1; j<5; j++) {
            const offset = j%2?8:-8;

            c.lineTo(
              l.x+dx*j/5-dy*.03*offset/8,
              l.y+dy*j/5+dx*.03*offset/8
            );
          }

          c.lineTo(l.tx,l.ty);
          c.stroke();
        }
      }

      for (const a of g.particles.items) {
        if (!this.visible(a.x,a.y)) continue;

        c.globalAlpha = clamp(a.life/a.max,0,1);
        c.fillStyle = a.color;
        c.fillRect(a.x,a.y,a.r,a.r);
      }

      c.textAlign = "center";

      for (const f of g.floats.items) {
        if (!this.visible(f.x,f.y)) continue;

        c.globalAlpha = clamp(f.life/.25,0,1);
        c.fillStyle = f.color;
        c.font = `600 ${f.size}px system-ui`;
        c.fillText(f.text,f.x,f.y);
      }

      c.globalAlpha = 1;
      c.textAlign = "left";
    }

    c.setTransform(g.dpr,0,0,g.dpr,0,0);

    if (p && g.input.touch.active) {
      const t = g.input.touch;

      c.strokeStyle = "#90d6c080";
      c.fillStyle = "#90d6c030";
      c.lineWidth = 2;

      this.circle(t.x,t.y,50);
      c.fill();
      c.stroke();

      this.circle(t.x+t.dx*34,t.y+t.dy*34,18);
      c.fillStyle = "#c2efce80";
      c.fill();
    }

    if (g.state==="playing" && p.health/p.maxHealth<.25) {
      c.strokeStyle = "#c8516266";
      c.lineWidth = 14;
      c.strokeRect(0,0,g.width,g.height);
    }
  }

  terrain() {
    const g = this.g;
    const c = this.c;
    const left = g.camera.x-g.viewW/2-30;
    const top = g.camera.y-g.viewH/2-30;

    c.fillStyle = this.floor||"#101e24";
    c.fillRect(left,top,g.viewW+60,g.viewH+60);

    const cell = 360;

    for (
      let x=Math.floor(left/cell);
      x<Math.ceil((left+g.viewW+60)/cell);
      x++
    ) {
      for (
        let y=Math.floor(top/cell);
        y<Math.ceil((top+g.viewH+60)/cell);
        y++
      ) {
        const hash = ((x*73856093)^(y*19349663))>>>0;
        if (hash%5!==0) continue;

        const px = x*cell+((hash>>>3)%180);
        const py = y*cell+((hash>>>10)%180);

        c.fillStyle = "#09161e88";
        c.beginPath();
        c.ellipse(px+15,py+28,25,10,-.3,0,TAU);
        c.fill();

        c.fillStyle = "#263b41";
        c.strokeStyle = "#395253";
        this.polygon(px,py,20,4,Math.PI/4);
        c.fill();
        c.stroke();

        c.fillStyle = "#344b4b";
        c.beginPath();
        c.moveTo(px-11,py);
        c.lineTo(px,py-58);
        c.lineTo(px+10,py);
        c.closePath();
        c.fill();

        c.strokeStyle = "#7dc5ab44";
        c.beginPath();
        c.moveTo(px,py-43);
        c.lineTo(px,py-15);
        c.stroke();
      }
    }
  }

  player(p,time) {
    const c = this.c;
    const g = this.g;
    const color = CHARACTER_DEFINITIONS[p.character].color;

    c.fillStyle = "#020b10aa";
    c.beginPath();
    c.ellipse(p.x,p.y+16,18,8,0,0,TAU);
    c.fill();

    if (p.invulnerable>0 && Math.floor(time*16)%2===0) {
      c.globalAlpha = .45;
    }

    if (p.buff>0) {
      c.strokeStyle = "#f6d093";
      c.lineWidth = 2;
      this.circle(p.x,p.y,25+Math.sin(time*6)*3);
      c.stroke();
    }

    c.fillStyle = "#19353a";
    c.strokeStyle = color;
    c.lineWidth = 2;

    c.beginPath();
    c.moveTo(p.x,p.y-17);
    c.lineTo(p.x+14,p.y+15);
    c.lineTo(p.x,p.y+9);
    c.lineTo(p.x-14,p.y+15);
    c.closePath();
    c.fill();
    c.stroke();

    c.fillStyle = color;
    this.polygon(p.x,p.y-8,9,4,Math.PI/4);
    c.fill();

    c.fillStyle = "#13242d";
    c.fillRect(p.x-5,p.y-10,10,5);

    c.fillStyle = "#ffedca";
    c.fillRect(p.x-4+p.dx*2,p.y-9,3,2);
    c.fillRect(p.x+2+p.dx*2,p.y-9,3,2);
    c.globalAlpha = 1;

    if (g.debug.hitboxes) {
      c.strokeStyle = "#fff";
      this.circle(p.x,p.y,p.r);
      c.stroke();

      c.strokeStyle = "#7ecab4";
      this.circle(p.x,p.y,p.stats.pickupRange);
      c.stroke();
    }
  }

  enemy(e,time) {
    const c = this.c;
    const special = e.type==="boss"||e.type==="final";
    const angle = e.type==="swarm"?time*2:-Math.PI/2;

    c.fillStyle = "#030b1088";
    c.beginPath();
    c.ellipse(e.x,e.y+e.r*.8,e.r,e.r*.45,0,0,TAU);
    c.fill();

    c.fillStyle =
      e.flash>0 ? "#fff2d2" :
      e.freeze>0 ? "#bee9f2" : e.color;

    c.strokeStyle = special?"#ffdec0":"#23323d";
    c.lineWidth = special?3:1.5;

    this.polygon(e.x,e.y,e.r,e.shape,angle);
    c.fill();
    c.stroke();

    c.fillStyle = "#14252c";
    this.polygon(e.x,e.y,e.r*.66,e.shape,-angle);
    c.fill();

    c.fillStyle = e.color;
    this.polygon(e.x,e.y-2,e.r*.25,3,time*.3);
    c.fill();

    c.fillStyle = "#ffdebc";
    c.fillRect(e.x-e.r*.36,e.y-e.r*.13,3,3);
    c.fillRect(e.x+e.r*.18,e.y-e.r*.13,3,3);

    if (e.type==="elite" || special) {
      c.strokeStyle = e.color;
      c.lineWidth = 1;
      this.circle(e.x,e.y,e.r+7+Math.sin(time*3)*2);
      c.stroke();

      c.fillStyle = "#102129";
      c.fillRect(e.x-e.r,e.y-e.r-15,e.r*2,4);

      c.fillStyle = e.color;
      c.fillRect(
        e.x-e.r,e.y-e.r-15,
        e.r*2*e.hp/e.maxHp,4
      );
    }

    if (e.wind>0) {
      c.strokeStyle = "#f6b7ac";
      c.globalAlpha = .6;
      c.lineWidth = 2;

      if (e.behavior==="ranged" || e.pattern==="charge") {
        c.beginPath();
        c.moveTo(e.x,e.y);
        c.lineTo(e.x+e.aimX*300,e.y+e.aimY*300);
        c.stroke();
      } else {
        this.circle(e.x,e.y,e.r+25);
        c.stroke();
      }

      c.globalAlpha = 1;
    }

    if (this.g.debug.hitboxes) {
      c.strokeStyle = "#ff7286";
      this.circle(e.x,e.y,e.r);
      c.stroke();
    }
  }

  pickup(item,time) {
    const g = this.g;
    const c = this.c;

    if (!this.visible(item.x,item.y,20)) {
      if (item.type!=="chest") return;

      const x = clamp(
        item.x,
        g.camera.x-g.viewW/2+40,
        g.camera.x+g.viewW/2-40
      );

      const y = clamp(
        item.y,
        g.camera.y-g.viewH/2+115,
        g.camera.y+g.viewH/2-95
      );

      c.fillStyle = "#edca8b";
      this.polygon(
        x,y,8,3,
        Math.atan2(item.y-y,item.x-x)
      );
      c.fill();

      c.font = "10px system-ui";
      c.fillText("BAÚ",x-10,y-14);
      return;
    }

    const symbols = {
      gold:"◈",
      heal:"♥",
      magnet:"⌖",
      bomb:"✹",
      buff:"✷",
      chest:"⬡"
    };

    const colors = {
      gold:"#dfbd78",
      heal:"#9ad9ac",
      magnet:"#a6c9ed",
      bomb:"#e9a4a0",
      buff:"#dfbcff",
      chest:"#ffe0a1"
    };

    c.fillStyle = "#0b171dc0";
    this.circle(item.x,item.y,13);
    c.fill();

    c.fillStyle = colors[item.type];
    c.textAlign = "center";
    c.font = `${item.type==="chest"?28:20}px Georgia`;

    c.fillText(
      symbols[item.type],
      item.x,
      item.y+7+Math.sin(time*3)*2
    );

    c.textAlign = "left";

    if (item.type==="chest") {
      c.strokeStyle = "#edca8b80";
      this.circle(item.x,item.y,21+Math.sin(time*2)*3);
      c.stroke();
    }
  }
}

/* Inicialização com mensagem legível em caso de HTML ou Canvas indisponível. */
let game;

try {
  game = new Game();

  if (DEBUG) {
    window.LIMIAR = {
      game,
      WEAPON_DEFINITIONS,
      PASSIVE_DEFINITIONS,
      CHARACTER_DEFINITIONS,
      ENEMY_DEFINITIONS,
      WAVE_TABLE,
      Weapon,
      Player,
      SpatialGrid,
      loadSave,
      saveGame,
      resetSave,
      get save() { return save; }
    };
  }
} catch (error) {
  const node = document.getElementById("screen");

  if (node) {
    node.hidden = false;
    node.textContent =
      "Não foi possível iniciar o Limiar: "+error.message;
  }
}

})();
