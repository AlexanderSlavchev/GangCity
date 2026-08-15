'use strict';
/* ============================================================
   GangCity v2 — пълнофункционална, подобрена интерпретация на
   класическата top-down формула от 1997 г.:
   • точки-като-долари + целеви резултат за завършване на града
   • множител, животи, BUSTED / WASTED
   • мисии от звънящи телефони
   • издирване с полицейски глави, respray за сваляне
   • Kill Frenzy, ГУРАНГА бонус
   • оръжия: юмруци, пистолет, картечница, огнехвъргачка, ракетомет
   • псевдо-3D сгради с височина, камера със зуум по скоростта
   Целият код и графика са оригинални, процедурно генерирани.
   ============================================================ */

// ---------------- Константи ----------------
const TILE = 48;
const MW = 64, MH = 64;
const BLOCK = 8;
const T = { GRASS: 0, ROAD: 1, SIDE: 2, BUILD: 3, WATER: 4, PARK: 5 };
const DAY_LENGTH = 180;
const DIR_ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// ---------------- Помощни ----------------
let seed = 20977;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const R = Math.random;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
function fmtMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
function shade(hex, k) {
  // hex '#rgb' или '#rrggbb' → затъмнен/осветен цвят
  let r, g, b;
  if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
  else { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
  r = clamp(Math.round(r * k), 0, 255); g = clamp(Math.round(g * k), 0, 255); b = clamp(Math.round(b * k), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

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

// ---------------- Град ----------------
const map = new Uint8Array(MW * MH);
const blockColor = {}, blockHeight = {}, blockRoof = {};
let hospitalBlock = null, policeBlock = null, resprayBlock = null;

function isRoadRow(y) { const m = y % BLOCK; return m === 3 || m === 4; }
function isRoadCol(x) { const m = x % BLOCK; return m === 3 || m === 4; }
function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return T.WATER;
  return map[ty * MW + tx];
}
function tileAtPx(x, y) { return tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
function blockKeyOf(tx, ty) { return Math.floor(tx / BLOCK) + ',' + Math.floor(ty / BLOCK); }

(function genCity() {
  const WALLS = ['#9a7b64', '#8b8d99', '#ab9070', '#7d8c78', '#997f9e', '#b09a80', '#82909f', '#a58474', '#c0aa8a', '#6f7f8f'];
  const ROOFS = ['#6e6a66', '#7a7672', '#5f6468', '#746e64', '#686e62', '#7e7468'];
  const blockType = {};
  for (let by = 0; by < MH / BLOCK; by++) {
    for (let bx = 0; bx < MW / BLOCK; bx++) {
      const key = bx + ',' + by;
      blockType[key] = rnd() < 0.16 ? 'park' : 'build';
      blockColor[key] = WALLS[Math.floor(rnd() * WALLS.length)];
      blockRoof[key] = ROOFS[Math.floor(rnd() * ROOFS.length)];
      blockHeight[key] = 1 + Math.floor(rnd() * 3); // 1..3 етажни групи
    }
  }
  // Специални блокове близо до центъра (болница, участък, бояджийница)
  const cb = Math.floor(MW / BLOCK / 2);
  hospitalBlock = (cb - 1) + ',' + cb;
  policeBlock = (cb + 1) + ',' + (cb - 1);
  resprayBlock = cb + ',' + (cb + 1);
  for (const k of [hospitalBlock, policeBlock, resprayBlock]) {
    blockType[k] = 'build'; blockHeight[k] = 2;
  }
  blockColor[hospitalBlock] = '#c8c4bc'; blockRoof[hospitalBlock] = '#b8b4ac';
  blockColor[policeBlock] = '#5a7290'; blockRoof[policeBlock] = '#4a5f7a';
  blockColor[resprayBlock] = '#8f6f3f'; blockRoof[resprayBlock] = '#7a6038';

  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let t;
      if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) t = T.WATER;
      else if (isRoadRow(y) || isRoadCol(x)) t = T.ROAD;
      else {
        const nearRoad = isRoadRow(y - 1) || isRoadRow(y + 1) || isRoadCol(x - 1) || isRoadCol(x + 1);
        if (nearRoad) t = T.SIDE;
        else {
          const key = blockKeyOf(x, y);
          if (blockType[key] === 'park') t = T.PARK;
          else if ([hospitalBlock, policeBlock, resprayBlock].includes(key)) t = T.BUILD;
          else t = rnd() < 0.1 ? T.SIDE : T.BUILD;
        }
      }
      map[y * MW + x] = t;
    }
  }
})();

function isSolid(t) { return t === T.BUILD || t === T.WATER; }

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

function randomRoadSpot() {
  for (let i = 0; i < 200; i++) {
    const tx = 2 + Math.floor(R() * (MW - 4));
    const ty = 2 + Math.floor(R() * (MH - 4));
    if (tileAt(tx, ty) !== T.ROAD) continue;
    const onH = isRoadRow(ty), onV = isRoadCol(tx);
    if (onH && onV) continue;
    let dir;
    if (onH) dir = (ty % BLOCK === 3) ? 2 : 0;
    else dir = (tx % BLOCK === 3) ? 1 : 3;
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, dir };
  }
  return null;
}
function laneCenterFor(dir, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const bx = Math.floor(tx / BLOCK) * BLOCK, by = Math.floor(ty / BLOCK) * BLOCK;
  if (dir === 0) return { x, y: (by + 4) * TILE + TILE / 2 };
  if (dir === 2) return { x, y: (by + 3) * TILE + TILE / 2 };
  if (dir === 1) return { x: (bx + 3) * TILE + TILE / 2, y };
  return { x: (bx + 4) * TILE + TILE / 2, y };
}
function nearestSideTile(px, py, maxR) {
  let best = null, bd = (maxR || 400) * (maxR || 400);
  const ctx0 = Math.floor(px / TILE), cty0 = Math.floor(py / TILE);
  for (let dy = -10; dy <= 10; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      const tx = ctx0 + dx, ty = cty0 + dy;
      if (tileAt(tx, ty) !== T.SIDE) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      const d = dist2(x, y, px, py);
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}
function blockDoor(key) {
  // Точка на тротоара до центъра на блока
  const [bx, by] = key.split(',').map(Number);
  const cx = (bx * BLOCK + BLOCK / 2) * TILE, cy = (by * BLOCK + BLOCK / 2) * TILE;
  return nearestSideTile(cx, cy + BLOCK / 2 * TILE, 500) || { x: cx, y: cy };
}
const hospitalDoor = blockDoor(hospitalBlock);
const policeDoor = blockDoor(policeBlock);
const resprayDoor = blockDoor(resprayBlock);

// Телефонни будки — 6, разположени радиално около центъра
const phones = [];
(function placePhones() {
  const cx = MW / 2 * TILE, cy = MH / 2 * TILE;
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + 0.4;
    const px = cx + Math.cos(a) * 14 * TILE, py = cy + Math.sin(a) * 14 * TILE;
    const s = nearestSideTile(px, py, 500);
    if (s) phones.push({ x: s.x, y: s.y, ringing: false });
  }
})();

// Kill Frenzy пикапи
const frenzySpots = [];
(function placeFrenzy() {
  const cx = MW / 2 * TILE, cy = MH / 2 * TILE;
  for (const a of [0.9, 3.6, 5.4]) {
    const s = nearestSideTile(cx + Math.cos(a) * 20 * TILE, cy + Math.sin(a) * 20 * TILE, 600);
    if (s) frenzySpots.push({ x: s.x, y: s.y, taken: false, respawn: 0 });
  }
})();

// ---------------- Аудио ----------------
const AudioSys = {
  ctx: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null, sirenT: 0,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch (e) { this.ctx = null; }
  },
  engine(speed, inCar) {
    if (!this.ctx) return;
    const target = inCar ? clamp(0.015 + Math.abs(speed) / 5000, 0.015, 0.06) : 0;
    this.engineGain.gain.setTargetAtTime(inCar ? target : 0, this.ctx.currentTime, 0.1);
    if (inCar) this.engineOsc.frequency.setTargetAtTime(45 + Math.abs(speed) * 0.3, this.ctx.currentTime, 0.05);
  },
  siren(on, dt) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.022 : 0, this.ctx.currentTime, 0.2);
    if (on) {
      this.sirenT += dt;
      const hi = Math.floor(this.sirenT * 1.6) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 660 : 470, this.ctx.currentTime, 0.06);
    }
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
  shot() { this.noise(0.1, 0.22); },
  mg() { this.noise(0.06, 0.16); },
  flame() { if (R() < 0.3) this.noise(0.15, 0.06); },
  rocket() { this.noise(0.3, 0.2); this.blip(120, 0.3, 0.15, 'sawtooth'); },
  boom() { this.noise(0.7, 0.5); this.blip(50, 0.6, 0.35, 'sine'); },
  pickup() { this.blip(880, 0.1, 0.14); this.blip(1320, 0.12, 0.1); },
  ring() { this.blip(1500, 0.07, 0.12); this.blip(1500, 0.07, 0.1); },
  hit() { this.blip(140, 0.08, 0.18, 'sawtooth'); },
  gouranga() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 0.16), i * 90)); }
};

// ---------------- Оръжия ----------------
const WEAPONS = [
  { name: 'Юмруци',        rate: 0.4,  dmg: 12, range: 34,  spread: 0,    melee: true },
  { name: 'Пистолет',      rate: 0.28, dmg: 25, range: 430, spread: 0.03, auto: false },
  { name: 'Картечница',    rate: 0.08, dmg: 14, range: 400, spread: 0.08, auto: true },
  { name: 'Огнехвъргачка', rate: 0.04, dmg: 7,  range: 150, spread: 0.25, auto: true, flame: true },
  { name: 'Ракетомет',     rate: 1.0,  dmg: 30, range: 700, spread: 0.01, auto: false, rocket: true },
];

// ---------------- Коли ----------------
const CAR_KINDS = {
  sedan:  { name: 'Комета',    l: 42, w: 22, maxSpeed: 280, accel: 210, hp: 100, mass: 1 },
  taxi:   { name: 'Такси',     l: 42, w: 22, maxSpeed: 300, accel: 230, hp: 100, mass: 1 },
  sport:  { name: 'Вихър GT',  l: 40, w: 20, maxSpeed: 440, accel: 360, hp: 90,  mass: 0.9 },
  bus:    { name: 'Автобус',   l: 78, w: 25, maxSpeed: 190, accel: 120, hp: 220, mass: 2.6 },
  truck:  { name: 'Камион',    l: 62, w: 25, maxSpeed: 210, accel: 140, hp: 180, mass: 2.2 },
  police: { name: 'Патрулка',  l: 44, w: 22, maxSpeed: 400, accel: 320, hp: 120, mass: 1.1 },
};
const CAR_COLORS = ['#c0392b', '#2e6bb5', '#3f9a4d', '#c9b530', '#9b59b6', '#2aa5a0', '#e07b28', '#dadfe4', '#37474f', '#a56a5a', '#5d4a7e', '#7a2c2c'];

