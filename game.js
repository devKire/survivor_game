(() => {
"use strict";

const DEBUG = false;
const VERSION = "1.3.0";
const TAU = Math.PI * 2;
const SAVE_KEY = "limiar.save.v1"; // chave preservada para migrar saves 1.0
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
    name:"Errante de Xisto",
    hp:34,
    speed:66,
    damage:15,
    r:13,
    xp:2,
    color:"#718d83",
    shape:5,
    behavior:"chase",
    resist:0.15
  },

  dart: {
    name:"Rasante",
    hp:28,
    speed:126,
    damage:12,
    r:10,
    xp:3,
    color:"#bd9fa5",
    shape:3,
    behavior:"chase",
    resist:0.05
  },

  tank: {
    name:"Muralha Oca",
    hp:210,
    speed:47,
    damage:30,
    r:24,
    xp:10,
    color:"#8898b5",
    shape:6,
    behavior:"chase",
    resist:0.9
  },

  swarm: {
    name:"Cisco Vivo",
    hp:16,
    speed:103,
    damage:8,
    r:7,
    xp:1,
    color:"#cdbd8c",
    shape:4,
    behavior:"chase",
    resist:0.05
  },

  ranged: {
    name:"Cantor de Fendas",
    hp:88,
    speed:68,
    damage:20,
    r:16,
    xp:6,
    color:"#c38dc0",
    shape:4,
    behavior:"ranged",
    resist:0.35
  },

  elite: {
    name:"Arauto de Basalto",
    hp:560,
    speed:72,
    damage:36,
    r:28,
    xp:40,
    color:"#e9ba7e",
    shape:6,
    behavior:"chase",
    resist:0.88
  },

  boss: {
    name:"Custódio",
    hp:1850,
    speed:52,
    damage:42,
    r:46,
    xp:125,
    color:"#e8958e",
    shape:8,
    behavior:"boss",
    resist:0.97
  },

  final: {
    name:"A Boca do Firmamento",
    hp:1000000,
    speed:148,
    damage:95,
    r:64,
    xp:500,
    color:"#eff5dc",
    shape:9,
    behavior:"final",
    resist:1
  }
,
  burrower:{name:"Escavador da Névoa",hp:72,speed:82,damage:22,r:15,xp:7,color:"#907f78",shape:5,behavior:"burrow",resist:.25},
  sentinel:{name:"Sentinela de Vidro",hp:145,speed:61,damage:24,r:19,xp:9,color:"#9bc7cf",shape:6,behavior:"sentinel",resist:.62},
  herald:{name:"Arauto do Véu",hp:120,speed:58,damage:18,r:18,xp:10,color:"#d0af77",shape:5,behavior:"herald",resist:.42},
  charger:{name:"Rasgador de Laje",hp:115,speed:77,damage:34,r:18,xp:9,color:"#c57f78",shape:4,behavior:"charger",resist:.55},
  splitter:{name:"Partilhado",hp:96,speed:74,damage:18,r:17,xp:8,color:"#a798c8",shape:6,behavior:"splitter",resist:.3},
  shardling:{name:"Lasca Viva",hp:22,speed:132,damage:8,r:7,xp:1,color:"#baadd6",shape:3,behavior:"chase",resist:0},
  weaver:{name:"Tecelão de Maré",hp:105,speed:62,damage:19,r:17,xp:10,color:"#76aaa4",shape:5,behavior:"weaver",resist:.35}

};

const WAVE_TABLE = [
  {
    start:0,
    end:60,
    rate:1.8,
    cap:100,
    enemies:[
      ["husk",8],
      ["swarm",2]
    ],
    elite:75,
    formation:"scatter",
    name:"O despertar"
  },

  {
    start:60,
    end:150,
    rate:3.5,
    cap:160,
    enemies:[
      ["husk",6],
      ["dart",3],
      ["swarm",2]
    ],
    elite:60,
    formation:"flank",
    name:"Passos na névoa"
  },

  {
    start:150,
    end:240,
    rate:5.5,
    cap:230,
    enemies:[
      ["husk",4],
      ["dart",4],
      ["tank",1],
      ["swarm",3]
    ],
    elite:50,
    formation:"ring",
    name:"Pedra e nervo"
  },

  {
    start:240,
    end:360,
    rate:7.5,
    cap:320,
    enemies:[
      ["husk",3],
      ["dart",4],
      ["tank",2],
      ["swarm",5],
      ["ranged",1]
    ],
    elite:40,
    formation:"swarm",
    name:"O coro das fendas"
  },

  {
    start:360,
    end:480,
    rate:10,
    cap:420,
    enemies:[
      ["dart",5],
      ["tank",2],
      ["swarm",6],
      ["ranged",2]
    ],
    elite:32,
    formation:"flank",
    name:"Maré de estilhaços"
  },

  {
    start:480,
    end:600,
    rate:13,
    cap:520,
    enemies:[
      ["husk",2],
      ["dart",5],
      ["tank",3],
      ["swarm",7],
      ["ranged",3]
    ],
    elite:25,
    formation:"ring",
    name:"A ruína respira"
  },

  {
    start:600,
    end:720,
    rate:17,
    cap:650,
    enemies:[
      ["dart",5],
      ["tank",4],
      ["swarm",8],
      ["ranged",4]
    ],
    elite:20,
    formation:"swarm",
    name:"O céu se fecha"
  },

  {
    start:720,
    end:840,
    rate:21,
    cap:760,
    enemies:[
      ["dart",6],
      ["tank",5],
      ["swarm",9],
      ["ranged",5]
    ],
    elite:16,
    formation:"flank",
    name:"Antes do silêncio"
  },

  {
    start:840,
    end:Infinity,
    rate:27,
    cap:900,
    enemies:[
      ["husk",1],
      ["dart",7],
      ["tank",6],
      ["swarm",10],
      ["ranged",6]
    ],
    elite:12,
    formation:"ring",
    name:"Além do limiar"
  }
];

const BOSS_EVENTS = [
  {
    at:120,
    name:"O Sineiro de Pedra",
    pattern:"ring"
  },

  {
    at:240,
    name:"A Corça de Cobre",
    pattern:"charge"
  },

  {
    at:360,
    name:"Mãe das Fendas",
    pattern:"summon"
  },

  {
    at:480,
    name:"O Cartógrafo Cego",
    pattern:"spiral"
  },

  {
    at:600,
    name:"A Catedral Errante",
    pattern:"pulse"
  },

  {
    at:690,
    name:"O Peregrino Sem Face",
    pattern:"charge"
  },

  {
    at:780,
    name:"O Olho Sob a Pedra",
    pattern:"spiral"
  },

  {
    at:870,
    name:"O Rei das Cinzas",
    pattern:"summon"
  },

  {
    at:960,
    name:"A Voz do Abismo",
    pattern:"pulse"
  },

  {
    at:1050,
    name:"O Último Custódio",
    pattern:"ring"
  }
];

const MODE_DEFINITIONS = {
  normal:{
    name:"Padrão",label:"Padrão · 30 minutos",summary:"Padrão · 30 min",hud:"PADRÃO",
    duration:1800,endless:false,clockRate:1,savesProgress:true,xpMultiplier:1,
    hpMultiplier:1,damageMultiplier:1,speedMultiplier:1,spawnMultiplier:1,enemyCapMultiplier:1,
    eliteFrequency:1,eliteHpMultiplier:1,eliteDamageMultiplier:1,
    bossHpMultiplier:1,bossDamageMultiplier:1,bossAttackRate:1,
    formationSizeMultiplier:1,formationIntervalMultiplier:1,goldDropMultiplier:1,
    rewardMultiplier:1,completionBase:250
  },
  nightmare:{
    name:"Pesadelo",label:"Pesadelo · 30 minutos",summary:"Pesadelo · 30 min",hud:"PESADELO",
    duration:1800,endless:false,clockRate:1,savesProgress:true,xpMultiplier:1,
    hpMultiplier:1.35,damageMultiplier:1.30,speedMultiplier:1.08,spawnMultiplier:1.35,enemyCapMultiplier:1.20,
    eliteFrequency:1.25,eliteHpMultiplier:1.55,eliteDamageMultiplier:1.35,
    bossHpMultiplier:1.50,bossDamageMultiplier:1.20,bossAttackRate:1.12,
    formationSizeMultiplier:1.15,formationIntervalMultiplier:.86,goldDropMultiplier:1,
    rewardMultiplier:1.25,completionBase:250
  },
  endless:{
    name:"Infinito",label:"Infinito · sobreviva o máximo possível",summary:"Infinito · sem limite",hud:"INFINITO",
    duration:null,endless:true,endlessStart:1800,clockRate:1,savesProgress:true,xpMultiplier:1,
    hpMultiplier:1,damageMultiplier:1,speedMultiplier:1,spawnMultiplier:1,enemyCapMultiplier:1,
    eliteFrequency:1,eliteHpMultiplier:1,eliteDamageMultiplier:1,
    bossHpMultiplier:1,bossDamageMultiplier:1,bossAttackRate:1,
    formationSizeMultiplier:1,formationIntervalMultiplier:1,goldDropMultiplier:1,
    rewardMultiplier:1,completionBase:0,bossInterval:120,bossEscortAfter:2400,doubleBossAfter:3000,
    post30:{
      hpPerMinute:1.11,damagePerMinute:1.07,spawnPerMinute:1.06,
      bossHpPerMinute:1.11,bossDamagePerMinute:1.07,bossAttackPerMinute:1.008,
      elitePerMinute:.045,eliteMax:2.6,capPerMinute:.018,capMax:1.34,
      formationPerMinute:.025,formationMax:1.75,
      formationIntervalPerMinute:.012,formationIntervalMin:.62
    }
  },
  test:{
    name:"Teste",label:"Teste · relógio 5× · sem salvar recompensas",summary:"Teste · relógio 5×",hud:"TESTE",
    duration:1800,endless:false,clockRate:5,savesProgress:false,xpMultiplier:5,
    hpMultiplier:1,damageMultiplier:1,speedMultiplier:1,spawnMultiplier:1,enemyCapMultiplier:1,
    eliteFrequency:1,eliteHpMultiplier:1,eliteDamageMultiplier:1,
    bossHpMultiplier:1,bossDamageMultiplier:1,bossAttackRate:1,
    formationSizeMultiplier:1,formationIntervalMultiplier:1,goldDropMultiplier:1,
    rewardMultiplier:1,completionBase:250
  }
};

function getModeDefinition(id) {
  return MODE_DEFINITIONS[id] || MODE_DEFINITIONS.normal;
}

function getModeScaling(id,time=0) {
  const mode=getModeDefinition(id);
  const scale={
    hp:mode.hpMultiplier,damage:mode.damageMultiplier,speed:mode.speedMultiplier,
    spawn:mode.spawnMultiplier,cap:mode.enemyCapMultiplier,elite:mode.eliteFrequency,
    eliteHp:mode.eliteHpMultiplier,eliteDamage:mode.eliteDamageMultiplier,
    bossHp:mode.bossHpMultiplier,bossDamage:mode.bossDamageMultiplier,bossAttack:mode.bossAttackRate,
    formation:mode.formationSizeMultiplier,formationInterval:mode.formationIntervalMultiplier,
    goldDrop:mode.goldDropMultiplier,reward:mode.rewardMultiplier
  };
  if (!mode.endless || time<mode.endlessStart) return scale;
  const minutes=Math.max(0,(time-mode.endlessStart)/60);
  const p=mode.post30;
  scale.hp*=Math.min(1e6,p.hpPerMinute**minutes);
  scale.damage*=Math.min(1e4,p.damagePerMinute**minutes);
  scale.spawn*=Math.min(8,p.spawnPerMinute**minutes);
  scale.bossHp*=Math.min(1e6,p.bossHpPerMinute**minutes);
  scale.bossDamage*=Math.min(1e4,p.bossDamagePerMinute**minutes);
  scale.bossAttack*=Math.min(2.2,p.bossAttackPerMinute**minutes);
  scale.elite*=Math.min(p.eliteMax,1+minutes*p.elitePerMinute);
  scale.cap*=Math.min(p.capMax,1+minutes*p.capPerMinute);
  scale.formation*=Math.min(p.formationMax,1+minutes*p.formationPerMinute);
  scale.formationInterval*=Math.max(p.formationIntervalMin,1-minutes*p.formationIntervalPerMinute);
  return scale;
}

const MAX_ACTIVE_ENEMIES = 1100;
const MAX_PRIORITY_ENEMIES = 8;
const MAX_WORLD_PICKUPS = 260;

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
    character:"orin", modes:["normal"], check:g=>g.run.time>=300
  },
  {
    id:"thousand", name:"Mil ecos",
    text:"Derrote 1.000 inimigos em uma partida.",
    character:"ivo", modes:["normal"], check:g=>g.run.kills>=1000
  },
  {
    id:"evolve", name:"Outra forma de arder", text:"Evolua uma arma.",
    character:"sena", modes:["normal"], check:g=>g.run.evolutions>0
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
    modes:["normal"], reward:200, check:g=>g.run.completed
  },
  {id:"first_structure",name:"A pedra responde",text:"Utilize sua primeira estrutura do mundo.",reward:35,check:g=>(g.run.structuresUsed||0)>0},
  {id:"urn_hundred",name:"Poeira de cem memórias",text:"Quebre 100 urnas em uma expedição.",reward:80,check:g=>(g.run.urnsBroken||0)>=100},
  {id:"exchange_altar",name:"Preço de sangue",text:"Aceite uma troca no Altar da Troca.",reward:60,check:g=>g.run.usedExchange===true},
  {id:"third_phase",name:"Até o núcleo",text:"Derrote um chefe depois de alcançar sua terceira fase.",reward:90,check:g=>(g.run.phase3BossKills||0)>0},
  {id:"first_synergy",name:"Dois ecos, uma forma",text:"Descubra sua primeira sinergia.",reward:75,check:g=>(g.run.synergies||[]).length>0},
  {id:"gardens",name:"Respirar sob a água",text:"Conclua os Jardins Submersos.",reward:150,check:g=>g.run.completed&&g.run.mapId==="gardens"},
  {id:"austere",name:"Mãos vazias",text:"Conclua uma expedição sem usar consumíveis.",reward:120,check:g=>g.run.completed&&(g.run.itemsUsed||0)===0}
];

/* v1.2 — conteúdo data-driven adicional. */
const SAVE_SCHEMA = 2;
const CHUNK_SIZE = 640;
const ACTIVE_CHUNK_RADIUS = 1;
const RUN_INVENTORY_SLOTS = 4;

const RARITY = {
  common:{name:"COMUM",color:"#afbbb5",weight:62},
  uncommon:{name:"INCOMUM",color:"#86d9bd",weight:27},
  rare:{name:"RARO",color:"#c7b1f0",weight:9},
  arcane:{name:"ARCANO",color:"#f0cb82",weight:2}
};

const ITEM_DEFINITIONS = {
  sap_flask:{name:"Frasco de Seiva",icon:"♥",rarity:"common",maxStack:3,weight:18,
    text:"Recupera 38% da vitalidade máxima.",use:"heal"},
  ash_bomb:{name:"Bomba de Cinzas",icon:"✹",rarity:"uncommon",maxStack:3,weight:13,
    text:"Explode ao redor do eco e causa dano massivo.",use:"bomb"},
  split_hourglass:{name:"Ampulheta Partida",icon:"⌛",rarity:"rare",maxStack:2,weight:8,
    text:"Desacelera todos os inimigos próximos por 6 s.",use:"slow"},
  amber_seal:{name:"Selo de Âmbar",icon:"✷",rarity:"uncommon",maxStack:3,weight:11,
    text:"Amplifica dano e frequência por 14 s.",use:"buff"},
  nacre_veil:{name:"Véu de Nácar",icon:"◌",rarity:"rare",maxStack:2,weight:7,
    text:"Concede invulnerabilidade por 4 s.",use:"veil"},
  echo_magnet:{name:"Ímã de Ecos",icon:"⌖",rarity:"common",maxStack:3,weight:15,
    text:"Atrai todos os cristais carregados no mundo ativo.",use:"magnet"},
  obelisk_shard:{name:"Fragmento do Obelisco",icon:"◇",rarity:"arcane",maxStack:2,weight:4,
    text:"Eleva sorte e chance de drops por 30 s.",use:"luck"},
  basalt_key:{name:"Chave Basáltica",icon:"⚿",rarity:"rare",maxStack:3,weight:6,
    text:"Abre cofres selados encontrados no mundo.",use:"key"}
};

const STATUS_DEFINITIONS = {
  slow:{maxStacks:1,color:"#a8dfff"},
  freeze:{maxStacks:1,color:"#d7f3ff"},
  burn:{maxStacks:5,color:"#ffac75",tick:.5},
  shock:{maxStacks:3,color:"#ffe69d",tick:.4},
  mark:{maxStacks:1,color:"#c6b7ff"},
  poison:{maxStacks:5,color:"#9edcaa",tick:.6}
};

const WEAPON_PATHS = {
  ember:{
    detonation:{name:"Detonação",text:"Explosões maiores; menor frequência.",mods:{area:1.35,cooldown:1.18,blast:1.7}},
    combustion:{name:"Combustão",text:"Brasas aplicam queimadura prolongada.",mods:{damage:.92,burn:1}},
    shrapnel:{name:"Estilhaço",text:"Mais projéteis e perfuração; menor dano individual.",mods:{damage:.76,amount:2,pierce:2}}
  },
  orbit:{
    bastion:{name:"Bastião",text:"Órbita menor, densa e com forte repulsão.",mods:{area:.82,damage:1.25,knock:1.8}},
    eclipse:{name:"Eclipse",text:"Anéis alternam raio e deixam inimigos marcados.",mods:{mark:1,amount:1}},
    fracture:{name:"Fratura",text:"Estilhaços orbitais soltam lascas ao acertar.",mods:{damage:.9,fragment:1}}
  },
  spear:{
    impalement:{name:"Empalamento",text:"Perfuração extrema e dano crescente em linha.",mods:{pierce:8,damage:1.18}},
    omen:{name:"Presságio",text:"Agulhas marcam alvos; marcas aumentam críticos.",mods:{mark:1,crit:1}},
    fan:{name:"Leque Abissal",text:"Mais agulhas em cone amplo; menor dano unitário.",mods:{amount:2,damage:.8,spread:1.5}}
  },
  frost:{
    rime:{name:"Geada",text:"Lentidão muito mais intensa e duradoura.",mods:{slow:1.8,area:1.12}},
    crystal:{name:"Cristalização",text:"Pulsos podem congelar inimigos comuns.",mods:{freeze:1}},
    rupture:{name:"Ruptura",text:"Alvos congelados explodem ao morrer.",mods:{shatter:1,damage:.92}}
  },
  chain:{
    conductor:{name:"Condutor",text:"Mais saltos e maior alcance entre alvos.",mods:{jumps:3,chainRange:1.2,damage:.88}},
    overload:{name:"Sobrecarga",text:"Menos saltos, descargas muito mais violentas.",mods:{jumps:-2,damage:1.65}},
    storm:{name:"Tormenta",text:"Alvos afetados por status sofrem descarga adicional.",mods:{statusBurst:1}}
  },
  well:{
    cinder:{name:"Leito de Brasas",text:"Campos aplicam queimadura e duram menos.",mods:{burn:1,duration:.82,damage:1.18}},
    gravity:{name:"Peso Morto",text:"Campos atraem mais cedo e com maior força.",mods:{pull:1,area:1.15}},
    bloom:{name:"Florescimento",text:"Mais campos menores surgem por ataque.",mods:{amount:2,area:.78,damage:.8}}
  },
  disc:{
    saw:{name:"Serrilha",text:"Discos aceleram, cortam com mais força e atravessam a horda.",mods:{damage:1.12,speed:1.2}},
    mirror:{name:"Espelho",text:"Retorno causa dano elevado e marca alvos.",mods:{returnDamage:1.6,mark:1}},
    hail:{name:"Granizo",text:"Impactos em alvos lentos geram estilhaços gelados.",mods:{frostShard:1,damage:.92}}
  },
  meteor:{
    zenith:{name:"Zênite",text:"Impactos maiores e mais lentos, com dano brutal.",mods:{area:1.35,damage:1.45,cooldown:1.15}},
    constellation:{name:"Constelação",text:"Mais impactos menores espalhados pela tela.",mods:{amount:2,area:.72,damage:.72}},
    comet:{name:"Cometa Frio",text:"Alvos congelados estilhaçam no impacto.",mods:{shatter:1,freezeBurst:1}}
  }
};

