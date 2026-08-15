'use strict';
/* ============================================================
   GangCity — оригинална top-down екшън игра в отворен град,
   вдъхновена от класиките на жанра (1997), с модерни подобрения:
   плавна физика, ден/нощ, минимапа, мисии, тъч контроли.
   Без каквито и да е чужди активи — целият код и графика са
   генерирани процедурно.
   ============================================================ */

// ---------------- Константи ----------------
const TILE = 48;              // размер на плочка в пиксела
const MW = 64, MH = 64;       // карта в плочки
const BLOCK = 8;              // период на уличната мрежа
const T = { GRASS: 0, ROAD: 1, SIDE: 2, BUILD: 3, WATER: 4, PARK: 5 };

const DAY_LENGTH = 150;       // секунди за пълен цикъл ден/нощ

// Посоки: 0=изток, 1=юг, 2=запад, 3=север (ъгли в радиани)
const DIR_ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// ---------------- Помощни ----------------
let seed = 1337;
function rnd() { // детерминистичен генератор за картата
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const R = Math.random;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function fmtMoney(n) { return '$' + n.toLocaleString('en-US'); }

// ---------------- Платно ----------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.round(VW * DPR);
  canvas.height = Math.round(VH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---------------- Генериране на града ----------------
const map = new Uint8Array(MW * MH);
const blockColor = {};   // цвят на сграда за всеки блок
function isRoadRow(y) { const m = y % BLOCK; return m === 3 || m === 4; }
function isRoadCol(x) { const m = x % BLOCK; return m === 3 || m === 4; }
function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return T.WATER;
  return map[ty * MW + tx];
}
function tileAtPx(x, y) { return tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); }

(function genCity() {
  const BUILD_PALETTE = ['#8a6d5c', '#7d7f8a', '#9c8468', '#6e7d6b', '#8d7390', '#a08a72', '#75808f', '#94766a'];
  const blockType = {};
  for (let by = 0; by < MH / BLOCK; by++) {
    for (let bx = 0; bx < MW / BLOCK; bx++) {
      const r = rnd();
      blockType[bx + ',' + by] = r < 0.18 ? 'park' : 'build';
      blockColor[bx + ',' + by] = BUILD_PALETTE[Math.floor(rnd() * BUILD_PALETTE.length)];
    }
  }
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let t;
      if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) t = T.WATER;
      else if (isRoadRow(y) || isRoadCol(x)) t = T.ROAD;
      else {
        const nearRoad =
          isRoadRow(y - 1) || isRoadRow(y + 1) || isRoadCol(x - 1) || isRoadCol(x + 1);
        if (nearRoad) t = T.SIDE;
        else {
          const key = Math.floor(x / BLOCK) + ',' + Math.floor(y / BLOCK);
          if (blockType[key] === 'park') t = T.PARK;
          else t = rnd() < 0.12 ? T.SIDE : T.BUILD; // малки дворове между сградите
        }
      }
      map[y * MW + x] = t;
    }
  }
})();

// Кои плочки блокират движение
function isSolid(t) { return t === T.BUILD || t === T.WATER; }

// Кръг срещу твърди плочки — връща коригирана позиция
function collideCircle(x, y, r) {
  const minTx = Math.floor((x - r) / TILE), maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((y - r) / TILE), maxTy = Math.floor((y + r) / TILE);
  let hit = false;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolid(tileAt(tx, ty))) continue;
      const cx = clamp(x, tx * TILE, tx * TILE + TILE);
      const cy = clamp(y, ty * TILE, ty * TILE + TILE);
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        hit = true;
        const d = Math.sqrt(d2) || 0.001;
        const push = (r - d) / d;
        x += dx * push; y += dy * push;
      }
    }
  }
  return { x, y, hit };
}

// Случайна пътна лента + посока (за спаунване на трафик)
function randomRoadSpot() {
  for (let i = 0; i < 200; i++) {
    const tx = 2 + Math.floor(R() * (MW - 4));
    const ty = 2 + Math.floor(R() * (MH - 4));
    if (tileAt(tx, ty) !== T.ROAD) continue;
    const onH = isRoadRow(ty), onV = isRoadCol(tx);
    if (onH && onV) continue; // не в кръстовище
    let dir;
    if (onH) dir = (ty % BLOCK === 3) ? 2 : 0;   // горна лента — запад, долна — изток
    else dir = (tx % BLOCK === 3) ? 1 : 3;       // лява лента — юг, дясна — север
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, dir };
  }
  return null;
}
function laneCenterFor(dir, x, y) {
  // За дадена посока връща коригирана координата към центъра на правилната лента
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const bx = Math.floor(tx / BLOCK) * BLOCK, by = Math.floor(ty / BLOCK) * BLOCK;
  if (dir === 0) return { x, y: (by + 4) * TILE + TILE / 2 };  // изток — долна лента
  if (dir === 2) return { x, y: (by + 3) * TILE + TILE / 2 };  // запад — горна лента
  if (dir === 1) return { x: (bx + 3) * TILE + TILE / 2, y };  // юг — лява
  return { x: (bx + 4) * TILE + TILE / 2, y };                 // север — дясна
}

// ---------------- Аудио (синтезирано, без файлове) ----------------
const AudioSys = {
  ctx: null, engineOsc: null, engineGain: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
    } catch (e) { this.ctx = null; }
  },
  engine(speed, inCar) {
    if (!this.ctx) return;
    const target = inCar ? clamp(0.02 + Math.abs(speed) / 4000, 0.02, 0.07) : 0;
    this.engineGain.gain.setTargetAtTime(inCar ? target : 0, this.ctx.currentTime, 0.1);
    if (inCar) this.engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.35, this.ctx.currentTime, 0.05);
  },
  blip(freq, dur, vol, type) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  },
  noise(dur, vol) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g).connect(this.ctx.destination);
    src.start();
  },
  shot() { this.noise(0.12, 0.25); },
  boom() { this.noise(0.6, 0.5); this.blip(60, 0.5, 0.3, 'sine'); },
  pickup() { this.blip(880, 0.12, 0.15); this.blip(1320, 0.12, 0.12); },
  hit() { this.blip(150, 0.08, 0.2, 'sawtooth'); }
};

// ---------------- Оръжия ----------------
const WEAPONS = [
  { name: 'Юмруци', auto: false, rate: 0.4, dmg: 12, range: 34, ammo: -1, spread: 0, melee: true },
  { name: 'Пистолет', auto: false, rate: 0.3, dmg: 25, range: 420, ammo: 0, spread: 0.03, melee: false },
  { name: 'Узи', auto: true, rate: 0.09, dmg: 14, range: 380, ammo: 0, spread: 0.09, melee: false },
];

// ---------------- Състояние на играта ----------------
const CAR_COLORS = ['#c33', '#36c', '#3a3', '#cc4', '#c6c', '#3aa', '#e82', '#eee', '#345', '#a55'];