function makeCar(x, y, angle, kind) {
  const k = CAR_KINDS[kind];
  return {
    x, y, angle, speed: 0,
    kind, name: k.name, l: k.l, w: k.w, mass: k.mass,
    r: Math.max(14, k.l * 0.31),
    color: kind === 'police' ? '#20375c' : (kind === 'taxi' ? '#e8b800' : (kind === 'bus' ? '#b05c2a' : CAR_COLORS[Math.floor(R() * CAR_COLORS.length)])),
    maxSpeed: k.maxSpeed * (0.92 + R() * 0.16), accel: k.accel,
    hp: k.hp, maxHp: k.hp, dead: false, burnT: 0, burn: 0,
    dir: 0, aiPause: 0, siren: 0, marked: false, parked: false, turned: false,
    copsInside: kind === 'police' ? 2 : 0
  };
}
function makePed(x, y, cop) {
  return {
    x, y, angle: R() * Math.PI * 2, speed: 0,
    hp: cop ? 45 : 30, dead: false, deadT: 0,
    panic: 0, cop: !!cop, burn: 0,
    skin: ['#e0b090', '#c68863', '#8d5a3b', '#f0c8a0'][Math.floor(R() * 4)],
    shirt: cop ? '#2a4a80' : ['#a33', '#37a', '#585', '#963', '#777', '#a83', '#559', '#7a4a6a'][Math.floor(R() * 8)],
    shootT: 1 + R(), arrestT: 0, markTarget: false
  };
}

// ---------------- Състояние ----------------
const cars = [], peds = [], projectiles = [], pickups = [];
const particles = [], skids = [], floaters = [];

const player = {
  x: 0, y: 0, angle: 0,
  hp: 100, armor: 0,
  car: null, weapon: 1, ammo: [-1, 30, 0, 0, 0],
  fireT: 0, dead: false, deadT: 0, busted: false, bustedT: 0,
  wanted: 0, heat: 0, lastCrimeT: -999
};
let score = 0, mult = 1, lives = 4, level = 1;
let missionsDone = 0;
let targetScore = 60000;
const frenzy = { active: false, timer: 0, kills: 0, goal: 8, savedWeapon: 0, savedAmmo: 0 };
const gour = { count: 0, timer: 0 };
let resprayCooldown = 0;
let levelCompleteT = 0, gameOver = false;

let camX = 0, camY = 0, camZoom = 1;
let gameT = 0, paused = false, started = false;
let message = null, messageT = 0;
let scoreBest = 0;
try { scoreBest = parseInt(localStorage.getItem('gangcity_best') || '0', 10) || 0; } catch (e) {}
function showMsg(txt, dur) { message = txt; messageT = dur || 3; }
function addFloater(x, y, txt, color) {
  floaters.push({ x, y, txt, color: color || '#ffd23c', t: 0 });
  if (floaters.length > 12) floaters.shift();
}
function addScore(points, atX, atY) {
  const total = Math.round(points * mult);
  score += total;
  if (atX !== undefined) addFloater(atX, atY, '+' + fmtMoney(total).slice(1), '#7ee08a');
  if (score >= targetScore && levelCompleteT <= 0) {
    levelCompleteT = 5;
    level++; lives++;
    targetScore = Math.round(targetScore * 3);
    AudioSys.gouranga();
  }
}

// Начална позиция
(function placePlayer() {
  const s = nearestSideTile(MW / 2 * TILE, MH / 2 * TILE, 600);
  player.x = s ? s.x : MW / 2 * TILE;
  player.y = s ? s.y : MH / 2 * TILE;
})();
camX = player.x; camY = player.y;

// Населяване
(function populate() {
  for (let i = 0; i < 26; i++) {
    const s = randomRoadSpot();
    if (!s) continue;
    const r = R();
    const kind = r < 0.1 ? 'taxi' : r < 0.16 ? 'sport' : r < 0.24 ? 'bus' : r < 0.34 ? 'truck' : r < 0.4 ? 'police' : 'sedan';
    const c = makeCar(s.x, s.y, DIR_ANG[s.dir], kind);
    c.dir = s.dir;
    cars.push(c);
  }
  let placed = 0;
  for (let i = 0; i < 400 && placed < 7; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    if (tileAt(tx, ty) !== T.SIDE) continue;
    const c = makeCar(tx * TILE + TILE / 2, ty * TILE + TILE / 2, Math.floor(R() * 4) * Math.PI / 2, R() < 0.45 ? 'sport' : 'sedan');
    c.parked = true;
    cars.push(c); placed++;
  }
  for (let i = 0; i < 65; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    const t = tileAt(tx, ty);
    if (t === T.SIDE || t === T.PARK) peds.push(makePed(tx * TILE + TILE / 2, ty * TILE + TILE / 2));
  }
  const PICKS = ['health', 'money', 'pistol', 'mg', 'flame', 'rocket', 'armor'];
  let pl = 0;
  for (let i = 0; i < 700 && pl < 26; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    const t = tileAt(tx, ty);
    if (t === T.SIDE || t === T.PARK) {
      pickups.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, type: PICKS[Math.floor(R() * PICKS.length)], spin: R() * 6 });
      pl++;
    }
  }
})();

// ---------------- Частици и следи ----------------
function spawnParticles(x, y, n, opts) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 260) particles.shift();
    const a = R() * Math.PI * 2, sp = (opts.speed || 60) * (0.3 + R());
    particles.push({
      x, y, vx: Math.cos(a) * sp + (opts.vx || 0), vy: Math.sin(a) * sp + (opts.vy || 0),
      t: 0, dur: (opts.dur || 0.6) * (0.5 + R() * 0.8),
      size: (opts.size || 3) * (0.6 + R() * 0.8),
      color: opts.colors[Math.floor(R() * opts.colors.length)],
      grow: opts.grow || 0, drag: opts.drag || 0
    });
  }
}
const FX = {
  sparks: (x, y) => spawnParticles(x, y, 8, { speed: 160, dur: 0.4, size: 2.4, colors: ['#ffe27a', '#ffb347', '#fff'], drag: 3 }),
  smoke: (x, y) => spawnParticles(x, y, 1, { speed: 12, vy: -18, dur: 1.4, size: 6, colors: ['rgba(70,70,74,0.5)', 'rgba(96,96,100,0.45)'], grow: 9 }),
  fire: (x, y) => spawnParticles(x, y, 2, { speed: 26, vy: -30, dur: 0.5, size: 5, colors: ['#ff9a3c', '#ff5722', '#ffd23c'], grow: -4 }),
  blood: (x, y) => spawnParticles(x, y, 7, { speed: 90, dur: 0.5, size: 3, colors: ['#8e1a1a', '#b32424'], drag: 4 }),
  boom: (x, y) => {
    spawnParticles(x, y, 22, { speed: 240, dur: 0.7, size: 4, colors: ['#ff9a3c', '#ff5722', '#ffd23c', '#333'], drag: 2.5 });
    spawnParticles(x, y, 10, { speed: 60, vy: -40, dur: 1.6, size: 10, colors: ['rgba(50,50,54,0.6)', 'rgba(90,90,94,0.5)'], grow: 14 });
  },
  glass: (x, y) => spawnParticles(x, y, 6, { speed: 120, dur: 0.4, size: 2, colors: ['#bde0f0', '#e8f4fa'], drag: 3 })
};
function addSkid(x1, y1, x2, y2) {
  if (skids.length > 220) skids.shift();
  skids.push({ x1, y1, x2, y2, t: 0 });
}

// ---------------- Престъпления и издирване ----------------
function addHeat(amount) {
  player.heat = Math.min(player.heat + amount, 400);
  player.lastCrimeT = gameT;
  recalcWanted();
}
function recalcWanted() {
  player.wanted = player.heat >= 260 ? 4 : player.heat >= 140 ? 3 : player.heat >= 60 ? 2 : player.heat >= 15 ? 1 : 0;
}
function updateWanted(dt) {
  if (gameT - player.lastCrimeT > 14) {
    player.heat = Math.max(0, player.heat - dt * 7);
    recalcWanted();
  }
  const wantCars = player.wanted === 0 ? 0 : player.wanted + Math.floor(level / 2);
  let copCars = 0, copPeds = 0;
  for (const c of cars) if (c.kind === 'police' && !c.dead && !c.parked) copCars++;
  for (const p of peds) if (p.cop && !p.dead) copPeds++;
  if (copCars < wantCars && R() < dt * 0.6) {
    const s = randomRoadSpot();
    if (s && dist2(s.x, s.y, player.x, player.y) > 450 * 450) {
      const c = makeCar(s.x, s.y, DIR_ANG[s.dir], 'police');
      c.dir = s.dir;
      cars.push(c);
    }
  }
  // Пеши полицаи при издирване ≥ 2
  if (player.wanted >= 2 && copPeds < player.wanted * 2 && R() < dt * 0.4) {
    const s = nearestSideTile(player.x + (R() - 0.5) * 900, player.y + (R() - 0.5) * 900, 500);
    if (s && dist2(s.x, s.y, player.x, player.y) > 260 * 260) peds.push(makePed(s.x, s.y, true));
  }
}