const SYNERGY_DEFINITIONS = {
  frozen_current:{name:"Corrente Branca",weapons:["frost","chain"],text:"Correntes em alvos congelados ganham salto e descarga extra."},
  burning_garden:{name:"Jardim Incandescente",weapons:["ember","well"],text:"Campos de cinzas alimentam queimaduras e ampliam explosões."},
  nacre_rime:{name:"Granizo de Nácar",weapons:["frost","disc"],text:"Discos contra alvos lentos lançam lascas geladas."},
  marked_void:{name:"Geometria Fatal",weapons:["spear","chain"],text:"Descargas em alvos marcados causam dano crítico adicional."},
  shattered_sky:{name:"Céu Estilhaçado",weapons:["meteor","frost"],text:"Meteoros quebram gelo em uma segunda explosão."},
  ember_orbit:{name:"Coroa de Fornalha",weapons:["ember","orbit"],text:"Órbitas podem incendiar; brasas explodem marcas orbitais."}
};

const MAP_DEFINITIONS = {
  ruins:{
    name:"Ruínas do Obelisco",icon:"◇",unlocked:true,
    description:"Pedra, névoa e fragmentos de uma arquitetura que ainda observa.",
    floor:"#101e24",water:false,structureDensity:.58,terrainDensity:.48,
    palette:{floor:"#101e24",accent:"#71998b",hazard:"#a65b85",water:"#153b40"},
    structures:["urn","fountain","exchange","memory","rift_altar","silence","chest","obelisk","column","wall","stone","tree","ruin","rift"],
    enemyPool:["husk","dart","tank","swarm","ranged","burrower","sentinel","charger","splitter"],
    bosses:BOSS_EVENTS.map((_,i)=>i),
    hazards:["rift","mist"],
    waveModifiers:{rate:1,hp:1,elite:1}
  },
  gardens:{
    name:"Jardins Submersos",icon:"≋",unlocked:true,
    description:"Ruínas alagadas, vegetação arcana e caminhos de pedra sob água rasa.",
    floor:"#0d2528",water:true,structureDensity:.68,terrainDensity:.55,
    palette:{floor:"#0d2528",accent:"#72aca1",hazard:"#749b77",water:"#153b40"},
    structures:["urn","fountain","exchange","memory","rift_altar","silence","chest","obelisk","column","stone","tree","ruin","platform","thorn"],
    enemyPool:["husk","dart","swarm","ranged","herald","weaver","burrower","splitter"],
    bosses:[0,2,4,5,7,9],
    hazards:["water","thorn","mist"],
    waveModifiers:{rate:1.06,hp:.96,elite:1.08}
  }
};

const STRUCTURE_DEFINITIONS = {
  urn:{name:"Urna de Ecos",kind:"BREAKABLE",r:15,hp:34,weight:22,destructible:true,color:"#7f7667"},
  fountain:{name:"Fonte de Seiva",kind:"INTERACTIVE",r:25,weight:4,interactive:true,color:"#79b99a",rare:true},
  exchange:{name:"Altar da Troca",kind:"INTERACTIVE",r:28,weight:2.3,interactive:true,color:"#d39a82",rare:true},
  memory:{name:"Altar da Memória",kind:"INTERACTIVE",r:27,weight:1.8,interactive:true,color:"#a9a0d3",rare:true},
  rift_altar:{name:"Altar da Fenda",kind:"INTERACTIVE",r:29,weight:1.1,interactive:true,color:"#cf7fad",rare:true},
  silence:{name:"Altar do Silêncio",kind:"INTERACTIVE",r:28,weight:1.1,interactive:true,color:"#8da2a2",rare:true},
  chest:{name:"Cofre Basáltico",kind:"INTERACTIVE",r:25,weight:2.2,interactive:true,collidable:true,color:"#d2b477",rare:true},
  obelisk:{name:"Obelisco Fraturado",kind:"INTERACTIVE",r:31,weight:.65,interactive:true,collidable:true,color:"#8dc2a5",rare:true},
  column:{name:"Coluna Partida",kind:"COLLIDABLE",r:23,weight:5,collidable:true,color:"#46585a"},
  wall:{name:"Muro Afundado",kind:"COLLIDABLE",r:31,weight:4,collidable:true,color:"#3d5050"},
  stone:{name:"Pedra Arcana",kind:"COLLIDABLE",r:20,weight:6,collidable:true,color:"#40575a"},
  tree:{name:"Árvore de Sal",kind:"DECORATIVE",r:20,weight:5,color:"#476758"},
  ruin:{name:"Ruína Baixa",kind:"COLLIDABLE",r:28,weight:3.2,collidable:true,color:"#435153"},
  platform:{name:"Plataforma de Pedra",kind:"DECORATIVE",r:42,weight:3.5,color:"#506365"},
  rift:{name:"Fenda Pulsante",kind:"HAZARD",r:36,weight:2,hazard:true,color:"#a65b85"},
  thorn:{name:"Espinhos de Maré",kind:"HAZARD",r:31,weight:2,hazard:true,color:"#749b77"}
};

const BOSS_PHASES = {
  default:["FASE I — A VIGÍLIA","FASE II — A PEDRA ABERTA","FASE III — O NÚCLEO DESPERTO"],
  "A Catedral Errante":["FASE I — O ÁTRIO","FASE II — A NAVE PARTIDA","FASE III — O NÚCLEO EXPOSTO"],
  "O Sineiro de Pedra":["FASE I — O BADALO","FASE II — O ECO DUPLO","FASE III — O ÚLTIMO TOQUE"]
};

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
    version:SAVE_SCHEMA,
    gameVersion:VERSION,
    gold:0,
    upgrades:{},
    unlocked:["nara"],
    achievements:[],
    discovered:{items:[],enemies:[],maps:["ruins"],synergies:[],structures:[]},
    selected:"nara",
    selectedMap:"ruins",
    tutorial:false,
    highScore:0,
    bestTime:0,
    bestKills:0,
    runs:0,
    completed:0,
    activeRun:null,
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

function migrateSave(raw) {
  const out = freshSave();
  if (!raw || typeof raw!=="object") return out;

  for (const k of ["gold","highScore","bestTime","bestKills","runs","completed"]) {
    if (Number.isFinite(raw[k])) out[k]=Math.floor(clamp(raw[k],0,1e9));
  }

  for (const k of Object.keys(META_DEFINITIONS)) {
    out.upgrades[k] = Number.isFinite(raw.upgrades?.[k])
      ? Math.floor(clamp(raw.upgrades[k],0,5)) : 0;
  }

  if (Array.isArray(raw.unlocked)) {
    out.unlocked=[...new Set(["nara",...raw.unlocked.filter(k=>Object.hasOwn(CHARACTER_DEFINITIONS,k))])];
  }
  if (Array.isArray(raw.achievements)) {
    out.achievements=[...new Set(raw.achievements.filter(k=>ACHIEVEMENTS.some(a=>a.id===k)))];
  }
  if (out.unlocked.includes(raw.selected)) out.selected=raw.selected;
  if (Object.hasOwn(MAP_DEFINITIONS,raw.selectedMap)) out.selectedMap=raw.selectedMap;
  out.tutorial=raw.tutorial===true;

  if (raw.settings && typeof raw.settings==="object") {
    for (const k of ["sounds","mute","shake","numbers"]) {
      if (typeof raw.settings[k]==="boolean") out.settings[k]=raw.settings[k];
    }
    if (Number.isFinite(raw.settings.volume)) out.settings.volume=clamp(raw.settings.volume,0,1);
    if (["auto","low","high","off"].includes(raw.settings.particles)) out.settings.particles=raw.settings.particles;
  }

  const disc=raw.discovered;
  if (disc && typeof disc==="object") {
    const known={
      items:Object.keys(ITEM_DEFINITIONS),
      enemies:Object.keys(ENEMY_DEFINITIONS),
      maps:Object.keys(MAP_DEFINITIONS),
      synergies:Object.keys(SYNERGY_DEFINITIONS),
      structures:Object.keys(STRUCTURE_DEFINITIONS)
    };
    for (const [k,ids] of Object.entries(known)) {
      if (Array.isArray(disc[k])) out.discovered[k]=[...new Set(disc[k].filter(id=>ids.includes(id)))];
    }
    if (!out.discovered.maps.includes("ruins")) out.discovered.maps.unshift("ruins");
  }

  if (raw.version>=2 && validateRunSnapshot(raw.activeRun,false)) out.activeRun=raw.activeRun;
  out.version=SAVE_SCHEMA;
  out.gameVersion=VERSION;
  return out;
}

function validateRunSnapshot(s,strict=true) {
  if (s==null || !s || typeof s!=="object" || Array.isArray(s)) return false;
  const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
  const finiteSigned=(n,limit)=>Number.isFinite(n)&&Math.abs(n)<=limit;
  if (!Object.hasOwn(MAP_DEFINITIONS,s.mapId)) return false;
  if (!Object.hasOwn(CHARACTER_DEFINITIONS,s.character)) return false;
  if (s.mode!=null && !Object.hasOwn(MODE_DEFINITIONS,s.mode)) return false;
  if (typeof s.worldSeed!=="string" || s.worldSeed.length<4 || s.worldSeed.length>80) return false;
  if (!finite(s.time,0,1e6)||!finite(s.level,1,999)||!finite(s.health,0,1e7)||!finite(s.xp,0,1e12)) return false;
  if (!finiteSigned(s.x,1e8)||!finiteSigned(s.y,1e8)) return false;
  for (const key of ["gold","kills","totalDamage","bossKills","evolutions","structuresBroken","urnsBroken","structuresUsed","itemsUsed","phase3BossKills"]) {
    if (s[key]!=null && !finite(s[key],0,1e12)) return false;
  }
  if (s.completionGold!=null && !finite(s.completionGold,0,1e12)) return false;
  for (const key of ["rerolls","banishments","skips"]) {
    if (s[key]!=null && (!Number.isInteger(s[key])||s[key]<0||s[key]>999)) return false;
  }
  if (!Array.isArray(s.weapons)||s.weapons.length<1||s.weapons.length>MAX_WEAPONS) return false;
  for (const w of s.weapons) {
    if (!w||typeof w!=="object"||!Object.hasOwn(WEAPON_DEFINITIONS,w.id)||!Number.isInteger(w.level)||w.level<1||w.level>8) return false;
    if (w.path!=null && !Object.hasOwn(WEAPON_PATHS[w.id]||{},w.path)) return false;
    if (w.pathLevel!=null && (!Number.isInteger(w.pathLevel)||w.pathLevel<0||w.pathLevel>10)) return false;
    if (w.evolved!=null && typeof w.evolved!=="boolean") return false;
  }
  if (!s.passives||typeof s.passives!=="object"||Array.isArray(s.passives)||Object.keys(s.passives).length>MAX_PASSIVES) return false;
  for (const [id,n] of Object.entries(s.passives)) {
    if (!Object.hasOwn(PASSIVE_DEFINITIONS,id)||!Number.isInteger(n)||n<1||n>PASSIVE_DEFINITIONS[id].max) return false;
  }
  if (!Array.isArray(s.inventory)||s.inventory.length>RUN_INVENTORY_SLOTS) return false;
  for (const slot of s.inventory) {
    if (slot==null) continue;
    const d=slot&&ITEM_DEFINITIONS[slot.id];
    if (!d || !Number.isInteger(slot.qty)||slot.qty<1||slot.qty>d.maxStack) return false;
  }
  if (s.banned!=null) {
    if (!Array.isArray(s.banned)||s.banned.length>Object.keys(WEAPON_DEFINITIONS).length+Object.keys(PASSIVE_DEFINITIONS).length) return false;
    for (const key of s.banned) {
      if (typeof key!=="string") return false;
      const [kind,id]=key.split(":");
      if (kind==="weapon"?!Object.hasOwn(WEAPON_DEFINITIONS,id):kind==="passive"?!Object.hasOwn(PASSIVE_DEFINITIONS,id):true) return false;
    }
  }
  if (s.synergies!=null && (!Array.isArray(s.synergies)||s.synergies.length>Object.keys(SYNERGY_DEFINITIONS).length||s.synergies.some(id=>!Object.hasOwn(SYNERGY_DEFINITIONS,id)))) return false;
  if (s.bossHistory!=null && (!Array.isArray(s.bossHistory)||s.bossHistory.length>BOSS_EVENTS.length||s.bossHistory.some(n=>!Number.isInteger(n)||n<0||n>BOSS_EVENTS.length+8))) return false;
  if (s.worldChanges!=null) {
    if (!s.worldChanges||typeof s.worldChanges!=="object"||Array.isArray(s.worldChanges)||Object.keys(s.worldChanges).length>12000) return false;
    for (const [id,change] of Object.entries(s.worldChanges)) {
      if (id.length>100||!change||typeof change!=="object"||Array.isArray(change)) return false;
      for (const k of Object.keys(change)) if (!["used","destroyed","opened","hp"].includes(k)) return false;
      if (change.hp!=null&&!finite(change.hp,0,1e7)) return false;
      for (const k of ["used","destroyed","opened"]) if (change[k]!=null&&typeof change[k]!=="boolean") return false;
    }
  }
  if (s.enemies!=null) {
    if (!Array.isArray(s.enemies)||s.enemies.length>320) return false;
    for (const e of s.enemies) if (!e||!Object.hasOwn(ENEMY_DEFINITIONS,e.type)||!finiteSigned(e.x,1e8)||!finiteSigned(e.y,1e8)||!finite(e.hp,0,1e9)||!finite(e.maxHp,1,1e9)) return false;
  }
  if (s.pickups!=null) {
    if (!Array.isArray(s.pickups)||s.pickups.length>80) return false;
    for (const o of s.pickups) if (!o||!["chest","item"].includes(o.type)||!finiteSigned(o.x,1e8)||!finiteSigned(o.y,1e8)||(o.type==="item"&&!Object.hasOwn(ITEM_DEFINITIONS,o.itemId))) return false;
  }
  if (strict && s.schemaVersion!==SAVE_SCHEMA) return false;
  return true;
}

function loadSave() {
  try {
    const raw=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
    return migrateSave(raw);
  } catch (e) {
    if (!(e instanceof SyntaxError)) storageAvailable=false;
    return freshSave();
  }
}

let save = loadSave();

function saveGame() {
  try {
    save.version=SAVE_SCHEMA;
    save.gameVersion=VERSION;
    localStorage.setItem(SAVE_KEY,JSON.stringify(save));
    storageAvailable=true;
    return true;
  } catch {
    storageAvailable=false;
    return false;
  }
}

function resetSave() {
  save=freshSave();
  return saveGame();
}

function safeFileStamp() {
  return new Date().toISOString().slice(0,10);
}