function makeCar(x, y, angle, kind) {
  // kind: 'traffic' | 'police' | 'sport' | 'taxi'
  const sport = kind === 'sport';
  return {
    x, y, angle, speed: 0, steer: 0,
    w: 22, l: sport ? 40 : 42,
    kind,
    color: kind === 'police' ? '#123a6e' : (kind === 'taxi' ? '#e6b400' : CAR_COLORS[Math.floor(R() * CAR_COLORS.length)]),
    maxSpeed: sport ? 420 : (kind === 'police' ? 380 : 260 + R() * 60),
    accel: sport ? 340 : (kind === 'police' ? 300 : 200),
    hp: 100, dead: false, burnT: 0,
    dir: 0,             // текуща посока по мрежата (за трафик)
    aiPause: 0,
    siren: 0,           // фаза на сирената (полиция)
    marked: false       // маркирана за мисия
  };
}
function makePed(x, y) {
  return {
    x, y, angle: R() * Math.PI * 2, speed: 0,
    hp: 30, dead: false, deadT: 0,
    panic: 0, cop: false,
    skin: ['#e0b090', '#c68863', '#8d5a3b', '#f0c8a0'][Math.floor(R() * 4)],
    shirt: ['#a33', '#37a', '#585', '#963', '#777', '#a83', '#559'][Math.floor(R() * 7)],
    shootT: 0
  };
}

const cars = [];
const peds = [];
const bullets = [];
const effects = [];   // {x,y,t,dur,type}
const pickups = [];   // {x,y,type,amount}

const player = {
  x: 0, y: 0, angle: 0, speed: 0,
  hp: 100, armor: 0, money: 0,
  car: null, weapon: 0, ammo: [ -1, 24, 0 ],
  fireT: 0, dead: false, deadT: 0,
  wanted: 0, heat: 0, lastCrimeT: -999
};

let camX = 0, camY = 0, camZoom = 1;
let gameT = 0;
let paused = false;
let started = false;
let message = null, messageT = 0;
let scoreBest = 0;
try { scoreBest = parseInt(localStorage.getItem('gangcity_best') || '0', 10) || 0; } catch (e) {}

function showMsg(txt, dur) { message = txt; messageT = dur || 3; }

// Начална позиция — център на картата, на тротоар
(function placePlayer() {
  for (let r = 0; r < 30; r++) {
    const tx = MW / 2 + Math.floor(R() * 10 - 5), ty = MH / 2 + Math.floor(R() * 10 - 5);
    if (tileAt(tx, ty) === T.SIDE) {
      player.x = tx * TILE + TILE / 2; player.y = ty * TILE + TILE / 2;
      return;
    }
  }
  player.x = MW / 2 * TILE; player.y = (MH / 2 - 2) * TILE;
})();
camX = player.x; camY = player.y;

// Начален трафик, пешеходци, пикапи
(function populate() {
  for (let i = 0; i < 26; i++) {
    const s = randomRoadSpot();
    if (!s) continue;
    const kind = R() < 0.12 ? 'taxi' : (R() < 0.08 ? 'sport' : 'traffic');
    const c = makeCar(s.x, s.y, DIR_ANG[s.dir], kind);
    c.dir = s.dir;
    cars.push(c);
  }
  // Няколко паркирани спортни коли за открадване
  let placed = 0;
  for (let i = 0; i < 400 && placed < 6; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    if (tileAt(tx, ty) !== T.SIDE) continue;
    const c = makeCar(tx * TILE + TILE / 2, ty * TILE + TILE / 2, R() * Math.PI * 2, R() < 0.5 ? 'sport' : 'traffic');
    c.speed = 0; c.parked = true;
    cars.push(c); placed++;
  }
  for (let i = 0; i < 60; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    const t = tileAt(tx, ty);
    if (t === T.SIDE || t === T.PARK) peds.push(makePed(tx * TILE + TILE / 2, ty * TILE + TILE / 2));
  }
  const PICKS = ['health', 'money', 'pistol', 'uzi', 'armor'];
  let pl = 0;
  for (let i = 0; i < 600 && pl < 22; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    const t = tileAt(tx, ty);
    if (t === T.SIDE || t === T.PARK) {
      const type = PICKS[Math.floor(R() * PICKS.length)];
      pickups.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, type, spin: R() * 6 });
      pl++;
    }
  }
})();

// ---------------- Мисии ----------------
const mission = {
  active: false, type: null, text: '', target: null,
  checkpoints: [], timer: 0, reward: 0, cooldown: 4, count: 0
};
function randomSideSpotPx(minDistFromPlayer) {
  for (let i = 0; i < 300; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    if (tileAt(tx, ty) !== T.SIDE) continue;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (dist2(x, y, player.x, player.y) > minDistFromPlayer * minDistFromPlayer) return { x, y };
  }
  return null;
}
function startMission() {
  const roll = mission.count % 3;
  mission.count++;
  if (roll === 0) {
    // Достави маркираната кола в гаража
    let car = null, bd = 1e18;
    for (const c of cars) {
      if (c.dead || c.kind === 'police' || c === player.car) continue;
      const d = dist2(c.x, c.y, player.x, player.y);
      if (d > 300 * 300 && d < bd) { bd = d; car = c; }
    }
    const drop = randomSideSpotPx(900);
    if (!car || !drop) { mission.cooldown = 3; return; }
    car.marked = true;
    mission.active = true; mission.type = 'deliver';
    mission.target = car; mission.drop = drop;
    mission.reward = 800 + Math.floor(R() * 5) * 100;
    mission.timer = 120;
    mission.text = 'МИСИЯ: Открадни маркираната кола и я закарай в гаража!';
  } else if (roll === 1) {
    // Ликвидирай целта
    let ped = null, bd = 1e18;
    for (const p of peds) {
      if (p.dead || p.cop) continue;
      const d = dist2(p.x, p.y, player.x, player.y);
      if (d > 400 * 400 && d < bd) { bd = d; ped = p; }
    }
    if (!ped) { mission.cooldown = 3; return; }
    ped.markTarget = true;
    mission.active = true; mission.type = 'hit';
    mission.target = ped;
    mission.reward = 600 + Math.floor(R() * 5) * 100;
    mission.timer = 90;
    mission.text = 'МИСИЯ: Ликвидирай маркираната цел, преди да избяга!';
  } else {
    // Гонка по чекпойнти
    mission.checkpoints = [];
    let last = { x: player.x, y: player.y };
    for (let i = 0; i < 5; i++) {
      const s = randomRoadSpot();
      if (s) { mission.checkpoints.push({ x: s.x, y: s.y }); last = s; }
    }
    if (mission.checkpoints.length < 3) { mission.cooldown = 3; return; }
    mission.active = true; mission.type = 'race';
    mission.reward = 1000;
    mission.timer = 25 + mission.checkpoints.length * 14;
    mission.text = 'МИСИЯ: Мини през всички чекпойнти за времето!';
  }
  showMsg(mission.text, 5);
  AudioSys.pickup();
}
function endMission(win) {
  if (mission.type === 'deliver' && mission.target) mission.target.marked = false;
  if (mission.type === 'hit' && mission.target) mission.target.markTarget = false;
  if (win) {
    player.money += mission.reward;
    showMsg('МИСИЯ ИЗПЪЛНЕНА! +' + fmtMoney(mission.reward), 4);
    AudioSys.pickup();
  } else {
    showMsg('Мисията се провали.', 3);
  }
  mission.active = false; mission.target = null; mission.checkpoints = [];
  mission.cooldown = 6;
}
function updateMission(dt) {
  if (!mission.active) {
    mission.cooldown -= dt;
    if (mission.cooldown <= 0 && !player.dead) startMission();
    return;
  }
  mission.timer -= dt;
  if (mission.timer <= 0) { endMission(false); return; }
  if (mission.type === 'deliver') {
    const c = mission.target;
    if (c.dead) { endMission(false); return; }
    if (player.car === c && dist2(c.x, c.y, mission.drop.x, mission.drop.y) < 70 * 70) {
      exitCar();
      endMission(true);
    }
  } else if (mission.type === 'hit') {
    if (mission.target.dead) endMission(true);
  } else if (mission.type === 'race') {
    const cp = mission.checkpoints[0];
    if (cp && dist2(player.x, player.y, cp.x, cp.y) < 60 * 60) {
      mission.checkpoints.shift();
      AudioSys.blip(660, 0.1, 0.15);
      if (!mission.checkpoints.length) endMission(true);
    }
  }
}