// ---------------- Бой ----------------
function fireWeapon(shooter, angle, weaponIdx, fromPolice) {
  const w = WEAPONS[weaponIdx];
  if (w.melee) {
    const hx = shooter.x + Math.cos(angle) * w.range, hy = shooter.y + Math.sin(angle) * w.range;
    for (const p of peds) {
      if (p.dead || p === shooter) continue;
      if (dist2(p.x, p.y, hx, hy) < 26 * 26 || dist2(p.x, p.y, shooter.x, shooter.y) < 30 * 30) {
        damagePed(p, w.dmg, !fromPolice, 'melee');
        AudioSys.hit();
        break;
      }
    }
    return;
  }
  const a = angle + (R() - 0.5) * w.spread * 2;
  if (w.flame) {
    projectiles.push({
      type: 'flame',
      x: shooter.x + Math.cos(a) * 14, y: shooter.y + Math.sin(a) * 14,
      vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
      life: w.range / 260, dmg: w.dmg, police: !!fromPolice
    });
    AudioSys.flame();
  } else if (w.rocket) {
    projectiles.push({
      type: 'rocket',
      x: shooter.x + Math.cos(a) * 20, y: shooter.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
      life: w.range / 520, dmg: w.dmg, police: !!fromPolice
    });
    AudioSys.rocket();
  } else {
    projectiles.push({
      type: 'bullet',
      x: shooter.x + Math.cos(a) * 16, y: shooter.y + Math.sin(a) * 16,
      vx: Math.cos(a) * 950, vy: Math.sin(a) * 950,
      life: w.range / 950, dmg: w.dmg, police: !!fromPolice
    });
    weaponIdx === 2 ? AudioSys.mg() : AudioSys.shot();
  }
  if (!fromPolice) {
    addHeat(w.flame ? 0.3 : 0.7);
    panicNear(shooter.x, shooter.y, 280);
  }
}
function panicNear(x, y, r) {
  for (const p of peds) {
    if (p.dead || p.cop) continue;
    if (dist2(p.x, p.y, x, y) < r * r) {
      p.panic = 6 + R() * 4;
      p.angle = Math.atan2(p.y - y, p.x - x) + (R() - 0.5);
    }
  }
}
function damagePed(p, dmg, byPlayer, cause) {
  if (p.dead) return;
  p.hp -= dmg;
  if (!p.cop) p.panic = 8;
  if (cause === 'fire') p.burn = Math.max(p.burn, 3);
  if (p.hp <= 0) {
    p.dead = true; p.deadT = 0;
    FX.blood(p.x, p.y);
    if (byPlayer) {
      addHeat(p.cop ? 55 : 16);
      addScore(p.cop ? 1000 : 100, p.x, p.y);
      if (frenzy.active) frenzy.kills++;
      if (cause === 'car' && !p.cop) {
        gour.count++; gour.timer = 4;
        if (gour.count >= 3) {
          addScore(1000, p.x, p.y - 20);
          showMsg('ГУРАНГА!!! +' + fmtMoney(1000 * mult), 2.5);
          AudioSys.gouranga();
          gour.count = 0;
        }
      }
    }
  }
}
function damageCar(c, dmg, byPlayer, cause) {
  if (c.dead) return;
  c.hp -= dmg;
  if (cause === 'fire') c.burn = Math.max(c.burn, 2.5);
  if (c.hp <= 0) {
    c.dead = true; c.burnT = 0;
    explode(c.x, c.y, byPlayer);
    if (byPlayer) { addHeat(c.kind === 'police' ? 70 : 22); addScore(c.kind === 'police' ? 1500 : 500, c.x, c.y); }
    if (player.car === c) { player.car = null; damagePlayer(45); }
  }
}
function explode(x, y, byPlayer) {
  FX.boom(x, y);
  AudioSys.boom();
  panicNear(x, y, 420);
  for (const p of peds) if (!p.dead && dist2(p.x, p.y, x, y) < 75 * 75) damagePed(p, 100, byPlayer, 'explosion');
  for (const c of cars) if (!c.dead && dist2(c.x, c.y, x, y) < 85 * 85) damageCar(c, 65, byPlayer, 'explosion');
  if (!player.car && !player.dead && dist2(player.x, player.y, x, y) < 85 * 85) damagePlayer(50);
  else if (player.car && dist2(player.car.x, player.car.y, x, y) < 85 * 85 && !player.car.dead) damageCar(player.car, 35, false, 'explosion');
}
function damagePlayer(dmg) {
  if (player.dead || player.busted) return;
  if (player.armor > 0) {
    const a = Math.min(player.armor, dmg * 0.6);
    player.armor -= a; dmg -= a;
  }
  player.hp -= dmg;
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; player.deadT = 0;
    player.car = null;
    endFrenzy(false);
    if (mission.active) endMission(false);
  }
}
function bustPlayer() {
  player.busted = true; player.bustedT = 0;
  endFrenzy(false);
  if (mission.active) endMission(false);
}

// ---------------- Kill Frenzy ----------------
function startFrenzy() {
  frenzy.active = true; frenzy.timer = 50; frenzy.kills = 0;
  frenzy.goal = 6 + level * 2;
  frenzy.savedWeapon = player.weapon; frenzy.savedAmmo = player.ammo[2];
  player.weapon = 2; player.ammo[2] = 9999;
  showMsg('ЛУДОСТ! Убий ' + frenzy.goal + ' за 50 секунди!', 4);
  AudioSys.gouranga();
}
function endFrenzy(win) {
  if (!frenzy.active) return;
  frenzy.active = false;
  player.ammo[2] = frenzy.savedAmmo + (win ? 60 : 0);
  if (player.weapon === 2 && player.ammo[2] <= 0) player.weapon = frenzy.savedWeapon;
  if (win) {
    mult = Math.min(8, mult + 1);
    addScore(5000, player.x, player.y);
    showMsg('ЛУДОСТТА Е ЗАВЪРШЕНА! +' + fmtMoney(5000 * mult) + ' · Множител x' + mult, 4);
  } else showMsg('Лудостта се провали.', 2.5);
}
function updateFrenzy(dt) {
  for (const f of frenzySpots) {
    if (f.taken) {
      f.respawn -= dt;
      if (f.respawn <= 0) f.taken = false;
    } else if (dist2(f.x, f.y, player.x, player.y) < 28 * 28 && !frenzy.active && !player.dead) {
      f.taken = true; f.respawn = 150;
      startFrenzy();
    }
  }
  if (frenzy.active) {
    frenzy.timer -= dt;
    if (frenzy.kills >= frenzy.goal) endFrenzy(true);
    else if (frenzy.timer <= 0) endFrenzy(false);
  }
  if (gour.timer > 0) { gour.timer -= dt; if (gour.timer <= 0) gour.count = 0; }
}

// ---------------- Мисии (телефони) ----------------
const mission = {
  active: false, type: null, text: '', target: null, drop: null,
  checkpoints: [], timer: 0, reward: 0, cooldown: 3, wrecks: 0, wreckGoal: 0
};
function updatePhones(dt) {
  let anyRinging = false;
  for (const ph of phones) if (ph.ringing) anyRinging = true;
  if (!mission.active && !anyRinging) {
    mission.cooldown -= dt;
    if (mission.cooldown <= 0 && !player.dead && !player.busted) {
      // Звъни телефонът, най-близък до играча
      let best = null, bd = 1e18;
      for (const ph of phones) {
        const d = dist2(ph.x, ph.y, player.x, player.y);
        if (d < bd) { bd = d; best = ph; }
      }
      if (best) { best.ringing = true; showMsg('☎ Телефонът звъни! Отговори за работа.', 3); }
    }
  }
  for (const ph of phones) {
    if (!ph.ringing) continue;
    const d = dist2(ph.x, ph.y, player.x, player.y);
    if (d < 500 * 500 && R() < dt * 1.2) AudioSys.ring();
    if (!player.car && d < 26 * 26) {
      ph.ringing = false;
      startMission();
    }
  }
}
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
  const roll = missionsDone % 4;
  if (roll === 0) {
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
    mission.reward = 3000; mission.timer = 120;
    mission.text = 'Шефът иска тази кола. Открадни я и я закарай в гаража!';
  } else if (roll === 1) {
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
    mission.reward = 2500; mission.timer = 90;
    mission.text = 'Този тип говори с ченгетата. Погрижи се за него!';
  } else if (roll === 2) {
    mission.checkpoints = [];
    for (let i = 0; i < 5; i++) {
      const s = randomRoadSpot();
      if (s) mission.checkpoints.push({ x: s.x, y: s.y });
    }
    if (mission.checkpoints.length < 3) { mission.cooldown = 3; return; }
    mission.active = true; mission.type = 'race';
    mission.reward = 3500;
    mission.timer = 20 + mission.checkpoints.length * 13;
    mission.text = 'Докажи, че си бърз — мини през всички чекпойнти!';
  } else {
    mission.active = true; mission.type = 'wreck';
    mission.wrecks = 0; mission.wreckGoal = 3;
    mission.reward = 3000; mission.timer = 100;
    mission.text = 'Конкуренцията ни дразни. Унищожи ' + mission.wreckGoal + ' коли!';
  }
  showMsg('☎ ' + mission.text, 5);
  AudioSys.pickup();
}
function endMission(win) {
  if (mission.type === 'deliver' && mission.target) mission.target.marked = false;
  if (mission.type === 'hit' && mission.target) mission.target.markTarget = false;
  if (win) {
    missionsDone++;
    addScore(mission.reward, player.x, player.y - 20);
    let extra = '';
    if (missionsDone % 2 === 0 && mult < 8) { mult++; extra = ' · Множител x' + mult; }
    showMsg('РАБОТАТА Е СВЪРШЕНА! +' + fmtMoney(mission.reward * mult) + extra, 4);
    AudioSys.pickup();
  } else showMsg('Провали работата. Шефът не е доволен.', 3);
  mission.active = false; mission.target = null; mission.checkpoints = [];
  mission.cooldown = 8;
}
function updateMission(dt) {
  if (!mission.active) return;
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
      addScore(200, player.x, player.y);
      if (!mission.checkpoints.length) endMission(true);
    }
  }
  // 'wreck' се отчита в damageCar чрез брояч по-долу
}
// Брояч на унищожени коли за мисия 'wreck'
const _origDamageCar = damageCar;
damageCar = function (c, dmg, byPlayer, cause) {
  const wasDead = c.dead;
  _origDamageCar(c, dmg, byPlayer, cause);
  if (!wasDead && c.dead && byPlayer && mission.active && mission.type === 'wreck') {
    mission.wrecks++;
    showMsg('Унищожени: ' + mission.wrecks + '/' + mission.wreckGoal, 2);
    if (mission.wrecks >= mission.wreckGoal) endMission(true);
  }
};

// ---------------- Вход ----------------
const keys = {};
let actionPressed = false;
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (!started) { started = true; AudioSys.init(); }
  if (gameOver) { restartGame(); return; }
  if (e.key.toLowerCase() === 'e' || e.key === 'Enter') actionPressed = true;
  if (e.key.toLowerCase() === 'q') cycleWeapon();
  if (e.key.toLowerCase() === 'p') paused = !paused;
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

const touch = {
  stick: { id: -1, cx: 0, cy: 0, dx: 0, dy: 0, active: false },
  buttons: {}, stickBase: { x: 0, y: 0, r: 60 },
  layout() {
    const m = Math.min(VW, VH);
    const br = clamp(m * 0.085, 30, 46);
    this.stickBase = { x: VW * 0.16, y: VH * 0.72, r: clamp(m * 0.16, 56, 86) };
    this.buttons = {
      fire:   { x: VW - br * 1.6, y: VH - br * 3.9, r: br * 1.15, label: '🔫' },
      action: { x: VW - br * 3.9, y: VH - br * 1.7, r: br,        label: '🚗' },
      brake:  { x: VW - br * 1.6, y: VH - br * 1.7, r: br,        label: '🛑' },
      weapon: { x: VW - br * 3.9, y: VH - br * 4.2, r: br * 0.8,  label: '🔁' },
    };
    for (const k in this.buttons) { this.buttons[k].held = false; this.buttons[k].id = -1; }
  }
};
touch.layout();
window.addEventListener('resize', () => touch.layout());