function validateImportEnvelope(data) {
  if (!data||typeof data!=="object"||!data.progress||typeof data.progress!=="object") return false;
  if (![1,2].includes(Number(data.schemaVersion))) return false;
  const p=data.progress;
  const nums=["gold","highScore","bestTime","bestKills","runs","completed"];
  if (nums.some(k=>p[k]!=null&&(!Number.isFinite(p[k])||p[k]<0||p[k]>1e9))) return false;
  if (p.upgrades&&Object.entries(p.upgrades).some(([id,n])=>!Object.hasOwn(META_DEFINITIONS,id)||!Number.isFinite(n)||n<0||n>5)) return false;
  if (p.unlocked&&(!Array.isArray(p.unlocked)||p.unlocked.some(id=>!Object.hasOwn(CHARACTER_DEFINITIONS,id)))) return false;
  if (p.achievements&&(!Array.isArray(p.achievements)||p.achievements.some(id=>!ACHIEVEMENTS.some(a=>a.id===id)))) return false;
  if (data.activeRun!=null&&!validateRunSnapshot(data.activeRun,false)) return false;
  return true;
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

function hashString(text) {
  let h=2166136261>>>0;
  for (let i=0;i<text.length;i++) {
    h^=text.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return h>>>0;
}

function mulberry32(seed) {
  let a=seed>>>0;
  return ()=>{
    a=(a+0x6D2B79F5)>>>0;
    let t=a;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

function makeWorldSeed() {
  const a=(Date.now()>>>0).toString(16).padStart(8,"0");
  const b=Math.floor(Math.random()*0xffffffff).toString(16).padStart(8,"0");
  return (a+b).toUpperCase();
}

function applyStatus(e,id,duration,magnitude=1,source=null,stacks=1) {
  const def=STATUS_DEFINITIONS[id];
  if (!def || e.dead) return;
  const old=e.statuses[id]||{duration:0,magnitude:0,stacks:0,source:null,tick:0};
  old.duration=Math.max(old.duration,duration);
  old.magnitude=Math.max(old.magnitude,magnitude);
  old.stacks=clamp(old.stacks+stacks,1,def.maxStacks||1);
  old.source=source||old.source;
  e.statuses[id]=old;
}

function hasStatus(e,id) { return !!e.statuses?.[id]?.duration; }

class World {
  constructor(g,mapId,seed,changes={}) {
    this.g=g;
    this.mapId=Object.hasOwn(MAP_DEFINITIONS,mapId)?mapId:"ruins";
    this.map=MAP_DEFINITIONS[this.mapId];
    this.seed=String(seed||makeWorldSeed());
    this.changes=changes&&typeof changes==="object"?changes:{};
    this.chunks=new Map();
    this.nearby=[];
    this.interactive=null;
    this.hazardClock=0;
  }

  chunkKey(cx,cy) { return `${cx},${cy}`; }

  chunkCoords(x,y) {
    return {cx:Math.floor(x/CHUNK_SIZE),cy:Math.floor(y/CHUNK_SIZE)};
  }

  createChunk(cx,cy) {
    const key=this.chunkKey(cx,cy);
    const rng=mulberry32(hashString(`${this.seed}|${this.mapId}|${cx}|${cy}`));
    const structures=[];
    const allowedStructures=new Set(this.map.structures||Object.keys(STRUCTURE_DEFINITIONS));
    const entries=Object.entries(STRUCTURE_DEFINITIONS).filter(([id])=>allowedStructures.has(id));
    const totalWeight=entries.reduce((a,[,d])=>a+d.weight,0);
    const count=Math.max(2,Math.floor((4+rng()*7)*this.map.structureDensity));

    for (let i=0;i<count;i++) {
      let roll=rng()*totalWeight, chosen=entries[0];
      for (const e of entries) { roll-=e[1].weight; if (roll<=0) { chosen=e; break; } }
      const [type,d]=chosen;
      const x=cx*CHUNK_SIZE+55+rng()*(CHUNK_SIZE-110);
      const y=cy*CHUNK_SIZE+55+rng()*(CHUNK_SIZE-110);
      if (Math.hypot(x,y)<125) continue;
      if (structures.some(o=>(o.x-x)**2+(o.y-y)**2<(o.r+d.r+28)**2)) continue;
      const id=`${cx}:${cy}:${type}:${i}`;
      const changed=this.changes[id]||{};
      const s={id,type,x,y,r:d.r,hp:d.hp||0,maxHp:d.hp||0,used:false,destroyed:false,opened:false,
        angle:rng()*TAU,variant:Math.floor(rng()*4),...changed};
      structures.push(s);
    }
    return {cx,cy,key,structures};
  }

  ensureChunkAt(x,y) {
    const {cx,cy}=this.chunkCoords(x,y),key=this.chunkKey(cx,cy);
    if (!this.chunks.has(key)) this.chunks.set(key,this.createChunk(cx,cy));
    return this.chunks.get(key);
  }

  update() {
    const p=this.g.player;
    if (!p) return;
    const {cx,cy}=this.chunkCoords(p.x,p.y);
    const keep=new Set();
    for (let y=cy-ACTIVE_CHUNK_RADIUS;y<=cy+ACTIVE_CHUNK_RADIUS;y++) {
      for (let x=cx-ACTIVE_CHUNK_RADIUS;x<=cx+ACTIVE_CHUNK_RADIUS;x++) {
        const key=this.chunkKey(x,y); keep.add(key);
        if (!this.chunks.has(key)) this.chunks.set(key,this.createChunk(x,y));
      }
    }
    for (const key of this.chunks.keys()) if (!keep.has(key)) this.chunks.delete(key);
    this.nearby=[];
    for (const ch of this.chunks.values()) for (const s of ch.structures) if (!s.destroyed) this.nearby.push(s);
    this.interactive=this.findInteractive(p.x,p.y,70);
  }

  mark(s,patch) {
    Object.assign(s,patch);
    this.changes[s.id]={...(this.changes[s.id]||{}),...patch};
    if (this.g.run) this.g.run.worldChanges=this.changes;
  }

  query(x,y,r,fn) {
    const min=this.chunkCoords(x-r,y-r), max=this.chunkCoords(x+r,y+r);
    for (let cy=min.cy;cy<=max.cy;cy++) for (let cx=min.cx;cx<=max.cx;cx++) {
      const ch=this.chunks.get(this.chunkKey(cx,cy));
      if (!ch) continue;
      for (const s of ch.structures) if (!s.destroyed && (s.x-x)**2+(s.y-y)**2<(r+s.r)**2) fn(s);
    }
  }

  findInteractive(x,y,r) {
    let best=null,dist=r*r;
    this.query(x,y,r,s=>{
      const d=STRUCTURE_DEFINITIONS[s.type];
      if (!d?.interactive || s.used || s.opened) return;
      const dd=(s.x-x)**2+(s.y-y)**2;
      if (dd<dist) { dist=dd; best=s; }
    });
    return best;
  }

  resolvePlayerMove(oldX,oldY,newX,newY,r) {
    let x=newX,y=newY,blocked=false;
    this.query(newX,newY,r+45,s=>{
      const d=STRUCTURE_DEFINITIONS[s.type];
      if (!d?.collidable || s.destroyed) return;
      const dx=x-s.x,dy=y-s.y,dist=Math.hypot(dx,dy)||.001,min=r+s.r;
      if (dist<min) {
        blocked=true;
        const nx=dx/dist,ny=dy/dist;
        x=s.x+nx*min; y=s.y+ny*min;
      }
    });
    if (blocked && !Number.isFinite(x+y)) return {x:oldX,y:oldY};
    return {x,y};
  }

  avoidEnemy(e,mx,my) {
    if (["burrow","weaver"].includes(e.behavior)) return {x:mx,y:my};
    let ax=0,ay=0;
    this.query(e.x+mx*28,e.y+my*28,e.r+32,s=>{
      const d=STRUCTURE_DEFINITIONS[s.type];
      if (!d?.collidable) return;
      const dx=e.x-s.x,dy=e.y-s.y,dist=Math.hypot(dx,dy)||1;
      const force=clamp((e.r+s.r+28-dist)/50,0,1);
      ax+=dx/dist*force; ay+=dy/dist*force;
    });
    const d=Math.hypot(mx+ax,my+ay)||1;
    return {x:(mx+ax)/d,y:(my+ay)/d};
  }

  damageBreakablesAt(x,y,r,damage) {
    this.query(x,y,r,s=>{
      const d=STRUCTURE_DEFINITIONS[s.type];
      if (!d?.destructible || s.destroyed) return;
      s.hp-=damage;
      if (s.hp<=0) this.breakStructure(s);
    });
  }

  breakStructure(s) {
    if (s.destroyed) return;
    this.mark(s,{destroyed:true,hp:0});
    const g=this.g,p=g.player;
    g.spark(s.x,s.y,"#c7b58d",10);
    g.sound.play("break");
    g.run.structuresBroken=(g.run.structuresBroken||0)+1;
    if (s.type==="urn") {
      g.run.urnsBroken=(g.run.urnsBroken||0)+1;
      const r=Math.random()/Math.max(1,p.stats.luck*(p.luckBuff>0?1.45:1));
      if (r<.13) g.dropItemWeighted(s.x,s.y);
      else if (r<.28) g.drop("heal",s.x,s.y,18);
      else if (r<.63) g.drop("gold",s.x,s.y,Math.ceil(rand(2,6)));
      else g.dropXP(s.x,s.y,4+Math.floor(rand(0,8)));
    }
    g.saveSnapshot(true);
  }

  isWater(x,y) {
    if (!this.map.water) return false;
    for (const s of this.nearby) if (s.type==="platform"&&(s.x-x)**2+(s.y-y)**2<(s.r+38)**2) return false;
    const cell=180,cx=Math.floor(x/cell),cy=Math.floor(y/cell);
    const h=hashString(`${this.seed}|water|${cx}|${cy}`)%100;
    const localX=((x%cell)+cell)%cell,localY=((y%cell)+cell)%cell;
    const path=Math.min(Math.abs(localX-cell/2),Math.abs(localY-cell/2));
    return h<58 && path>27;
  }

  updateHazards(dt) {
    const g=this.g,p=g.player;
    if (!p) return;
    p.inWater=this.isWater(p.x,p.y);
    this.hazardClock-=dt;
    if (this.hazardClock>0) return;
    this.hazardClock=.45;
    this.query(p.x,p.y,p.r+45,s=>{
      const d=STRUCTURE_DEFINITIONS[s.type];
      if (!d?.hazard) return;
      if ((p.x-s.x)**2+(p.y-s.y)**2<(p.r+s.r*.75)**2) {
        g.hurtPlayer(s.type==="rift"?8:5);
      }
    });
  }

  countInteractive() {
    return this.nearby.reduce((n,s)=>n+(STRUCTURE_DEFINITIONS[s.type]?.interactive&&!s.used&&!s.opened?1:0),0);
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
      phase:[180,70,.35],
      item:[620,980,.18],
      break:[240,110,.12],
      interact:[430,650,.2],
      evolve:[330,1250,.55],
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
    this.luckBuff = 0;
    this.inWater = false;
    this.hurtFlash = 0;

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
    this.path = null;
    this.pathLevel = 0;
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
    const mods=this.path ? WEAPON_PATHS[this.id]?.[this.path]?.mods||{} : {};
    return {
      damage:
        this.definition.damage *
        (1+.23*(this.level-1)) *
        p.stats.damage *
        (this.evolved?1.65:1) *
        (p.buff>0?1.4:1) * (mods.damage||1),

      cooldown:
        this.definition.cooldown *
        (1-.035*(this.level-1)) *
        p.stats.cooldown *
        (p.buff>0?.75:1) * (mods.cooldown||1),

      area:p.stats.area*(1+.045*(this.level-1))*(mods.area||1),
      amount:Math.max(1,1+Math.floor(this.level/3)+p.stats.amount+(mods.amount||0)),
      duration:p.stats.duration*(1+.07*(this.level-1))*(mods.duration||1),
      mods
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
      } else if (g.state==="playing" && /^Digit[1-4]$/.test(e.code)) {
        g.useItem(Number(e.code.slice(-1))-1);
      }

      if (g.state==="playing" && (e.code==="KeyE" || e.code==="KeyF")) {
        g.interact();
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
      if (document.hidden && g.run && !g.run.settled) g.saveSnapshot(true);
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
    this.index=0;
    this.spawnClock=0;
    this.eliteClock=80;
    this.formationClock=24;
    this.eventIndex=0;
    this.nextEndlessBossAt=1920;
    this.endlessBossIndex=0;
  }

  wavePool(g,wave) {
    const allowed=new Set(g.world?.map.enemyPool||Object.keys(ENEMY_DEFINITIONS));
    const pool=wave.enemies.filter(([id])=>allowed.has(id));
    const t=g.run.time;
    const additions=[
      ["burrower",t>120?1.5:0],["sentinel",t>210?1.2:0],["herald",t>300?1:0],
      ["charger",t>240?1.35:0],["splitter",t>360?1.1:0],["weaver",t>420?1:0]
    ].filter(([id,w])=>w>0&&allowed.has(id));
    return [...pool,...additions].length?[...pool,...additions]:[["husk",1]];
  }

  spawnEndlessBosses(g,t) {
    const mode=g.modeDef;
    if (!mode.endless || t<mode.endlessStart) return;
    if (!Number.isFinite(this.nextEndlessBossAt) || this.nextEndlessBossAt<mode.endlessStart+mode.bossInterval) {
      this.nextEndlessBossAt=mode.endlessStart+mode.bossInterval;
    }
    while (t>=this.nextEndlessBossAt) {
      const mapBosses=g.world?.map.bosses||BOSS_EVENTS.map((_,i)=>i);
      const bossIndex=mapBosses[this.endlessBossIndex%mapBosses.length];
      const base=BOSS_EVENTS[bossIndex]||BOSS_EVENTS[0];
      const count=t>=mode.doubleBossAfter?2:1;
      for (let i=0;i<count;i++) {
        const alternate=BOSS_EVENTS[mapBosses[(this.endlessBossIndex+i)%mapBosses.length]]||base;
        g.spawn("boss",i?Math.PI:null,{...alternate,eventIndex:null,endless:true});
      }
      if (t>=mode.bossEscortAfter) {
        const escorts=t>=mode.doubleBossAfter?2:1;
        for (let i=0;i<escorts;i++) g.spawn("elite");
      }
      this.endlessBossIndex+=count;
      this.nextEndlessBossAt+=mode.bossInterval;
      g.announce(base.name,t>=mode.doubleBossAfter?"Dois custódios atravessam a névoa.":"Outro custódio responde ao chamado.");
      g.sound.play("boss");
    }
  }

  update(g,dt) {
    const t=g.run.time;
    while (this.index<WAVE_TABLE.length-1 && t>=WAVE_TABLE[this.index].end) this.index++;
    const wave=WAVE_TABLE[this.index];
    const scale=g.modeScaling(t);
    const cap=g.currentEnemyCap(wave,scale);

    while (this.eventIndex<BOSS_EVENTS.length && t>=BOSS_EVENTS[this.eventIndex].at) {
      const mapBosses=g.world?.map.bosses||BOSS_EVENTS.map((_,i)=>i);
      const bossIndex=mapBosses[this.eventIndex%mapBosses.length];
      const base=BOSS_EVENTS[bossIndex]||BOSS_EVENTS[this.eventIndex];
      const event={...base,eventIndex:this.eventIndex};
      this.eventIndex++;
      if (!(g.run.bossHistory||[]).includes(event.eventIndex)) {
        g.spawn("boss",null,event);
        g.announce(event.name,"Um custódio atravessou a névoa.");
        g.sound.play("boss");
      }
    }
    this.spawnEndlessBosses(g,t);

    const mapMods=g.world?.map.waveModifiers||{};
    const eventRate=g.run.silenceTime>0?.32:g.run.surgeTime>0?1.6:1;
    this.spawnClock+=dt*wave.rate*(mapMods.rate||1)*eventRate*(t<12?.45:1)*scale.spawn;
    let budget=Math.min(24,Math.max(14,Math.ceil(14*scale.spawn)));
    const pool=this.wavePool(g,wave);
    while (this.spawnClock>=1 && budget-->0) {
      this.spawnClock--;
      if (g.enemies.length<cap) g.spawn(weighted(pool,x=>x[1])[0]);
    }

    this.eliteClock-=dt*g.clockRate*(g.run.surgeTime>0?1.5:1)*scale.elite;
    if (this.eliteClock<=0) {
      this.eliteClock=wave.elite/Math.max(.25,mapMods.elite||1);
      if (g.enemies.length<cap) g.spawn("elite");
    }

    this.formationClock-=dt*g.clockRate/Math.max(.2,scale.formationInterval);
    if (this.formationClock<=0) {
      this.formationClock=rand(26,40);
      const count=Math.min(28,Math.ceil(Math.min(18,4+Math.floor(t/110))*scale.formation));
      const angle=rand(0,TAU);
      for (let i=0;i<count && g.enemies.length<cap;i++) {
        const a=wave.formation==="ring"?i/count*TAU:angle+(i-count/2)*.07;
        const id=wave.formation==="swarm"&&g.world.map.enemyPool.includes("swarm")?"swarm":weighted(pool,x=>x[1])[0];
        g.spawn(id,a);
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
    this.world = null;
    this.hitstop = 0;

    this.grid = new SpatialGrid();
    this.bullets = new Pool(()=>({hitIds:new Set()}),1100);
    this.particles = new Pool(()=>({}),850);
    this.floats = new Pool(()=>({}),160);

    this.sound = new Sound();
    this.input = new Input(this);
    this.camera = {x:0,y:0};
    this.mode="normal";
    this.modeDef=getModeDefinition(this.mode);
    this.clockRate = 1;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.fps = 60;
    this.fx = 1;
    this.shake = 0;
    this.debug = {god:false,hitboxes:false,stats:DEBUG,chunks:false,structureIds:false,collisions:false};
    this.hudClock = 0;

    this.ui = new UI(this);
    this.renderer = new Renderer(this);

    this.resize();
    window.addEventListener("resize",()=>this.resize());
    window.addEventListener("beforeunload",()=>this.saveSnapshot(true));

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

    const crowd=this.enemies.length;
    const autoFx=crowd>=800?.28:crowd>=600?.38:crowd>=420?.52:crowd>=260?.72:1;
    this.fx =
      save.settings.particles==="off" ? 0 :
      save.settings.particles==="low" ? .3 :
      save.settings.particles==="high" ? 1 :
      Math.min(autoFx,this.fps<43?.35:1);

    if (this.state==="playing") {
      if (this.hitstop>0) {
        this.hitstop=Math.max(0,this.hitstop-raw);
      } else {
        this.accumulator += Math.min(raw,.25);
      }
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

  start(character=save.selected,mode="normal",mapId=save.selectedMap,seed=null) {
    if (!Object.hasOwn(CHARACTER_DEFINITIONS,character)) character="nara";
    if (!save.unlocked.includes(character)) character="nara";
    if (!Object.hasOwn(MAP_DEFINITIONS,mapId)) mapId="ruins";

    this.setState("playing");
    this.mode=Object.hasOwn(MODE_DEFINITIONS,mode)?mode:"normal";
    this.modeDef=getModeDefinition(this.mode);
    this.clockRate=this.modeDef.clockRate;

    this.player=new Player(character);
    this.player.weapons.push(new Weapon(CHARACTER_DEFINITIONS[character].weapon));

    this.run={
      schemaVersion:SAVE_SCHEMA,
      gameVersion:VERSION,
      time:0,simTime:0,kills:0,gold:0,totalDamage:0,bossKills:0,evolutions:0,
      completed:false,settled:false,completionGold:null,
      mapId,worldSeed:String(seed||makeWorldSeed()),worldChanges:{},
      inventory:Array(RUN_INVENTORY_SLOTS).fill(null),
      rerolls:2,banishments:2,skips:1,banned:[],
      structuresBroken:0,urnsBroken:0,structuresUsed:0,itemsUsed:0,synergies:[],usedExchange:false,phase3BossKills:0,
      event:null,eventTime:0,silenceTime:0,surgeTime:0,endlessAnnounced:false,
      autosave:20,bossHistory:[]
    };

    this.world=new World(this,mapId,this.run.worldSeed,this.run.worldChanges);
    this.resetTransientRunState();
    this.director=new WaveDirector();
    this.camera.x=0; this.camera.y=0;
    this.shake=0; this.hudClock=0;
    this.hitstop=0;
    this.world.update();

    save.selected=character;
    save.selectedMap=mapId;
    if (!save.discovered.maps.includes(mapId)) save.discovered.maps.push(mapId);
    saveGame();

    this.ui.hide();
    this.ui.hud(true);
    this.ui.updateHUD();
    this.saveSnapshot(true);

    this.announce(
      MAP_DEFINITIONS[mapId].name,
      this.mode==="test"
        ? `TESTE • relógio 5× • seed ${this.run.worldSeed}`
        : `${this.modeDef.name} · seed ${this.run.worldSeed} · explore, lute e atravesse a névoa.`
    );
  }

  modeScaling(time=this.run?.time||0) {
    return getModeScaling(this.mode,time);
  }

  currentEnemyCap(wave=WAVE_TABLE[this.director?.index||0],scale=this.modeScaling()) {
    return Math.min(MAX_ACTIVE_ENEMIES,Math.max(1,Math.floor(wave.cap*scale.cap)));
  }

  canSpawnPriority() {
    return this.enemies.length<MAX_ACTIVE_ENEMIES+MAX_PRIORITY_ENEMIES;
  }

  pushPickup(item) {
    if (this.pickups.length>=MAX_WORLD_PICKUPS) {
      const replace=this.pickups.findIndex(p=>p.type!=="chest"&&p.type!=="item");
      if (replace>=0) this.pickups[replace]=item;
      return replace>=0;
    }
    this.pickups.push(item);
    return true;
  }

  resetTransientRunState() {
    this.enemies.length=0;
    this.pickups.length=0;
    this.gems.length=0;
    this.areas.length=0;
    this.lines.length=0;
    this.gemCells.clear();
    this.bullets.clear();
    this.particles.clear();
    this.floats.clear();
    this.grid.rebuild([]);
    this.enemyId=0;
    this.choices=[];
    this.chestReward=null;
  }

  serializeRun() {
    if (!this.run || !this.player || this.run.settled) return null;
    const p=this.player;
    const enemies=this.enemies
      .filter(e=>!e.dead && ((e.x-p.x)**2+(e.y-p.y)**2<1300**2 || e.type==="boss"||e.type==="final"))
      .slice(0,320)
      .map(e=>({
        type:e.type,id:e.id,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,speed:e.speed,damage:e.damage,
        name:e.name,pattern:e.pattern,attack:e.attack,wind:e.wind,charge:e.charge,aimX:e.aimX,aimY:e.aimY,
        bossPhase:e.bossPhase||1,bossEventIndex:e.bossEventIndex??null,statuses:e.statuses||{}
      }));
    return {
      schemaVersion:SAVE_SCHEMA,gameVersion:VERSION,mapId:this.run.mapId,worldSeed:this.run.worldSeed,
      mode:this.mode,time:this.run.time,simTime:this.run.simTime,completed:this.run.completed===true,completionGold:this.run.completionGold,character:p.character,x:p.x,y:p.y,
      health:p.health,maxHealth:p.maxHealth,level:p.level,xp:p.xp,xpToNextLevel:p.xpToNextLevel,
      weapons:p.weapons.map(w=>({id:w.id,level:w.level,evolved:w.evolved,path:w.path,pathLevel:w.pathLevel,
        damageDealt:w.damageDealt,kills:w.kills,shots:w.shots,hits:w.hits,timer:w.timer})),
      passives:{...p.passives},inventory:this.run.inventory.map(x=>x?{...x}:null),
      rerolls:this.run.rerolls,banishments:this.run.banishments,skips:this.run.skips,banned:[...this.run.banned],
      gold:this.run.gold,kills:this.run.kills,totalDamage:this.run.totalDamage,bossKills:this.run.bossKills,
      evolutions:this.run.evolutions,structuresBroken:this.run.structuresBroken,urnsBroken:this.run.urnsBroken||0,structuresUsed:this.run.structuresUsed,
      itemsUsed:this.run.itemsUsed,synergies:[...this.run.synergies],usedExchange:this.run.usedExchange===true,phase3BossKills:this.run.phase3BossKills||0,worldChanges:{...this.run.worldChanges},
      event:this.run.event,eventTime:this.run.eventTime,nextMapEvent:this.run.nextMapEvent,silenceTime:this.run.silenceTime,surgeTime:this.run.surgeTime,
      silenceAfter:this.run.silenceAfter||0,riftPending:this.run.riftPending?{...this.run.riftPending}:null,endlessAnnounced:this.run.endlessAnnounced===true,
      director:{index:this.director.index,spawnClock:this.director.spawnClock,eliteClock:this.director.eliteClock,
        formationClock:this.director.formationClock,eventIndex:this.director.eventIndex,
        nextEndlessBossAt:this.director.nextEndlessBossAt,endlessBossIndex:this.director.endlessBossIndex},
      enemies,pickups:this.pickups.filter(o=>o.type==="chest"||o.type==="item").slice(0,80).map(o=>({...o})),bossHistory:[...(this.run.bossHistory||[])]
    };
  }

  saveSnapshot(force=false) {
    if (!this.modeDef?.savesProgress || !this.run || this.run.settled) return false;
    if (!force && this.run.autosave>0) return false;
    const snap=this.serializeRun();
    if (!snap) return false;
    save.activeRun=snap;
    this.run.autosave=20;
    return saveGame();
  }

  continueRun() {
    const s=save.activeRun;
    if (!validateRunSnapshot(s,false)) { save.activeRun=null; saveGame(); this.ui.main(); return; }
    this.mode=Object.hasOwn(MODE_DEFINITIONS,s.mode)&&s.mode!=="test"?s.mode:"normal";
    this.modeDef=getModeDefinition(this.mode);
    this.clockRate=this.modeDef.clockRate;
    this.player=new Player(s.character);
    const p=this.player;
    p.x=s.x; p.y=s.y; p.level=s.level; p.xp=s.xp; p.xpToNextLevel=s.xpToNextLevel||xpNeed(s.level);
    p.passives={...s.passives}; p.recalculate(); p.health=clamp(s.health,1,p.maxHealth);
    p.weapons=s.weapons.map(o=>{ const w=new Weapon(o.id); Object.assign(w,o); return w; });
    this.run={
      schemaVersion:SAVE_SCHEMA,gameVersion:VERSION,time:s.time,simTime:s.simTime||s.time,kills:s.kills||0,gold:s.gold||0,
      totalDamage:s.totalDamage||0,bossKills:s.bossKills||0,evolutions:s.evolutions||0,completed:s.completed===true,settled:false,completionGold:Number.isFinite(s.completionGold)?s.completionGold:null,
      mapId:s.mapId,worldSeed:s.worldSeed,worldChanges:{...(s.worldChanges||{})},inventory:s.inventory.map(x=>x?{...x}:null),
      rerolls:s.rerolls??2,banishments:s.banishments??2,skips:s.skips??1,banned:[...(s.banned||[])],
      structuresBroken:s.structuresBroken||0,urnsBroken:s.urnsBroken||0,structuresUsed:s.structuresUsed||0,itemsUsed:s.itemsUsed||0,
      synergies:[...(s.synergies||[])],usedExchange:s.usedExchange===true,phase3BossKills:s.phase3BossKills||0,event:s.event||null,eventTime:s.eventTime||0,nextMapEvent:s.nextMapEvent,
      silenceTime:s.silenceTime||0,surgeTime:s.surgeTime||0,silenceAfter:s.silenceAfter||0,riftPending:s.riftPending?{...s.riftPending}:null,
      endlessAnnounced:s.endlessAnnounced===true,autosave:20,bossHistory:[...(s.bossHistory||[])]
    };
    this.resetTransientRunState();
    this.world=new World(this,s.mapId,s.worldSeed,this.run.worldChanges);
    this.director=new WaveDirector(); Object.assign(this.director,s.director||{});
    for (const o of s.enemies||[]) {
      if (!Object.hasOwn(ENEMY_DEFINITIONS,o.type)) continue;
      const e=this.spawnAt(o.type,o.x,o.y,null,o);
      if (e) this.enemyId=Math.max(this.enemyId,e.id||0);
    }
    for (const o of s.pickups||[]) {
      if (["chest","item"].includes(o.type) && Number.isFinite(o.x)&&Number.isFinite(o.y)) this.pushPickup({...o});
    }
    this.camera.x=p.x; this.camera.y=p.y; this.world.update();
    this.setState("playing"); this.ui.hide(); this.ui.hud(true); this.ui.updateHUD();
    this.announce("Expedição retomada",`${MAP_DEFINITIONS[s.mapId].name} · ${clock(s.time)}`);
  }

  pause() {
    if (this.state!=="playing") return;
    this.saveSnapshot(true);
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
  updateMapEvents(dt) {
    const r=this.run;
    if (!r) return;
    if (!Number.isFinite(r.nextMapEvent)) r.nextMapEvent=300+hashString(r.worldSeed)%90;
    if (r.eventTime<=0 && r.event) {
      if (r.event==="deep_fog") this.announce("A névoa recua","A visão volta ao normal.");
      r.event=null;
    }
    if (r.silenceAfter>0) {
      r.silenceAfter-=dt;
      if (r.silenceAfter<=0) {
        r.surgeTime=Math.max(r.surgeTime,18);
        this.announce("O silêncio se rompe","Uma onda intensa atravessa o limiar.");
      }
    }
    if (r.time>=r.nextMapEvent) {
      const event=(hashString(`${r.worldSeed}|event|${Math.floor(r.nextMapEvent)}`)&1)?"sky_split":"deep_fog";
      r.event=event; r.eventTime=45; r.nextMapEvent+=330+hashString(`${r.worldSeed}|${r.nextMapEvent}`)%100;
      if (event==="sky_split") {
        r.surgeTime=Math.max(r.surgeTime,45);
        this.announce("O céu se parte","Mais elites e mais ouro por 45 segundos.");
      } else {
        this.announce("Névoa profunda","A visão se fecha; cristais concedem mais experiência.");
      }
    }
  }

  hasSynergy(id) {
    return this.run?.synergies?.includes(id);
  }

  discoverSynergies() {
    if (!this.run || !this.player) return;
    const ids=new Set(this.player.weapons.map(w=>w.id));
    for (const [id,s] of Object.entries(SYNERGY_DEFINITIONS)) {
      if (s.weapons.every(w=>ids.has(w)) && !this.run.synergies.includes(id)) {
        this.run.synergies.push(id);
        if (!save.discovered.synergies.includes(id)) save.discovered.synergies.push(id);
        this.announce("Sinergia descoberta • "+s.name,s.text);
        this.sound.play("evolve");
        this.saveSnapshot(true);
      }
    }
  }

  weightedItem() {
    const luck=this.player?.stats.luck||1;
    const list=Object.entries(ITEM_DEFINITIONS).map(([id,d])=>({id,...d}));
    return weighted(list,o=>o.weight*(o.rarity==="rare"?luck:o.rarity==="arcane"?Math.sqrt(luck):1));
  }

  dropItemWeighted(x,y,itemId=null) {
    const d=itemId?ITEM_DEFINITIONS[itemId]:this.weightedItem();
    const id=itemId||d?.id;
    if (!id || !ITEM_DEFINITIONS[id] || this.pickups.length>=MAX_WORLD_PICKUPS) return;
    this.pushPickup({type:"item",itemId:id,x,y,value:1,life:120});
  }

  addItem(id,qty=1) {
    const d=ITEM_DEFINITIONS[id];
    if (!d || !this.run) return false;
    if (!save.discovered.items.includes(id)) save.discovered.items.push(id);
    let remaining=Math.max(1,Math.floor(qty));
    for (const slot of this.run.inventory) {
      if (slot?.id===id && slot.qty<d.maxStack) {
        const add=Math.min(remaining,d.maxStack-slot.qty); slot.qty+=add; remaining-=add;
        if (!remaining) { this.sound.play("item"); this.ui.updateHUD(); this.saveSnapshot(true); return true; }
      }
    }
    while (remaining>0) {
      const empty=this.run.inventory.findIndex(s=>!s);
      if (empty<0) {
        this.pendingItem={id,qty:remaining};
        this.setState("inventory");
        this.ui.itemOverflow();
        return false;
      }
      const add=Math.min(remaining,d.maxStack);
      this.run.inventory[empty]={id,qty:add}; remaining-=add;
    }
    this.sound.play("item"); this.ui.updateHUD(); this.saveSnapshot(true); return true;
  }

  replaceInventorySlot(index) {
    if (this.state!=="inventory" || !this.pendingItem) return;
    const pending=this.pendingItem; this.pendingItem=null;
    if (index>=0 && index<RUN_INVENTORY_SLOTS) this.run.inventory[index]=null;
    this.setState("playing"); this.ui.hide(); this.addItem(pending.id,pending.qty); this.ui.updateHUD();
    this.saveSnapshot(true);
  }

  discardPendingItem() {
    if (this.state!=="inventory") return;
    this.pendingItem=null; this.resume(); this.announce("Item deixado para trás","O inventário permanece inalterado.");
  }

  consumeItem(id,qty=1) {
    for (let i=0;i<this.run.inventory.length;i++) {
      const s=this.run.inventory[i];
      if (s?.id!==id) continue;
      s.qty-=qty; if (s.qty<=0) this.run.inventory[i]=null;
      return true;
    }
    return false;
  }

  useItem(index) {
    if (this.state!=="playing" || !this.run?.inventory[index]) return;
    const slot=this.run.inventory[index],d=ITEM_DEFINITIONS[slot.id],p=this.player;
    if (!d) return;
    if (d.use==="heal" && p.health>=p.maxHealth) { this.announce(d.name,"Sua vitalidade já está completa."); return; }
    if (d.use==="key") { this.announce(d.name,"Ela reage apenas diante de um cofre basáltico."); return; }
    if (d.use==="heal") { const n=Math.ceil(p.maxHealth*.38); p.health=Math.min(p.maxHealth,p.health+n); this.float(p.x,p.y,"+"+n,"#89edba",20); }
    if (d.use==="bomb") { this.blast(p.x,p.y,Math.max(this.viewW,this.viewH)*.72,300*p.stats.damage,null); this.shake=12; }
    if (d.use==="slow") { for (const e of this.enemies) if (!e.dead) applyStatus(e,"slow",6,.68,null); }
    if (d.use==="buff") p.buff=Math.max(p.buff,14);
    if (d.use==="veil") p.invulnerable=Math.max(p.invulnerable,4);
    if (d.use==="magnet") for (const gem of this.gems) gem.magnet=true;
    if (d.use==="luck") p.luckBuff=Math.max(p.luckBuff,30);
    this.consumeItem(slot.id,1); this.run.itemsUsed++; this.sound.play("item"); this.spark(p.x,p.y,d.rarity==="arcane"?"#f0cb82":"#9edcc1",14);
    this.announce(d.name,d.text); this.ui.updateHUD(); this.saveSnapshot(true);
  }

  interact() {
    if (this.state!=="playing" || !this.world?.interactive) return;
    this.ui.structureInteraction(this.world.interactive);
  }

  resolveStructure(s,accept=true) {
    if (!s || s.destroyed || s.used || s.opened) { this.resume(); return; }
    const p=this.player,r=this.run;
    const used=()=>{ this.world.mark(s,{used:true}); r.structuresUsed++; if (!save.discovered.structures.includes(s.type)) save.discovered.structures.push(s.type); this.sound.play("interact"); this.saveSnapshot(true); };
    if (!accept) { this.resume(); return; }

    if (s.type==="fountain") {
      p.health=Math.min(p.maxHealth,p.health+p.maxHealth*.42); used(); this.announce("Fonte de Seiva","A água escurece depois de restaurar sua vitalidade.");
    } else if (s.type==="exchange") {
      r.usedExchange=true;
      const cost=Math.max(1,Math.floor(p.health*.25)); p.health=Math.max(1,p.health-cost); used();
      const roll=Math.random();
      if (roll<.3) { r.rerolls++; this.announce("Troca selada","O altar devolveu uma nova chance de reroll."); }
      else if (roll<.55) { r.banishments++; this.announce("Troca selada","O altar concedeu um banimento adicional."); }
      else if (roll<.8) { const item=this.weightedItem(); this.dropItemWeighted(p.x+24,p.y,item.id); this.announce("Troca selada",`${item.name} foi deixado diante do altar.`); }
      else { p.buff=Math.max(p.buff,35); p.luckBuff=Math.max(p.luckBuff,35); this.announce("Troca selada","Âmbar prolongado fortalece dano e fortuna no próximo trecho."); }
    } else if (s.type==="memory") {
      if (r.gold<35) { this.announce("Altar da Memória","São necessários 35 ecos de ouro."); this.resume(); return; }
      r.gold-=35; p.xp+=p.xpToNextLevel*.55; used(); this.announce("Memória comprada","Ouro se converte em experiência.");
    } else if (s.type==="rift_altar") {
      used(); r.riftPending={id:s.id,count:4,x:s.x,y:s.y};
      for (let i=0;i<4;i++) { const e=this.spawn("elite",rand(0,TAU)); if (e) e.riftSource=s.id; }
      this.announce("A fenda responde","Quatro arautos precisam cair para liberar a recompensa.");
    } else if (s.type==="silence") {
      used(); r.silenceTime=20; r.silenceAfter=20; this.announce("O mundo se cala","Menos aparições por 20 s. Depois, a dívida chega.");
    } else if (s.type==="chest") {
      if (!this.consumeItem("basalt_key",1)) { this.announce("Cofre Basáltico","Uma Chave Basáltica é necessária."); this.resume(); return; }
      this.world.mark(s,{opened:true,used:true}); r.structuresUsed++; r.gold+=80; r.rerolls++;
      this.dropItemWeighted(p.x+22,p.y,this.weightedItem().id); this.dropItemWeighted(p.x-22,p.y,this.weightedItem().id);
      this.announce("Cofre aberto","80 ouro, um reroll e duas relíquias foram reveladas.");
    } else if (s.type==="obelisk") {
      used(); r.rerolls++; p.luckBuff=Math.max(p.luckBuff,45); this.announce("Obelisco Fraturado","Sua rota ressoa: +1 reroll e fortuna temporária.");
    }
    this.resume(); this.ui.updateHUD(); this.saveSnapshot(true); this.maybeLevelUp();
  }

  currentInteractionText() {
    const s=this.world?.interactive;
    return s?STRUCTURE_DEFINITIONS[s.type]?.name||"INTERAGIR":"";
  }


  update(dt) {
    if (this.state!=="playing" || !this.player) return;

    const p = this.player;
    const r = this.run;

    r.time += dt*this.clockRate;
    r.simTime += dt;

    p.invulnerable = Math.max(0,p.invulnerable-dt);
    p.buff = Math.max(0,p.buff-dt);
    p.luckBuff = Math.max(0,p.luckBuff-dt);
    p.hurtFlash = Math.max(0,p.hurtFlash-dt);
    p.health = Math.min(p.maxHealth,p.health+p.stats.recovery*dt);
    r.autosave -= dt;
    r.eventTime=Math.max(0,r.eventTime-dt);
    r.silenceTime=Math.max(0,r.silenceTime-dt);
    r.surgeTime=Math.max(0,r.surgeTime-dt);

    const move = this.input.vector();
    const oldX=p.x,oldY=p.y;
    const moveSpeed=p.speed*(p.inWater?.88:1);
    let nx=p.x+move.x*moveSpeed*dt;
    let ny=p.y+move.y*moveSpeed*dt;
    if (this.world) ({x:nx,y:ny}=this.world.resolvePlayerMove(oldX,oldY,nx,ny,p.r));
    p.x=nx; p.y=ny;

    if (Math.hypot(move.x,move.y) > .05) {
      const d = Math.hypot(move.x,move.y);
      p.dx = move.x/d;
      p.dy = move.y/d;
    }

    this.camera.x = p.x;
    this.camera.y = p.y;
    this.shake = Math.max(0,this.shake-dt*28);
    this.world?.update();
    this.world?.updateHazards(dt);
    this.updateMapEvents(dt);
    if (r.autosave<=0) this.saveSnapshot();

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
    if (this.state!=="playing") return;
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

    const duration=this.modeDef.duration;
    if (this.modeDef.endless && r.time>=this.modeDef.endlessStart && !r.endlessAnnounced) {
      r.endlessAnnounced=true;
      this.announce("ALÉM DO LIMIAR","A névoa já não conhece limites.");
      this.sound.play("phase");
      this.saveSnapshot(true);
    } else if (!this.modeDef.endless && duration!=null && r.time>=duration && !r.completed) {
      r.completed = true;
      r.completionGold=r.gold;
      this.spawn("final");
      this.checkAchievements();
      this.setState("goal");
      this.sound.play("boss");
      this.ui.goal();
      return;
    }

    this.maybeLevelUp();
  }

  findValidSpawnPosition(angle=null) {
    for (let attempt=0;attempt<12;attempt++) {
      const a=angle??rand(0,TAU);
      const hw=this.viewW/2+95,hh=this.viewH/2+95;
      const distance=Math.min(hw/(Math.abs(Math.cos(a))||.0001),hh/(Math.abs(Math.sin(a))||.0001))+rand(20,100);
      const x=this.camera.x+Math.cos(a)*distance,y=this.camera.y+Math.sin(a)*distance;
      this.world?.ensureChunkAt(x,y);
      let blocked=false;
      this.world?.query(x,y,42,s=>{ if (STRUCTURE_DEFINITIONS[s.type]?.collidable) blocked=true; });
      if (!blocked) return {x,y,a};
    }
    return {x:this.camera.x+this.viewW/2+120,y:this.camera.y,a:0};
  }

  spawn(type,angle=null,event=null) {
    if (!Object.hasOwn(ENEMY_DEFINITIONS,type)) return null;
    const pos=this.findValidSpawnPosition(angle);
    return this.spawnAt(type,pos.x,pos.y,event);
  }

  spawnAt(type,x,y,event=null,restore=null) {
    const d=ENEMY_DEFINITIONS[type];
    if (!d) return null;
    const priority=type==="boss"||type==="final"||type==="elite";
    if ((!priority && this.enemies.length>=MAX_ACTIVE_ENEMIES) || (priority && !this.canSpawnPriority())) return null;
    const min=this.run.time/60;
    const modeScale=this.modeScaling();
    const temporalMinute=this.modeDef.endless?Math.min(min,30):min;
    const temporalHp=(1+.10*temporalMinute+.006*temporalMinute*temporalMinute)*(this.world?.map.waveModifiers?.hp||1);
    const bossLike=type==="boss"||type==="final";
    const elite=type==="elite";
    const hpMode=bossLike?modeScale.bossHp:elite?modeScale.hp*modeScale.eliteHp:modeScale.hp;
    const damageMode=bossLike?modeScale.bossDamage:elite?modeScale.damage*modeScale.eliteDamage:modeScale.damage;
    const hpScale=(type==="final"?1:temporalHp)*hpMode;
    const e={
      ...d,type,id:restore?.id||++this.enemyId,x,y,
      hp:d.hp*hpScale,maxHp:d.hp*hpScale,
      speed:d.speed*(1+Math.min(.32,temporalMinute*.007))*modeScale.speed,damage:d.damage*(1+temporalMinute*.04)*damageMode,
      name:event?.name||d.name,pattern:event?.pattern||"ring",bossEventIndex:event?.eventIndex??null,
      dead:false,kx:0,ky:0,flash:0,attack:rand(1.5,3.5),wind:0,charge:0,aimX:0,aimY:0,
      bossPhase:1,phase:0,statuses:{},burrow:0,shield:0,buffAura:0,specialClock:rand(1.2,3.5)
    };
    if (restore) Object.assign(e,restore,{dead:false,statuses:restore.statuses||{}});
    this.enemies.push(e);
    if (!save.discovered.enemies.includes(type)) save.discovered.enemies.push(type);
    return e;
  }

  updateStatusEffects(e,dt) {
    for (const [id,s] of Object.entries(e.statuses||{})) {
      s.duration-=dt;
      if ((id==="burn"||id==="poison") && s.duration>0) {
        s.tick=(s.tick||0)-dt;
        if (s.tick<=0) {
          s.tick=STATUS_DEFINITIONS[id].tick;
          const source=s.source;
          const base=(id==="burn"?4.5:3.2)*Math.max(1,s.stacks)*Math.max(.5,s.magnitude||1);
          this.damageEnemy(e,base*(source?.values?source.values(this.player).damage/Math.max(1,source.definition.damage):1),source,0,false,{status:id});
          if (e.dead) return;
        }
      }
      if (s.duration<=0) delete e.statuses[id];
    }
  }

  updateBossPhase(e) {
    if (e.type!=="boss" && e.type!=="final") return;
    const ratio=e.hp/Math.max(1,e.maxHp);
    const phase=ratio<=.30?3:ratio<=.60?2:1;
    if (phase<=e.bossPhase) return;
    e.bossPhase=phase;
    e.wind=Math.max(e.wind,.8);
    e.attack=Math.max(e.attack,.8);
    this.shake=Math.max(this.shake,10);
    this.hitstop=.035;
    this.spark(e.x,e.y,e.color,30);
    this.ring(e.x,e.y,e.r*2.2,"#f0c5b8");
    this.sound.play("phase");
    const names=BOSS_PHASES[e.name]||BOSS_PHASES.default;
    this.announce(e.name,names[phase-1]);
    this.saveSnapshot(true);
  }

  updateEnemies(dt) {
    const p=this.player;
    const far=Math.max(this.viewW,this.viewH)*2.2+600;
    const heralds=this.enemies.filter(e=>!e.dead&&e.behavior==="herald");

    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;
      const special=e.type==="boss"||e.type==="final";
      if (d>far && !special && e.type!=="elite") { e.dead=true; continue; }

      e.flash=Math.max(0,e.flash-dt);
      this.updateStatusEffects(e,dt);
      if (e.dead) continue;
      this.updateBossPhase(e);

      const frozen=hasStatus(e,"freeze");
      const slow=hasStatus(e,"slow")?clamp(e.statuses.slow.magnitude||.48,.12,.9):1;
      if (frozen) continue;

      let speed=e.speed*slow;
      if (this.world?.map.water && this.world.isWater(e.x,e.y) && !["burrow","weaver"].includes(e.behavior)) speed*=.94;
      let mx=dx/d,my=dy/d;
      if (heralds.some(h=>h!==e&&(h.x-e.x)**2+(h.y-e.y)**2<190**2)) speed*=1.18;

      if (e.behavior==="ranged") {
        e.attack-=dt;
        if (e.attack<=.55 && e.wind===0) { e.wind=.55; e.aimX=mx; e.aimY=my; }
        if (e.attack<=0) { this.hostile(e,e.aimX,e.aimY,155); e.attack=3.2; e.wind=0; }
        if (d<255) { mx=-mx; my=-my; } else if (d<340) { mx=-dy/d*.3; my=dx/d*.3; }
      }

      if (e.behavior==="burrow") {
        e.specialClock-=dt;
        if (e.specialClock<.65 && e.burrow===0) { e.burrow=1; e.wind=.65; e.aimX=mx; e.aimY=my; }
        if (e.specialClock<=0) {
          const a=rand(0,TAU),dist=rand(120,190);
          e.x=p.x+Math.cos(a)*dist; e.y=p.y+Math.sin(a)*dist;
          e.specialClock=rand(4.5,6); e.burrow=0; e.wind=0;
          this.ring(e.x,e.y,36,"#bca69c");
        }
        if (e.burrow) speed*=.05;
      }

      if (e.behavior==="sentinel") {
        e.specialClock-=dt;
        if (e.specialClock<=0) { e.shield=e.shield>0?0:2.2; e.specialClock=e.shield?4.8:2.3; }
        e.shield=Math.max(0,e.shield-dt);
        if (d<180) speed*=.65;
      }

      if (e.behavior==="herald") {
        e.specialClock-=dt;
        if (e.specialClock<=0) {
          e.specialClock=4.2;
          this.ring(e.x,e.y,190,"#d0af77");
          for (const other of this.enemies) if (!other.dead&&other!==e&&(other.x-e.x)**2+(other.y-e.y)**2<190**2) applyStatus(other,"shock",1.2,.35,null);
        }
        if (d<270) { mx=-mx*.45; my=-my*.45; }
      }

      if (e.behavior==="charger") {
        e.attack-=dt;
        if (e.attack<=.72 && e.wind===0 && e.charge<=0) { e.wind=.72; e.aimX=mx; e.aimY=my; }
        if (e.attack<=0 && e.charge<=0) { e.charge=.72; e.wind=0; e.attack=3.8; }
        if (e.charge>0) { e.charge-=dt; mx=e.aimX; my=e.aimY; speed=355; }
      }

      if (e.behavior==="weaver") {
        e.specialClock-=dt;
        if (e.specialClock<.75 && e.wind===0) e.wind=.75;
        if (e.specialClock<=0) {
          this.enemyHazard(p.x+rand(-90,90),p.y+rand(-90,90),48,e.damage*.55,4.5,.65,"web");
          e.specialClock=rand(4.5,6); e.wind=0;
        }
        if (d<300) { mx=-dy/d*.45; my=dx/d*.45; }
      }

      if (special) {
        e.attack-=dt*this.modeScaling().bossAttack;
        if (e.type==="final") speed+=Math.min(280,Math.max(0,this.run.time-1800)*.6);
        const windTime=e.bossPhase>=3?.48:.65;
        if (e.attack<windTime && e.wind===0) { e.wind=windTime; e.aimX=dx/d; e.aimY=dy/d; }
        if (e.attack<=0) {
          e.wind=0; e.phase++;
          const phase=e.bossPhase||1;
          if (e.pattern==="charge") {
            e.charge=phase>=2?1.25:1; e.attack=phase>=3?2.5:4.1;
          } else {
            const base=e.pattern==="spiral"?9:e.pattern==="pulse"?22:14;
            const n=base+(phase-1)*4;
            for (let i=0;i<n;i++) {
              const a=i/n*TAU+e.phase*.31;
              this.hostile(e,Math.cos(a),Math.sin(a),(e.pattern==="pulse"?140:112)*(1+.12*(phase-1)));
            }
            if (phase>=2 && (e.name==="A Catedral Errante" || e.pattern==="pulse")) {
              for (let i=0;i<phase;i++) this.enemyHazard(p.x+rand(-180,180),p.y+rand(-180,180),55,e.damage*.45,3.5,.8,"rift");
            }
            if (e.pattern==="summon" || e.type==="final" || phase>=3) {
              const count=phase>=3?9:7;
              for (let i=0;i<count && this.enemies.length<this.currentEnemyCap();i++) this.spawn(phase>=3&&i%3===0?"charger":"swarm");
            }
            e.attack=e.type==="final"?1.9:e.pattern==="spiral"?(phase>=3?1.15:1.7):(phase>=3?2.6:4.4);
          }
        }
        if (e.wind>0) speed*=.15;
        if (e.charge>0) { e.charge-=dt; mx=e.aimX; my=e.aimY; speed=330*(1+.12*(e.bossPhase-1)); }
      }

      const avoid=this.world?.avoidEnemy(e,mx,my)||{x:mx,y:my}; mx=avoid.x; my=avoid.y;
      e.x+=(mx*speed+e.kx)*dt; e.y+=(my*speed+e.ky)*dt;
      e.kx*=Math.exp(-9*dt); e.ky*=Math.exp(-9*dt);
      if ((p.x-e.x)**2+(p.y-e.y)**2<(p.r+e.r)**2) this.hurtPlayer(e.damage*(e.behavior==="herald"?1.05:1));
      if (this.state!=="playing") return;
      e.wind=Math.max(0,e.wind-dt);
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
      if (!b.enemy && b.source) this.world?.damageBreakablesAt(b.x,b.y,b.r+3,b.damage*.22);

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
            const hitDamage=(b.kind==="disc"&&b.returned&&b.source?.path==="mirror")?b.damage*1.6:b.damage;
            this.damageEnemy(e,hitDamage,b.source,b.knock);

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

  damageEnemy(e,damage,w,knock=0,allowCrit=true,opts={}) {
    if (e.dead) return false;
    let dealt=damage;
    if (e.behavior==="sentinel" && e.shield>0 && !opts.status && !opts.area) dealt*=.42;
    const markCrit=w?.id==="spear" && w.path==="omen" && hasStatus(e,"mark");
    const critical=allowCrit && (Math.random()<(this.player.stats.critChance+(this.player.luckBuff>0?.05:0)) || markCrit);
    const amount=Math.min(e.hp,dealt*(critical?1.8:1));
    e.hp-=amount; e.flash=.085; this.run.totalDamage+=amount;
    if (w) { w.damageDealt+=amount; w.hits++; }

    if (w && !opts.status) {
      const mods=w.path?WEAPON_PATHS[w.id]?.[w.path]?.mods||{}:{};
      if (mods.burn) applyStatus(e,"burn",3.6,1,w);
      if (mods.mark) applyStatus(e,"mark",4,1,w);
      if (w.id==="orbit" && this.hasSynergy("ember_orbit")) applyStatus(e,"burn",2,.6,w);
      if (w.id==="chain" && w.path==="storm" && Object.keys(e.statuses).length && !opts.synergy) {
        this.damageEnemy(e,amount*.32,w,0,false,{synergy:true});
      }
      if (w.id==="chain" && hasStatus(e,"freeze") && this.hasSynergy("frozen_current") && !opts.synergy) {
        this.damageEnemy(e,amount*.38,w,0,false,{synergy:true});
        this.ring(e.x,e.y,30,"#d6f5ff");
      }
      if (w.id==="chain" && hasStatus(e,"mark") && this.hasSynergy("marked_void") && !opts.synergy) {
        this.damageEnemy(e,amount*.28,w,0,false,{synergy:true});
      }
      if (w.id==="disc" && hasStatus(e,"slow") && (this.hasSynergy("nacre_rime")||w.path==="hail") && !opts.synergy) {
        const other=this.grid.nearest(e.x,e.y,105,new Set([e.id]));
        if (other) { this.damageEnemy(other,amount*.24,w,0,false,{synergy:true}); applyStatus(other,"slow",1.4,.55,w); }
        if (Math.random()<.12) applyStatus(e,"freeze",.32,1,w);
      }
      if (w.id==="meteor" && w.path==="comet" && hasStatus(e,"freeze") && !opts.synergy) {
        this.damageEnemy(e,amount*.3,w,0,false,{synergy:true});
        this.ring(e.x,e.y,42,"#bfeaff");
      }
      if (w.id==="ember" && hasStatus(e,"mark") && this.hasSynergy("ember_orbit") && !opts.synergy) {
        this.blast(e.x,e.y,34,amount*.22,w,0,0,{noStructure:true});
      }
    }

    if (knock && e.resist<1) {
      const dx=e.x-this.player.x,dy=e.y-this.player.y,d=Math.hypot(dx,dy)||1;
      const mult=w?.path==="bastion"?1.8:1;
      e.kx+=dx/d*knock*(1-e.resist)*mult; e.ky+=dy/d*knock*(1-e.resist)*mult;
    }

    const numberChance=this.enemies.length>=600?.12:this.enemies.length>=350?.20:.35;
    if (save.settings.numbers && Math.random()<(critical?1:numberChance)) {
      this.float(e.x,e.y,Math.ceil(amount),critical?"#ffe399":"#dbe5df",critical?18:12);
    }
    this.spark(e.x,e.y,w?.definition.color||"#ffdfb2",critical?4:2);
    this.sound.play("hit");
    if (critical && (amount>80 || e.type==="boss")) this.hitstop=Math.max(this.hitstop,.022);

    if (e.hp<=0) {
      const wasFrozen=hasStatus(e,"freeze");
      e.dead=true; this.run.kills++; if (w) w.kills++;
      this.dropXP(e.x,e.y,e.xp);

      if (e.behavior==="splitter" && this.enemies.length<MAX_ACTIVE_ENEMIES) {
        for (let i=0;i<3 && this.enemies.length<MAX_ACTIVE_ENEMIES;i++) {
          const a=i/3*TAU+rand(-.2,.2);
          this.spawnAt("shardling",e.x+Math.cos(a)*18,e.y+Math.sin(a)*18);
        }
      }

      if (wasFrozen && w && ((w.id==="frost"&&w.path==="rupture") || (w.id==="meteor"&&this.hasSynergy("shattered_sky")))) {
        this.blast(e.x,e.y,64,Math.max(14,amount*.45),w,1.2,0,{noStructure:true});
      }

      if (e.riftSource && this.run.riftPending?.id===e.riftSource) {
        this.run.riftPending.count--;
        if (this.run.riftPending.count<=0) {
          this.pushPickup({type:"chest",x:e.x,y:e.y,value:180,life:Infinity,worldReward:true});
          this.run.riftPending=null;
          this.announce("A fenda se fecha","Um baú enriquecido permaneceu no chão.");
          this.saveSnapshot(true);
        }
      } else if (e.type==="elite" || e.type==="boss" || e.type==="final") {
        this.pushPickup({type:"chest",x:e.x,y:e.y,value:e.type==="elite"?35:100,life:Infinity});
        if (e.type!=="elite") {
          this.run.bossKills++;
          if ((e.bossPhase||1)>=3) this.run.phase3BossKills=(this.run.phase3BossKills||0)+1;
          if (e.bossEventIndex!=null && !this.run.bossHistory.includes(e.bossEventIndex)) this.run.bossHistory.push(e.bossEventIndex);
        }
        this.spark(e.x,e.y,"#f4d69e",28);
        this.saveSnapshot(true);
      } else {
        const luck=this.player.stats.luck*(this.player.luckBuff>0?1.45:1)*(this.run.surgeTime>0?1.15:1);
        const goldChance=clamp(.055*luck*this.modeScaling().goldDrop,0,.12);
        if (Math.random()<goldChance) this.drop("gold",e.x+9,e.y,Math.ceil(rand(1,3)*(this.run.surgeTime>0?1.5:1)));
        const roll=Math.random()/luck;
        if (roll<.0045) this.dropItemWeighted(e.x,e.y);
        else if (roll<.011) this.drop("heal",e.x-8,e.y,25);
        else if (roll<.013) this.drop("magnet",e.x,e.y);
        else if (roll<.0145) this.drop("bomb",e.x,e.y);
        else if (roll<.017) this.drop("buff",e.x,e.y);
      }

      if (w?.evolved && w.id==="well") this.player.health=Math.min(this.player.maxHealth,this.player.health+.35);
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
    p.hurtFlash = .16;
    this.shake = 7;

    this.float(p.x,p.y-22,"−"+Math.ceil(loss),"#ff9297",20);
    this.sound.play("hurt");

    if (p.health<=0) this.finish(false);
  }

  blast(x,y,r,damage,w,slow=0,freeze=0,opts={}) {
    this.grid.query(x,y,r+68,e=>{
      if ((e.x-x)**2+(e.y-y)**2 < (r+e.r)**2) {
        this.damageEnemy(e,damage,w,110,true,{area:true});
        if (slow>0) applyStatus(e,"slow",slow,w?.id==="frost"&&w.path==="rime"?.32:.48,w);
        if (freeze>0 && e.type!=="boss"&&e.type!=="elite"&&e.type!=="final") applyStatus(e,"freeze",freeze,1,w);
      }
    });
    if (!opts.noStructure) this.world?.damageBreakablesAt(x,y,r,damage);
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
    if (this.areas.length>=80) return;
    this.areas.push({x,y,r,damage,w,life,delay,kind,tick:0,armed:delay<=0,enemy:false});
  }

  enemyHazard(x,y,r,damage,life=3,delay=.6,kind="rift") {
    if (this.areas.length>=80) return;
    this.areas.push({x,y,r,damage,w:null,life,delay,kind,tick:0,armed:delay<=0,enemy:true});
  }

  updateAreas(dt) {
    for (let i=this.areas.length-1;i>=0;i--) {
      const a=this.areas[i];
      if (!a.armed) {
        a.delay-=dt;
        if (a.delay<=0) {
          a.armed=true;
          if (a.enemy) {
            a.tick=0;
            this.ring(a.x,a.y,a.r,a.kind==="web"?"#78b7aa":"#c07395");
          } else {
            this.blast(a.x,a.y,a.r,a.damage,a.w);
            this.shake=Math.max(this.shake,3);
            if (a.w?.evolved) { a.kind="pool"; a.life=2.8; a.damage*=.17; }
            else a.life=0;
          }
        }
      } else {
        a.life-=dt; a.tick-=dt;
        if (a.enemy) {
          if (a.tick<=0&&a.life>0) {
            a.tick=.5;
            const p=this.player;
            if ((p.x-a.x)**2+(p.y-a.y)**2<(p.r+a.r)**2) {
              if (a.kind==="web") {
                p.invulnerable=Math.max(p.invulnerable,.08);
                this.hurtPlayer(a.damage*.55);
              } else this.hurtPlayer(a.damage);
              if (this.state!=="playing") return;
            }
          }
        } else {
          if (a.tick<=0&&a.life>0) {
            a.tick=.45;
            this.grid.query(a.x,a.y,a.r+68,e=>{
              if ((e.x-a.x)**2+(e.y-a.y)**2<(a.r+e.r)**2) {
                this.damageEnemy(e,a.damage,a.w,0,false,{area:true});
                if (a.w?.id==="well") {
                  const mods=a.w.path?WEAPON_PATHS.well[a.w.path]?.mods||{}:{};
                  if (mods.burn || this.hasSynergy("burning_garden")) applyStatus(e,"burn",2.4,mods.burn?1:.7,a.w);
                }
              }
            });
          }
          if (a.w?.id==="well" && (a.w.evolved || a.w.path==="gravity")) {
            this.grid.query(a.x,a.y,a.r+90,e=>{
              const dx=a.x-e.x,dy=a.y-e.y,d=Math.hypot(dx,dy)||1;
              if (d>15&&d<a.r+90) {
                const pull=a.w.path==="gravity"?95:65;
                e.x+=dx/d*pull*(1-e.resist)*dt; e.y+=dy/d*pull*(1-e.resist)*dt;
              }
            });
          }
        }
      }
      if (a.armed&&a.life<=0) removeAt(this.areas,i);
    }
  }

  drop(type,x,y,value=1) {
    if (this.pickups.length<MAX_WORLD_PICKUPS) {
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
        p.xp += gem.value*p.stats.growth*this.modeDef.xpMultiplier*(this.run.event==="deep_fog"?1.25:1);

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

        case "item":
          this.addItem(item.itemId,item.value||1);
          if (this.state!=="playing") return;
          break;

        case "chest":
          this.openChest(item);
          return;
      }
    }
  }

  choiceKey(item) { return `${item.kind}:${item.weaponId||""}:${item.id}`; }

  candidates(existingOnly=false) {
    const p=this.player,result=[];
    const banned=new Set(this.run?.banned||[]);
    for (const [id,d] of Object.entries(WEAPON_DEFINITIONS)) {
      const w=p.weapons.find(w=>w.id===id),key=`weapon:${id}`;
      if (banned.has(key)) continue;
      if (w&&w.level<8&&!w.evolved) result.push({kind:"weapon",id,weight:d.weight*2.8});
      else if (!w&&!existingOnly&&p.weapons.length<MAX_WEAPONS) result.push({kind:"weapon",id,weight:d.weight});
    }
    for (const [id,d] of Object.entries(PASSIVE_DEFINITIONS)) {
      const level=p.passives[id]||0,key=`passive:${id}`;
      if (banned.has(key)) continue;
      if (level>0&&level<d.max) result.push({kind:"passive",id,weight:d.weight*2.2});
      else if (!level&&!existingOnly&&Object.keys(p.passives).length<MAX_PASSIVES) result.push({kind:"passive",id,weight:d.weight});
    }
    return result;
  }

  rollChoices(avoidKey="") {
    let out=[],key="";
    const hasAlternatives=this.candidates().length>4;
    for (let attempt=0;attempt<6;attempt++) {
      const pool=this.candidates(); out=[];
      while (pool.length&&out.length<4) {
        const choiceLuck=this.player.stats.luck*(this.player.luckBuff>0?1.3:1);
        const selected=weighted(pool,x=>x.weight*(x.weight<9?choiceLuck:1));
        out.push(selected); pool.splice(pool.indexOf(selected),1);
      }
      for (const id of ["heal","gold","buff","magnet"]) if (out.length<4) out.push({kind:"bonus",id,weight:1});
      key=out.map(o=>this.choiceKey(o)).sort().join("|");
      if (!avoidKey||key!==avoidKey||!hasAlternatives) break;
    }
    this.lastChoiceKey=key;
    return out;
  }

  pathChoices(w) {
    return Object.entries(WEAPON_PATHS[w.id]||{}).map(([id,d])=>({kind:"path",id,weaponId:w.id,weight:1,name:d.name}));
  }

  maybeLevelUp() {
    const p=this.player;
    if (this.state!=="playing"||p.xp<p.xpToNextLevel) return;
    p.xp-=p.xpToNextLevel; p.level++; p.xpToNextLevel=xpNeed(p.level); p.recalculate();
    this.pathSelection=false;
    this.choices=this.rollChoices();
    this.setState("levelup"); this.sound.play("level"); this.checkAchievements(); this.ui.levelup();
  }

  applyUpgrade(item) {
    const p=this.player;
    if (item.kind==="path") {
      const w=p.weapons.find(w=>w.id===item.weaponId);
      if (w&&!w.path&&WEAPON_PATHS[w.id]?.[item.id]) { w.path=item.id; w.pathLevel=1; this.sound.play("evolve"); this.announce(`${w.name} · ${WEAPON_PATHS[w.id][item.id].name}`,WEAPON_PATHS[w.id][item.id].text); }
      return null;
    }
    if (item.kind==="weapon") {
      let w=p.weapons.find(w=>w.id===item.id);
      if (w) { if (w.level<8&&!w.evolved) w.level++; }
      else if (p.weapons.length<MAX_WEAPONS) { w=new Weapon(item.id); p.weapons.push(w); }
      this.discoverSynergies();
      if (w&&w.level>=4&&!w.path) return w;
    } else if (item.kind==="passive") {
      const d=PASSIVE_DEFINITIONS[item.id];
      if ((p.passives[item.id]||0)<d.max && ((p.passives[item.id]||0)>0||Object.keys(p.passives).length<MAX_PASSIVES)) p.passives[item.id]=(p.passives[item.id]||0)+1;
      p.recalculate();
    } else if (item.id==="heal") p.health=Math.min(p.maxHealth,p.health+35);
    else if (item.id==="buff") p.buff=12;
    else if (item.id==="magnet") for (const gem of this.gems) gem.magnet=true;
    else this.run.gold+=25;
    return null;
  }

  pickUpgrade(index) {
    if (this.state!=="levelup"||!this.choices[index]) return;
    const item=this.choices[index];
    const pending=this.applyUpgrade(item);
    if (this.pathSelection) {
      this.pathSelection=false; this.choices=[]; this.resume(); this.ui.updateHUD(); this.saveSnapshot(true); this.maybeLevelUp(); return;
    }
    if (pending) {
      this.pathSelection=true; this.choices=this.pathChoices(pending); this.ui.levelup(); return;
    }
    this.choices=[]; this.resume(); this.ui.updateHUD(); this.saveSnapshot(true); this.maybeLevelUp();
  }

  rerollChoices() {
    if (this.state!=="levelup"||this.pathSelection||this.run.rerolls<=0) return;
    this.run.rerolls--; const old=this.lastChoiceKey; this.choices=this.rollChoices(old); this.ui.levelup(); this.saveSnapshot(true);
  }

  banishChoice(index) {
    if (this.state!=="levelup"||this.pathSelection||this.run.banishments<=0) return;
    const item=this.choices[index];
    if (!item||!["weapon","passive"].includes(item.kind)) return;
    const key=`${item.kind}:${item.id}`;
    if (!this.run.banned.includes(key)) this.run.banned.push(key);
    this.run.banishments--; this.choices=this.rollChoices(); this.ui.levelup(); this.saveSnapshot(true);
  }

  skipLevelUp() {
    if (this.state!=="levelup"||this.pathSelection||this.run.skips<=0) return;
    this.run.skips--; this.run.gold+=8; this.choices=[]; this.resume(); this.announce("Eco recusado","+8 ouro pela escolha de seguir sem melhoria."); this.ui.updateHUD(); this.saveSnapshot(true); this.maybeLevelUp();
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
      this.sound.play("evolve");
      this.announce(w.name,w.definition.evolvedDescription+(w.path?` · Caminho: ${WEAPON_PATHS[w.id][w.path].name}`:""));
    } else if (reward.upgrade) {
      const pending=this.applyUpgrade(reward.upgrade);
      if (pending) {
        this.pathSelection=true;
        this.choices=this.pathChoices(pending);
        this.setState("levelup");
        this.ui.updateHUD();
        this.saveSnapshot(true);
        this.ui.levelup();
        return;
      }
    }

    this.checkAchievements();
    this.resume();
    this.ui.updateHUD();
    this.saveSnapshot(true);
    this.maybeLevelUp();
  }

  checkAchievements() {
    if (this.mode==="test") return;
    let changed = false;

    for (const a of ACHIEVEMENTS) {
      if (a.modes && !a.modes.includes(this.mode)) continue;
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
    const baseBonus=this.run.completed?this.modeDef.completionBase:0;
    const rewardGold=Number.isFinite(this.run.completionGold)?this.run.completionGold:this.run.gold;
    const difficultyBonus=this.run.completed&&this.modeDef.rewardMultiplier>1
      ? Math.floor(rewardGold*(this.modeDef.rewardMultiplier-1)) : 0;
    this.run.bonus = baseBonus+difficultyBonus;
    this.run.difficultyBonus=difficultyBonus;

    this.run.score = Math.floor(
      this.run.kills*10 +
      this.run.time +
      this.run.totalDamage/100 +
      this.run.gold*5 +
      (this.run.completed?10000:0)
    );

    if (this.modeDef.savesProgress) {
      save.activeRun = null;
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

  debugSpawnStructure(type) {
    if (!DEBUG||!this.world||!STRUCTURE_DEFINITIONS[type]) return;
    const p=this.player,{cx,cy}=this.world.chunkCoords(p.x,p.y),key=this.world.chunkKey(cx,cy);
    let ch=this.world.chunks.get(key);if(!ch){ch=this.world.createChunk(cx,cy);this.world.chunks.set(key,ch);}
    const id=`${cx}:${cy}:${type}:debug${Date.now()}`;
    ch.structures.push({id,type,x:p.x+80,y:p.y,r:STRUCTURE_DEFINITIONS[type].r,hp:STRUCTURE_DEFINITIONS[type].hp||0,maxHp:STRUCTURE_DEFINITIONS[type].hp||0,used:false,destroyed:false,opened:false,angle:0,variant:0});
    this.world.update();
  }

  teleportChunk(cx,cy) {
    if (!DEBUG||!this.player||!Number.isFinite(cx)||!Number.isFinite(cy)) return;
    this.player.x=(Math.floor(cx)+.5)*CHUNK_SIZE;this.player.y=(Math.floor(cy)+.5)*CHUNK_SIZE;this.camera.x=this.player.x;this.camera.y=this.player.y;this.world?.update();
  }

  debugBossPhase(phase=3) {
    if(!DEBUG)return;const b=this.enemies.find(e=>!e.dead&&e.type==="boss");if(!b)return;
    const target=phase>=3?.28:phase===2?.58:.95;b.hp=Math.min(b.hp,b.maxHp*target);this.updateBossPhase(b);
  }

  debugKey(key) {
    if (!DEBUG||!this.run||this.run.settled) return;
    if(key==="F1")this.run.gold+=1000;
    if(key==="F2"){this.player.xp+=this.player.xpToNextLevel*3;this.maybeLevelUp();}
    if(key==="F3")this.spawn("boss",null,{...choose(BOSS_EVENTS),eventIndex:999});
    if(key==="F4"){this.clockRate=this.clockRate===1?5:this.clockRate===5?20:1;this.announce("Relógio "+this.clockRate+"×");}
    if(key==="F6")this.debug.god=!this.debug.god;
    if(key==="F7")this.debug.hitboxes=!this.debug.hitboxes;
    if(key==="F8")this.debug.stats=!this.debug.stats;
    if(key==="F9")this.addItem(this.weightedItem().id,3);
    if(key==="F10")this.debugSpawnStructure("exchange");
    if(key==="F11")this.debugSpawnStructure("urn");
    if(key==="F12"){this.saveSnapshot(true);this.announce("DEBUG","Snapshot salvo.");}
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
          blast:(w.evolved?90:0)*v.area*(v.mods.blast||1),
          pierce:v.mods.pierce||0
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
            if (w.path==="fracture" && Math.random()<.18) g.blast(e.x,e.y,24*v.area,v.damage*.28,w,0,0,{noStructure:true});
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
        : base+(i-(n-1)/2)*.14*(v.mods.spread||1);

      g.projectile(
        w,p.x,p.y,
        Math.cos(a)*560,
        Math.sin(a)*560,
        {
          damage:v.damage,
          r:5*v.area,
          pierce:w.evolved?50:2+Math.floor(w.level/2)+(v.mods.pierce||0),
          life:1.25*v.duration,
          kind:"needle",
          knock:85
        }
      );
    }
  },

  frost(g,w,v) {
    w.shots++;

    const slow=w.path==="rime"?2.7:1.5;
    const freeze=w.evolved?.65:(w.path==="crystal"&&Math.random()<.28?.48:0);
    g.blast(g.player.x,g.player.y,(w.evolved?135:76)*v.area,v.damage,w,slow,freeze);
  },

  chain(g,w,v) {
    const p = g.player;
    const hit = new Set();

    let x = p.x;
    let y = p.y;
    let count = Math.max(1,2+v.amount+(w.evolved?5:0)+(v.mods.jumps||0));

    w.shots++;

    while (count-->0) {
      const e = g.grid.nearest(
        x,y,
        hit.size?240*v.area*(v.mods.chainRange||1):750,
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
        Math.cos(angle)*310*(v.mods.speed||1),
        Math.sin(angle)*310*(v.mods.speed||1),
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
      "wave","gold","kills","weapons","passives","run-items",
      "boss-hud","boss-name","boss-phase","boss-fill","interaction-prompt","interaction-name","debug","toast"
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
    this.root.addEventListener("change",e=>this.onChange?.(e.target));

    document.getElementById("pause-button")
      .addEventListener("click",()=>g.pause());
    document.getElementById("interaction-button")
      .addEventListener("click",()=>{ g.sound.unlock(); g.interact(); });
    this.nodes["run-items"].addEventListener("click",e=>{
      const b=e.target.closest("button[data-run-item]");
      if (!b) return; g.sound.unlock(); g.useItem(Number(b.dataset.runItem));
    });
  }

  show(html,actions={},wide=false) {
    this.actions = actions;
    this.onInput = null;
    this.onChange = null;

    if (this.nodes?.["interaction-prompt"]) this.nodes["interaction-prompt"].hidden=true;
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
    this.onChange = null;
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
    const c=CHARACTER_DEFINITIONS[save.selected];
    const hasRun=validateRunSnapshot(save.activeRun,false);
    const run=hasRun?save.activeRun:null;
    this.show(`
      <div class="menu-top">
        <span class="eyebrow">ESTÚDIO DO LIMIAR · VOL. 01</span>
        <span class="gold">◈ ${fmt(save.gold)}</span>
      </div>
      <div class="hero">
        <div>
          <div class="eyebrow">UM SURVIVOR DE FANTASIA ARCANA</div>
          <h1 class="logo">LIMIAR<span>ECOS DO OBELISCO</span></h1>
          <p class="lede">A noite guarda o que você deixou para trás.<br>Quanto de você atravessa a névoa?</p>
          <div class="actions">
            ${hasRun?this.button("continue","CONTINUAR EXPEDIÇÃO",true):""}
            ${this.button("play",hasRun?"NOVA EXPEDIÇÃO":"INICIAR EXPEDIÇÃO ↗",!hasRun)}
          </div>
          ${hasRun?`<div class="run-summary">
            <span>ECO<b>${CHARACTER_DEFINITIONS[run.character].name}</b></span>
            <span>LIMIAR<b>${MAP_DEFINITIONS[run.mapId].name}</b></span>
            <span>EXPEDIÇÃO<b>${getModeDefinition(run.mode).name}</b></span>
            <span>TEMPO<b>${clock(run.time)}</b></span>
          </div>`:""}
          <div class="menu-grid">
            ${this.button("characters","Personagens e mapas")}
            ${this.button("meta","Melhorias permanentes")}
            ${this.button("achievements","Conquistas")}
            ${this.button("settings","Configurações")}
          </div>
        </div>
        <aside class="hero-seal">
          <div class="obelisk"><i></i></div>
          <span class="eyebrow">SEU PRÓXIMO ECO</span>
          <h2>${c.name}</h2><p>${c.title}</p>
          <span style="color:${c.color}">${c.icon} ${WEAPON_DEFINITIONS[c.weapon].name}</span>
        </aside>
      </div>
      <div class="records">
        <span>RECORDE <b>${fmt(save.highScore)}</b></span>
        <span>MAIOR TEMPO <b>${clock(save.bestTime)}</b></span>
        <span>MAIS BAIXAS <b>${fmt(save.bestKills)}</b></span>
        <span>TRAVESSIAS <b>${save.completed}</b></span>
      </div>
      <div class="footer">
        ${this.button("codex","Códice")}
        ${this.button("reset","Resetar progresso")}
        <small>v${VERSION} · ${storageAvailable?"SALVAMENTO LOCAL":"PROGRESSO TEMPORÁRIO"}</small>
      </div>
    `,{
      continue:()=>this.g.continueRun(),
      play:()=>hasRun?this.confirm("Iniciar uma nova expedição?","A run em andamento será apagada.",()=>{save.activeRun=null;saveGame();this.characters();},()=>this.main()):this.characters(),
      characters:()=>this.characters(),meta:()=>this.meta(),achievements:()=>this.achievements(),
      settings:()=>this.settings(()=>this.main()),codex:()=>this.codex(()=>this.main()),
      reset:()=>this.confirm("Resetar todo o progresso?","O ouro, as conquistas, melhorias e a expedição ativa serão apagados.",()=>{resetSave();this.main();},()=>this.main())
    },true);
  }

  characters() {
    this.show(
      this.head("PREPARE A TRAVESSIA","Escolha seu eco e seu limiar","Personagem, mapa e modo definem o início da expedição.")+`
      <h3>Eco</h3>
      <div class="cards characters">
        ${Object.entries(CHARACTER_DEFINITIONS).map(([id,c])=>{
          const unlocked=save.unlocked.includes(id);
          return `<button data-action="select" data-id="${id}" class="card ${save.selected===id?"selected":""} ${unlocked?"":"locked"}" ${unlocked?"":"disabled"}>
            <span class="sigil" style="color:${c.color}">${c.icon}</span>
            <small>${unlocked?(save.selected===id?"SELECIONADO":"DISPONÍVEL"):"BLOQUEADO"}</small>
            <h2>${c.name}</h2><p>${c.title}</p><strong>${WEAPON_DEFINITIONS[c.weapon].name}</strong><p>${c.bonus}</p><small>${c.condition}</small>
          </button>`;
        }).join("")}
      </div>
      <h3>Escolha o Limiar</h3>
      <div class="cards map-grid">
        ${Object.entries(MAP_DEFINITIONS).map(([id,m])=>`<button data-action="map" data-id="${id}" class="card map-card ${save.selectedMap===id?"selected":""}">
          <small>${save.selectedMap===id?"SELECIONADO":"DISPONÍVEL"}</small><span class="map-glyph">${m.icon}</span><h2>${m.name}</h2><p>${m.description}</p>
          <strong>${m.water?"Água rasa · rotas secas · fauna própria":"Ruínas · fendas · estruturas de pedra"}</strong>
        </button>`).join("")}
      </div>
      <div class="mode"><label for="run-mode">Expedição</label><select id="run-mode">
        ${Object.entries(MODE_DEFINITIONS).map(([id,m])=>`<option value="${id}" ${this.mode===id?"selected":""}>${m.label}</option>`).join("")}
      </select></div>
      <div class="run-summary">
        <span>ECO<b>${CHARACTER_DEFINITIONS[save.selected].name}</b></span>
        <span>LIMIAR<b>${MAP_DEFINITIONS[save.selectedMap].name}</b></span>
        <span>EXPEDIÇÃO<b>${getModeDefinition(this.mode).summary}</b></span>
      </div>
      <div class="actions">${this.button("start","ATRAVESSAR A NÉVOA",true)}${this.button("back","Voltar")}</div>
    `,{
      select:b=>{save.selected=b.dataset.id;saveGame();this.characters();},
      map:b=>{save.selectedMap=b.dataset.id;saveGame();this.characters();},
      start:()=>this.begin(),back:()=>this.main()
    },true);
    this.onInput=t=>{if(t.id==="run-mode"){this.mode=Object.hasOwn(MODE_DEFINITIONS,t.value)?t.value:"normal";this.characters();}};
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
            ${getModeDefinition(this.mode).endless
              ? "No <b>Infinito</b>, atravesse 30 minutos e sobreviva ao escalonamento além do Limiar."
              : "Sobreviva <b>30 minutos</b> para concluir a expedição."}
            No touch, arraste o dedo sobre a arena.
          </p>
          <p>
            <kbd>Esc</kbd> / <kbd>P</kbd> pausa. <kbd>E</kbd> interage.
            <kbd>1–4</kbd> usa itens durante a ação e escolhe melhorias no level-up.
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
          this.g.start(save.selected,this.mode,save.selectedMap);
        },
        back:()=>this.characters()
      });

      return;
    }

    this.g.start(save.selected,this.mode,save.selectedMap);
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

  exportSave() {
    if (this.g.run && !this.g.run.settled) this.g.saveSnapshot(true);
    const payload={
      schemaVersion:SAVE_SCHEMA,gameVersion:VERSION,exportedAt:new Date().toISOString(),
      progress:{...save,activeRun:undefined},activeRun:save.activeRun||null
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`limiar-save-${safeFileStamp()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    this.toast("Save exportado","Arquivo JSON gerado localmente.");
  }

  importSaveFile(file,back) {
    if (!file || file.size>2_000_000) { this.toast("Arquivo de save inválido","O arquivo excede o limite permitido."); return; }
    const reader=new FileReader();
    reader.onload=()=>{
      try {
        const data=JSON.parse(String(reader.result||""));
        if (!validateImportEnvelope(data)) throw new Error("invalid");
        const imported=migrateSave(data.progress);
        imported.activeRun=data.activeRun&&validateRunSnapshot(data.activeRun,false)?data.activeRun:null;
        this.confirm(
          "Importar este progresso?",
          "Importar este progresso substituirá o save atual deste navegador.",
          ()=>{ save=imported; saveGame(); this.toast("Save importado","Progresso validado e aplicado."); this.main(); },
          ()=>this.settings(back)
        );
      } catch { this.toast("Arquivo de save inválido","Nenhuma alteração foi feita no progresso atual."); }
    };
    reader.onerror=()=>this.toast("Arquivo de save inválido","Não foi possível ler o arquivo.");
    reader.readAsText(file);
  }

  settings(back) {
    const s=save.settings;
    const toggle=(key,label)=>`<label class="setting"><span>${label}</span><input data-setting="${key}" type="checkbox" ${s[key]?"checked":""}></label>`;
    this.show(
      this.head("PREFERÊNCIAS","Ajuste a atmosfera")+`
      <div class="settings">
        <label class="setting"><span>Volume geral</span><input data-setting="volume" type="range" min="0" max="1" step=".05" value="${s.volume}"></label>
        ${toggle("mute","Silenciar")}${toggle("sounds","Efeitos sonoros")}${toggle("shake","Tremor de tela")}${toggle("numbers","Números de dano")}
        <label class="setting"><span>Partículas</span><select data-setting="particles">
          ${[["auto","Automática"],["high","Alta"],["low","Reduzida"],["off","Desativadas"]].map(([v,t])=>`<option value="${v}" ${s.particles===v?"selected":""}>${t}</option>`).join("")}
        </select></label>
      </div>
      <p class="muted">Na qualidade automática, os efeitos diminuem quando a taxa de quadros cai. A simulação permanece a mesma.</p>
      <div class="save-actions">
        ${this.button("export","EXPORTAR SAVE")}${this.button("import","IMPORTAR SAVE")}
        <input id="save-import-file" type="file" accept="application/json,.json" hidden>
      </div>
      <div class="actions">${this.button("back","Voltar",true)}${this.button("sound","Testar som")}</div>
    `,{
      back,sound:()=>{this.g.sound.unlock();this.g.sound.play("level");},
      export:()=>this.exportSave(),
      import:()=>this.root.querySelector("#save-import-file")?.click()
    });
    this.onInput=t=>{
      const key=t.dataset.setting;if(!key||!Object.hasOwn(s,key))return;
      s[key]=t.type==="checkbox"?t.checked:t.type==="range"?Number(t.value):t.value;saveGame();
    };
    this.onChange=t=>{if(t.id==="save-import-file"&&t.files?.[0])this.importSaveFile(t.files[0],back);};
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
    const discovered=(kind,id)=>save.discovered?.[kind]?.includes(id);
    this.show(
      this.head("CÓDICE DO LIMIAR","O que a névoa já revelou","Armas e passivos são conhecidos; criaturas, itens e sinergias surgem conforme são encontrados.")+`
      <h3>Armas e evoluções</h3>
      <div class="cards meta">
        ${Object.entries(WEAPON_DEFINITIONS).map(([id,d])=>`<div class="card">
          <span class="sigil small" style="color:${d.color}">${d.icon}</span><h2>${d.name}</h2><p>${d.description}</p>
          <small>+ ${PASSIVE_DEFINITIONS[d.passive].name}</small><h3>${d.evolution}</h3><p>${d.evolvedDescription}</p>
          <p class="path-badge">${Object.values(WEAPON_PATHS[id]).map(x=>x.name).join(" · ")}</p>
        </div>`).join("")}
      </div>
      <h3>Passivos</h3>
      <div class="cards meta">${Object.values(PASSIVE_DEFINITIONS).map(d=>`<div class="card"><span class="sigil small">${d.icon}</span><h2>${d.name}</h2><p>${d.text}</p></div>`).join("")}</div>
      <h3>Itens</h3>
      <div class="cards meta">${Object.entries(ITEM_DEFINITIONS).map(([id,d])=>{const seen=discovered("items",id);return `<div class="card ${seen?"":"locked"}"><span class="sigil small">${seen?d.icon:"?"}</span><h2>${seen?d.name:"???"}</h2><small class="rarity-${d.rarity}">${seen?RARITY[d.rarity].name:"NÃO DESCOBERTO"}</small><p>${seen?d.text:"A névoa ainda guarda este objeto."}</p></div>`;}).join("")}</div>
      <h3>Inimigos</h3>
      <div class="cards meta">${Object.entries(ENEMY_DEFINITIONS).filter(([id])=>!["boss","final","shardling"].includes(id)).map(([id,d])=>{const seen=discovered("enemies",id);return `<div class="card ${seen?"":"locked"}"><span class="sigil small" style="color:${seen?d.color:"#65706b"}">${seen?"◆":"?"}</span><h2>${seen?d.name:"???"}</h2><p>${seen?`Comportamento: ${d.behavior}.`:"Ainda não encontrado."}</p></div>`;}).join("")}</div>
      <h3>Mapas</h3>
      <div class="cards map-grid">${Object.entries(MAP_DEFINITIONS).map(([id,m])=>`<div class="card"><span class="map-glyph">${m.icon}</span><h2>${m.name}</h2><p>${m.description}</p></div>`).join("")}</div>
      <h3>Sinergias</h3>
      <div class="cards meta">${Object.entries(SYNERGY_DEFINITIONS).map(([id,d])=>{const seen=discovered("synergies",id);return `<div class="card ${seen?"selected":"locked"}"><small>${seen?"DESCOBERTA":"???"}</small><h2>${seen?d.name:"???"}</h2><p>${seen?d.text:"Combine armas e efeitos para revelar."}</p></div>`;}).join("")}</div>
      <div class="actions">${this.button("back","Voltar")}</div>
    `,{back},true);
  }

  upgradeText(item) {
    const p=this.g.player;
    if (item.kind==="path") {
      const w=p.weapons.find(w=>w.id===item.weaponId),d=WEAPON_PATHS[item.weaponId][item.id];
      return {title:d.name,icon:w?.definition.icon||"◇",color:w?.definition.color||"#e9c48b",tag:"CAMINHO DE ESPECIALIZAÇÃO",text:d.text,foot:`${w?.name||WEAPON_DEFINITIONS[item.weaponId].name} · permanece após evolução`};
    }
    if (item.kind==="weapon") {
      const d=WEAPON_DEFINITIONS[item.id],w=p.weapons.find(w=>w.id===item.id);
      return {title:d.name,icon:d.icon,color:d.color,tag:w?`ARMA · ${w.level} → ${w.level+1}`:"NOVA ARMA",
        text:w?"Mais dano, área e frequência. "+((w.level+1)===4&&!w.path?"No nível 4, escolha um caminho de especialização.":(w.level+1)%3===0?"Ataques compatíveis ganham +1 unidade.":""):d.description,
        foot:`Evolução: ${PASSIVE_DEFINITIONS[d.passive].name}${w?.path?` · ${WEAPON_PATHS[w.id][w.path].name}`:""}`};
    }
    if (item.kind==="passive") {
      const d=PASSIVE_DEFINITIONS[item.id],n=p.passives[item.id]||0;
      return {title:d.name,icon:d.icon,color:"#87d7bf",tag:n?`PASSIVO · ${n} → ${n+1}`:"NOVO PASSIVO",text:d.text,foot:`Máximo: nível ${d.max}`};
    }
    const alternatives={heal:["Seiva fresca","♥","Recupere 35 de vida."],gold:["Bolsa de ecos","◈","Receba 25 de ouro."],buff:["Pulso de âmbar","✷","Fortaleça seus ataques por 12 segundos."],magnet:["Ressonância","⌖","Atraia todos os cristais no mundo."]};
    const a=alternatives[item.id];
    return {title:a[0],icon:a[1],color:"#e9c48b",tag:"RECOMPENSA",text:a[2],foot:"Efeito imediato"};
  }

  levelup() {
    const path=this.g.pathSelection;
    this.show(
      this.head(path?"ESPECIALIZAÇÃO":`NÍVEL ${this.g.player.level}`,path?"Escolha um caminho":"Subiu de nível",path?"Esta decisão altera o comportamento da arma e permanecerá após a evolução.":"O próximo eco é uma escolha sua. A partida está pausada.")+`
      <div class="cards choices">
        ${this.g.choices.map((o,i)=>{const d=this.upgradeText(o);return `<button class="card choice" data-action="pick" data-index="${i}">
          <small>${i+1} · ${d.tag}</small><span class="sigil" style="color:${d.color}">${d.icon}</span><h2>${d.title}</h2><p>${d.text}</p><footer>${d.foot}</footer>
        </button>`;}).join("")}
      </div>
      ${path?"":`<div class="level-controls">
        <button data-action="reroll" ${this.g.run.rerolls<=0?"disabled":""}>↻ REROLL ${this.g.run.rerolls}</button>
        <button data-action="skip" ${this.g.run.skips<=0?"disabled":""}>→ PULAR ${this.g.run.skips}</button>
        <span class="muted">⊘ BANIR ${this.g.run.banishments}</span>
      </div>
      <div class="banish-row">${this.g.choices.map((o,i)=>`<button data-action="banish" data-index="${i}" ${this.g.run.banishments<=0||!["weapon","passive"].includes(o.kind)?"disabled":""}>Banir ${i+1}</button>`).join("")}</div>`}
      <p class="muted">Clique em uma opção ou use as teclas 1–4.</p>
    `,{
      pick:b=>this.g.pickUpgrade(Number(b.dataset.index)),reroll:()=>this.g.rerollChoices(),skip:()=>this.g.skipLevelUp(),banish:b=>this.g.banishChoice(Number(b.dataset.index))
    },true);
  }

  itemOverflow() {
    const pending=this.g.pendingItem,d=ITEM_DEFINITIONS[pending.id];
    this.show(
      this.head("INVENTÁRIO CHEIO","Algo precisa ficar para trás",`${d.name} ×${pending.qty} não cabe nos quatro quick slots.`)+`
      <div class="cards choices">
        ${this.g.run.inventory.map((slot,i)=>{const x=slot&&ITEM_DEFINITIONS[slot.id];return `<button class="card" data-action="replace" data-index="${i}"><small>SUBSTITUIR SLOT ${i+1}</small><span class="sigil small">${x?.icon||"·"}</span><h2>${x?.name||"Vazio"}</h2><p>${slot?`Quantidade: ${slot.qty}`:"Slot disponível"}</p></button>`;}).join("")}
      </div><div class="actions">${this.button("discard","DESCARTAR NOVO ITEM",true)}</div>
    `,{replace:b=>this.g.replaceInventorySlot(Number(b.dataset.index)),discard:()=>this.g.discardPendingItem()},true);
  }

  structureInteraction(s) {
    const d=STRUCTURE_DEFINITIONS[s.type];
    if (!d) return;
    let text="",accept="USAR";
    if (s.type==="fountain") { text="Recuperar 42% da vida máxima? A fonte secará depois do uso."; accept="BEBER DA FONTE"; }
    if (s.type==="exchange") { text="Sacrificar 25% da vida atual para receber uma melhoria rara? O sacrifício não pode matar você."; accept="ACEITAR TROCA"; }
    if (s.type==="memory") { text="Entregar 35 ouro para converter memória em experiência?"; accept="OFERECER OURO"; }
    if (s.type==="rift_altar") { text="Abrir a fenda e invocar quatro elites em troca de um baú enriquecido?"; accept="ABRIR A FENDA"; }
    if (s.type==="silence") { text="Silenciar as aparições por 20 segundos e aceitar uma onda intensa logo depois?"; accept="ACEITAR O SILÊNCIO"; }
    if (s.type==="chest") { text="Abrir este cofre consome uma Chave Basáltica. Ele contém ouro, reroll e relíquias."; accept="ABRIR COFRE"; }
    if (s.type==="obelisk") { text="Tocar o fragmento concede fortuna temporária e uma nova chance de reroll."; accept="TOCAR O OBELISCO"; }
    this.g.setState("interaction");
    this.show(this.head("ESTRUTURA ENCONTRADA",d.name,text)+`<div class="actions">${this.button("accept",accept,true)}${this.button("decline","RECUSAR")}</div>`,{
      accept:()=>this.g.resolveStructure(s,true),decline:()=>this.g.resolveStructure(s,false)
    });
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
          Encerre a expedição com vitória e <b>${this.g.modeDef.name==="Pesadelo"?"250 de ouro + 25% do ouro coletado":"250 de ouro extra"}</b>,
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
        `${g.modeDef.hud} · ${g.mode==="test"
          ? "recompensas e recordes não salvos"
          : "Expedição contabilizada"
        }${!storageAvailable?" · Armazenamento indisponível":""}`
      ) + `
      <div class="result-grid">
        <span>TEMPO<b>${clock(r.time)}</b></span>
        <span>NÍVEL<b>${p.level}</b></span>
        <span>INIMIGOS<b>${fmt(r.kills)}</b></span>
        <span>CHEFES<b>${fmt(r.bossKills)}</b></span>
        <span>EVOLUÇÕES<b>${fmt(r.evolutions)}</b></span>
        <span>OURO<b>${fmt(r.gold+r.bonus)}</b></span>
        <span>DANO TOTAL<b>${fmt(r.totalDamage)}</b></span>
        <span>PONTUAÇÃO<b>${fmt(r.score)}</b></span>
      </div>

      <p class="muted">
        Arma com mais dano: <b>${top.name}</b>
        ${r.bonus?` · Bônus de conclusão: ${r.bonus} ouro${r.difficultyBonus?` (${r.difficultyBonus} do Pesadelo)`:""}`:""}.
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
      again:()=>g.start(p.character,g.mode,r.mapId),
      menu:()=>g.menu()
    },true);
  }

  updateHUD() {
    const g=this.g,p=g.player,r=g.run;if(!p||!r)return;
    const n=this.nodes;
    n["hp-fill"].style.width=`${100*p.health/p.maxHealth}%`;
    n["hp-text"].textContent=`${Math.ceil(p.health)} / ${p.maxHealth}`;
    n["xp-fill"].style.width=`${clamp(100*p.xp/p.xpToNextLevel,0,100)}%`;
    n.level.textContent="NV. "+p.level;n.timer.textContent=clock(r.time);
    const event=r.event==="deep_fog"?" · NÉVOA PROFUNDA":r.surgeTime>0?" · CÉU PARTIDO":"";
    const phase=g.modeDef.endless&&r.time>=g.modeDef.endlessStart?"ALÉM DO LIMIAR":WAVE_TABLE[g.director.index].name;
    const modeTag=g.mode==="normal"?"":g.mode==="test"?`TESTE ${g.clockRate}× · `:`${g.modeDef.hud} · `;
    n.wave.textContent=modeTag+phase+(p.buff>0?" · ÂMBAR":"")+(p.inWater?" · ÁGUA RASA":"")+event;
    n.gold.textContent=fmt(r.gold);n.kills.textContent=fmt(r.kills);

    const key=p.weapons.map(w=>`${w.id}:${w.level}:${w.evolved}:${w.path||"-"}`).join("|")+JSON.stringify(p.passives)+JSON.stringify(r.inventory);
    if(this.slotKey!==key){
      this.slotKey=key;
      n.weapons.innerHTML=Array.from({length:6},(_,i)=>{const w=p.weapons[i];return w?`<span class="slot ${w.evolved?"evolved":""}" style="color:${w.definition.color}" title="${esc(w.name+" · "+(w.evolved?"Evoluída":"Nível "+w.level)+(w.path?" · "+WEAPON_PATHS[w.id][w.path].name:""))}">${w.definition.icon}<b>${w.evolved?"✦":w.level}</b></span>`:`<span class="slot empty">·</span>`;}).join("");
      const passives=Object.entries(p.passives);
      n.passives.innerHTML=Array.from({length:6},(_,i)=>{const o=passives[i];return o?`<span class="slot passive" title="${esc(PASSIVE_DEFINITIONS[o[0]].name)}">${PASSIVE_DEFINITIONS[o[0]].icon}<b>${o[1]}</b></span>`:`<span class="slot empty">·</span>`;}).join("");
      n["run-items"].innerHTML=Array.from({length:RUN_INVENTORY_SLOTS},(_,i)=>{const slot=r.inventory[i],d=slot&&ITEM_DEFINITIONS[slot.id];return d?`<button class="item-slot item-${d.rarity}" data-run-item="${i}" title="${esc(d.name+" · "+d.text)}" aria-label="Usar ${esc(d.name)}"><span class="key">${i+1}</span><span class="item-icon" style="color:${RARITY[d.rarity].color}">${d.icon}</span><b>×${slot.qty}</b></button>`:`<span class="item-slot empty"><span class="key">${i+1}</span><span class="item-icon">·</span></span>`;}).join("");
    }

    const boss=g.enemies.find(e=>!e.dead&&(e.type==="boss"||e.type==="final"));
    n["boss-hud"].hidden=!boss;
    if(boss){
      n["boss-name"].textContent=boss.name;
      const names=BOSS_PHASES[boss.name]||BOSS_PHASES.default;
      n["boss-phase"].textContent=names[(boss.bossPhase||1)-1]||`FASE ${boss.bossPhase||1}`;
      n["boss-fill"].style.width=`${100*boss.hp/boss.maxHp}%`;
    }

    const interactive=g.state==="playing"&&g.world?.interactive;
    n["interaction-prompt"].hidden=!interactive;
    if(interactive)n["interaction-name"].textContent=STRUCTURE_DEFINITIONS[g.world.interactive.type].name.toUpperCase();

    n.debug.hidden=!g.debug.stats;
    if(g.debug.stats){
      n.debug.textContent=`FPS ${Math.round(g.fps)} | Enemies ${g.enemies.length} | Projectiles ${g.bullets.items.length}\n`+
        `Particles ${g.particles.items.length} | Pickups ${g.gems.length+g.pickups.length} | Areas ${g.areas.length}\n`+
        `Structures ${g.world?.nearby.length||0} | Chunks ${g.world?.chunks.size||0} | Interactive ${g.world?.countInteractive()||0}\n`+
        `Spatial cells ${g.grid.cells.size} | Mode ${g.modeDef.name} | Seed ${r.worldSeed} | ${g.clockRate}× ${g.debug.god?"INVENCÍVEL":""}`;
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

        const areaColor=a.enemy?(a.kind==="web"?"#79b7aa":"#c07395"):a.w.definition.color;
        c.fillStyle = areaColor;
        c.strokeStyle = areaColor;

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

      for (const s of g.world?.nearby||[]) this.structure(s,g.run.simTime);

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

    if (p && g.run?.event==="deep_fog") {
      const grd=c.createRadialGradient(g.width/2,g.height/2,Math.min(g.width,g.height)*.2,g.width/2,g.height/2,Math.max(g.width,g.height)*.72);
      grd.addColorStop(0,"#0c181d00"); grd.addColorStop(1,"#061016c9");
      c.fillStyle=grd; c.fillRect(0,0,g.width,g.height);
    }

    if (g.state==="playing" && p.health/p.maxHealth<.25) {
      c.strokeStyle = "#c8516266";
      c.lineWidth = 14;
      c.strokeRect(0,0,g.width,g.height);
    }
  }

  terrain() {
    const g=this.g,c=this.c;
    const left=g.camera.x-g.viewW/2-30,top=g.camera.y-g.viewH/2-30;
    const map=g.world?.map;
    c.fillStyle=map?.palette?.floor||map?.floor||this.floor||"#101e24";
    c.fillRect(left,top,g.viewW+60,g.viewH+60);

    if (map?.water) {
      const cell=220;
      const minX=Math.floor(left/cell)-1,maxX=Math.ceil((left+g.viewW+60)/cell)+1;
      const minY=Math.floor(top/cell)-1,maxY=Math.ceil((top+g.viewH+60)/cell)+1;
      for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++){
        const x=cx*cell,y=cy*cell;
        if(!g.world.isWater(x+cell*.2,y+cell*.2)&&!g.world.isWater(x+cell*.8,y+cell*.8))continue;
        c.fillStyle=(map.palette?.water||"#153b40")+"45";c.fillRect(x,y,cell,cell);
        const hash=hashString(`${g.run.worldSeed}|water|${cx}|${cy}`);
        if(hash%3===0){
          c.strokeStyle="#6fa3a31d";c.lineWidth=1;
          c.beginPath();
          const rippleY=y+cell*.52+Math.sin(g.run.simTime*.55+(hash%17))*4;
          c.moveTo(x+45,rippleY);c.lineTo(x+cell-45,rippleY+Math.cos(g.run.simTime*.45+cy)*3);c.stroke();
        }
      }
    }

    const cell=560;
    const density=map?.terrainDensity??.5;
    const minX=Math.floor(left/cell)-1,maxX=Math.ceil((left+g.viewW+60)/cell)+1;
    const minY=Math.floor(top/cell)-1,maxY=Math.ceil((top+g.viewH+60)/cell)+1;
    for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++){
      const hash=hashString(`${g.run?.worldSeed||"menu"}|terrain|${g.world?.mapId||"ruins"}|${cx}|${cy}`);
      if((hash%100)>=Math.round(18*density))continue;
      const px=cx*cell+90+((hash>>>4)%(cell-180));
      const py=cy*cell+90+((hash>>>12)%(cell-180));
      const kind=(hash>>>20)%3;
      c.save();
      c.globalAlpha=map?.water ? .18 : .22;
      c.strokeStyle=map?.palette?.accent||"#71998b";
      c.fillStyle="#26383b";
      c.lineWidth=1;
      if(kind===0){
        c.beginPath();c.ellipse(px,py,48,17,(hash%31)/31,0,TAU);c.stroke();
        c.beginPath();c.ellipse(px+8,py-2,25,8,(hash%19)/19,0,TAU);c.stroke();
      }else if(kind===1){
        this.polygon(px,py,22,4,Math.PI/4);c.stroke();
        this.polygon(px+34,py+10,11,5,0);c.stroke();
      }else{
        c.beginPath();c.moveTo(px-34,py+12);c.lineTo(px-7,py-14);c.lineTo(px+18,py+3);c.lineTo(px+43,py-18);c.stroke();
      }
      c.restore();
    }

    if (g.debug.chunks && g.world) {
      c.strokeStyle="#8fd0b755";c.lineWidth=1;c.font="11px monospace";c.fillStyle="#bfe6d0";
      for(const ch of g.world.chunks.values()){
        const x=ch.cx*CHUNK_SIZE,y=ch.cy*CHUNK_SIZE;c.strokeRect(x,y,CHUNK_SIZE,CHUNK_SIZE);c.fillText(`${ch.cx},${ch.cy}`,x+8,y+16);
      }
    }
  }

  structure(s,time) {
    const g=this.g,c=this.c,d=STRUCTURE_DEFINITIONS[s.type];if(!d)return;
    if(!this.visible(s.x,s.y,s.r+30)){
      if(!d.rare)return;
      const x=clamp(s.x,g.camera.x-g.viewW/2+42,g.camera.x+g.viewW/2-42);
      const y=clamp(s.y,g.camera.y-g.viewH/2+125,g.camera.y+g.viewH/2-90);
      c.fillStyle="#e9d093";c.font="13px Georgia";c.textAlign="center";c.fillText("◇",x,y);
      c.font="9px system-ui";c.fillText(`${Math.round(Math.hypot(s.x-g.player.x,s.y-g.player.y))}m`,x,y+12);c.textAlign="left";return;
    }
    c.save();c.translate(s.x,s.y);c.rotate((s.angle||0)+(s.type==="rift"?time*.08:0));
    const gameplayAlpha=d.kind==="HAZARD"?1:d.interactive?.95:d.destructible?.76:s.type==="platform"?.58:d.collidable?.56:.38;
    c.globalAlpha=(s.used||s.opened)?gameplayAlpha*.46:gameplayAlpha;
    c.fillStyle="#07111688";c.beginPath();c.ellipse(5,s.r*.7,s.r*.9,s.r*.35,0,0,TAU);c.fill();
    c.strokeStyle=d.color;c.fillStyle=d.color;c.lineWidth=1.5;
    if(s.type==="urn"){
      c.beginPath();c.moveTo(-10,-12);c.quadraticCurveTo(-17,4,-11,15);c.lineTo(11,15);c.quadraticCurveTo(17,4,10,-12);c.closePath();c.fill();c.fillStyle="#1b2b2c";c.fillRect(-8,-15,16,5);
    } else if(["column","wall","stone","ruin"].includes(s.type)){
      this.polygon(0,0,s.r,s.type==="wall"?4:6,s.angle||0);c.fill();c.stroke();c.fillStyle="#1b3033";this.polygon(-3,-5,s.r*.55,5,0);c.fill();
    } else if(s.type==="tree"){
      c.fillStyle="#263d36";c.fillRect(-4,-5,8,25);c.fillStyle=d.color;this.polygon(0,-16,s.r,5,time*.03+s.variant);c.fill();
    } else if(s.type==="platform"){
      c.fillStyle="#405456aa";c.strokeStyle="#71868877";c.beginPath();c.ellipse(0,0,s.r*1.25,s.r*.72,0,0,TAU);c.fill();c.stroke();
      c.strokeStyle="#88aaa655";for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(-s.r,i*12);c.lineTo(s.r,i*12);c.stroke();}
    } else if(s.type==="fountain"){
      c.strokeStyle=d.color;c.lineWidth=3;this.circle(0,0,s.r);c.stroke();c.fillStyle=s.used?"#293b39":"#4e9a8277";this.circle(0,0,s.r*.67);c.fill();c.fillStyle="#d8f4db";c.font="18px Georgia";c.textAlign="center";c.fillText(s.used?"·":"✚",0,6);
    } else if(["exchange","memory","rift_altar","silence"].includes(s.type)){
      this.polygon(0,0,s.r,6,Math.PI/6);c.fill();c.stroke();c.fillStyle="#14252c";this.polygon(0,0,s.r*.68,6,0);c.fill();c.fillStyle=d.color;c.font="20px Georgia";c.textAlign="center";c.fillText(s.type==="exchange"?"↔":s.type==="memory"?"◈":s.type==="rift_altar"?"✧":"○",0,7);
    } else if(s.type==="chest"){
      c.fillStyle="#493e33";c.fillRect(-18,-10,36,24);c.strokeRect(-18,-10,36,24);c.fillStyle=d.color;c.fillRect(-3,-3,6,9);c.beginPath();c.arc(0,-10,18,Math.PI,TAU);c.stroke();
    } else if(s.type==="obelisk"){
      c.fillStyle="#34514d";c.beginPath();c.moveTo(0,-38);c.lineTo(17,19);c.lineTo(0,29);c.lineTo(-17,19);c.closePath();c.fill();c.stroke();c.strokeStyle="#9edcc177";c.beginPath();c.moveTo(0,-26);c.lineTo(0,13);c.stroke();
    } else if(s.type==="rift"||s.type==="thorn"){
      c.globalAlpha=.35+.15*Math.sin(time*4+s.variant);c.fillStyle=d.color;this.circle(0,0,s.r);c.fill();c.globalAlpha=.9;c.strokeStyle=d.color;this.circle(0,0,s.r*(.72+.08*Math.sin(time*5)));c.stroke();
      if(s.type==="thorn"){for(let i=0;i<7;i++){const a=i/7*TAU;c.beginPath();c.moveTo(Math.cos(a)*10,Math.sin(a)*10);c.lineTo(Math.cos(a)*s.r,Math.sin(a)*s.r);c.stroke();}}
    }
    c.restore();
    if(g.debug.structureIds){c.fillStyle="#fff";c.font="9px monospace";c.fillText(s.id,s.x-s.r,s.y-s.r-6);}
    if(g.debug.collisions&&d.collidable){c.strokeStyle="#ff8a8a";this.circle(s.x,s.y,s.r);c.stroke();}
  }

  player(p,time) {
    const c=this.c,g=this.g,def=CHARACTER_DEFINITIONS[p.character],color=def.color;
    const moving=Math.abs(p.dx)+Math.abs(p.dy)>.01;
    const bob=moving?Math.sin(time*10)*1.8:Math.sin(time*3)*.8;
    c.fillStyle="#020b10aa";c.beginPath();c.ellipse(p.x,p.y+16,18,8,0,0,TAU);c.fill();
    if(p.invulnerable>0&&Math.floor(time*16)%2===0)c.globalAlpha=.45;
    if(p.hurtFlash>0)c.globalAlpha=.58;
    if(p.buff>0){c.strokeStyle="#f6d093";c.lineWidth=2;this.circle(p.x,p.y,25+Math.sin(time*6)*3);c.stroke();}
    c.save();c.translate(p.x,p.y+bob);
    c.fillStyle="#19353a";c.strokeStyle=color;c.lineWidth=2;
    if(p.character==="nara"){
      c.beginPath();c.moveTo(0,-18);c.lineTo(15,15);c.lineTo(0,9);c.lineTo(-15,15);c.closePath();c.fill();c.stroke();
      c.fillStyle=color;this.polygon(0,-9,9,4,Math.PI/4);c.fill();
      c.strokeStyle="#ffbd86";c.beginPath();c.moveTo(-11,8);c.quadraticCurveTo(-18,3+Math.sin(time*6)*3,-12,-8);c.stroke();
    } else if(p.character==="orin"){
      c.beginPath();c.arc(0,-3,14,Math.PI*.1,Math.PI*.9);c.lineTo(11,15);c.lineTo(-11,15);c.closePath();c.fill();c.stroke();
      c.strokeStyle=color;for(let i=0;i<3;i++){this.circle(0,-4,7+i*5+Math.sin(time*2+i));c.stroke();}
    } else if(p.character==="ivo"){
      c.beginPath();c.moveTo(0,-19);c.lineTo(13,-2);c.lineTo(9,16);c.lineTo(-9,16);c.lineTo(-13,-2);c.closePath();c.fill();c.stroke();
      c.fillStyle=color;this.polygon(0,-7,8,6,time*.5);c.fill();
      c.strokeStyle=color;c.beginPath();c.moveTo(-17,-2);c.lineTo(-9,-2);c.moveTo(9,-2);c.lineTo(17,-2);c.stroke();
    } else {
      c.beginPath();c.moveTo(0,-20);c.lineTo(14,12);c.lineTo(0,17);c.lineTo(-14,12);c.closePath();c.fill();c.stroke();
      c.strokeStyle=color;this.circle(0,-7,9);c.stroke();c.fillStyle=color;for(let i=0;i<3;i++){const a=time*.45+i/3*TAU;this.circle(Math.cos(a)*11,-7+Math.sin(a)*6,2.2);c.fill();}
    }
    c.fillStyle="#13242d";c.fillRect(-5,-10,10,5);c.fillStyle="#ffedca";c.fillRect(-4+p.dx*2,-9,3,2);c.fillRect(2+p.dx*2,-9,3,2);
    c.restore();c.globalAlpha=1;
    if(g.debug.hitboxes){c.strokeStyle="#fff";this.circle(p.x,p.y,p.r);c.stroke();c.strokeStyle="#7ecab4";this.circle(p.x,p.y,p.stats.pickupRange);c.stroke();}
  }

  enemy(e,time) {
    const c=this.c,special=e.type==="boss"||e.type==="final";
    const angle=e.type==="swarm"?time*2:-Math.PI/2;
    if(e.behavior==="burrow"&&e.burrow)c.globalAlpha=.28;
    c.fillStyle="#030b1088";c.beginPath();c.ellipse(e.x,e.y+e.r*.8,e.r,e.r*.45,0,0,TAU);c.fill();
    c.fillStyle=e.flash>0?"#fff2d2":hasStatus(e,"freeze")?"#bee9f2":e.color;
    c.strokeStyle=special?"#ffdec0":"#23323d";c.lineWidth=special?3:1.5;
    this.polygon(e.x,e.y,e.r,e.shape,angle+(special?(e.bossPhase-1)*.08:0));c.fill();c.stroke();
    c.fillStyle="#14252c";this.polygon(e.x,e.y,e.r*.66,e.shape,-angle);c.fill();
    c.fillStyle=e.color;this.polygon(e.x,e.y-2,e.r*.25,3,time*.3);c.fill();
    if(e.name==="A Catedral Errante"&&special){
      c.strokeStyle=e.bossPhase>=3?"#ffe2af":"#d7a7a1";c.lineWidth=2;
      const towers=e.bossPhase===1?4:e.bossPhase===2?3:2;
      for(let i=0;i<towers;i++){
        const a=-Math.PI*.82+i/(Math.max(1,towers-1))*Math.PI*.64;
        c.beginPath();c.moveTo(e.x+Math.cos(a)*e.r*.45,e.y+Math.sin(a)*e.r*.45);
        c.lineTo(e.x+Math.cos(a)*e.r*1.12,e.y+Math.sin(a)*e.r*1.12);c.stroke();
      }
      if(e.bossPhase>=2){c.strokeStyle="#efb1a788";c.beginPath();c.moveTo(e.x-e.r*.65,e.y-e.r*.35);c.lineTo(e.x+e.r*.55,e.y+e.r*.28);c.stroke();}
      if(e.bossPhase>=3){c.fillStyle="#fff0bf";this.circle(e.x,e.y,e.r*.18+Math.sin(time*7)*2);c.fill();}
    }

    if(e.behavior==="sentinel"&&e.shield>0){c.strokeStyle="#aee9ef";c.lineWidth=4;c.beginPath();c.arc(e.x,e.y,e.r+8,-Math.PI*.75,Math.PI*.75);c.stroke();}
    if(e.behavior==="herald"){c.strokeStyle="#d0af7750";c.lineWidth=1;this.circle(e.x,e.y,55+Math.sin(time*3)*5);c.stroke();c.font="15px Georgia";c.fillStyle="#ead29b";c.fillText("✧",e.x-5,e.y+5);}
    if(e.behavior==="weaver"){c.strokeStyle="#76aaa477";for(let i=0;i<3;i++){const a=time+i*TAU/3;c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(a)*e.r*1.5,e.y+Math.sin(a)*e.r*1.5);c.stroke();}}
    if(e.behavior==="charger"&&e.charge>0){c.strokeStyle="#ff8f86";c.lineWidth=2;this.circle(e.x,e.y,e.r+5);c.stroke();}
    if(hasStatus(e,"burn")){c.fillStyle="#ffac75";c.fillRect(e.x-2,e.y-e.r-8,4,5);}
    if(hasStatus(e,"mark")){c.strokeStyle="#c6b7ff";this.polygon(e.x,e.y,e.r+5,4,Math.PI/4);c.stroke();}

    c.fillStyle="#ffdebc";c.fillRect(e.x-e.r*.36,e.y-e.r*.13,3,3);c.fillRect(e.x+e.r*.18,e.y-e.r*.13,3,3);
    if(e.type==="elite"||special){
      c.strokeStyle=e.color;c.lineWidth=1;this.circle(e.x,e.y,e.r+7+Math.sin(time*3)*2+(special?(e.bossPhase-1)*3:0));c.stroke();
      if(special&&e.bossPhase>=2){c.strokeStyle=e.bossPhase===3?"#ffe3b8":"#eeb5ae";this.circle(e.x,e.y,e.r+13+Math.sin(time*4)*3);c.stroke();}
      c.fillStyle="#102129";c.fillRect(e.x-e.r,e.y-e.r-15,e.r*2,4);c.fillStyle=e.color;c.fillRect(e.x-e.r,e.y-e.r-15,e.r*2*e.hp/e.maxHp,4);
    }
    if(e.wind>0){
      c.strokeStyle="#f6b7ac";c.globalAlpha=.65;c.lineWidth=2;
      if(e.behavior==="ranged"||e.behavior==="charger"||e.pattern==="charge"){c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+e.aimX*320,e.y+e.aimY*320);c.stroke();}
      else {this.circle(e.x,e.y,e.r+28+Math.sin(time*8)*4);c.stroke();}
      c.globalAlpha=1;
    }
    c.globalAlpha=1;
    if(this.g.debug.hitboxes){c.strokeStyle="#ff7286";this.circle(e.x,e.y,e.r);c.stroke();}
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

    const itemDef=item.type==="item"?ITEM_DEFINITIONS[item.itemId]:null;
    const symbols = {gold:"◈",heal:"♥",magnet:"⌖",bomb:"✹",buff:"✷",chest:"⬡",item:itemDef?.icon||"◇"};
    const colors = {gold:"#dfbd78",heal:"#9ad9ac",magnet:"#a6c9ed",bomb:"#e9a4a0",buff:"#dfbcff",chest:"#ffe0a1",item:itemDef?RARITY[itemDef.rarity].color:"#d9d2bd"};

    c.fillStyle = "#0b171dc0";
    this.circle(item.x,item.y,13);
    c.fill();

    c.fillStyle = colors[item.type];
    c.textAlign = "center";
    c.font = `${item.type==="chest"?28:item.type==="item"?22:20}px Georgia`;

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
      ITEM_DEFINITIONS,
      STRUCTURE_DEFINITIONS,
      MAP_DEFINITIONS,
      WEAPON_PATHS,
      SYNERGY_DEFINITIONS,
      STATUS_DEFINITIONS,
      MODE_DEFINITIONS,
      WAVE_TABLE,
      Weapon,
      Player,
      SpatialGrid,
      loadSave,
      saveGame,
      resetSave,
      debug:{
        spawnItem:id=>game.addItem(id||game.weightedItem().id),
        spawnAltar:type=>game.debugSpawnStructure(type||"exchange"),
        spawnUrn:()=>game.debugSpawnStructure("urn"),
        spawnBoss:name=>{const e=BOSS_EVENTS.find(x=>x.name===name)||BOSS_EVENTS[0];return game.spawn("boss",null,{...e,eventIndex:999});},
        bossPhase:n=>game.debugBossPhase(n),
        rerolls:n=>game.run.rerolls+=Number(n)||1,
        fillInventory:()=>Object.keys(ITEM_DEFINITIONS).slice(0,4).forEach(id=>game.addItem(id,ITEM_DEFINITIONS[id].maxStack)),
        teleport:(cx,cy)=>game.teleportChunk(cx,cy),
        chunks:v=>game.debug.chunks=v??!game.debug.chunks,
        structureIds:v=>game.debug.structureIds=v??!game.debug.structureIds,
        collisions:v=>game.debug.collisions=v??!game.debug.collisions,
        startSeed:seed=>game.start(save.selected,"test",save.selectedMap,String(seed)),
        saveSnapshot:()=>game.saveSnapshot(true),
        loadSnapshot:()=>game.continueRun(),
        modeScaling:(mode,time)=>getModeScaling(mode,time)
      },
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