// ---------------- Вход: клавиатура ----------------
const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (!started) { started = true; AudioSys.init(); }
  if (e.key.toLowerCase() === 'e' || e.key === 'Enter') actionPressed = true;
  if (e.key.toLowerCase() === 'q') cycleWeapon();
  if (e.key.toLowerCase() === 'p') paused = !paused;
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ---------------- Вход: тъч ----------------
const touch = {
  stick: { id: -1, cx: 0, cy: 0, dx: 0, dy: 0, active: false },
  buttons: {},   // name -> {x,y,r,label,held,id}
  layout() {
    const m = Math.min(VW, VH);
    const br = clamp(m * 0.085, 30, 46);
    this.stickBase = { x: VW * 0.16, y: VH * 0.74, r: clamp(m * 0.16, 56, 86) };
    this.buttons = {
      fire:   { x: VW - br * 1.6,  y: VH - br * 3.9, r: br * 1.15, label: '🔫' },
      action: { x: VW - br * 3.9,  y: VH - br * 1.7, r: br,        label: '🚗' },
      brake:  { x: VW - br * 1.6,  y: VH - br * 1.7, r: br,        label: '🛑' },
      weapon: { x: VW - br * 3.9,  y: VH - br * 4.2, r: br * 0.8,  label: '🔁' },
    };
    for (const k in this.buttons) { this.buttons[k].held = false; this.buttons[k].id = -1; }
  }
};
touch.layout();
window.addEventListener('resize', () => touch.layout());

let actionPressed = false;

function touchStart(e) {
  e.preventDefault();
  if (!started) { started = true; AudioSys.init(); }
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    let handled = false;
    for (const name in touch.buttons) {
      const b = touch.buttons[name];
      if (dist2(x, y, b.x, b.y) < (b.r * 1.3) * (b.r * 1.3)) {
        b.held = true; b.id = t.identifier; handled = true;
        if (name === 'action') actionPressed = true;
        if (name === 'weapon') cycleWeapon();
        break;
      }
    }
    if (!handled && x < VW * 0.45 && touch.stick.id === -1) {
      touch.stick.id = t.identifier;
      touch.stick.cx = x; touch.stick.cy = y;
      touch.stick.dx = 0; touch.stick.dy = 0;
      touch.stick.active = true;
    }
  }
}
function touchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.stick.id) {
      const r = touch.stickBase.r;
      let dx = t.clientX - touch.stick.cx, dy = t.clientY - touch.stick.cy;
      const d = Math.hypot(dx, dy);
      if (d > r) { dx *= r / d; dy *= r / d; }
      touch.stick.dx = dx / r; touch.stick.dy = dy / r;
    }
  }
}
function touchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.stick.id) {
      touch.stick.id = -1; touch.stick.active = false;
      touch.stick.dx = 0; touch.stick.dy = 0;
    }
    for (const name in touch.buttons) {
      const b = touch.buttons[name];
      if (b.id === t.identifier) { b.held = false; b.id = -1; }
    }
  }
}
canvas.addEventListener('touchstart', touchStart, { passive: false });
canvas.addEventListener('touchmove', touchMove, { passive: false });
canvas.addEventListener('touchend', touchEnd, { passive: false });
canvas.addEventListener('touchcancel', touchEnd, { passive: false });
canvas.addEventListener('mousedown', () => { if (!started) { started = true; AudioSys.init(); } });

function inputState() {
  let mx = 0, my = 0, fire = false, brake = false;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['f'] || keys['control']) fire = true;
  if (keys[' ']) brake = true;
  if (touch.stick.active) { mx += touch.stick.dx; my += touch.stick.dy; }
  if (touch.buttons.fire && touch.buttons.fire.held) fire = true;
  if (touch.buttons.brake && touch.buttons.brake.held) brake = true;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  return { mx, my, fire, brake };
}

function cycleWeapon() {
  for (let i = 1; i <= WEAPONS.length; i++) {
    const w = (player.weapon + i) % WEAPONS.length;
    if (player.ammo[w] !== 0) { player.weapon = w; showMsg(WEAPONS[w].name, 1.2); return; }
  }
}

// ---------------- Престъпления и полиция ----------------
function addHeat(amount) {
  player.heat = Math.min(player.heat + amount, 500);
  player.lastCrimeT = gameT;
  player.wanted = player.heat >= 300 ? 5 : player.heat >= 180 ? 4 : player.heat >= 100 ? 3 : player.heat >= 45 ? 2 : player.heat >= 15 ? 1 : 0;
}
function updateWanted(dt) {
  if (gameT - player.lastCrimeT > 12) {
    player.heat = Math.max(0, player.heat - dt * 6);
    player.wanted = player.heat >= 300 ? 5 : player.heat >= 180 ? 4 : player.heat >= 100 ? 3 : player.heat >= 45 ? 2 : player.heat >= 15 ? 1 : 0;
  }
  // Спаунване на полиция според нивото
  const copsWanted = player.wanted === 0 ? 0 : player.wanted + 1;
  let copCars = 0;
  for (const c of cars) if (c.kind === 'police' && !c.dead) copCars++;
  if (copCars < copsWanted && R() < dt * 0.5) {
    const s = randomRoadSpot();
    if (s && dist2(s.x, s.y, player.x, player.y) > 500 * 500) {
      const c = makeCar(s.x, s.y, DIR_ANG[s.dir], 'police');
      c.dir = s.dir;
      cars.push(c);
    }
  }
}