function touchStart(e) {
  e.preventDefault();
  if (!started) { started = true; AudioSys.init(); return; }
  if (gameOver) { restartGame(); return; }
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
canvas.addEventListener('mousedown', () => {
  if (!started) { started = true; AudioSys.init(); }
  else if (gameOver) restartGame();
});

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

// ---------------- Кола: влизане/излизане/respray ----------------
function tryEnterCar() {
  let best = null, bd = 72 * 72;
  for (const c of cars) {
    if (c.dead) continue;
    const d = dist2(c.x, c.y, player.x, player.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) {
    player.car = best;
    const wasParked = best.parked;
    best.parked = false;
    if (best.kind === 'police') addHeat(35);
    else if (!wasParked) addHeat(8);
    addScore(10, best.x, best.y);
    showMsg('Открадна: ' + best.name, 1.6);
  }
}
function exitCar() {
  const c = player.car;
  if (!c) return;
  c.speed *= 0.2;
  const ex = c.x + Math.cos(c.angle + Math.PI / 2) * (c.w / 2 + 14);
  const ey = c.y + Math.sin(c.angle + Math.PI / 2) * (c.w / 2 + 14);
  const pos = collideCircle(ex, ey, 8);
  player.x = pos.x; player.y = pos.y;
  player.car = null;
}
function updateRespray(dt) {
  resprayCooldown -= dt;
  if (!player.car || resprayCooldown > 0 || player.car.dead) return;
  if (dist2(player.car.x, player.car.y, resprayDoor.x, resprayDoor.y) < 55 * 55) {
    if (player.wanted === 0 && player.car.hp >= player.car.maxHp) return;
    if (score >= 1000) {
      score -= 1000;
      player.heat = 0; recalcWanted();
      player.car.hp = player.car.maxHp;
      player.car.color = CAR_COLORS[Math.floor(R() * CAR_COLORS.length)];
      player.car.burn = 0;
      resprayCooldown = 6;
      showMsg('Пребоядисано! Ченгетата те изгубиха. -$1,000', 3);
      AudioSys.pickup();
    } else if (resprayCooldown <= 0) {
      showMsg('Бояджийницата иска $1,000...', 2);
      resprayCooldown = 4;
    }
  }
}

// ---------------- Ъпдейт: играч ----------------
function updatePlayer(dt, inp) {
  if (player.busted) {
    player.bustedT += dt;
    if (player.bustedT > 3) {
      player.busted = false;
      player.hp = 100;
      player.heat = 0; recalcWanted();
      player.ammo = [-1, 0, 0, 0, 0]; player.weapon = 0;
      mult = Math.max(1, Math.ceil(mult / 2));
      player.x = policeDoor.x; player.y = policeDoor.y;
      showMsg('Пуснаха те от участъка. Оръжията ти ги няма.', 3);
    }
    return;
  }
  if (player.dead) {
    player.deadT += dt;
    if (player.deadT > 3.5) {
      lives--;
      if (lives < 0) { gameOver = true; return; }
      player.dead = false; player.hp = 100;
      player.heat = 0; recalcWanted();
      mult = Math.max(1, mult - 1);
      player.x = hospitalDoor.x; player.y = hospitalDoor.y;
      showMsg('Болницата те закърпи. Остават ' + (lives + 1) + ' живота.', 3);
    }
    return;
  }

  if (actionPressed) {
    actionPressed = false;
    if (player.car) exitCar(); else tryEnterCar();
  }

  if (player.car) updatePlayerCar(dt, inp, player.car);
  else updatePlayerFoot(dt, inp);
  AudioSys.engine(player.car ? player.car.speed : 0, !!player.car);

  // Пикапи
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    const px = player.car ? player.car.x : player.x, py = player.car ? player.car.y : player.y;
    if (dist2(pk.x, pk.y, px, py) < 30 * 30) {
      let taken = true;
      if (pk.type === 'health') { player.hp = Math.min(100, player.hp + 40); showMsg('+Здраве', 1); }
      else if (pk.type === 'armor') { player.armor = Math.min(100, player.armor + 50); showMsg('+Броня', 1); }
      else if (pk.type === 'money') { addScore(300, pk.x, pk.y); }
      else if (pk.type === 'pistol') { player.ammo[1] += 20; if (player.weapon === 0) player.weapon = 1; showMsg('+Пистолет', 1); }
      else if (pk.type === 'mg') { player.ammo[2] += 50; if (player.weapon <= 1) player.weapon = 2; showMsg('+Картечница', 1); }
      else if (pk.type === 'flame') { player.ammo[3] += 40; showMsg('+Огнехвъргачка', 1); }
      else if (pk.type === 'rocket') { player.ammo[4] += 3; showMsg('+Ракетомет', 1); }
      else taken = false;
      if (taken) { pickups.splice(i, 1); AudioSys.pickup(); }
    }
  }

  // Стрелба (пеша)
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
  const spd = 135;
  if (inp.mx || inp.my) {
    player.angle = Math.atan2(inp.my, inp.mx);
    const nx = player.x + inp.mx * spd * dt;
    const ny = player.y + inp.my * spd * dt;
    const pos = collideCircle(nx, ny, 9);
    player.x = pos.x; player.y = pos.y;
  }
}
function updatePlayerCar(dt, inp, c) {
  const fwd = -inp.my;
  let accel = 0;
  if (fwd > 0.1) accel = c.accel * fwd;
  else if (fwd < -0.1) accel = c.speed > 10 ? -c.accel * 1.4 : c.accel * 0.55 * fwd;
  c.speed += accel * dt;
  const t = tileAtPx(c.x, c.y);
  const drag = t === T.ROAD ? 0.55 : 2.2;
  c.speed -= c.speed * drag * dt;
  if (inp.brake) c.speed -= c.speed * 4.5 * dt;
  c.speed = clamp(c.speed, -c.maxSpeed * 0.4, c.maxSpeed);

  const steerInput = inp.mx;
  const handbrakeBoost = inp.brake && Math.abs(c.speed) > 120 ? 1.7 : 1;
  const steerPow = clamp(Math.abs(c.speed) / 60, 0, 1) * 2.5 * handbrakeBoost / Math.sqrt(c.mass);
  if (Math.abs(c.speed) > 4) c.angle += steerInput * steerPow * dt * (c.speed > 0 ? 1 : -1);

  // Следи от гуми при дрифт/спиране
  if ((Math.abs(steerInput) > 0.65 && Math.abs(c.speed) > 230) || (inp.brake && Math.abs(c.speed) > 160)) {
    const bx = c.x - Math.cos(c.angle) * c.l * 0.35, by = c.y - Math.sin(c.angle) * c.l * 0.35;
    const ox = Math.cos(c.angle + Math.PI / 2) * c.w * 0.35, oy = Math.sin(c.angle + Math.PI / 2) * c.w * 0.35;
    const dxv = Math.cos(c.angle) * 6, dyv = Math.sin(c.angle) * 6;
    addSkid(bx + ox, by + oy, bx + ox - dxv, by + oy - dyv);
    addSkid(bx - ox, by - oy, bx - ox - dxv, by - oy - dyv);
  }

  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, c.r);
  if (pos.hit) {
    const impact = Math.abs(c.speed);
    if (impact > 140) {
      damageCar(c, impact * 0.08, false);
      FX.sparks(c.x + Math.cos(c.angle) * c.l / 2, c.y + Math.sin(c.angle) * c.l / 2);
      AudioSys.hit();
    }
    c.speed *= -0.25;
  }
  c.x = pos.x; c.y = pos.y;

  for (const o of cars) {
    if (o === c || o.dead) continue;
    const rr = c.r + o.r - 8;
    const d2v = dist2(c.x, c.y, o.x, o.y);
    if (d2v < rr * rr) {
      const d = Math.sqrt(d2v) || 0.01;
      const overlap = rr - d;
      const dx = (c.x - o.x) / d, dy = (c.y - o.y) / d;
      const totalM = c.mass + o.mass;
      c.x += dx * overlap * (o.mass / totalM); c.y += dy * overlap * (o.mass / totalM);
      o.x -= dx * overlap * (c.mass / totalM); o.y -= dy * overlap * (c.mass / totalM);
      const impact = Math.abs(c.speed);
      if (impact > 120) {
        damageCar(o, impact * 0.07 / o.mass, true);
        damageCar(c, impact * 0.03, false);
        addScore(20, o.x, o.y);
        addHeat(2);
        FX.sparks((c.x + o.x) / 2, (c.y + o.y) / 2);
        FX.glass((c.x + o.x) / 2, (c.y + o.y) / 2);
        AudioSys.hit();
      }
      c.speed *= 0.55;
      o.aiPause = 1.2;
    }
  }
  for (const p of peds) {
    if (p.dead) continue;
    if (dist2(p.x, p.y, c.x, c.y) < (c.r + 6) * (c.r + 6) && Math.abs(c.speed) > 60) {
      damagePed(p, 100, true, 'car');
      c.speed *= 0.93;
    }
  }
  player.x = c.x; player.y = c.y; player.angle = c.angle;
}

// ---------------- Ъпдейт: коли AI ----------------
function updateCarAI(c, dt) {
  if (c.dead) {
    c.burnT += dt;
    if (c.burnT < 4) FX.smoke(c.x + (R() - 0.5) * 14, c.y + (R() - 0.5) * 14);
    if (c.burnT < 1.6) FX.fire(c.x + (R() - 0.5) * 16, c.y + (R() - 0.5) * 16);
    return;
  }
  if (c.burn > 0) {
    c.burn -= dt;
    FX.fire(c.x + (R() - 0.5) * 16, c.y + (R() - 0.5) * 16);
    damageCar(c, 14 * dt, true, 'burning');
    if (c.dead) return;
  }
  if (c.hp < c.maxHp * 0.35 && R() < dt * 8) FX.smoke(c.x, c.y);
  if (c === player.car || c.parked) return;

  if (c.kind === 'police' && player.wanted > 0 && !player.dead && !player.busted) {
    updatePoliceCar(c, dt);
    return;
  }
  c.aiPause -= dt;
  if (c.aiPause > 0) { c.speed *= 0.9; return; }

  const cruise = c.kind === 'bus' || c.kind === 'truck' ? 90 : 120;
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
    }
  }
  if (!inIntersection) c.turned = false;

  const lane = laneCenterFor(c.dir, c.x, c.y);
  let targetAngle = DIR_ANG[c.dir];
  if (c.dir % 2 === 0) {
    const err = lane.y - c.y;
    targetAngle += clamp(err * 0.02, -0.5, 0.5) * (c.dir === 2 ? -1 : 1);
  } else {
    const err = lane.x - c.x;
    targetAngle += clamp(err * 0.02, -0.5, 0.5) * (c.dir === 1 ? -1 : 1);
  }
  c.angle += clamp(angDiff(c.angle, targetAngle), -2.4 * dt, 2.4 * dt);

  const lookAhead = c.l * 0.6 + 30;
  const aheadX = c.x + Math.cos(c.angle) * lookAhead, aheadY = c.y + Math.sin(c.angle) * lookAhead;
  let blocked = false;
  for (const o of cars) {
    if (o === c || o.dead) continue;
    if (dist2(o.x, o.y, aheadX, aheadY) < (o.r + 16) * (o.r + 16)) { blocked = true; break; }
  }
  if (!blocked && !player.car && !player.dead && dist2(player.x, player.y, aheadX, aheadY) < 24 * 24) blocked = true;

  const want = blocked ? 0 : cruise;
  c.speed += clamp(want - c.speed, -300 * dt, 120 * dt);

  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, c.r);
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
  const aggr = 0.65 + level * 0.06 + player.wanted * 0.04;
  const want = d > 70 ? c.maxSpeed * clamp(aggr, 0.6, 0.98) : 30;
  c.speed += clamp(want - c.speed, -400 * dt, c.accel * dt);
  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, c.r);
  if (pos.hit) c.speed *= -0.4;
  c.x = pos.x; c.y = pos.y;

  if (player.car && dist2(c.x, c.y, player.car.x, player.car.y) < (c.r + player.car.r) * (c.r + player.car.r) && Math.abs(c.speed) > 100) {
    damageCar(player.car, 9, false);
    player.car.speed *= 0.82;
    c.speed *= 0.5;
    FX.sparks((c.x + player.car.x) / 2, (c.y + player.car.y) / 2);
    AudioSys.hit();
  }
  if (!player.car && !player.dead && dist2(c.x, c.y, player.x, player.y) < 22 * 22 && Math.abs(c.speed) > 60) {
    damagePlayer(35);
    c.speed *= 0.7;
  }
  // Спрялата патрулка сваля ченгета
  if (c.copsInside > 0 && d < 180 && Math.abs(c.speed) < 50 && R() < dt * 1.5) {
    c.copsInside--;
    const cop = makePed(c.x + (R() - 0.5) * 20, c.y + (R() - 0.5) * 20, true);
    peds.push(cop);
  }
  if (player.wanted >= 3 && d < 320 && R() < dt * (0.5 + level * 0.15)) {
    fireWeapon(c, ta + (R() - 0.5) * 0.15, 1, true);
  }
}