// ---------------- Куршуми ----------------
function fireWeapon(shooter, angle, weapon, fromPolice) {
  const w = WEAPONS[weapon];
  if (w.melee) {
    // Мелле: удар пред играча
    const hx = shooter.x + Math.cos(angle) * w.range, hy = shooter.y + Math.sin(angle) * w.range;
    for (const p of peds) {
      if (p.dead) continue;
      if (dist2(p.x, p.y, hx, hy) < 26 * 26 || dist2(p.x, p.y, shooter.x, shooter.y) < 30 * 30) {
        damagePed(p, w.dmg, !fromPolice);
        AudioSys.hit();
        break;
      }
    }
    return;
  }
  const a = angle + (R() - 0.5) * w.spread * 2;
  bullets.push({
    x: shooter.x + Math.cos(a) * 16, y: shooter.y + Math.sin(a) * 16,
    vx: Math.cos(a) * 900, vy: Math.sin(a) * 900,
    life: w.range / 900, dmg: w.dmg, police: !!fromPolice
  });
  AudioSys.shot();
  if (!fromPolice) {
    addHeat(0.6); // стрелбата вдига внимание
    panicNear(shooter.x, shooter.y, 260);
  }
}
function panicNear(x, y, r) {
  for (const p of peds) {
    if (p.dead) continue;
    if (dist2(p.x, p.y, x, y) < r * r) {
      p.panic = 6 + R() * 4;
      p.angle = Math.atan2(p.y - y, p.x - x) + (R() - 0.5);
    }
  }
}
function damagePed(p, dmg, byPlayer) {
  if (p.dead) return;
  p.hp -= dmg;
  p.panic = 8;
  if (p.hp <= 0) {
    p.dead = true; p.deadT = 0;
    effects.push({ x: p.x, y: p.y, t: 0, dur: 0.5, type: 'blood' });
    if (byPlayer) {
      addHeat(p.cop ? 40 : 18);
      player.money += 10;
      if (p.markTarget) { /* мисията ще го отчете */ }
    }
  }
}
function damageCar(c, dmg, byPlayer) {
  if (c.dead) return;
  c.hp -= dmg;
  if (c.hp <= 0) {
    c.dead = true; c.burnT = 0;
    explode(c.x, c.y, byPlayer);
    if (byPlayer) addHeat(c.kind === 'police' ? 60 : 25);
    if (player.car === c) {
      player.car = null;
      damagePlayer(45);
    }
  }
}
function explode(x, y, byPlayer) {
  effects.push({ x, y, t: 0, dur: 0.9, type: 'boom' });
  AudioSys.boom();
  panicNear(x, y, 400);
  for (const p of peds) {
    if (!p.dead && dist2(p.x, p.y, x, y) < 70 * 70) damagePed(p, 100, byPlayer);
  }
  for (const c of cars) {
    if (!c.dead && dist2(c.x, c.y, x, y) < 80 * 80) damageCar(c, 60, byPlayer);
  }
  if (!player.car && dist2(player.x, player.y, x, y) < 80 * 80) damagePlayer(50);
}
function damagePlayer(dmg) {
  if (player.dead) return;
  if (player.armor > 0) {
    const a = Math.min(player.armor, dmg * 0.6);
    player.armor -= a; dmg -= a;
  }
  player.hp -= dmg;
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; player.deadT = 0;
    if (player.car) { player.car = null; }
    if (mission.active) endMission(false);
  }
}

// ---------------- Кола: влизане/излизане ----------------
function tryEnterCar() {
  let best = null, bd = 70 * 70;
  for (const c of cars) {
    if (c.dead) continue;
    const d = dist2(c.x, c.y, player.x, player.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) {
    player.car = best;
    const wasParked = !!best.parked;
    best.parked = false;
    if (best.kind === 'police') addHeat(30);
    else if (!wasParked) addHeat(8); // кражба на движеща се кола се забелязва
    showMsg(best.kind === 'police' ? 'Открадна полицейска кола!' : 'Открадна кола', 1.5);
  }
}
function exitCar() {
  const c = player.car;
  if (!c) return;
  c.speed *= 0.2;
  const ex = c.x + Math.cos(c.angle + Math.PI / 2) * 30;
  const ey = c.y + Math.sin(c.angle + Math.PI / 2) * 30;
  const pos = collideCircle(ex, ey, 8);
  player.x = pos.x; player.y = pos.y;
  player.car = null;
}

// ---------------- Ъпдейт: играч ----------------
function updatePlayer(dt, inp) {
  if (player.dead) {
    player.deadT += dt;
    if (player.deadT > 3.5) {
      // Съживяване в "болницата" — център на картата
      player.dead = false; player.hp = 100;
      player.heat = 0; player.wanted = 0;
      player.money = Math.max(0, player.money - 200);
      const s = randomSideSpotPx(0) || { x: MW / 2 * TILE, y: MH / 2 * TILE };
      player.x = s.x; player.y = s.y;
      showMsg('Излезе от болницата. -$200', 3);
    }
    return;
  }

  if (actionPressed) {
    actionPressed = false;
    if (player.car) exitCar(); else tryEnterCar();
  }

  if (player.car) {
    updatePlayerCar(dt, inp, player.car);
  } else {
    updatePlayerFoot(dt, inp);
  }
  AudioSys.engine(player.car ? player.car.speed : 0, !!player.car);

  // Пикапи
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    const px = player.car ? player.car.x : player.x, py = player.car ? player.car.y : player.y;
    if (dist2(pk.x, pk.y, px, py) < 30 * 30) {
      let taken = true;
      if (pk.type === 'health') { player.hp = Math.min(100, player.hp + 40); showMsg('+Здраве', 1); }
      else if (pk.type === 'armor') { player.armor = Math.min(100, player.armor + 50); showMsg('+Броня', 1); }
      else if (pk.type === 'money') { player.money += 150; showMsg('+$150', 1); }
      else if (pk.type === 'pistol') { player.ammo[1] += 20; showMsg('+Патрони (пистолет)', 1); }
      else if (pk.type === 'uzi') { player.ammo[2] += 40; if (player.weapon === 0) player.weapon = 2; showMsg('+Узи', 1); }
      else taken = false;
      if (taken) { pickups.splice(i, 1); AudioSys.pickup(); }
    }
  }

  // Стрелба (само пеша)
  player.fireT -= dt;
  if (!player.car && inp.fire && player.fireT <= 0) {
    const w = WEAPONS[player.weapon];
    if (player.ammo[player.weapon] !== 0) {
      player.fireT = w.rate;
      fireWeapon(player, player.angle, player.weapon, false);
      if (player.ammo[player.weapon] > 0) {
        player.ammo[player.weapon]--;
        if (player.ammo[player.weapon] === 0) { showMsg('Патроните свършиха', 1.5); cycleWeapon(); }
      }
    }
  }
}
function updatePlayerFoot(dt, inp) {
  const spd = 130;
  if (inp.mx || inp.my) {
    player.angle = Math.atan2(inp.my, inp.mx);
    const nx = player.x + inp.mx * spd * dt;
    const ny = player.y + inp.my * spd * dt;
    const pos = collideCircle(nx, ny, 9);
    player.x = pos.x; player.y = pos.y;
  }
}
function updatePlayerCar(dt, inp, c) {
  const fwd = -inp.my; // напред = стик нагоре / W
  let accel = 0;
  if (fwd > 0.1) accel = c.accel * fwd;                                          // газ
  else if (fwd < -0.1) accel = c.speed > 10 ? -c.accel * 1.4 : c.accel * 0.55 * fwd; // спирачка или заден ход
  c.speed += accel * dt;
  // Триене
  const t = tileAtPx(c.x, c.y);
  const road = t === T.ROAD;
  const drag = road ? 0.6 : 2.2;
  c.speed -= c.speed * drag * dt;
  if (inp.brake) c.speed -= c.speed * 4 * dt;
  c.speed = clamp(c.speed, -c.maxSpeed * 0.4, c.maxSpeed);

  // Завиване — зависи от скоростта
  const steerInput = inp.mx;
  const steerPow = clamp(Math.abs(c.speed) / 60, 0, 1) * 2.6;
  if (Math.abs(c.speed) > 4) {
    c.angle += steerInput * steerPow * dt * (c.speed > 0 ? 1 : -1);
  }

  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, 14);
  if (pos.hit) {
    const impact = Math.abs(c.speed);
    if (impact > 140) { damageCar(c, impact * 0.09, false); AudioSys.hit(); }
    c.speed *= -0.25;
  }
  c.x = pos.x; c.y = pos.y;

  // Сблъсък с други коли
  for (const o of cars) {
    if (o === c || o.dead) continue;
    const d2v = dist2(c.x, c.y, o.x, o.y);
    const rr = 30;
    if (d2v < rr * rr) {
      const d = Math.sqrt(d2v) || 0.01;
      const push = (rr - d) / 2;
      const dx = (c.x - o.x) / d, dy = (c.y - o.y) / d;
      c.x += dx * push; c.y += dy * push;
      o.x -= dx * push; o.y -= dy * push;
      const impact = Math.abs(c.speed);
      if (impact > 120) {
        damageCar(o, impact * 0.07, true);
        damageCar(c, impact * 0.035, false);
        addHeat(2);
        AudioSys.hit();
      }
      c.speed *= 0.55;
      o.aiPause = 1.2;
    }
  }
  // Прегазване на пешеходци
  for (const p of peds) {
    if (p.dead) continue;
    if (dist2(p.x, p.y, c.x, c.y) < 20 * 20 && Math.abs(c.speed) > 60) {
      damagePed(p, 100, true);
      c.speed *= 0.92;
    }
  }
  // Играчът следва колата
  player.x = c.x; player.y = c.y; player.angle = c.angle;
}

// ---------------- Ъпдейт: трафик и полиция ----------------
function updateCarAI(c, dt) {
  if (c.dead) { c.burnT += dt; return; }
  if (c === player.car) return;
  if (c.parked) return;

  if (c.kind === 'police' && player.wanted > 0 && !player.dead) {
    updatePoliceCar(c, dt);
    return;
  }

  c.aiPause -= dt;
  if (c.aiPause > 0) { c.speed *= 0.9; return; }

  // Кара по лентата, завива на кръстовища
  const cruise = 120;
  const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
  const inIntersection = isRoadRow(ty) && isRoadCol(tx);
  if (inIntersection && !c.turned) {
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (dist2(c.x, c.y, cx, cy) < 14 * 14) {
      c.turned = true;
      if (R() < 0.45) {
        const opts = c.dir % 2 === 0 ? [1, 3] : [0, 2];
        c.dir = opts[Math.floor(R() * 2)];
      }
      const lane = laneCenterFor(c.dir, c.x, c.y);
      c.laneTarget = lane;
    }
  }
  if (!inIntersection) c.turned = false;

  // Придържане към лентата
  const lane = laneCenterFor(c.dir, c.x, c.y);
  let targetAngle = DIR_ANG[c.dir];
  if (c.dir % 2 === 0) { // хоризонтално — коригирай y
    const err = lane.y - c.y;
    targetAngle += clamp(err * 0.02, -0.5, 0.5) * (c.dir === 2 ? -1 : 1);
  } else {
    const err = lane.x - c.x;
    targetAngle += clamp(err * 0.02, -0.5, 0.5) * (c.dir === 1 ? -1 : 1);
  }
  c.angle += clamp(angDiff(c.angle, targetAngle), -2.4 * dt, 2.4 * dt);

  // Спирай при препятствие напред
  const aheadX = c.x + Math.cos(c.angle) * 52, aheadY = c.y + Math.sin(c.angle) * 52;
  let blocked = false;
  for (const o of cars) {
    if (o === c || o.dead) continue;
    if (dist2(o.x, o.y, aheadX, aheadY) < 30 * 30) { blocked = true; break; }
  }
  if (!blocked && player.car && dist2(player.car.x, player.car.y, aheadX, aheadY) < 30 * 30) blocked = true;
  if (!blocked && !player.car && !player.dead && dist2(player.x, player.y, aheadX, aheadY) < 24 * 24) blocked = true;

  const want = blocked ? 0 : cruise;
  c.speed += clamp(want - c.speed, -300 * dt, 120 * dt);

  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, 14);
  if (pos.hit) { c.speed *= -0.3; c.dir = (c.dir + 2) % 4; }
  c.x = pos.x; c.y = pos.y;
}
function updatePoliceCar(c, dt) {
  c.siren += dt * 8;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  const ta = Math.atan2(py - c.y, px - c.x);
  c.angle += clamp(angDiff(c.angle, ta), -2.8 * dt, 2.8 * dt);
  const d = Math.sqrt(dist2(c.x, c.y, px, py));
  const want = d > 60 ? c.maxSpeed * 0.75 : 40;
  c.speed += clamp(want - c.speed, -400 * dt, c.accel * dt);
  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, 14);
  if (pos.hit) c.speed *= -0.4;
  c.x = pos.x; c.y = pos.y;

  // Таран на играча
  if (player.car && dist2(c.x, c.y, player.car.x, player.car.y) < 32 * 32 && Math.abs(c.speed) > 100) {
    damageCar(player.car, 8, false);
    player.car.speed *= 0.8;
    c.speed *= 0.5;
    AudioSys.hit();
  }
  // Блъскане на играча пеша
  if (!player.car && !player.dead && dist2(c.x, c.y, player.x, player.y) < 22 * 22 && Math.abs(c.speed) > 60) {
    damagePlayer(35);
    c.speed *= 0.7;
  }
  // Ченгето стреля от колата при високо издирване
  if (player.wanted >= 3 && d < 300 && R() < dt * 0.8) {
    fireWeapon(c, ta + (R() - 0.5) * 0.15, 1, true);
  }
}

// ---------------- Ъпдейт: пешеходци ----------------
function updatePed(p, dt) {
  if (p.dead) { p.deadT += dt; return; }
  const spd = p.panic > 0 ? 150 : 45;
  if (p.panic > 0) p.panic -= dt;
  if (R() < dt * (p.panic > 0 ? 1.5 : 0.4)) p.angle += (R() - 0.5) * (p.panic > 0 ? 2.5 : 1.6);
  const nx = p.x + Math.cos(p.angle) * spd * dt;
  const ny = p.y + Math.sin(p.angle) * spd * dt;
  // Пешеходците стоят на тротоари/паркове, освен ако не бягат
  const nt = tileAtPx(nx, ny);
  if (isSolid(nt) || (p.panic <= 0 && nt === T.ROAD)) {
    p.angle += Math.PI / 2 + R();
    return;
  }
  const pos = collideCircle(nx, ny, 7);
  p.x = pos.x; p.y = pos.y;

  // Целта на мисия "hit" бяга от играча
  if (p.markTarget) {
    const d = dist2(p.x, p.y, player.x, player.y);
    if (d < 350 * 350) { p.panic = 3; p.angle = Math.atan2(p.y - player.y, p.x - player.x); }
  }
}

// ---------------- Ъпдейт: куршуми ----------------
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    let gone = b.life <= 0 || isSolid(tileAtPx(b.x, b.y));
    if (!gone) {
      for (const p of peds) {
        if (p.dead) continue;
        if (dist2(p.x, p.y, b.x, b.y) < 12 * 12) { damagePed(p, b.dmg, !b.police); gone = true; break; }
      }
    }
    if (!gone) {
      for (const c of cars) {
        if (c.dead) continue;
        if (dist2(c.x, c.y, b.x, b.y) < 18 * 18) {
          damageCar(c, b.dmg * 0.7, !b.police);
          gone = true; break;
        }
      }
    }
    if (!gone && b.police && !player.car && !player.dead) {
      if (dist2(player.x, player.y, b.x, b.y) < 12 * 12) { damagePlayer(b.dmg); gone = true; }
    }
    if (gone) bullets.splice(i, 1);
  }
}