// ---------------- Ъпдейт: пешеходци и ченгета ----------------
function updatePed(p, dt) {
  if (p.dead) { p.deadT += dt; return; }
  if (p.burn > 0) {
    p.burn -= dt;
    p.panic = 5;
    FX.fire(p.x, p.y);
    damagePed(p, 16 * dt, true, 'burning');
    if (p.dead) return;
  }
  if (p.cop && player.wanted > 0 && !player.dead && !player.busted) { updateCopPed(p, dt); return; }
  const spd = p.panic > 0 ? 150 : 45;
  if (p.panic > 0) p.panic -= dt;
  if (R() < dt * (p.panic > 0 ? 1.5 : 0.4)) p.angle += (R() - 0.5) * (p.panic > 0 ? 2.5 : 1.6);
  const nx = p.x + Math.cos(p.angle) * spd * dt;
  const ny = p.y + Math.sin(p.angle) * spd * dt;
  const nt = tileAtPx(nx, ny);
  if (isSolid(nt) || (p.panic <= 0 && nt === T.ROAD)) {
    p.angle += Math.PI / 2 + R();
    return;
  }
  const pos = collideCircle(nx, ny, 7);
  p.x = pos.x; p.y = pos.y;
  if (p.markTarget) {
    const d = dist2(p.x, p.y, player.x, player.y);
    if (d < 350 * 350) { p.panic = 3; p.angle = Math.atan2(p.y - player.y, p.x - player.x); }
  }
}
function updateCopPed(p, dt) {
  const d = Math.sqrt(dist2(p.x, p.y, player.x, player.y));
  const ta = Math.atan2(player.y - p.y, player.x - p.x);
  p.angle = ta;
  if (d > 26) {
    const spd = 115;
    const nx = p.x + Math.cos(p.angle) * spd * dt;
    const ny = p.y + Math.sin(p.angle) * spd * dt;
    const pos = collideCircle(nx, ny, 7);
    p.x = pos.x; p.y = pos.y;
    p.arrestT = 0;
  } else if (!player.car) {
    // Арест — ако ченгето те държи близо
    p.arrestT += dt;
    if (p.arrestT > 0.7) { bustPlayer(); p.arrestT = 0; }
  }
  // Стрелба при издирване ≥ 2
  p.shootT -= dt;
  if (player.wanted >= 2 && d < 260 && d > 40 && p.shootT <= 0) {
    p.shootT = 1.2 - level * 0.08;
    fireWeapon(p, ta + (R() - 0.5) * 0.12, 1, true);
  }
}

// ---------------- Ъпдейт: снаряди ----------------
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const b = projectiles[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const solid = isSolid(tileAtPx(b.x, b.y));
    let gone = b.life <= 0 || solid;
    if (b.type === 'rocket') FX.smoke(b.x, b.y);
    if (b.type === 'flame') FX.fire(b.x, b.y);
    if (!gone) {
      for (const p of peds) {
        if (p.dead) continue;
        if (dist2(p.x, p.y, b.x, b.y) < 13 * 13) {
          if (b.type !== 'rocket') damagePed(p, b.dmg, !b.police, b.type === 'flame' ? 'fire' : 'bullet');
          gone = true; break;
        }
      }
    }
    if (!gone) {
      for (const c of cars) {
        if (c.dead) continue;
        if (dist2(c.x, c.y, b.x, b.y) < c.r * c.r) {
          if (b.type !== 'rocket') damageCar(c, b.dmg * (b.type === 'flame' ? 1 : 0.7), !b.police, b.type === 'flame' ? 'fire' : 'bullet');
          gone = true; break;
        }
      }
    }
    if (!gone && b.police && !player.car && !player.dead) {
      if (dist2(player.x, player.y, b.x, b.y) < 12 * 12) { damagePlayer(b.dmg); gone = true; }
    }
    if (gone) {
      if (b.type === 'rocket') explode(b.x, b.y, !b.police); // ракетата взривява всичко наоколо
      projectiles.splice(i, 1);
    }
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.dur) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.drag) { p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; }
    if (p.grow) p.size += p.grow * dt;
  }
  for (let i = skids.length - 1; i >= 0; i--) {
    skids[i].t += dt;
    if (skids[i].t > 9) skids.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].t += dt;
    if (floaters[i].t > 1.4) floaters.splice(i, 1);
  }
}

// ---------------- Рециклиране ----------------
function recycle(dt) {
  const FAR = 1900 * 1900;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c === player.car || c.marked) continue;
    if (c.dead && c.burnT > 14) { cars.splice(i, 1); continue; }
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
  for (const p of peds) if (!p.dead && !p.cop) livePeds++;
  if (liveCars < 30 && R() < dt * 2.5) {
    const s = randomRoadSpot();
    if (s) {
      const d = dist2(s.x, s.y, player.x, player.y);
      if (d > 600 * 600 && d < FAR) {
        const r = R();
        const kind = r < 0.1 ? 'taxi' : r < 0.16 ? 'sport' : r < 0.24 ? 'bus' : r < 0.34 ? 'truck' : r < 0.38 ? 'police' : 'sedan';
        const c = makeCar(s.x, s.y, DIR_ANG[s.dir], kind);
        c.dir = s.dir;
        cars.push(c);
      }
    }
  }
  if (livePeds < 48 && R() < dt * 4) {
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

function nightAmount() {
  const phase = (gameT % DAY_LENGTH) / DAY_LENGTH;
  return clamp(Math.sin(phase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 0, 1);
}
function restartGame() {
  score = 0; mult = 1; lives = 4; level = 1;
  targetScore = 60000; missionsDone = 0;
  gameOver = false;
  player.hp = 100; player.armor = 0; player.dead = false; player.busted = false;
  player.heat = 0; recalcWanted();
  player.ammo = [-1, 30, 0, 0, 0]; player.weapon = 1;
  player.x = hospitalDoor.x; player.y = hospitalDoor.y;
  if (mission.active) endMission(false);
  mission.cooldown = 3;
}

// ---------------- Рендер ----------------
function worldToScreen(x, y) {
  return { x: (x - camX) * camZoom + VW / 2, y: (y - camY) * camZoom + VH / 2 };
}

function drawGround() {
  const halfW = VW / 2 / camZoom, halfH = VH / 2 / camZoom;
  const minTx = Math.floor((camX - halfW) / TILE) - 1, maxTx = Math.floor((camX + halfW) / TILE) + 1;
  const minTy = Math.floor((camY - halfH) / TILE) - 1, maxTy = Math.floor((camY + halfH) / TILE) + 1;
  const night = nightAmount();
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = tileAt(tx, ty);
      const s = worldToScreen(tx * TILE, ty * TILE);
      const sz = TILE * camZoom + 1;
      const h = hash2(tx, ty);
      let fill;
      switch (t) {
        case T.ROAD: fill = h < 0.5 ? '#3a3a40' : '#3d3d43'; break;
        case T.SIDE: fill = h < 0.5 ? '#95959c' : '#9a9aa1'; break;
        case T.BUILD: fill = '#2c2c30'; break; // под сградата — тъмна основа
        case T.WATER: fill = '#173352'; break;
        case T.PARK: fill = h < 0.5 ? '#3e6b3a' : '#42703e'; break;
        default: fill = '#4c6b46';
      }
      ctx.fillStyle = fill;
      ctx.fillRect(s.x, s.y, sz, sz);

      if (t === T.ROAD) {
        const inter = isRoadRow(ty) && isRoadCol(tx);
        const my = ty % BLOCK, mx = tx % BLOCK;
        if (!inter) {
          // Осева линия
          ctx.fillStyle = '#c9b23c';
          if (my === 4 && isRoadRow(ty)) {
            for (let k = 0; k < 2; k++) ctx.fillRect(s.x + (5 + k * 26) * camZoom, s.y - 1 * camZoom, 9 * camZoom, 2 * camZoom);
          } else if (mx === 4 && isRoadCol(tx)) {
            for (let k = 0; k < 2; k++) ctx.fillRect(s.x - 1 * camZoom, s.y + (5 + k * 26) * camZoom, 2 * camZoom, 9 * camZoom);
          }
          // Пешеходни пътеки преди кръстовище
          ctx.fillStyle = 'rgba(220,220,225,0.75)';
          if (isRoadRow(ty) && (isRoadCol(tx - 1) || isRoadCol(tx + 1))) {
            const zx = isRoadCol(tx + 1) ? s.x + sz - 12 * camZoom : s.x + 4 * camZoom;
            for (let k = 0; k < 4; k++) ctx.fillRect(zx, s.y + (4 + k * 12) * camZoom, 8 * camZoom, 6 * camZoom);
          } else if (isRoadCol(tx) && (isRoadRow(ty - 1) || isRoadRow(ty + 1))) {
            const zy = isRoadRow(ty + 1) ? s.y + sz - 12 * camZoom : s.y + 4 * camZoom;
            for (let k = 0; k < 4; k++) ctx.fillRect(s.x + (4 + k * 12) * camZoom, zy, 6 * camZoom, 8 * camZoom);
          }
          // Шахта
          if (h > 0.93) {
            ctx.fillStyle = '#2e2e33';
            ctx.beginPath(); ctx.arc(s.x + sz / 2, s.y + sz / 2, 5 * camZoom, 0, Math.PI * 2); ctx.fill();
          }
        }
      } else if (t === T.SIDE) {
        // Бордюр към пътя
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        if (isRoadRow(ty + 1)) ctx.fillRect(s.x, s.y + sz - 2.5 * camZoom, sz, 2.5 * camZoom);
        if (isRoadRow(ty - 1)) ctx.fillRect(s.x, s.y, sz, 2.5 * camZoom);
        if (isRoadCol(tx + 1)) ctx.fillRect(s.x + sz - 2.5 * camZoom, s.y, 2.5 * camZoom, sz);
        if (isRoadCol(tx - 1)) ctx.fillRect(s.x, s.y, 2.5 * camZoom, sz);
        // Плочки
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x, s.y, sz / 2, sz / 2);
        ctx.strokeRect(s.x + sz / 2, s.y + sz / 2, sz / 2, sz / 2);
      } else if (t === T.WATER) {
        const ph = Math.sin(gameT * 1.5 + tx * 0.7 + ty * 1.3) * 0.5 + 0.5;
        ctx.fillStyle = 'rgba(120,170,220,' + (0.05 + ph * 0.06) + ')';
        ctx.fillRect(s.x, s.y + sz * (0.3 + 0.3 * ph), sz, 2 * camZoom);
      } else if (t === T.PARK) {
        if (h > 0.85) {
          ctx.fillStyle = 'rgba(70,110,60,0.6)';
          ctx.fillRect(s.x + sz * 0.2, s.y + sz * 0.55, sz * 0.14, sz * 0.1);
          ctx.fillRect(s.x + sz * 0.6, s.y + sz * 0.25, sz * 0.14, sz * 0.1);
        }
      }
    }
  }
  // Слънчева светлина / здрач — топъл оттенък през деня
  if (night < 0.3) {
    ctx.fillStyle = 'rgba(255,240,200,' + (0.03 * (1 - night / 0.3)) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}