// ---------------- Рециклиране на света ----------------
function recycle(dt) {
  // Премахвай далечни/мъртви обекти и добавяй нови около играча
  const FAR = 1900 * 1900;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c === player.car || c.marked) continue;
    if (c.dead && c.burnT > 12) { cars.splice(i, 1); continue; }
    if (!c.parked && dist2(c.x, c.y, player.x, player.y) > FAR) cars.splice(i, 1);
  }
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    if (p.markTarget) continue;
    if (p.dead && p.deadT > 15) { peds.splice(i, 1); continue; }
    if (dist2(p.x, p.y, player.x, player.y) > FAR) peds.splice(i, 1);
  }
  let liveCars = 0, livePeds = 0;
  for (const c of cars) if (!c.dead && c.kind !== 'police') liveCars++;
  for (const p of peds) if (!p.dead) livePeds++;
  if (liveCars < 22 && R() < dt * 2) {
    const s = randomRoadSpot();
    if (s) {
      const d = dist2(s.x, s.y, player.x, player.y);
      if (d > 700 * 700 && d < FAR) {
        const kind = R() < 0.12 ? 'taxi' : (R() < 0.08 ? 'sport' : 'traffic');
        const c = makeCar(s.x, s.y, DIR_ANG[s.dir], kind);
        c.dir = s.dir;
        cars.push(c);
      }
    }
  }
  if (livePeds < 45 && R() < dt * 4) {
    for (let i = 0; i < 20; i++) {
      const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
      const t = tileAt(tx, ty);
      if (t !== T.SIDE && t !== T.PARK) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      const d = dist2(x, y, player.x, player.y);
      if (d > 600 * 600 && d < FAR) { peds.push(makePed(x, y)); break; }
    }
  }
}

// ---------------- Ден/нощ ----------------
function nightAmount() {
  // 0 = ден, 1 = нощ
  const phase = (gameT % DAY_LENGTH) / DAY_LENGTH; // 0..1
  return clamp(Math.sin(phase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 0, 1);
}

// ---------------- Рендер ----------------
function worldToScreen(x, y) {
  return { x: (x - camX) * camZoom + VW / 2, y: (y - camY) * camZoom + VH / 2 };
}

function drawCity() {
  const halfW = VW / 2 / camZoom, halfH = VH / 2 / camZoom;
  const minTx = Math.floor((camX - halfW) / TILE) - 1, maxTx = Math.floor((camX + halfW) / TILE) + 1;
  const minTy = Math.floor((camY - halfH) / TILE) - 1, maxTy = Math.floor((camY + halfH) / TILE) + 1;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = tileAt(tx, ty);
      const s = worldToScreen(tx * TILE, ty * TILE);
      const sz = TILE * camZoom + 1;
      let fill;
      switch (t) {
        case T.ROAD: fill = '#3a3a40'; break;
        case T.SIDE: fill = '#8f8f96'; break;
        case T.BUILD: fill = blockColor[Math.floor(tx / BLOCK) + ',' + Math.floor(ty / BLOCK)] || '#777'; break;
        case T.WATER: fill = '#1b3a5c'; break;
        case T.PARK: fill = '#3e6b3a'; break;
        default: fill = '#4c6b46';
      }
      ctx.fillStyle = fill;
      ctx.fillRect(s.x, s.y, sz, sz);

      if (t === T.ROAD) {
        // Осева прекъсната линия между лентите
        const my = ty % BLOCK, mx = tx % BLOCK;
        const inter = isRoadRow(ty) && isRoadCol(tx);
        if (!inter) {
          ctx.fillStyle = '#c9b23c';
          if (my === 4 && isRoadRow(ty)) {
            const dw = 8 * camZoom;
            for (let k = 0; k < 2; k++) ctx.fillRect(s.x + (6 + k * 24) * camZoom, s.y - 1 * camZoom, dw, 2 * camZoom);
          } else if (mx === 4 && isRoadCol(tx)) {
            const dw = 8 * camZoom;
            for (let k = 0; k < 2; k++) ctx.fillRect(s.x - 1 * camZoom, s.y + (6 + k * 24) * camZoom, 2 * camZoom, dw);
          }
        }
      } else if (t === T.BUILD) {
        // Псевдо-3D ръб на сградата
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(s.x, s.y + sz - 5 * camZoom, sz, 5 * camZoom);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(s.x, s.y, sz, 3 * camZoom);
        // Прозорци
        const night = nightAmount();
        if (((tx * 7 + ty * 13) % 5) < 2) {
          ctx.fillStyle = night > 0.5 ? 'rgba(255,220,120,0.75)' : 'rgba(40,50,70,0.5)';
          const wsz = 7 * camZoom;
          ctx.fillRect(s.x + 8 * camZoom, s.y + 10 * camZoom, wsz, wsz);
          ctx.fillRect(s.x + 28 * camZoom, s.y + 24 * camZoom, wsz, wsz);
        }
      } else if (t === T.PARK) {
        if (((tx * 11 + ty * 17) % 7) < 2) {
          const cx = s.x + sz / 2, cy = s.y + sz / 2;
          ctx.fillStyle = '#2c4f28';
          ctx.beginPath(); ctx.arc(cx, cy, 12 * camZoom, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#376334';
          ctx.beginPath(); ctx.arc(cx - 3 * camZoom, cy - 3 * camZoom, 8 * camZoom, 0, Math.PI * 2); ctx.fill();
        }
      } else if (t === T.WATER) {
        const ph = Math.sin(gameT * 1.5 + tx * 0.7 + ty * 1.3) * 0.5 + 0.5;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + ph * 0.05) + ')';
        ctx.fillRect(s.x, s.y + sz * 0.4, sz, 2 * camZoom);
      }
    }
  }
}

function drawCar(c) {
  const s = worldToScreen(c.x, c.y);
  if (s.x < -80 || s.y < -80 || s.x > VW + 80 || s.y > VH + 80) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(c.angle);
  ctx.scale(camZoom, camZoom);
  const L = c.l, W = c.w;

  // Сянка
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 3, L, W);

  if (c.dead) {
    ctx.fillStyle = '#222';
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.restore();
    // Пушек
    const sm = worldToScreen(c.x, c.y);
    ctx.fillStyle = 'rgba(60,60,60,' + clamp(0.5 - c.burnT * 0.04, 0, 0.5) + ')';
    ctx.beginPath();
    ctx.arc(sm.x + Math.sin(gameT * 2) * 4, sm.y - c.burnT * 2 % 30, (8 + (c.burnT * 6) % 20) * camZoom, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Купе
  ctx.fillStyle = c.color;
  ctx.beginPath();
  const r = 5;
  ctx.moveTo(-L / 2 + r, -W / 2);
  ctx.lineTo(L / 2 - r, -W / 2); ctx.quadraticCurveTo(L / 2, -W / 2, L / 2, -W / 2 + r);
  ctx.lineTo(L / 2, W / 2 - r); ctx.quadraticCurveTo(L / 2, W / 2, L / 2 - r, W / 2);
  ctx.lineTo(-L / 2 + r, W / 2); ctx.quadraticCurveTo(-L / 2, W / 2, -L / 2, W / 2 - r);
  ctx.lineTo(-L / 2, -W / 2 + r); ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + r, -W / 2);
  ctx.fill();
  // Покрив/стъкла
  ctx.fillStyle = 'rgba(20,30,40,0.8)';
  ctx.fillRect(-L / 6, -W / 2 + 3, L / 3.2, W - 6);
  ctx.fillStyle = 'rgba(160,210,240,0.85)';
  ctx.fillRect(L / 8, -W / 2 + 3, 4, W - 6);
  // Фарове
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 4);
  ctx.fillRect(L / 2 - 3, W / 2 - 6, 3, 4);
  // Стопове
  ctx.fillStyle = '#c22';
  ctx.fillRect(-L / 2, -W / 2 + 2, 2, 4);
  ctx.fillRect(-L / 2, W / 2 - 6, 2, 4);

  if (c.kind === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-L / 8, -W / 2, L / 4, W);
    const on = Math.floor(c.siren) % 2 === 0;
    ctx.fillStyle = on ? '#f33' : '#33f';
    ctx.fillRect(-4, -5, 8, 4);
    ctx.fillStyle = on ? '#33f' : '#f33';
    ctx.fillRect(-4, 1, 8, 4);
  }
  if (c.kind === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-3, -4, 6, 8);
  }
  ctx.restore();

  // Маркер за мисия
  if (c.marked) {
    const m = worldToScreen(c.x, c.y);
    ctx.strokeStyle = 'rgba(80,220,120,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, (30 + Math.sin(gameT * 5) * 4) * camZoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Фарове нощем
  const night = nightAmount();
  if (night > 0.45 && Math.abs(c.speed) > 5) {
    const m = worldToScreen(c.x, c.y);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(255,240,170,' + (0.14 * night) + ')';
    ctx.beginPath();
    ctx.moveTo(c.l / 2 * camZoom, -6 * camZoom);
    ctx.lineTo((c.l / 2 + 80) * camZoom, -30 * camZoom);
    ctx.lineTo((c.l / 2 + 80) * camZoom, 30 * camZoom);
    ctx.lineTo(c.l / 2 * camZoom, 6 * camZoom);
    ctx.fill();
    ctx.restore();
  }
}