function drawSkids() {
  ctx.lineCap = 'round';
  for (const sk of skids) {
    const a = clamp(0.4 * (1 - sk.t / 9), 0, 0.4);
    const p1 = worldToScreen(sk.x1, sk.y1), p2 = worldToScreen(sk.x2, sk.y2);
    ctx.strokeStyle = 'rgba(20,20,22,' + a + ')';
    ctx.lineWidth = 3 * camZoom;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
}

function drawPhonesShops() {
  // Телефонни будки
  for (const ph of phones) {
    const s = worldToScreen(ph.x, ph.y);
    if (s.x < -50 || s.y < -50 || s.x > VW + 50 || s.y > VH + 50) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(camZoom, camZoom);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-7, -6, 16, 16);
    ctx.fillStyle = '#1d4d7a';
    ctx.fillRect(-9, -8, 16, 16);
    ctx.fillStyle = '#bde0f0';
    ctx.fillRect(-6, -5, 10, 7);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☎', -1, 6);
    ctx.restore();
    if (ph.ringing) {
      const k = (gameT * 2) % 1;
      ctx.strokeStyle = 'rgba(120,220,140,' + (1 - k) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, (12 + k * 26) * camZoom, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Respray маркер
  {
    const s = worldToScreen(resprayDoor.x, resprayDoor.y);
    if (s.x > -60 && s.y > -60 && s.x < VW + 60 && s.y < VH + 60) {
      const k = Math.sin(gameT * 3) * 0.5 + 0.5;
      ctx.strokeStyle = 'rgba(80,180,255,' + (0.5 + k * 0.4) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, 26 * camZoom, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(80,180,255,0.9)';
      ctx.font = 'bold ' + Math.round(11 * camZoom) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('СПРЕЙ', s.x, s.y);
    }
  }
  // Kill Frenzy пикапи
  for (const f of frenzySpots) {
    if (f.taken) continue;
    const s = worldToScreen(f.x, f.y);
    if (s.x < -40 || s.y < -40 || s.x > VW + 40 || s.y > VH + 40) continue;
    const bob = Math.sin(gameT * 4) * 3 * camZoom;
    ctx.font = Math.round(18 * camZoom) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(s.x, s.y + bob, 12 * camZoom, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('💀', s.x, s.y + bob);
  }
}

function drawPickups() {
  for (const pk of pickups) {
    const s = worldToScreen(pk.x, pk.y);
    if (s.x < -30 || s.y < -30 || s.x > VW + 30 || s.y > VH + 30) continue;
    const bob = Math.sin(gameT * 3 + pk.spin) * 2.5 * camZoom;
    ctx.save();
    ctx.translate(s.x, s.y + bob);
    ctx.scale(camZoom, camZoom);
    // Щайга (както в класиката)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-8, -6, 17, 17);
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#6a5028';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const icons = { health: '➕', armor: '🛡', money: '💰', pistol: '🔫', mg: '🔫', flame: '🔥', rocket: '🚀' };
    ctx.fillText(icons[pk.type] || '?', 0, 0);
    ctx.restore();
  }
}

function drawCar(c) {
  const s = worldToScreen(c.x, c.y);
  const margin = 100;
  if (s.x < -margin || s.y < -margin || s.x > VW + margin || s.y > VH + margin) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(c.angle);
  ctx.scale(camZoom, camZoom);
  const L = c.l, W = c.w;

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 3, L, W);

  if (c.dead) {
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.fillStyle = '#0e0e10';
    ctx.fillRect(-L / 6, -W / 2 + 3, L / 3.2, W - 6);
    ctx.restore();
    return;
  }

  const dmg = c.hp / c.maxHp;
  const bodyColor = dmg < 0.45 ? shade(c.color, 0.6 + dmg * 0.6) : c.color;

  // Купе със заоблени ъгли
  const r = 5;
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-L / 2 + r, -W / 2);
  ctx.lineTo(L / 2 - r, -W / 2); ctx.quadraticCurveTo(L / 2, -W / 2, L / 2, -W / 2 + r);
  ctx.lineTo(L / 2, W / 2 - r); ctx.quadraticCurveTo(L / 2, W / 2, L / 2 - r, W / 2);
  ctx.lineTo(-L / 2 + r, W / 2); ctx.quadraticCurveTo(-L / 2, W / 2, -L / 2, W / 2 - r);
  ctx.lineTo(-L / 2, -W / 2 + r); ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + r, -W / 2);
  ctx.fill();
  // Светлосенки по купето
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(-L / 2 + 2, -W / 2 + 1.5, L - 4, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(-L / 2 + 2, W / 2 - 4.5, L - 4, 3);

  if (c.kind === 'bus') {
    // Прозорци по дължина
    ctx.fillStyle = 'rgba(160,210,240,0.85)';
    for (let k = 0; k < 5; k++) ctx.fillRect(-L / 2 + 8 + k * (L - 18) / 5, -W / 2 + 3, (L - 22) / 5 - 3, 4);
    for (let k = 0; k < 5; k++) ctx.fillRect(-L / 2 + 8 + k * (L - 18) / 5, W / 2 - 7, (L - 22) / 5 - 3, 4);
    ctx.fillStyle = 'rgba(20,30,40,0.75)';
    ctx.fillRect(L / 2 - 8, -W / 2 + 3, 5, W - 6);
  } else if (c.kind === 'truck') {
    // Кабина + каросерия
    ctx.fillStyle = 'rgba(20,30,40,0.75)';
    ctx.fillRect(L / 2 - 16, -W / 2 + 3, 7, W - 6);
    ctx.fillStyle = shade(bodyColor, 0.75);
    ctx.fillRect(-L / 2 + 3, -W / 2 + 2, L / 2 + 4, W - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-L / 2 + 3, -W / 2 + 2, L / 2 + 4, W - 4);
  } else {
    // Покрив + предно/задно стъкло
    ctx.fillStyle = shade(bodyColor, 0.8);
    ctx.fillRect(-L / 6 - 2, -W / 2 + 3, L / 2.6, W - 6);
    ctx.fillStyle = 'rgba(160,210,240,0.9)';
    ctx.fillRect(L / 6 - 1, -W / 2 + 3.5, 4, W - 7);
    ctx.fillStyle = 'rgba(130,180,215,0.8)';
    ctx.fillRect(-L / 6 - 4, -W / 2 + 3.5, 3, W - 7);
  }

  // Фарове и стопове
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 4);
  ctx.fillRect(L / 2 - 3, W / 2 - 6, 3, 4);
  ctx.fillStyle = '#c22';
  ctx.fillRect(-L / 2, -W / 2 + 2, 2, 4);
  ctx.fillRect(-L / 2, W / 2 - 6, 2, 4);

  if (c.kind === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-L / 8, -W / 2, L / 4, W);
    ctx.fillStyle = '#123';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const on = Math.floor(c.siren) % 2 === 0;
    ctx.fillStyle = on ? '#f33' : '#33f';
    ctx.fillRect(-5, -5, 9, 4);
    ctx.fillStyle = on ? '#33f' : '#f33';
    ctx.fillRect(-5, 1, 9, 4);
  }
  if (c.kind === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-3, -4, 7, 8);
    ctx.fillStyle = '#e8b800';
    ctx.font = 'bold 6px sans-serif';
  }
  ctx.restore();

  if (c.marked) {
    ctx.strokeStyle = 'rgba(80,220,120,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (c.l * 0.75 + Math.sin(gameT * 5) * 4) * camZoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  const night = nightAmount();
  if (night > 0.45 && Math.abs(c.speed) > 5) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(c.angle);
    const grad = ctx.createLinearGradient(c.l / 2 * camZoom, 0, (c.l / 2 + 95) * camZoom, 0);
    grad.addColorStop(0, 'rgba(255,240,170,' + (0.22 * night) + ')');
    grad.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(c.l / 2 * camZoom, -7 * camZoom);
    ctx.lineTo((c.l / 2 + 95) * camZoom, -34 * camZoom);
    ctx.lineTo((c.l / 2 + 95) * camZoom, 34 * camZoom);
    ctx.lineTo(c.l / 2 * camZoom, 7 * camZoom);
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
    ctx.fillStyle = 'rgba(120,16,16,0.55)';
    ctx.beginPath(); ctx.arc(-2, 1, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.shirt;
    ctx.fillRect(-8, -4, 16, 8);
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(9, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(1.5, 1.5, 6.5, 0, Math.PI * 2); ctx.fill();
  const step = Math.sin(gameT * 12 + p.x * 0.1) * (p.panic > 0 || p.cop ? 4 : 2.4);
  ctx.fillStyle = '#223';
  ctx.fillRect(-2 + step, -5, 4, 3);
  ctx.fillRect(-2 - step, 2, 4, 3);
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  // Рамене
  ctx.fillStyle = shade(p.shirt, 0.75);
  ctx.fillRect(-2, -6.5, 4, 2.4);
  ctx.fillRect(-2, 4.1, 4, 2.4);
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(2, 0, 3.4, 0, Math.PI * 2); ctx.fill();
  if (p.cop) {
    // Фуражка
    ctx.fillStyle = '#20375c';
    ctx.beginPath(); ctx.arc(2, 0, 3.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9b23c';
    ctx.fillRect(3.6, -1, 1.6, 2);
  }
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
  if (player.car || player.dead || player.busted) return;
  const s = worldToScreen(player.x, player.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(camZoom, camZoom);
  ctx.rotate(player.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(2, 2, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#16161e';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0e0e14';
  ctx.fillRect(-2.5, -7.6, 5, 2.6);
  ctx.fillRect(-2.5, 5, 5, 2.6);
  const w = WEAPONS[player.weapon];
  if (!w.melee) {
    ctx.fillStyle = '#333';
    ctx.fillRect(4, -1.5, w.rocket ? 12 : 9, 3);
    if (w.rocket) { ctx.fillStyle = '#722'; ctx.fillRect(13, -2.2, 4, 4.4); }
  }
  ctx.fillStyle = '#e0b090';
  ctx.beginPath(); ctx.arc(2.5, 0, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawProjectiles() {
  for (const b of projectiles) {
    const s = worldToScreen(b.x, b.y);
    if (b.type === 'bullet') {
      ctx.fillStyle = '#ffdf80';
      ctx.fillRect(s.x - 2, s.y - 2, 4 * camZoom, 4 * camZoom);
    } else if (b.type === 'rocket') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.scale(camZoom, camZoom);
      ctx.fillStyle = '#888';
      ctx.fillRect(-6, -2.5, 12, 5);
      ctx.fillStyle = '#c33';
      ctx.fillRect(4, -2.5, 3, 5);
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath(); ctx.arc(-7, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // flame се вижда чрез частиците
  }
}
function drawParticles() {
  for (const p of particles) {
    const s = worldToScreen(p.x, p.y);
    const k = p.t / p.dur;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, p.size) * camZoom, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Псевдо-3D сгради — стени + покриви, проектирани от центъра на камерата
function drawBuildings() {
  const halfW = VW / 2 / camZoom, halfH = VH / 2 / camZoom;
  const minTx = Math.floor((camX - halfW) / TILE) - 2, maxTx = Math.floor((camX + halfW) / TILE) + 2;
  const minTy = Math.floor((camY - halfH) / TILE) - 2, maxTy = Math.floor((camY + halfH) / TILE) + 2;
  const tiles = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (tileAt(tx, ty) !== T.BUILD) continue;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      tiles.push({ tx, ty, d: dist2(cx, cy, camX, camY) });
    }
  }
  tiles.sort((a, b) => b.d - a.d); // далечните първо, близките ги закриват

  const cX = VW / 2, cY = VH / 2;
  const night = nightAmount();
  for (const tI of tiles) {
    const { tx, ty } = tI;
    const key = blockKeyOf(tx, ty);
    const h = blockHeight[key] || 1;
    const f = 0.035 * h;
    const wall = blockColor[key] || '#888';
    const roof = blockRoof[key] || '#6e6a66';

    // Ъгли на земята (екранни координати)
    const g = [
      worldToScreen(tx * TILE, ty * TILE),
      worldToScreen(tx * TILE + TILE, ty * TILE),
      worldToScreen(tx * TILE + TILE, ty * TILE + TILE),
      worldToScreen(tx * TILE, ty * TILE + TILE)
    ];
    // Ъгли на покрива — отместени навън от центъра на екрана
    const rf = g.map(p => ({ x: p.x + (p.x - cX) * f, y: p.y + (p.y - cY) * f }));

    // Стени — само на външни ръбове (съсед, който не е сграда от същия блок)
    const edges = [
      { a: 0, b: 1, nx: 0, ny: -1, sh: 0.78 },
      { a: 1, b: 2, nx: 1, ny: 0, sh: 0.6 },
      { a: 2, b: 3, nx: 0, ny: 1, sh: 0.5 },
      { a: 3, b: 0, nx: -1, ny: 0, sh: 0.68 }
    ];
    for (const e of edges) {
      const ntx = tx + e.nx, nty = ty + e.ny;
      if (tileAt(ntx, nty) === T.BUILD && blockKeyOf(ntx, nty) === key) continue;
      ctx.fillStyle = shade(wall, e.sh);
      ctx.beginPath();
      ctx.moveTo(g[e.a].x, g[e.a].y);
      ctx.lineTo(g[e.b].x, g[e.b].y);
      ctx.lineTo(rf[e.b].x, rf[e.b].y);
      ctx.lineTo(rf[e.a].x, rf[e.a].y);
      ctx.closePath();
      ctx.fill();
      // Прозорци по стената (при по-високи сгради)
      if (h >= 2 && camZoom > 0.8) {
        const litSeed = hash2(tx * 3 + e.a, ty * 3 + e.b);
        ctx.fillStyle = night > 0.5 && litSeed > 0.4 ? 'rgba(255,220,130,0.55)' : 'rgba(20,26,36,0.35)';
        for (let wi = 1; wi <= 2; wi++) {
          const t0 = wi / 3;
          const wx1 = g[e.a].x + (rf[e.a].x - g[e.a].x) * t0;
          const wy1 = g[e.a].y + (rf[e.a].y - g[e.a].y) * t0;
          const wx2 = g[e.b].x + (rf[e.b].x - g[e.b].x) * t0;
          const wy2 = g[e.b].y + (rf[e.b].y - g[e.b].y) * t0;
          for (let seg = 0.15; seg < 0.85; seg += 0.24) {
            const px = wx1 + (wx2 - wx1) * seg, py = wy1 + (wy2 - wy1) * seg;
            ctx.fillRect(px, py, 4 * camZoom, 3 * camZoom);
          }
        }
      }
    }

    // Покрив
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(rf[0].x, rf[0].y);
    ctx.lineTo(rf[1].x, rf[1].y);
    ctx.lineTo(rf[2].x, rf[2].y);
    ctx.lineTo(rf[3].x, rf[3].y);
    ctx.closePath();
    ctx.fill();
    // Ръб на покрива
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Детайли на покрива (детерминистични)
    const hh = hash2(tx, ty);
    const rcx = (rf[0].x + rf[2].x) / 2, rcy = (rf[0].y + rf[2].y) / 2;
    const rsz = TILE * camZoom * (1 + f);
    if (hh > 0.75) {
      ctx.fillStyle = shade(roof, 0.8);
      ctx.fillRect(rcx - rsz * 0.16, rcy - rsz * 0.13, rsz * 0.32, rsz * 0.26);
      ctx.fillStyle = shade(roof, 1.15);
      ctx.fillRect(rcx - rsz * 0.16, rcy - rsz * 0.13, rsz * 0.32, rsz * 0.05);
    } else if (hh > 0.6) {
      ctx.fillStyle = shade(roof, 0.7);
      ctx.beginPath(); ctx.arc(rcx + rsz * 0.15, rcy, rsz * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    // Специални покриви
    if (key === hospitalBlock && hh > 0.9) { /* центърът се маркира по-долу */ }
  }

  // Знаци на специалните сгради (в центъра на блока)
  drawBlockLabel(hospitalBlock, '#e04545', '➕');
  drawBlockLabel(policeBlock, '#e8e8f0', '🛡');
  drawBlockLabel(resprayBlock, '#50b4ff', '🎨');

  // Дървета в парковете — леко проектирани (над колите/пешеходците)
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (tileAt(tx, ty) !== T.PARK) continue;
      if (hash2(tx, ty) <= 0.72) continue;
      const wx = tx * TILE + TILE / 2 + (hash2(tx + 9, ty) - 0.5) * 22;
      const wy = ty * TILE + TILE / 2 + (hash2(tx, ty + 9) - 0.5) * 22;
      const s = worldToScreen(wx, wy);
      const tf = 0.03;
      const topX = s.x + (s.x - cX) * tf, topY = s.y + (s.y - cY) * tf;
      // Сянка + ствол + корона
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(s.x + 3 * camZoom, s.y + 3 * camZoom, 9 * camZoom, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a4632';
      ctx.lineWidth = 3 * camZoom;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(topX, topY); ctx.stroke();
      ctx.fillStyle = '#2c4f28';
      ctx.beginPath(); ctx.arc(topX, topY, 11 * camZoom, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a6534';
      ctx.beginPath(); ctx.arc(topX - 2.5 * camZoom, topY - 2.5 * camZoom, 7.5 * camZoom, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function drawBlockLabel(key, color, icon) {
  const [bx, by] = key.split(',').map(Number);
  const wx = (bx * BLOCK + BLOCK / 2) * TILE, wy = (by * BLOCK + BLOCK / 2) * TILE;
  const s = worldToScreen(wx, wy);
  if (s.x < -100 || s.y < -100 || s.x > VW + 100 || s.y > VH + 100) return;
  const cX = VW / 2, cY = VH / 2;
  const h = blockHeight[key] || 2;
  const f = 0.035 * h;
  const px = s.x + (s.x - cX) * f, py = s.y + (s.y - cY) * f;
  ctx.font = 'bold ' + Math.round(26 * camZoom) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(icon, px, py);
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

// Минимапа
const miniCanvas = document.createElement('canvas');
(function renderMini() {
  miniCanvas.width = MW; miniCanvas.height = MH;
  const mc = miniCanvas.getContext('2d');
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const t = map[y * MW + x];
      mc.fillStyle = t === T.ROAD ? '#54545a' : t === T.WATER ? '#173352' : t === T.BUILD ? '#8a7666' : t === T.PARK ? '#3e6b3a' : '#84848a';
      mc.fillRect(x, y, 1, 1);
    }
  }
})();
function drawMiniMap() {
  const size = clamp(Math.min(VW, VH) * 0.22, 90, 150);
  const pad = 10;
  const x0 = VW - size - pad, y0 = pad;
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#000';
  ctx.fillRect(x0 - 2, y0 - 2, size + 4, size + 4);
  ctx.drawImage(miniCanvas, x0, y0, size, size);
  const sx = size / (MW * TILE), sy = size / (MH * TILE);
  // Специални места
  ctx.fillStyle = '#e04545';
  ctx.fillRect(x0 + hospitalDoor.x * sx - 1.5, y0 + hospitalDoor.y * sy - 1.5, 3, 3);
  ctx.fillStyle = '#50b4ff';
  ctx.fillRect(x0 + resprayDoor.x * sx - 1.5, y0 + resprayDoor.y * sy - 1.5, 3, 3);
  for (const ph of phones) {
    if (!ph.ringing) continue;
    const bl = Math.floor(gameT * 3) % 2 === 0;
    if (bl) {
      ctx.fillStyle = '#6be08a';
      ctx.beginPath(); ctx.arc(x0 + ph.x * sx, y0 + ph.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
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
  ctx.fillStyle = '#39f';
  for (const c of cars) {
    if (c.kind === 'police' && !c.dead) ctx.fillRect(x0 + c.x * sx - 1.5, y0 + c.y * sy - 1.5, 3, 3);
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x0 + player.x * sx, y0 + player.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return { x0, y0, size };
}

function drawPoliceHead(x, y, r, active) {
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.25;
  // Лице
  ctx.fillStyle = '#e8b48c';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  // Фуражка
  ctx.fillStyle = '#20375c';
  ctx.beginPath(); ctx.arc(x, y - r * 0.25, r, Math.PI, 0); ctx.fill();
  ctx.fillRect(x - r, y - r * 0.35, r * 2, r * 0.28);
  ctx.fillStyle = '#c9b23c';
  ctx.fillRect(x - r * 0.2, y - r * 0.72, r * 0.4, r * 0.3);
  // Очи
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(x - r * 0.32, y + r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.32, y + r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHUD() {
  const pad = 10;
  ctx.textBaseline = 'top';

  // === Резултат (в центъра горе, като в класиката) ===
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  const scoreTxt = fmtMoney(score);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(scoreTxt, VW / 2, pad);
  ctx.fillStyle = '#ffd23c';
  ctx.fillText(scoreTxt, VW / 2, pad);
  // Множител
  if (mult > 1) {
    ctx.font = 'bold 16px monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    const mtxt = 'x' + mult;
    ctx.strokeText(mtxt, VW / 2 + ctx.measureText(scoreTxt).width * 0.9 + 26, pad + 6);
    ctx.fillStyle = '#7ee08a';
    ctx.fillText(mtxt, VW / 2 + ctx.measureText(scoreTxt).width * 0.9 + 26, pad + 6);
  }
  // Прогрес към целта
  {
    const bw = 120, bh = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(VW / 2 - bw / 2, pad + 30, bw, bh);
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(VW / 2 - bw / 2, pad + 30, bw * clamp(score / targetScore, 0, 1), bh);
  }

  // === Ляво: животи, здраве, оръжие ===
  ctx.textAlign = 'left';
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#ff6b7a';
  let hearts = '';
  for (let i = 0; i < Math.min(lives, 7); i++) hearts += '❤';
  ctx.fillText(hearts + (lives > 7 ? ' +' + (lives - 7) : ''), pad, pad);

  const bw = 130, bh = 9;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(pad, pad + 24, bw, bh);
  ctx.fillStyle = player.hp > 30 ? '#d84d4d' : '#ff2222';
  ctx.fillRect(pad, pad + 24, bw * player.hp / 100, bh);
  if (player.armor > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(pad, pad + 36, bw, 5);
    ctx.fillStyle = '#4aa3ff';
    ctx.fillRect(pad, pad + 36, bw * player.armor / 100, 5);
  }
  ctx.font = '13px monospace';
  ctx.fillStyle = '#eee';
  const w = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  ctx.fillText(w.name + (ammo >= 0 ? ' · ' + (ammo > 999 ? '∞' : ammo) : ''), pad, pad + 46);
  if (player.car) {
    ctx.fillStyle = '#aac';
    ctx.fillText(player.car.name + ' ▮' + Math.max(0, Math.ceil(player.car.hp / player.car.maxHp * 100)) + '%', pad, pad + 62);
  }

  // === Дясно: издирване под минимапата ===
  const mini = { x0: VW - clamp(Math.min(VW, VH) * 0.22, 90, 150) - 10, y0: 10, size: clamp(Math.min(VW, VH) * 0.22, 90, 150) };
  const headR = 9;
  for (let i = 0; i < 4; i++) {
    drawPoliceHead(mini.x0 + 12 + i * (headR * 2.4), mini.y0 + mini.size + 16, headR, i < player.wanted);
  }

  // === Съобщения ===
  if (message && messageT > 0) {
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    const y = VH * 0.17;
    const tw = ctx.measureText(message).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(VW / 2 - tw / 2 - 12, y - 7, tw + 24, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(message, VW / 2, y);
  }
  if (mission.active) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = mission.timer < 10 ? '#ff5555' : '#ffd23c';
    ctx.fillText('⏱ ' + Math.ceil(mission.timer) + 'с', VW / 2, pad + 40);
  }
  if (frenzy.active) {
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    const bl = Math.floor(gameT * 4) % 2 === 0;
    ctx.fillStyle = bl ? '#ff4444' : '#ffdd44';
    ctx.fillText('ЛУДОСТ ' + frenzy.kills + '/' + frenzy.goal + ' · ' + Math.ceil(frenzy.timer) + 'с', VW / 2, VH * 0.1);
  }

  // Плаващи числа
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  for (const fl of floaters) {
    const s = worldToScreen(fl.x, fl.y);
    ctx.globalAlpha = clamp(1 - fl.t / 1.4, 0, 1);
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.txt, s.x, s.y - 14 - fl.t * 26);
  }
  ctx.globalAlpha = 1;

  // === Големи екрани ===
  if (player.dead) {
    ctx.fillStyle = 'rgba(70,0,0,' + clamp(player.deadT * 0.4, 0, 0.6) + ')';
    ctx.fillRect(0, 0, VW, VH);
    bigCenterText('ЕЛИМИНИРАН', '#ff5560');
  }
  if (player.busted) {
    ctx.fillStyle = 'rgba(0,10,50,' + clamp(player.bustedT * 0.4, 0, 0.6) + ')';
    ctx.fillRect(0, 0, VW, VH);
    bigCenterText('АРЕСТУВАН!', '#7ab6ff');
  }
  if (levelCompleteT > 0) {
    bigCenterText('ГРАД ' + (level - 1) + ' ЗАВЪРШЕН!', '#ffd23c');
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('Нова цел: ' + fmtMoney(targetScore) + ' · +1 живот', VW / 2, VH / 2 + 44);
  }
  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, VW, VH);
    bigCenterText('КРАЙ НА ИГРАТА', '#ff5560');
    ctx.font = '17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('Резултат: ' + fmtMoney(score) + (score >= scoreBest ? ' · НОВ РЕКОРД!' : ' · Рекорд: ' + fmtMoney(scoreBest)), VW / 2, VH / 2 + 44);
    ctx.fillText(IS_TOUCH ? 'Докосни за нова игра' : 'Натисни клавиш за нова игра', VW / 2, VH / 2 + 74);
  }
  if (paused && !gameOver) bigCenterText('ПАУЗА', '#fff');

  // Тъч контроли
  if (IS_TOUCH && !gameOver) drawTouchControls();
}
function bigCenterText(txt, color) {
  ctx.font = 'bold ' + Math.min(52, VW * 0.09) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(txt, VW / 2, VH / 2);
  ctx.fillStyle = color;
  ctx.fillText(txt, VW / 2, VH / 2);
  ctx.textBaseline = 'top';
}
function drawTouchControls() {
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

function drawStartScreen() {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.min(64, VW * 0.1) + 'px sans-serif';
  ctx.fillStyle = '#ffd23c';
  ctx.fillText('GANG CITY', VW / 2, VH * 0.24);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#ccc';
  const lines = IS_TOUCH ? [
    'Събери ' + fmtMoney(targetScore) + ', за да превземеш града!',
    'Отговаряй на звънящите телефони ☎ за работа от шефа.',
    '',
    'Ляв палец — движение / волан',
    '🚗 влез/излез · 🔫 стрелба · 🛑 спирачка/дрифт · 🔁 оръжие',
    'Внимавай: полицията арестува, а болницата взима живот.',
    '',
    'Докосни екрана, за да започнеш'
  ] : [
    'Събери ' + fmtMoney(targetScore) + ', за да превземеш града!',
    'Отговаряй на звънящите телефони ☎ за работа от шефа.',
    '',
    'WASD / стрелки — движение и шофиране',
    'E — влез/излез · F — стрелба · Q — оръжие · Space — спирачка/дрифт · P — пауза',
    'Внимавай: полицията арестува, а болницата взима живот.',
    '',
    'Натисни клавиш, за да започнеш'
  ];
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, VH * 0.42 + i * 24));
  if (scoreBest > 0) {
    ctx.fillStyle = '#7ee08a';
    ctx.fillText('Рекорд: ' + fmtMoney(scoreBest), VW / 2, VH * 0.42 + lines.length * 24 + 18);
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

  if (!paused && !gameOver) {
    gameT += dt;
    if (messageT > 0) messageT -= dt;
    if (levelCompleteT > 0) levelCompleteT -= dt;

    const inp = inputState();
    updatePlayer(dt, inp);
    for (const c of cars) updateCarAI(c, dt);
    for (const p of peds) updatePed(p, dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updateWanted(dt);
    updatePhones(dt);
    updateMission(dt);
    updateFrenzy(dt);
    updateRespray(dt);
    recycle(dt);

    // Сирена — ако наблизо гони патрулка
    let sirenOn = false;
    if (player.wanted > 0) {
      for (const c of cars) {
        if (c.kind === 'police' && !c.dead && dist2(c.x, c.y, player.x, player.y) < 700 * 700) { sirenOn = true; break; }
      }
    }
    AudioSys.siren(sirenOn, dt);

    if (score > scoreBest) {
      scoreBest = score;
      try { localStorage.setItem('gangcity_best', String(scoreBest)); } catch (e) {}
    }

    // Камера — по-силен зуум навън при скорост (както в класиката)
    const spd = player.car ? Math.abs(player.car.speed) : 0;
    const targetZoom = player.car ? clamp(1.12 - spd / 620, 0.62, 1.05) : 1.15;
    camZoom += (targetZoom - camZoom) * dt * 1.8;
    const lookAhead = player.car ? clamp(player.car.speed * 0.4, -150, 150) : 0;
    const txp = player.x + Math.cos(player.angle) * lookAhead;
    const typ = player.y + Math.sin(player.angle) * lookAhead;
    camX += (txp - camX) * dt * 5;
    camY += (typ - camY) * dt * 5;
  }

  // ---- Рендер ----
  drawGround();
  drawSkids();
  drawPhonesShops();
  drawPickups();
  for (const p of peds) if (p.dead) drawPed(p);
  for (const c of cars) drawCar(c);
  for (const p of peds) if (!p.dead) drawPed(p);
  drawPlayer();
  drawProjectiles();
  drawParticles();
  drawMissionMarkers();
  drawBuildings();          // сградите закриват всичко зад тях (както в класиката)

  const night = nightAmount();
  if (night > 0.02) {
    ctx.fillStyle = 'rgba(8,8,34,' + (night * 0.42) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }

  drawMiniMap();
  drawHUD();
}
requestAnimationFrame(frame);