function drawPed(p) {
  const s = worldToScreen(p.x, p.y);
  if (s.x < -40 || s.y < -40 || s.x > VW + 40 || s.y > VH + 40) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(camZoom, camZoom);
  if (p.dead) {
    ctx.rotate(p.angle);
    ctx.globalAlpha = clamp(1 - p.deadT / 15, 0, 1);
    ctx.fillStyle = p.shirt;
    ctx.fillRect(-8, -4, 16, 8);
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(9, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(p.angle);
  // Крака (анимация при ходене)
  const step = Math.sin(gameT * 12 + p.x) * (p.panic > 0 ? 4 : 2.4);
  ctx.fillStyle = '#223';
  ctx.fillRect(-2 + step, -5, 4, 3);
  ctx.fillRect(-2 - step, 2, 4, 3);
  // Тяло
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  // Глава
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(2, 0, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (p.markTarget) {
    ctx.strokeStyle = 'rgba(230,80,80,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (16 + Math.sin(gameT * 6) * 3) * camZoom, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPlayer() {
  if (player.car || player.dead) return;
  const s = worldToScreen(player.x, player.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(camZoom, camZoom);
  ctx.rotate(player.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(2, 2, 7, 0, Math.PI * 2); ctx.fill();
  // Тяло — черно яке
  ctx.fillStyle = '#1a1a22';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  // Ръце с оръжие
  const w = WEAPONS[player.weapon];
  if (!w.melee) {
    ctx.fillStyle = '#333';
    ctx.fillRect(4, -1.5, 9, 3);
  }
  // Глава
  ctx.fillStyle = '#e0b090';
  ctx.beginPath(); ctx.arc(2.5, 0, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBulletsFx() {
  ctx.fillStyle = '#ffdf80';
  for (const b of bullets) {
    const s = worldToScreen(b.x, b.y);
    ctx.fillRect(s.x - 2, s.y - 2, 4 * camZoom, 4 * camZoom);
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const s = worldToScreen(e.x, e.y);
    const k = e.t / e.dur;
    if (e.type === 'boom') {
      ctx.fillStyle = 'rgba(255,' + Math.floor(200 - k * 180) + ',40,' + (1 - k) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, (10 + k * 60) * camZoom, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,200,' + (1 - k) * 0.8 + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, (4 + k * 26) * camZoom, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'blood') {
      ctx.fillStyle = 'rgba(150,20,20,' + (1 - k) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, (4 + k * 10) * camZoom, 0, Math.PI * 2); ctx.fill();
    }
    if (e.t >= e.dur) effects.splice(i, 1);
  }
}

function drawPickups() {
  for (const pk of pickups) {
    const s = worldToScreen(pk.x, pk.y);
    if (s.x < -30 || s.y < -30 || s.x > VW + 30 || s.y > VH + 30) continue;
    const bob = Math.sin(gameT * 3 + pk.spin) * 3 * camZoom;
    ctx.save();
    ctx.translate(s.x, s.y + bob);
    ctx.scale(camZoom, camZoom);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const icon = pk.type === 'health' ? '➕' : pk.type === 'money' ? '💵' : pk.type === 'armor' ? '🛡️' : pk.type === 'uzi' ? '🔫' : '🔫';
    if (pk.type === 'health') { ctx.fillStyle = '#e33'; ctx.fillText('+', 0, 1); ctx.strokeStyle = '#e33'; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14); }
    else if (pk.type === 'money') { ctx.fillStyle = '#4c4'; ctx.fillText('$', 0, 1); }
    else if (pk.type === 'armor') { ctx.fillStyle = '#4af'; ctx.fillText('◆', 0, 1); }
    else { ctx.fillStyle = '#eee'; ctx.fillText('▮', 0, 1); }
    ctx.restore();
  }
}

function drawMissionMarkers() {
  if (!mission.active) return;
  let tx = null, ty = null, color = '#5c8';
  if (mission.type === 'deliver') {
    if (player.car === mission.target) { tx = mission.drop.x; ty = mission.drop.y; }
    else { tx = mission.target.x; ty = mission.target.y; }
  } else if (mission.type === 'hit') { tx = mission.target.x; ty = mission.target.y; color = '#e55'; }
  else if (mission.type === 'race' && mission.checkpoints.length) {
    const cp = mission.checkpoints[0];
    tx = cp.x; ty = cp.y; color = '#fc5';
    const s = worldToScreen(cp.x, cp.y);
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (40 + Math.sin(gameT * 4) * 6) * camZoom, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (mission.type === 'deliver' && player.car === mission.target) {
    const s = worldToScreen(mission.drop.x, mission.drop.y);
    ctx.strokeStyle = '#5c8'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (46 + Math.sin(gameT * 4) * 6) * camZoom, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Стрелка към целта от края на екрана
  if (tx !== null) {
    const dx = tx - player.x, dy = ty - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 260) {
      const a = Math.atan2(dy, dx);
      const ax = VW / 2 + Math.cos(a) * Math.min(VW, VH) * 0.32;
      const ay = VH / 2 + Math.sin(a) * Math.min(VW, VH) * 0.32;
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9);
      ctx.fill();
      ctx.restore();
    }
  }
}

// Минимапа — предварително рендерирана
const miniCanvas = document.createElement('canvas');
(function renderMini() {
  miniCanvas.width = MW; miniCanvas.height = MH;
  const mc = miniCanvas.getContext('2d');
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const t = map[y * MW + x];
      mc.fillStyle = t === T.ROAD ? '#555' : t === T.WATER ? '#1b3a5c' : t === T.BUILD ? '#847063' : t === T.PARK ? '#3e6b3a' : '#7c7c80';
      mc.fillRect(x, y, 1, 1);
    }
  }
})();
function drawMiniMap() {
  const size = clamp(Math.min(VW, VH) * 0.22, 90, 150);
  const pad = 10;
  const x0 = VW - size - pad, y0 = pad;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#000';
  ctx.fillRect(x0 - 2, y0 - 2, size + 4, size + 4);
  ctx.drawImage(miniCanvas, x0, y0, size, size);
  const sx = size / (MW * TILE), sy = size / (MH * TILE);
  // Мисионен маркер
  if (mission.active) {
    let tx = null, ty = null, color = '#5c8';
    if (mission.type === 'deliver') {
      if (player.car === mission.target) { tx = mission.drop.x; ty = mission.drop.y; }
      else { tx = mission.target.x; ty = mission.target.y; }
    } else if (mission.type === 'hit') { tx = mission.target.x; ty = mission.target.y; color = '#e55'; }
    else if (mission.type === 'race' && mission.checkpoints.length) { tx = mission.checkpoints[0].x; ty = mission.checkpoints[0].y; color = '#fc5'; }
    if (tx !== null) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x0 + tx * sx, y0 + ty * sy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Полиция
  ctx.fillStyle = '#39f';
  for (const c of cars) {
    if (c.kind === 'police' && !c.dead) {
      ctx.fillRect(x0 + c.x * sx - 1.5, y0 + c.y * sy - 1.5, 3, 3);
    }
  }
  // Играч
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x0 + player.x * sx, y0 + player.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHUD() {
  const pad = 10;
  ctx.textBaseline = 'top';

  // Пари
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(fmtMoney(player.money), pad + 2, pad + 2);
  ctx.fillStyle = '#7ee08a';
  ctx.fillText(fmtMoney(player.money), pad, pad);

  // Здраве и броня
  const bw = 130, bh = 10;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(pad, pad + 28, bw, bh);
  ctx.fillStyle = player.hp > 30 ? '#d84d4d' : '#ff2222';
  ctx.fillRect(pad, pad + 28, bw * player.hp / 100, bh);
  if (player.armor > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(pad, pad + 42, bw, 6);
    ctx.fillStyle = '#4aa3ff';
    ctx.fillRect(pad, pad + 42, bw * player.armor / 100, 6);
  }

  // Оръжие
  ctx.font = '14px monospace';
  ctx.fillStyle = '#eee';
  const w = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  ctx.fillText(w.name + (ammo >= 0 ? ' · ' + ammo : ''), pad, pad + 54);

  // Издирване (звезди)
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < player.wanted ? '★' : '☆';
  ctx.fillStyle = player.wanted > 0 ? '#ffd23c' : 'rgba(255,255,255,0.35)';
  ctx.fillText(stars, pad, pad + 74);

  // Съобщение / мисия
  if (message && messageT > 0) {
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    const y = VH * 0.16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const tw = ctx.measureText(message).width;
    ctx.fillRect(VW / 2 - tw / 2 - 12, y - 8, tw + 24, 32);
    ctx.fillStyle = '#fff';
    ctx.fillText(message, VW / 2, y);
  }
  if (mission.active) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = mission.timer < 10 ? '#ff5555' : '#ffd23c';
    ctx.fillText('⏱ ' + Math.ceil(mission.timer) + 'с', VW / 2, pad);
  }

  // WASTED екран
  if (player.dead) {
    ctx.fillStyle = 'rgba(80,0,0,' + clamp(player.deadT * 0.4, 0, 0.6) + ')';
    ctx.fillRect(0, 0, VW, VH);
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('ЕЛИМИНИРАН', VW / 2, VH / 2);
    ctx.textBaseline = 'top';
  }

  // Тъч контроли
  if (IS_TOUCH) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    const sb = touch.stickBase;
    const scx = touch.stick.active ? touch.stick.cx : sb.x;
    const scy = touch.stick.active ? touch.stick.cy : sb.y;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(scx, scy, sb.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(scx + touch.stick.dx * sb.r, scy + touch.stick.dy * sb.r, sb.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    for (const name in touch.buttons) {
      const b = touch.buttons[name];
      ctx.globalAlpha = b.held ? 0.6 : 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.font = Math.round(b.r * 0.8) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      const lbl = name === 'action' ? (player.car ? '🚶' : '🚗') : b.label;
      ctx.fillText(lbl, b.x, b.y + 1);
      ctx.textBaseline = 'top';
    }
    ctx.restore();
  }
}

function drawStartScreen() {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.min(64, VW * 0.1) + 'px sans-serif';
  ctx.fillStyle = '#ffd23c';
  ctx.fillText('GANG CITY', VW / 2, VH * 0.3);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#ccc';
  const lines = IS_TOUCH ? [
    'Ляв палец — движение / волан',
    '🚗 влизане и излизане от кола · 🔫 стрелба · 🛑 спирачка',
    'Изпълнявай мисии, събирай пари, бягай от полицията!',
    '',
    'Докосни екрана, за да започнеш'
  ] : [
    'WASD / стрелки — движение и шофиране',
    'E — влез/излез от кола · F — стрелба · Q — смяна на оръжие · Space — спирачка',
    'Изпълнявай мисии, събирай пари, бягай от полицията!',
    '',
    'Натисни клавиш, за да започнеш'
  ];
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, VH * 0.5 + i * 26));
  if (scoreBest > 0) {
    ctx.fillStyle = '#7ee08a';
    ctx.fillText('Рекорд: ' + fmtMoney(scoreBest), VW / 2, VH * 0.5 + lines.length * 26 + 20);
  }
  ctx.textBaseline = 'top';
}

// ---------------- Главен цикъл ----------------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;

  if (!started) { drawStartScreen(); return; }
  if (paused) { drawHUD(); return; }

  gameT += dt;
  if (messageT > 0) messageT -= dt;

  const inp = inputState();
  updatePlayer(dt, inp);
  for (const c of cars) updateCarAI(c, dt);
  for (const p of peds) updatePed(p, dt);
  updateBullets(dt);
  for (const e of effects) e.t += dt;
  updateWanted(dt);
  updateMission(dt);
  recycle(dt);

  if (player.money > scoreBest) {
    scoreBest = player.money;
    try { localStorage.setItem('gangcity_best', String(scoreBest)); } catch (e) {}
  }

  // Камера
  const targetZoom = player.car ? clamp(1.15 - Math.abs(player.car.speed) / 900, 0.72, 1.05) : 1.15;
  camZoom += (targetZoom - camZoom) * dt * 2;
  const lookAhead = player.car ? clamp(player.car.speed * 0.35, -120, 120) : 0;
  const tx = player.x + Math.cos(player.angle) * lookAhead;
  const ty = player.y + Math.sin(player.angle) * lookAhead;
  camX += (tx - camX) * dt * 5;
  camY += (ty - camY) * dt * 5;

  // Рендер
  drawCity();
  drawPickups();
  for (const p of peds) if (p.dead) drawPed(p);
  for (const c of cars) drawCar(c);
  for (const p of peds) if (!p.dead) drawPed(p);
  drawPlayer();
  drawBulletsFx();
  drawMissionMarkers();

  // Нощен слой
  const night = nightAmount();
  if (night > 0.02) {
    ctx.fillStyle = 'rgba(10,10,40,' + (night * 0.45) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }

  drawMiniMap();
  drawHUD();
}
requestAnimationFrame(frame);
