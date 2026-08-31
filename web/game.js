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

// ---------------- Текстури и "фото" ефекти ----------------
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const TEX = { grain: null, organic: null, vignette: null };
(function buildNoise() {
  // Фин зърнест шум — асфалт, бетон, покриви
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  const id = g.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const lum = Math.random() < 0.5 ? 0 : 255;
    id.data[i] = lum; id.data[i + 1] = lum; id.data[i + 2] = lum;
    id.data[i + 3] = Math.random() * 44;
  }
  g.putImageData(id, 0, 0);
  TEX.grain = c;
  // Органичен петнист шум — трева, паркове, вода
  const c2 = makeCanvas(256, 256), g2 = c2.getContext('2d');
  const id2 = g2.createImageData(256, 256);
  for (let i = 0; i < id2.data.length; i += 4) {
    const n = Math.random() * 0.5 + Math.random() * 0.5;
    const lum = n < 0.5 ? 0 : 255;
    id2.data[i] = lum; id2.data[i + 1] = lum; id2.data[i + 2] = lum;
    id2.data[i + 3] = Math.abs(n - 0.5) * 110;
  }
  g2.putImageData(id2, 0, 0);
  TEX.organic = c2;
})();
function buildVignette() {
  const c = makeCanvas(Math.max(2, Math.round(VW / 4)), Math.max(2, Math.round(VH / 4)));
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.5,
    c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.78);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(8,8,18,0.38)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  TEX.vignette = c;
}
buildVignette();
window.addEventListener('resize', buildVignette);

// Сенчест слой (половин резолюция — меки сенки, евтино)
const shadowCanvas = makeCanvas(2, 2);
function sizeShadowCanvas() {
  shadowCanvas.width = Math.max(2, Math.round(VW / 2));
  shadowCanvas.height = Math.max(2, Math.round(VH / 2));
}
sizeShadowCanvas();
window.addEventListener('resize', sizeShadowCanvas);

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

// Градове: София (по действителния център) + класическата тройка
const THEMES = [
  {
    name: 'София',
    cast: 'rgb(255,240,214)', glow: '255,210,60', nightBias: 0, rainBias: 1, payMult: 1, heatMult: 1,
    tagline: 'Домът. Тук започва всичко.', starCar: 'sport',
    sofia: true,
    walls: ['#d9c9a9', '#e6dcc6', '#c9b998', '#b3a890', '#d3c3b3', '#e2d2ba', '#cfc0a4', '#bfae94'],
    roofs: ['#9a5f48', '#a86a50', '#8a6a55', '#7a7068', '#96604a'],
    road: ['#3c3c42', '#3f3f45'], side: ['#aaa294', '#afa799'],
    park: ['#42703c', '#467440'], water: '#2a5a74', grass: '#5c7448',
    lane: '#d8d4c8', parkChance: 0.18, palm: false, metro: '#2a6db5',
    stations: ['Лъвов мост', 'СУ Кл. Охридски', 'НДК', 'Опълченска'],
    streetsH: ['ул. Козлодуй', 'бул. Сливница', 'бул. Тодор Александров', 'бул. Цар Освободител', 'ул. Граф Игнатиев', 'бул. Патриарх Евтимий', 'бул. България', 'бул. Гоце Делчев'],
    streetsV: ['бул. К. Величков', 'бул. Опълченска', 'бул. Мария Луиза', 'бул. Витоша', 'ул. Г. С. Раковски', 'бул. Васил Левски', 'бул. Евлоги Георгиев', 'бул. Цариградско шосе']
  },
  {
    name: 'Русе',
    cast: 'rgb(214,240,208)', glow: '120,220,140', nightBias: 0, rainBias: 1.6, payMult: 1.25, heatMult: 1.1,
    tagline: 'Дунавът е влажен, но плаща добре.', starCar: 'cabrio',
    ruse: true, freeform: true, lowRise: true,
    walls: ['#e9dfc8', '#dcc9a5', '#e6d6b8', '#d3bb93', '#eae3d3', '#cbb79b', '#e0d2be', '#d8c2a2', '#f0e8d8', '#c4ae8e'],
    roofs: ['#a1573e', '#95513a', '#8a5a46', '#7d6c5a', '#9a6248'],
    road: ['#3d3d43', '#404046'], side: ['#b6ae9e', '#bbb3a3'],
    park: ['#477a40', '#4b7e44'], water: '#38678a', grass: '#61794c',
    lane: '#e2ded2', parkChance: 0, palm: false, metro: '#2a7a4a',
    stations: ['Пл. Батенберг', 'Операта', 'Борисова', 'Кеят'],
    streetNames: ['бул. Придунавски', 'ул. Княжеска', 'ул. Александровска', 'ул. Хан Аспарух', 'бул. Ген. Скобелев', 'бул. Цар Фердинанд', 'ул. Ангел Кънчев', 'бул. Цар Освободител', 'ул. Църковна независимост', 'ул. Муткурова', 'ул. Петко Д. Петков', 'ул. Стефан Караджа', 'ул. Борисова']
  },
  {
    name: 'Стоманград',
    cast: 'rgb(196,208,226)', glow: '130,170,230', nightBias: 0.35, rainBias: 1.3, payMult: 1.5, heatMult: 1.25,
    tagline: 'Град без слънце. Но с много пари.', starCar: 'volta',
    walls: ['#9a7b64', '#8b8d99', '#ab9070', '#7d8c78', '#997f9e', '#b09a80', '#82909f', '#a58474', '#c0aa8a', '#6f7f8f'],
    roofs: ['#6e6a66', '#7a7672', '#5f6468', '#746e64', '#686e62', '#7e7468'],
    road: ['#3a3a40', '#3d3d43'], side: ['#95959c', '#9a9aa1'],
    park: ['#3e6b3a', '#42703e'], water: '#173352', grass: '#4c6b46',
    lane: '#c9b23c', parkChance: 0.16, palm: false, metro: '#3a6ea8',
    stations: ['Север', 'Изток', 'Юг', 'Запад']
  },
  {
    name: 'Сан Прахос',
    cast: 'rgb(255,214,178)', glow: '255,150,70', nightBias: -0.35, rainBias: 0.15, payMult: 1.75, heatMult: 1.4,
    tagline: 'Пек, прах и суперколи.', starCar: 'toro',
    walls: ['#e8ccb8', '#d4e0c4', '#f0e2c4', '#c4d8e4', '#e4c8d8', '#f0d2a8', '#d6cab2', '#b8d0c2', '#f4e8d0', '#ccb8a0'],
    roofs: ['#a89078', '#98a088', '#b0a080', '#8a9aa4', '#a4988a', '#9aa48a'],
    road: ['#46464c', '#49494f'], side: ['#b2aa9a', '#b7afa0'],
    park: ['#5c7c3c', '#617f40'], water: '#1d5a78', grass: '#6c7c48',
    lane: '#e8e4d8', parkChance: 0.22, palm: true, metro: '#c03830',
    stations: ['Север', 'Изток', 'Юг', 'Запад']
  },
  {
    name: 'Вайб Сити',
    cast: 'rgb(244,196,226)', glow: '255,110,200', nightBias: 0.5, rainBias: 1.2, payMult: 2, heatMult: 1.6,
    tagline: 'Неон, дъжд и Кавало. Върхът.', starCar: 'cavallo',
    walls: ['#e8a8c0', '#a8d8d0', '#f0d8b0', '#c4b0e0', '#f0b8a8', '#b8e0f0', '#e8e0d0', '#d8b8d8', '#f8d0c8', '#b0c8e8'],
    roofs: ['#95788a', '#7a8a92', '#a08a92', '#8a927a', '#928a9a'],
    road: ['#3e3a42', '#413d45'], side: ['#c2b2a2', '#c7b7a7'],
    park: ['#4a7a4c', '#4e7e50'], water: '#0e6080', grass: '#5c7a52',
    lane: '#f0c0d0', parkChance: 0.2, palm: true, metro: '#20a8a0',
    stations: ['Север', 'Изток', 'Юг', 'Запад']
  }
];
// Специални слоеве на картата
let yellowRoad = null;    // жълтите павета (София)
let pedRoad = null;       // пешеходни улици (Витоша, Александровска)
let crossWalkMap = null;  // пресичания на пешеходна улица с булевард
let lmMap = null;         // коя плочка на коя забележителност принадлежи
let landmarks = [];       // забележителности с custom рисуване
let laneDirMap = null;    // посока на лентата за всяка пътна плочка (255 = кръстовище)
let streetIdxMap = null;  // име на улицата за всяка пътна плочка (freeform градове)
let pedZoneTiles = [];    // плочки за спаунване на пешеходци в пешеходните зони
function laneDirAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || !laneDirMap) return 255;
  if (tileAt(tx, ty) !== T.ROAD) return 254; // не е път
  return laneDirMap[ty * MW + tx];
}
let cityIdx = 0;
let theme = THEMES[0];
let hospitalDoor = null, policeDoor = null, resprayDoor = null;
let crusherDoor = null, churchDoor = null;
let crusherCd = 0, churchCd = 0;
const taxiJob = { fare: null, dest: null, t: 0, pay: 0, offCd: 0 };
const GANGS = [
  { name: 'Западните', color: '#3a6fb5' },
  { name: 'Източните', color: '#b53a3a' },
];
const respect = [0, 0];   // -100..100 за всяка банда
let gangZoneLast = -2;
function gangAt(x) {
  const f = x / (MW * TILE);
  return f < 0.42 ? 0 : f > 0.58 ? 1 : -1;   // средата е ничия земя
}

/* ---------------- Реклами (AdMob мост към Android обвивката) ---------------- */
let adKeepWeapons = false;
const AdBridge = {
  btnBribe: null, btnRevive: null,
  has() {
    try { return typeof AndroidAds !== 'undefined' && AndroidAds.isReady(); }
    catch (e) { return false; }
  },
  show(hook) { try { AndroidAds.show(hook); } catch (e) {} },
  init() {
    const mk = (txt, bottom) => {
      const b = document.createElement('div');
      b.textContent = txt;
      b.style.cssText = 'position:fixed;right:12px;bottom:' + bottom + 'px;z-index:30;display:none;' +
        'background:rgba(10,10,18,.88);color:#ffd23c;border:1px solid #ffd23c;border-radius:6px;' +
        'padding:10px 12px;font:700 13px sans-serif;user-select:none;-webkit-user-select:none';
      document.body.appendChild(b);
      return b;
    };
    this.btnBribe = mk('📺 Реклама → чисто досие', 150);
    this.btnRevive = mk('📺 Реклама → запази оръжията', 110);
    const bind = (btn, hook) => {
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.show(hook); }, { passive: false });
      btn.addEventListener('mousedown', () => this.show(hook));
    };
    bind(this.btnBribe, 'bribe');
    bind(this.btnRevive, 'revive');
  },
  update() {
    if (!this.btnBribe) this.init();
    const ready = this.has();
    const showBribe = ready && started && !gameOver && !player.dead && !player.busted && player.wanted >= 3;
    const showRevive = ready && started && !gameOver && player.dead && !adKeepWeapons;
    this.btnBribe.style.display = showBribe ? 'block' : 'none';
    this.btnRevive.style.display = showRevive ? 'block' : 'none';
  }
};
window.onAdReward = function (hook) {
  if (hook === 'bribe') {
    player.heat = 0; recalcWanted();
    showMsg('💵 Рекламата плати подкупа. Досието е чисто.', 2.5);
  } else if (hook === 'revive') {
    adKeepWeapons = true;
    showMsg('Оръжията ще те чакат след болницата.', 2.5);
  }
};

/* ---------------- Настройки ---------------- */
const settings = { sfx: true, music: true, vibro: true, lowFx: false, bigCtrl: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('gangcity_settings') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('gangcity_settings', JSON.stringify(settings)); } catch (e) {} }
function applySettings() {
  if (AudioSys.sfxVol) AudioSys.sfxVol.gain.value = settings.sfx ? 1 : 0;
  if (typeof MusicSys !== 'undefined' && MusicSys.timer && MusicSys.on !== settings.music) MusicSys.toggle();
  if (typeof touch !== 'undefined' && touch.layout) touch.layout();
}

/* ---------------- Главно меню ---------------- */
let menuState = 'main', menuButtons = [], resetArmed = 0;
function hasSave() { try { return !!localStorage.getItem('gangcity_auto'); } catch (e) { return false; } }
function menuBtn(label, x, y, w, h, act, style) {
  ctx.fillStyle = style === 'primary' ? 'rgba(255,210,60,0.18)' : 'rgba(255,255,255,0.07)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = style === 'primary' ? '#ffd23c' : style === 'danger' ? '#e05a5a' : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = style === 'primary' ? 2 : 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = style === 'primary' ? '#ffd23c' : style === 'danger' ? '#e08080' : '#ddd';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  menuButtons.push({ x, y, w, h, act });
}
function drawMainMenu() {
  menuButtons = [];
  ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.min(64, VW * 0.1) + 'px sans-serif';
  ctx.fillStyle = '#ffd23c';
  ctx.fillText('GANG CITY', VW / 2, VH * 0.2);
  ctx.font = '14px sans-serif'; ctx.fillStyle = '#8aa';
  ctx.fillText('⭐ ' + rankOf(meta.rankXp).name + '  ·  🚗 ' + meta.collection.length + '/' + Object.keys(CAR_KINDS).length +
    '  ·  🏙 ' + THEMES.filter((t, i) => cityUnlocked(i)).length + '/' + THEMES.length + ' града', VW / 2, VH * 0.2 + 46);
  const w = Math.min(300, VW - 60), h = 46, x = VW / 2 - w / 2;
  let y = VH * 0.38;
  ctx.font = 'bold 17px sans-serif';
  const sv = hasSave();
  if (sv) { menuBtn('▶  ПРОДЪЛЖИ', x, y, w, h, 'continue', 'primary'); y += h + 14; }
  menuBtn('✦  НОВА ИГРА', x, y, w, h, 'new', sv ? '' : 'primary'); y += h + 14;
  menuBtn('⚙  НАСТРОЙКИ', x, y, w, h, 'settings'); y += h + 14;
  if (scoreBest > 0) { ctx.font = '13px sans-serif'; ctx.fillStyle = '#7ee08a'; ctx.fillText('Рекорд: ' + fmtMoney(scoreBest), VW / 2, y + 10); }
  ctx.textBaseline = 'top';
}
function drawSettingsMenu() {
  menuButtons = [];
  ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#ffd23c';
  ctx.fillText('НАСТРОЙКИ', VW / 2, VH * 0.11);
  const rows = [
    ['🔊 Звукови ефекти', 'sfx'], ['🎵 Музика', 'music'], ['📳 Вибрация при удар', 'vibro'],
    ['⚡ Икономичен режим (слаб телефон)', 'lowFx'], ['🕹 По-големи бутони', 'bigCtrl'],
  ];
  const w = Math.min(340, VW - 40), h = 42, x = VW / 2 - w / 2;
  let y = VH * 0.19;
  for (const [label, key] of rows) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#ddd';
    ctx.fillText(label, x + 12, y + h / 2);
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'right';
    ctx.fillStyle = settings[key] ? '#7ee08a' : '#888';
    ctx.fillText(settings[key] ? 'ВКЛ' : 'ИЗКЛ', x + w - 12, y + h / 2);
    menuButtons.push({ x, y, w, h, act: 'toggle:' + key });
    y += h + 8;
  }
  y += 10;
  ctx.font = 'bold 15px sans-serif';
  menuBtn(resetArmed > 0 ? 'СИГУРЕН ЛИ СИ? Тапни пак' : '🗑 Изтрий целия прогрес', x, y, w, h, 'reset', 'danger'); y += h + 12;
  menuBtn('← НАЗАД', x, y, w, h, 'back');
  ctx.textBaseline = 'top';
}
function menuPrimary() { menuTapAct(hasSave() ? 'continue' : 'new'); }
function menuTapAct(hit) {
  if (hit === 'continue') {
    runLoaded = true;
    const c = applyAutoRun();
    if (c !== null && cityUnlocked(c) && c !== cityIdx) { genCityMap(c); playerToStart(); spawnWorld(); }
    menuState = 'cities';
  } else if (hit === 'new') {
    try { localStorage.removeItem('gangcity_auto'); localStorage.removeItem('gangcity_save'); } catch (e) {}
    restartGame(); runLoaded = true; menuState = 'cities';
  } else if (hit === 'settings') { menuState = 'settings'; resetArmed = 0; }
  else if (hit === 'back') { menuState = 'main'; resetArmed = 0; }
  else if (hit.startsWith('toggle:')) { const k = hit.slice(7); settings[k] = !settings[k]; saveSettings(); applySettings(); }
  else if (hit === 'reset') {
    if (resetArmed > 0) {
      try { ['gangcity_auto', 'gangcity_save', 'gangcity_meta'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
      meta.metaMissions = 0; meta.collection = []; meta.rankXp = 0;
      meta.daily = { date: '', taskIdx: 0, progress: 0, done: false, streak: 0, lastDoneDate: '' };
      restartGame(); runLoaded = true; resetArmed = 0; menuState = 'main';
    } else resetArmed = 1;
  }
}
function menuTap(x, y) {
  let hit = null;
  for (const b of menuButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hit = b.act; break; }
  if (menuState === 'cities') {
    if (hit === 'back') { menuState = 'main'; return; }
    let picked = cityIdx;
    for (const b of startCityButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { picked = b.idx; break; }
    startWithCity(picked);
    return;
  }
  if (hit) menuTapAct(hit);
}

/* ---------------- Екран "Нов град" ---------------- */
let unlockScreen = null;
function openUnlockScreen(city, mode) {
  unlockScreen = { city, mode, t: 0, lastT: 0, btns: [], confetti: [] };
  AudioSys.gouranga();
}
function unlockTap(x, y) {
  const u = unlockScreen;
  if (!u || u.t < 1.2) return;
  let act = null;
  if (x < 0) act = u.mode === 'offer' ? 'stay' : 'close';
  else for (const b of u.btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { act = b.act; break; }
  if (!act) return;
  const city = u.city;
  unlockScreen = null;
  if (act === 'travel') { switchCity(city); autosaveRun(); }
}
function drawUnlockScreen() {
  const u = unlockScreen, th = THEMES[u.city];
  const ddt = Math.min(0.05, u.t - u.lastT); u.lastT = u.t;
  const a = clamp(u.t / 0.6, 0, 1);
  ctx.fillStyle = 'rgba(5,5,12,' + (0.85 * a).toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);
  const glow = th.glow || '255,210,60';
  const g = ctx.createRadialGradient(VW / 2, VH * 0.42, 10, VW / 2, VH * 0.42, Math.max(VW, VH) * 0.55);
  g.addColorStop(0, 'rgba(' + glow + ',' + (0.38 * a).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(' + glow + ',0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (!u.confetti.length)
    for (let i = 0; i < 90; i++)
      u.confetti.push({ x: R() * VW, y: -R() * VH, vy: 70 + R() * 130, vx: (R() - 0.5) * 50,
        s: 4 + R() * 6, rot: R() * 6, vr: (R() - 0.5) * 6, c: ['#ffd23c', '#7ee08a', '#7ab6ff', '#e05a8a', '#fff'][i % 5] });
  for (const p of u.confetti) {
    p.y += p.vy * ddt; p.x += p.vx * ddt; p.rot += p.vr * ddt;
    if (p.y > VH + 10) { p.y = -10; p.x = R() * VW; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.c; ctx.globalAlpha = a;
    ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const k = clamp((u.t - 0.25) / 0.7, 0, 1);
  const c1 = 1.70158, c3 = c1 + 1;
  const ease = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);   // easeOutBack — "изскача"
  ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,' + k.toFixed(3) + ')';
  ctx.fillText(u.mode === 'offer' ? '🔓  НОВ ГРАД ОТКЛЮЧЕН' : '🏆  ГРАДЪТ Е ПРЕВЗЕТ · ДОБРЕ ДОШЪЛ В', VW / 2, VH * 0.30);
  ctx.save();
  ctx.translate(VW / 2, VH * 0.42); ctx.scale(Math.max(0.01, ease), Math.max(0.01, ease));
  ctx.font = 'bold ' + Math.min(56, VW * 0.11) + 'px sans-serif'; ctx.fillStyle = '#ffd23c';
  ctx.shadowColor = 'rgba(' + glow + ',0.9)'; ctx.shadowBlur = 30;
  ctx.fillText(th.name.toUpperCase(), 0, 0);
  ctx.restore();
  const k2 = clamp((u.t - 0.9) / 0.5, 0, 1);
  ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(220,220,230,' + k2.toFixed(3) + ')';
  ctx.fillText(th.tagline || '', VW / 2, VH * 0.52);
  ctx.fillStyle = 'rgba(126,224,138,' + k2.toFixed(3) + ')';
  ctx.fillText('Мисиите тук плащат ×' + (th.payMult || 1) + '  ·  Полицията е по-нервна', VW / 2, VH * 0.57);
  u.btns = [];
  if (u.t > 1.2) {
    const h = 44, bw = Math.min(200, VW * 0.42), y = VH * 0.7;
    ctx.font = 'bold 15px sans-serif';
    const btn = (x, w, label, act, primary) => {
      ctx.fillStyle = primary ? 'rgba(255,210,60,0.2)' : 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = primary ? '#ffd23c' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = primary ? 2 : 1; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = primary ? '#ffd23c' : '#ddd'; ctx.fillText(label, x + w / 2, y + h / 2);
      u.btns.push({ x, y, w, h, act });
    };
    if (u.mode === 'offer') { btn(VW / 2 - bw - 8, bw, 'ОСТАНИ', 'stay', false); btn(VW / 2 + 8, bw, 'ЗАМИНИ  ✈', 'travel', true); }
    else btn(VW / 2 - bw / 2, bw, 'ПРОДЪЛЖИ', 'close', true);
  }
  ctx.textBaseline = 'top';
}

/* ---------------- Постоянен прогрес (мета) ---------------- */
const CITY_REQ = [0, 4, 8, 12, 16];   // мисии за отключване на всеки град
const RANKS = [
  { xp: 0, name: 'Хлапе' }, { xp: 30, name: 'Джебчия' }, { xp: 80, name: 'Боец' },
  { xp: 160, name: 'Дясна ръка' }, { xp: 300, name: 'Бос' }, { xp: 500, name: 'Кръстник' },
];
const DAILY_TASKS = [
  { id: 'crush', txt: 'Смачкай 3 коли в пресата', goal: 3 },
  { id: 'taxi', txt: 'Изкарай $600 с такси', goal: 600 },
  { id: 'wreck', txt: 'Унищожи 8 коли', goal: 8 },
  { id: 'missions', txt: 'Завърши 2 мисии', goal: 2 },
];
const meta = {
  metaMissions: 0, collection: [], rankXp: 0,
  daily: { date: '', taskIdx: 0, progress: 0, done: false, streak: 0, lastDoneDate: '' }
};
try { Object.assign(meta, JSON.parse(localStorage.getItem('gangcity_meta') || '{}')); } catch (e) {}
function saveMeta() { try { localStorage.setItem('gangcity_meta', JSON.stringify(meta)); } catch (e) {} }
function cityUnlocked(i) { return meta.metaMissions >= (CITY_REQ[i] || 0); }
function rankOf(xp) { let r = RANKS[0]; for (const q of RANKS) if (xp >= q.xp) r = q; return r; }
function addRankXp(n) {
  const before = rankOf(meta.rankXp).name;
  meta.rankXp += n;
  const after = rankOf(meta.rankXp);
  if (after.name !== before) { showMsg('⭐ НОВ РАНГ: ' + after.name.toUpperCase() + '!', 4); AudioSys.gouranga(); }
  saveMeta();
}
function dailyKey(off) {
  const d = new Date(Date.now() - (off || 0));
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function ensureDaily() {
  const k = dailyKey(0);
  if (meta.daily.date !== k) {
    const seed = k.split('-').reduce((a, b) => a * 31 + (+b), 7);
    meta.daily.date = k;
    meta.daily.taskIdx = seed % DAILY_TASKS.length;
    meta.daily.progress = 0;
    meta.daily.done = false;
    saveMeta();
  }
}
function dailyProgress(id, amt) {
  ensureDaily();
  const t = DAILY_TASKS[meta.daily.taskIdx];
  if (meta.daily.done || t.id !== id) return;
  meta.daily.progress += amt;
  if (meta.daily.progress >= t.goal) {
    meta.daily.done = true;
    meta.daily.streak = (meta.daily.lastDoneDate === dailyKey(864e5)) ? (meta.daily.streak || 0) + 1 : 1;
    meta.daily.lastDoneDate = meta.daily.date;
    const rew = meta.daily.streak >= 5 ? 3000 : 1500;
    addScore(rew, player.x, player.y - 24);
    addRankXp(10);
    showMsg('📅 Дневна задача изпълнена! +' + fmtMoney(rew) +
      (meta.daily.streak > 1 ? ' · Серия: ' + meta.daily.streak + ' дни' : ''), 4);
  } else {
    showMsg('📅 ' + t.txt + ' — ' + Math.min(meta.daily.progress, t.goal) + '/' + t.goal, 1.6);
  }
  saveMeta();
}
function collectCar(kind) {
  if (meta.collection.includes(kind)) return;
  meta.collection.push(kind);
  addRankXp(5);
  showMsg('🚗 Нов модел в колекцията: ' + (CAR_KINDS[kind] ? CAR_KINDS[kind].name : kind) +
    ' (' + meta.collection.length + '/' + Object.keys(CAR_KINDS).length + ')', 3);
  saveMeta();
}
/* ---------------- Тих авто-запис на текущата игра ---------------- */
let runLoaded = false, autoT = 12;
function autosaveRun() {
  try {
    localStorage.setItem('gangcity_auto', JSON.stringify({
      score, lives, level, mult, missionsDone, cityIdx, targetScore, doneMissions: doneMissions.slice(),
      ammo: player.ammo.slice(), weapon: player.weapon, respect: respect.slice()
    }));
  } catch (e) {}
}
function applyAutoRun() {
  try {
    const sv = JSON.parse(localStorage.getItem('gangcity_auto') || localStorage.getItem('gangcity_save') || 'null');
    if (!sv) return null;
    score = sv.score || 0;
    lives = (sv.lives != null && sv.lives > 0) ? sv.lives : 4;
    level = sv.level || 1; mult = sv.mult || 1;
    missionsDone = sv.missionsDone || 0;
    doneMissions = Array.isArray(sv.doneMissions) ? sv.doneMissions.slice() : [];
    if (sv.targetScore) targetScore = sv.targetScore;
    if (Array.isArray(sv.ammo)) player.ammo = sv.ammo.slice();
    if (sv.weapon != null) player.weapon = sv.weapon;
    if (Array.isArray(sv.respect)) { respect[0] = sv.respect[0] || 0; respect[1] = sv.respect[1] || 0; }
    return sv.cityIdx || 0;
  } catch (e) { return null; }
}
const phones = [];
const frenzySpots = [];
const miniCanvas = document.createElement('canvas');

function genCityMap(idx) {
  cityIdx = idx;
  theme = THEMES[idx % THEMES.length];
  seed = 20977 + idx * 7919 + level * 104729;
  const blockType = {};
  for (let by = 0; by < MH / BLOCK; by++) {
    for (let bx = 0; bx < MW / BLOCK; bx++) {
      const key = bx + ',' + by;
      blockType[key] = rnd() < theme.parkChance ? 'park' : 'build';
      blockColor[key] = theme.walls[Math.floor(rnd() * theme.walls.length)];
      blockRoof[key] = theme.roofs[Math.floor(rnd() * theme.roofs.length)];
      blockHeight[key] = 1 + Math.floor(rnd() * (theme.lowRise ? 2 : 3)); // етажни групи
    }
  }

  // Нулиране на специалните слоеве
  yellowRoad = null; pedRoad = null; crossWalkMap = null; lmMap = null;
  landmarks = []; pedZoneTiles = [];
  laneDirMap = new Uint8Array(MW * MH).fill(255);
  streetIdxMap = null;

  if (theme.freeform) {
    // Русе — ръчно построена карта по реалния градски план
    buildRuse(blockType);
    placePhonesFrenzy();
    renderMini();
    initMetro();
    return;
  }

  // Специални блокове (болница, участък, бояджийница)
  const cb = Math.floor(MW / BLOCK / 2);
  if (theme.sofia) {
    // Встрани от забележителностите в центъра
    hospitalBlock = '2,2'; policeBlock = '5,1'; resprayBlock = '2,5';
  } else {
    hospitalBlock = (cb - 1) + ',' + cb;
    policeBlock = (cb + 1) + ',' + (cb - 1);
    resprayBlock = cb + ',' + (cb + 1);
  }
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

  // София: река, жълти павета, пешеходна зона и забележителности
  if (theme.sofia) {
    yellowRoad = new Uint8Array(MW * MH);
    pedRoad = new Uint8Array(MW * MH);
    lmMap = new Int16Array(MW * MH).fill(-1);

    // Река Перловска (север–юг) с мостове на булевардите
    for (let y = 2; y < MH - 2; y++) {
      if (isRoadRow(y)) continue; // мост
      map[y * MW + 54] = T.WATER;
      map[y * MW + 55] = T.WATER;
    }

    const mark = (x0, y0, x1, y1, id) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        map[y * MW + x] = T.BUILD;
        lmMap[y * MW + x] = id;
      }
    };
    const park = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const t = map[y * MW + x];
        if (t !== T.ROAD && t !== T.WATER) map[y * MW + x] = T.PARK;
      }
    };
    // Катедралата със златните куполи
    landmarks.push({ type: 'nevski', x: 40 * TILE, y: 24 * TILE, h: 2, wall: '#eae6dc', roof: '#d9d4c6' });
    mark(38, 22, 41, 25, 0);
    // Университетът (Ректоратът)
    landmarks.push({ type: 'su', x: 48 * TILE, y: 32 * TILE, h: 2, wall: '#c8a058', roof: '#7a3830' });
    mark(46, 30, 49, 33, 1);
    // НДК с парка пред него
    park(27, 44, 36, 52);
    landmarks.push({ type: 'ndk', x: 32 * TILE, y: 48 * TILE, h: 2, wall: '#dcd8cc', roof: '#cac6ba' });
    mark(30, 46, 33, 49, 2);
    // Градската градина с фонтана
    park(30, 29, 34, 31);
    landmarks.push({ type: 'fountain', x: 32.5 * TILE, y: 30.5 * TILE, h: 0 });
    // Стадионът в парка
    park(45, 37, 50, 42);
    landmarks.push({ type: 'stadium', x: 48 * TILE, y: 40 * TILE, h: 0 });

    // Пешеходната зона на бул. Витоша
    for (let y = 29; y <= 42; y++) {
      pedRoad[y * MW + 27] = 1; pedRoad[y * MW + 28] = 1;
      pedZoneTiles.push([27, y], [28, y]);
    }
    // Жълтите павета около Ларгото и Царя
    for (let y = 20; y <= 33; y++) {
      for (let x = 24; x <= 45; x++) {
        if (map[y * MW + x] === T.ROAD && !pedRoad[y * MW + x]) yellowRoad[y * MW + x] = 1;
      }
    }
  }

  // Входове на специалните сгради
  hospitalDoor = blockDoor(hospitalBlock);
  policeDoor = blockDoor(policeBlock);
  resprayDoor = blockDoor(resprayBlock);
  crusherDoor = nearestSideTile((MW - 9) * TILE, (MH - 9) * TILE, 1400) || { x: (MW - 9) * TILE, y: (MH - 9) * TILE };
  churchDoor = nearestSideTile(9 * TILE, 9 * TILE, 1400) || { x: 9 * TILE, y: 9 * TILE };

  // Ленти на решетъчните улици (за трафика и маркировката)
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (map[y * MW + x] !== T.ROAD) continue;
      const onH = isRoadRow(y), onV = isRoadCol(x);
      let d = 255;
      if (onH && !onV) d = (y % BLOCK === 3) ? 2 : 0;
      else if (onV && !onH) d = (x % BLOCK === 3) ? 1 : 3;
      laneDirMap[y * MW + x] = d;
    }
  }

  placePhonesFrenzy();
  renderMini();
  initMetro();
}
/* ---------------- РУСЕ ----------------
   Карта по реалния план на центъра (данни от OpenStreetMap), завъртяна
   така, че ул. Александровска да е вертикалната ос. Мащаб ≈ 17.5 м/плочка
   (прозорец ~1.1 км × 1.1 км около пл. Свобода). Дунав е на запад,
   Пантеонът на север, Доходното здание южно на площада — както в реалността. */
function buildRuse(blockType) {
  pedRoad = new Uint8Array(MW * MH);
  crossWalkMap = new Uint8Array(MW * MH);
  lmMap = new Int16Array(MW * MH).fill(-1);
  streetIdxMap = new Uint8Array(MW * MH).fill(255);

  // Основа: трева
  map.fill(T.GRASS);

  // Дунав — по западния ръб, с леко начупен бряг
  for (let y = 0; y < MH; y++) {
    const shore = 3 + Math.round(Math.sin(y * 0.35) * 0.9);
    for (let x = 0; x <= shore; x++) map[y * MW + x] = T.WATER;
    // Кеят — Придунавският парк между реката и булеварда
    for (let x = shore + 1; x <= 7; x++) map[y * MW + x] = T.PARK;
  }

  const idx = (x, y) => y * MW + x;
  // Хоризонтална улица (двойка редове), с име и ленти
  const hR = (y, x0, x1, nameIdx) => {
    for (let x = x0; x <= x1; x++) {
      for (const [yy, dir] of [[y, 2], [y + 1, 0]]) {   // горна лента запад, долна изток
        const i = idx(x, yy);
        if (map[i] === T.ROAD) laneDirMap[i] = 255;      // кръстовище
        else { map[i] = T.ROAD; laneDirMap[i] = dir; }
        streetIdxMap[i] = nameIdx;
      }
    }
  };
  // Вертикална улица (двойка колони)
  const vR = (x, y0, y1, nameIdx) => {
    for (let y = y0; y <= y1; y++) {
      for (const [xx, dir] of [[x, 1], [x + 1, 3]]) {    // лява лента юг, дясна север
        const i = idx(xx, y);
        if (map[i] === T.ROAD) laneDirMap[i] = 255;
        else { map[i] = T.ROAD; laneDirMap[i] = dir; }
        streetIdxMap[i] = nameIdx;
      }
    }
  };
  // Пешеходна отсечка (вертикална двойка колони)
  const pedV = (x, y0, y1, nameIdx) => {
    for (let y = y0; y <= y1; y++) {
      for (const xx of [x, x + 1]) {
        const i = idx(xx, y);
        if (map[i] === T.ROAD) { crossWalkMap[i] = 1; }  // пресичане на булевард
        else { map[i] = T.ROAD; pedRoad[i] = 1; pedZoneTiles.push([xx, y]); }
        streetIdxMap[i] = nameIdx;
      }
    }
  };

  // Улици (позиции от реалната карта)
  vR(8, 2, 61, 0);      // бул. Придунавски — покрай кея
  vR(19, 17, 50, 1);    // ул. Княжеска
  vR(55, 8, 58, 4);     // бул. Ген. Скобелев — източният паралел
  vR(43, 17, 50, 3);    // ул. Хан Аспарух
  hR(17, 8, 44, 5);     // бул. Цар Фердинанд — север
  hR(25, 19, 56, 6);    // ул. Ангел Кънчев
  hR(29, 8, 62, 7);     // бул. Цар Освободител — дългият булевард
  hR(34, 8, 28, 8);     // ул. Църковна независимост — запад, опира в Александровска
  hR(41, 38, 62, 9);    // ул. Муткурова — изток от площада
  hR(50, 8, 56, 10);    // ул. Петко Д. Петков
  hR(57, 19, 56, 11);   // ул. Стефан Караджа
  vR(29, 48, 62, 12);   // ул. Борисова — продължението към гарата (юг)

  // Пешеходната Александровска: от север (Батенберг) през площада
  pedV(29, 12, 47, 2);

  // Пл. Свобода — пешеходен площад около Паметника на свободата
  for (let y = 37; y <= 44; y++) {
    for (let x = 26; x <= 37; x++) {
      const i = idx(x, y);
      if (map[i] === T.ROAD && !pedRoad[i]) continue;   // не пипай булевардите
      map[i] = T.ROAD; pedRoad[i] = 1;
      streetIdxMap[i] = 2;
      if ((x + y) % 3 === 0) pedZoneTiles.push([x, y]);
    }
  }
  // Градинките на площада (около паметника, като в реалността)
  for (const [gx0, gy0] of [[27, 38], [34, 38], [27, 42], [34, 42]]) {
    for (let y = gy0; y <= gy0 + 1; y++) for (let x = gx0; x <= gx0 + 1; x++) {
      map[idx(x, y)] = T.PARK; pedRoad[idx(x, y)] = 0;
    }
  }

  // Паркове: Парк на възрожденците (север-изток) + малък до Скобелев
  for (let y = 3; y <= 14; y++) for (let x = 45; x <= 58; x++) {
    if (map[idx(x, y)] === T.GRASS) map[idx(x, y)] = T.PARK;
  }
  for (let y = 52; y <= 55; y++) for (let x = 47; x <= 53; x++) {
    if (map[idx(x, y)] === T.GRASS) map[idx(x, y)] = T.PARK;
  }

  // Забележителности (реални позиции от картата)
  const mark = (x0, y0, x1, y1, id) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      map[idx(x, y)] = T.BUILD;
      lmMap[idx(x, y)] = id;
    }
  };
  // Паметникът на Свободата — в средата на площада
  landmarks.push({ type: 'monument', x: 32 * TILE, y: 40 * TILE, h: 0 });
  // Доходното здание (Операта на Русе) — южно на площада
  landmarks.push({ type: 'dohodno', x: 32 * TILE, y: 46.5 * TILE, h: 2, wall: '#e8dcc4', roof: '#3e7a5e' });
  mark(29, 45, 34, 48, 1);
  // Съдебната палата — северозападно от площада
  landmarks.push({ type: 'court', x: 25.5 * TILE, y: 34.5 * TILE, h: 2, wall: '#ded6c6', roof: '#8a8276' });
  mark(23, 32, 27, 36, 2);
  // Операта/Филхармонията — на изток (реална позиция)
  landmarks.push({ type: 'opera', x: 47 * TILE, y: 32.5 * TILE, h: 2, wall: '#e6d0a8', roof: '#96513a' });
  mark(45, 31, 48, 34, 3);
  // Пантеонът на Възрожденците — в парка на север, златен купол
  landmarks.push({ type: 'pantheon', x: 51.5 * TILE, y: 8 * TILE, h: 2, wall: '#e4ddd0', roof: '#cabfae' });
  mark(50, 6, 53, 9, 4);
  // Катедралата „Св. Троица" — югоизточно от площада
  landmarks.push({ type: 'trinity', x: 40 * TILE, y: 47.5 * TILE, h: 2, wall: '#e9e2d4', roof: '#b8b0a0' });
  mark(38, 46, 41, 49, 5);
  // Шлепове по Дунава
  landmarks.push({ type: 'boat', x: 1.6 * TILE, y: 20 * TILE, h: 0 });
  landmarks.push({ type: 'boat', x: 2.2 * TILE, y: 44 * TILE, h: 0 });

  // Запълване: тротоари около улиците, сгради в карето
  for (let y = 1; y < MH - 1; y++) {
    for (let x = 1; x < MW - 1; x++) {
      const i = idx(x, y);
      if (map[i] !== T.GRASS) continue;
      if (x < 8 || x > 60 || y < 2 || y > 61) continue;  // покрайнини — трева
      const nearRoad =
        map[idx(x - 1, y)] === T.ROAD || map[idx(x + 1, y)] === T.ROAD ||
        map[idx(x, y - 1)] === T.ROAD || map[idx(x, y + 1)] === T.ROAD;
      if (nearRoad) map[i] = T.SIDE;
      else map[i] = rnd() < 0.12 ? T.SIDE : T.BUILD;
    }
  }

  // Входове на службите (реалистично разположени)
  hospitalDoor = nearestSideTile(13 * TILE, 21 * TILE, 500) || { x: 13 * TILE, y: 21 * TILE };
  policeDoor = nearestSideTile(13 * TILE, 46 * TILE, 500) || { x: 13 * TILE, y: 46 * TILE };
  resprayDoor = nearestSideTile(50 * TILE, 47 * TILE, 500) || { x: 50 * TILE, y: 47 * TILE };
  crusherDoor = nearestSideTile((MW - 9) * TILE, (MH - 9) * TILE, 1400) || { x: (MW - 9) * TILE, y: (MH - 9) * TILE };
  churchDoor = nearestSideTile(9 * TILE, 9 * TILE, 1400) || { x: 9 * TILE, y: 9 * TILE };
}

function placePhonesFrenzy() {
  phones.length = 0;
  const cx = MW / 2 * TILE, cy = MH / 2 * TILE;
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + 0.4;
    const s = nearestSideTile(cx + Math.cos(a) * 14 * TILE, cy + Math.sin(a) * 14 * TILE, 500);
    if (s) phones.push({ x: s.x, y: s.y, ringing: false });
  }
  frenzySpots.length = 0;
  for (const a of [0.9, 3.6, 5.4]) {
    const s = nearestSideTile(cx + Math.cos(a) * 20 * TILE, cy + Math.sin(a) * 20 * TILE, 600);
    if (s) frenzySpots.push({ x: s.x, y: s.y, taken: false, respawn: 0 });
  }
}
function renderMini() {
  miniCanvas.width = MW; miniCanvas.height = MH;
  const mc = miniCanvas.getContext('2d');
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const t = map[y * MW + x];
      mc.fillStyle = t === T.ROAD
        ? (yellowRoad && yellowRoad[y * MW + x] ? '#ab8f3e' : (pedRoad && pedRoad[y * MW + x] ? '#a09578' : '#54545a'))
        : t === T.WATER ? theme.water : t === T.BUILD ? (lmMap && lmMap[y * MW + x] >= 0 ? '#c8bfa8' : '#8a7666') : t === T.PARK ? theme.park[0] : '#84848a';
      mc.fillRect(x, y, 1, 1);
    }
  }
}

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
    if (pedRoad && pedRoad[ty * MW + tx]) continue; // пешеходна зона — без коли
    const d = laneDirMap[ty * MW + tx];
    if (d > 3) continue; // кръстовище
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, dir: d };
  }
  return null;
}
function dirRoadOk(tx, ty, dir) {
  const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
  const nx = tx + dx * 3, ny = ty + dy * 3;
  if (tileAt(nx, ny) !== T.ROAD) return false;
  if (pedRoad && pedRoad[ny * MW + nx]) return false;
  return true;
}
function laneCenterFor(dir, x, y) {
  // Намери най-близкия ред/колона с лента в моята посока (работи за всяка карта)
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (dir % 2 === 0) {
    for (const s of [0, -1, 1, -2, 2]) {
      if (laneDirAt(tx, ty + s) === dir) return { x, y: (ty + s + 0.5) * TILE };
    }
    return { x, y };
  } else {
    for (const s of [0, -1, 1, -2, 2]) {
      if (laneDirAt(tx + s, ty) === dir) return { x: (tx + s + 0.5) * TILE, y };
    }
    return { x, y };
  }
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
// Входовете, телефоните и Kill Frenzy пикапите се задават в genCityMap()

// ---------------- Аудио ----------------
/* Звуков двигател v2 — изцяло синтезиран, без файлове:
   слоеве (град, гуми, дъжд, тълпа), двигател с предавки, градско ехо,
   позиционирани ефекти (стерео панорама по X), случайни градски събития. */
const AudioSys = {
  ctx: null, master: null, noiseBuf: null, brownBuf: null,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = this.ctx = new AC();
      this.master = c.createDynamicsCompressor();
      this.master.threshold.value = -20;
      this.master.ratio.value = 6;
      this.sfxVol = c.createGain();
      this.sfxVol.gain.value = settings.sfx ? 1 : 0;
      this.master.connect(this.sfxVol);
      this.sfxVol.connect(c.destination);

      // Градско ехо (за изстрели и взривове)
      this.echoIn = c.createGain(); this.echoIn.gain.value = 1;
      const dly = c.createDelay(0.6); dly.delayTime.value = 0.21;
      const fb = c.createGain(); fb.gain.value = 0.34;
      const efl = c.createBiquadFilter(); efl.type = 'lowpass'; efl.frequency.value = 1300;
      const eg = c.createGain(); eg.gain.value = 0.5;
      this.echoIn.connect(dly); dly.connect(efl); efl.connect(fb); fb.connect(dly);
      efl.connect(eg); eg.connect(this.master);

      // Шумови буфери
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
      this.brownBuf = c.createBuffer(1, len, c.sampleRate);
      const bd = this.brownBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998; bd[i] = last * 3.5; }

      const mkLoop = (buffer, type, f0, q, g0) => {
        const src = c.createBufferSource(); src.buffer = buffer; src.loop = true;
        const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f0; flt.Q.value = q;
        const g = c.createGain(); g.gain.value = g0;
        src.connect(flt); flt.connect(g); g.connect(this.master);
        src.start();
        return { flt, g };
      };
      // Постоянни слоеве на града
      this.bed = mkLoop(this.brownBuf, 'lowpass', 260, 0.5, 0.016);   // далечен трафик
      this.tire = mkLoop(this.noiseBuf, 'lowpass', 480, 0.6, 0);      // гуми по асфалта
      this.wetH = mkLoop(this.noiseBuf, 'bandpass', 2400, 0.7, 0);    // съскане на мокро
      this.rainL = mkLoop(this.noiseBuf, 'bandpass', 3600, 0.35, 0);  // дъжд
      this.crowd = mkLoop(this.noiseBuf, 'bandpass', 850, 1.4, 0);    // глъч на хора
      this.skid = mkLoop(this.noiseBuf, 'bandpass', 950, 7, 0);       // свистене на гуми
      this.engN = mkLoop(this.noiseBuf, 'bandpass', 400, 1.6, 0);     // дишане на двигателя

      // Двигател: два осцилатора през нискочестотен филтър
      this.eng1 = c.createOscillator(); this.eng1.type = 'sawtooth';
      this.eng2 = c.createOscillator(); this.eng2.type = 'square';
      this.engFlt = c.createBiquadFilter(); this.engFlt.type = 'lowpass'; this.engFlt.frequency.value = 260;
      this.engG = c.createGain(); this.engG.gain.value = 0;
      this.eng1.connect(this.engFlt); this.eng2.connect(this.engFlt);
      this.engFlt.connect(this.engG); this.engG.connect(this.master);
      this.eng1.start(); this.eng2.start();

      // Полицейска сирена (виеща)
      this.sir = c.createOscillator(); this.sir.type = 'triangle';
      this.sirG = c.createGain(); this.sirG.gain.value = 0;
      this.sir.connect(this.sirG); this.sirG.connect(this.master);
      this.sir.start();

      // Таймери за случайни градски звуци
      this.ev = { horn: 6, birds: 4, bell: 25 };
    } catch (e) { this.ctx = null; }
  },
  pan(x) { return clamp((x - player.x) / 600, -0.9, 0.9); },
  // Едновременен шумов "залп" през филтър, с обвивка и по избор ехо/панорама
  burst(o) {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    src.loop = true;
    const flt = c.createBiquadFilter();
    flt.type = o.ftype || 'lowpass'; flt.frequency.value = o.freq || 800; flt.Q.value = o.q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (o.dur || 0.2));
    src.connect(flt); flt.connect(g);
    let out = g;
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = o.pan;
      g.connect(p); out = p;
    }
    out.connect(this.master);
    if (o.echo) { const e = c.createGain(); e.gain.value = o.echo; out.connect(e); e.connect(this.echoIn); }
    src.start(); src.stop(c.currentTime + (o.dur || 0.2) + 0.05);
  },
  // Тон с плавна смяна на честотата
  tone(o) {
    if (!this.ctx) return;
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, c.currentTime);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), c.currentTime + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + o.dur);
    osc.connect(g);
    let out = g;
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = o.pan;
      g.connect(p); out = p;
    }
    out.connect(this.master);
    if (o.echo) { const e = c.createGain(); e.gain.value = o.echo; out.connect(e); e.connect(this.echoIn); }
    osc.start(); osc.stop(c.currentTime + o.dur + 0.05);
  },
  blip(freq, dur, vol, type) { this.tone({ f0: freq, f1: freq, dur, vol, type: type || 'square' }); },
  // --- Ефекти ---
  shot() {
    this.burst({ dur: 0.13, vol: 0.5, freq: 950, q: 0.7, echo: 0.7, rate: 1.25 });
    this.tone({ f0: 230, f1: 60, dur: 0.08, vol: 0.1, type: 'square' });
  },
  mg() { this.burst({ dur: 0.08, vol: 0.36, freq: 1150, q: 0.8, echo: 0.45, rate: 1.4 }); },
  flame() { if (R() < 0.4) this.burst({ dur: 0.3, vol: 0.07, freq: 550, q: 0.4, rate: 0.8 }); },
  rocket() { this.burst({ dur: 0.55, vol: 0.28, freq: 380, q: 0.6, echo: 0.4, rate: 0.65 }); },
  boom() {
    this.tone({ f0: 100, f1: 27, dur: 0.9, vol: 0.5, type: 'sine', echo: 0.5 });
    this.burst({ dur: 0.85, vol: 0.5, freq: 240, q: 0.5, echo: 0.8, rate: 0.5 });
    this.burst({ dur: 0.22, vol: 0.26, freq: 2600, q: 0.7, rate: 1.4 });
  },
  hit() {
    this.burst({ dur: 0.1, vol: 0.24, freq: 320, q: 1, rate: 0.8 });
    this.tone({ f0: 170, f1: 65, dur: 0.09, vol: 0.09, type: 'square' });
  },
  pickup() { this.blip(880, 0.1, 0.12); this.blip(1320, 0.12, 0.09); },
  ring() { this.blip(1480, 0.07, 0.11); this.blip(1480, 0.07, 0.09); },
  gouranga() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 0.14), i * 90)); },
  step(hard) {
    this.burst({ dur: 0.045, vol: 0.05, freq: hard ? 1500 : 950, q: 1.6, ftype: 'bandpass', rate: 1.6 });
  },
  horn(x) {},  // тонални клаксони — изключени: биеха се със саундтрака
  scream(x) {
    this.tone({ f0: 750 + R() * 350, f1: 380, dur: 0.32, vol: 0.045, type: 'sawtooth', pan: this.pan(x) });
  },
  bell() {},   // камбани — изключени
  birds() {},  // птички — изключени
  thunder() {
    this.tone({ f0: 68, f1: 24, dur: 2.4, vol: 0.4, type: 'sine' });
    this.burst({ dur: 2.1, vol: 0.32, freq: 170, q: 0.4, rate: 0.4, echo: 0.6 });
  },
  // Всеки кадър: настройва постоянните слоеве по състоянието на играта
  update(dt, st) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (st.inCar) {
      // Предавки: оборотите растат и падат при смяна
      const gear = Math.min(4, Math.floor(st.speed / 95));
      const rpm = clamp((st.speed - gear * 95) / 95, 0, 1);
      const f = 42 + rpm * 66 + gear * 9;
      this.eng1.frequency.setTargetAtTime(f, now, 0.06);
      this.eng2.frequency.setTargetAtTime(f * 1.5, now, 0.06);
      this.engFlt.frequency.setTargetAtTime(230 + rpm * 850, now, 0.1);
      this.engG.gain.setTargetAtTime(0.026 + rpm * 0.028 + (st.speed > 3 ? 0.01 : 0), now, 0.08);
      this.engN.flt.frequency.setTargetAtTime(320 + rpm * 1100, now, 0.1);
      this.engN.g.gain.setTargetAtTime(0.012 + rpm * 0.018, now, 0.1);
      this.tire.g.gain.setTargetAtTime(Math.min(0.045, st.speed / 9000) * (1 + st.wet), now, 0.15);
    } else {
      this.engG.gain.setTargetAtTime(0, now, 0.15);
      this.engN.g.gain.setTargetAtTime(0, now, 0.15);
      this.tire.g.gain.setTargetAtTime(0, now, 0.2);
    }
    this.wetH.g.gain.setTargetAtTime(st.wet * (st.inCar ? Math.min(0.04, st.speed / 9000) : 0.004), now, 0.25);
    this.skid.g.gain.setTargetAtTime(st.skid ? 0.055 : 0, now, st.skid ? 0.03 : 0.1);
    if (st.skid) this.skid.flt.frequency.setTargetAtTime(850 + Math.sin(gameT * 21) * 200, now, 0.05);
    this.rainL.g.gain.setTargetAtTime(st.rain * 0.05, now, 0.6);
    this.crowd.g.gain.setTargetAtTime(Math.min(0.028, st.pedNear * 0.0035), now, 0.6);
    this.bed.g.gain.setTargetAtTime(0.011 + (1 - st.night) * 0.009, now, 1);
    // Сирена: виеща, по-силна при близка патрулка
    if (st.siren > 0) {
      this.sir.frequency.setTargetAtTime(620 + Math.sin(gameT * 2.7) * 170, now, 0.05);
      this.sirG.gain.setTargetAtTime(0.008 + st.siren * 0.024, now, 0.2);
    } else this.sirG.gain.setTargetAtTime(0, now, 0.3);
    // Случайни градски събития
    this.ev.horn -= dt;
    if (this.ev.horn <= 0) {
      this.ev.horn = 5 + R() * 11;
      this.horn(player.x + (R() - 0.5) * 1000);
    }
    this.ev.birds -= dt;
    if (this.ev.birds <= 0) {
      this.ev.birds = 2.5 + R() * 5;
      if (st.parkNear && st.night < 0.4 && st.rain < 0.3) this.birds();
    }
    this.ev.bell -= dt;
    if (this.ev.bell <= 0) {
      this.ev.bell = 35 + R() * 40;
      if (st.nearCathedral) this.bell();
    }
  }
};

// ---------------- Оръжия ----------------
const WEAPONS = [
  { name: 'Юмруци',        rate: 0.4,  dmg: 12, range: 34,  spread: 0,    melee: true },
  { name: 'Пистолет',      rate: 0.28, dmg: 25, range: 430, spread: 0.03, auto: false },
  { name: 'Картечница',    rate: 0.08, dmg: 14, range: 400, spread: 0.08, auto: true },
  { name: 'Огнехвъргачка', rate: 0.04, dmg: 7,  range: 150, spread: 0.25, auto: true, flame: true },
  { name: 'Ракетомет',     rate: 1.0,  dmg: 30, range: 700, spread: 0.01, auto: false, rocket: true },
  { name: 'Молотов',       rate: 1.1,  dmg: 22, range: 300, spread: 0.02, auto: false, molotov: true },
  { name: 'Електрошок',    rate: 0.4,  dmg: 22, range: 250, spread: 0,    auto: true,  zap: true },
];

// ---------------- Коли ----------------
const CAR_KINDS = {
  sedan:  { name: 'Комета',    l: 42, w: 22, maxSpeed: 280, accel: 210, hp: 100, mass: 1 },
  taxi:   { name: 'Такси',     l: 42, w: 22, maxSpeed: 300, accel: 230, hp: 100, mass: 1 },
  sport:  { name: 'Вихър GT',  l: 40, w: 20, maxSpeed: 440, accel: 360, hp: 90,  mass: 0.9 },
  toro:   { name: 'Торо V12',   l: 42, w: 21, maxSpeed: 520, accel: 430, hp: 80, mass: 0.9 },
  cavallo:{ name: 'Кавало GT',  l: 43, w: 20, maxSpeed: 545, accel: 450, hp: 75, mass: 0.85 },
  volta:  { name: 'Волта S',    l: 44, w: 21, maxSpeed: 485, accel: 520, hp: 95, mass: 1.05 },
  cabrio: { name: 'Бриз кабрио',l: 42, w: 21, maxSpeed: 430, accel: 330, hp: 70, mass: 0.95 },
  bus:    { name: 'Автобус',   l: 78, w: 25, maxSpeed: 190, accel: 120, hp: 220, mass: 2.6 },
  truck:  { name: 'Камион',    l: 62, w: 25, maxSpeed: 210, accel: 140, hp: 180, mass: 2.2 },
  police: { name: 'Патрулка',  l: 44, w: 22, maxSpeed: 400, accel: 320, hp: 120, mass: 1.1 },
  tank:   { name: 'Танк',       l: 56, w: 30, maxSpeed: 150, accel: 100, hp: 900, mass: 6 },
  swatvan:{ name: 'SWAT ван',   l: 52, w: 26, maxSpeed: 390, accel: 260, hp: 300, mass: 2.4 },
  fbi:    { name: 'Кола на FBI',l: 44, w: 22, maxSpeed: 470, accel: 380, hp: 90,  mass: 1 },
  cannon: { name: 'Оръдие',     l: 34, w: 22, maxSpeed: 0,   accel: 0,   hp: 420, mass: 5 },
  heli:   { name: 'Хеликоптер', l: 52, w: 26, maxSpeed: 330, accel: 210, hp: 240, mass: 1.4 },
};
const CAR_COLORS = ['#c0392b', '#2e6bb5', '#3f9a4d', '#c9b530', '#9b59b6', '#2aa5a0', '#e07b28', '#dadfe4', '#37474f', '#a56a5a', '#5d4a7e', '#7a2c2c'];

const EXOTIC_COLORS = {
  toro:    ['#f2c718', '#e07b28', '#7ec850', '#f2f2f2', '#111418'],
  cavallo: ['#d0231f', '#d0231f', '#c8171c', '#f2c718', '#111418'],
  volta:   ['#f4f5f7', '#c8ccd2', '#2b2f36', '#8c1d22', '#2e5da8'],
  cabrio:  ['#e05a8a', '#2aa5a0', '#f2c718', '#c0392b', '#dadfe4'],
};
function makeCar(x, y, angle, kind) {
  const k = CAR_KINDS[kind];
  return {
    x, y, angle, speed: 0,
    kind, name: k.name, l: k.l, w: k.w, mass: k.mass,
    r: Math.max(14, k.l * 0.31),
    color: EXOTIC_COLORS[kind] ? EXOTIC_COLORS[kind][Math.floor(R() * EXOTIC_COLORS[kind].length)] : kind === 'tank' || kind === 'cannon' ? '#4d5a3c' : kind === 'heli' ? '#37414a' : kind === 'swatvan' ? '#22303c' : kind === 'fbi' ? '#101418' : kind === 'police' ? '#20375c' : (kind === 'taxi' ? '#e8b800' : (kind === 'bus' ? '#b05c2a' : CAR_COLORS[Math.floor(R() * CAR_COLORS.length)])),
    maxSpeed: k.maxSpeed * (0.92 + R() * 0.16), accel: k.accel,
    hp: k.hp, maxHp: k.hp, dead: false, burnT: 0, burn: 0,
    dir: 0, aiPause: 0, siren: 0, marked: false, parked: false, turned: false,
    copsInside: kind === 'swatvan' ? 4 : (kind === 'police' || kind === 'fbi') ? 2 : 0
  };
}
function makePed(x, y, cop) {
  return {
    x, y, angle: R() * Math.PI * 2, speed: 0,
    hp: cop ? 45 : 30, dead: false, deadT: 0,
    panic: 0, cop: !!cop, burn: 0,
    skin: ['#e0b090', '#c68863', '#8d5a3b', '#f0c8a0'][Math.floor(R() * 4)],
    shirt: cop ? '#2a4a80' : ['#a33', '#37a', '#585', '#963', '#777', '#a83', '#559', '#7a4a6a'][Math.floor(R() * 8)],
    hair: ['#221a10', '#4a3520', '#7a5a30', '#151515', '#8a8a86', '#5a3828'][Math.floor(R() * 6)],
    bag: !cop && R() < 0.25,
    walkT: R() * 6, moving: 0,
    shootT: 1 + R(), arrestT: 0, markTarget: false
  };
}

// ---------------- Състояние ----------------
const cars = [], peds = [], projectiles = [], pickups = [];
const particles = [], skids = [], floaters = [];

const player = {
  x: 0, y: 0, angle: 0,
  hp: 100, armor: 0,
  car: null, onTrain: null, weapon: 1, ammo: [-1, 30, 0, 0, 0, 0, 0],
  fireT: 0, dead: false, deadT: 0, busted: false, bustedT: 0,
  dd: 0, invis: 0,
  wanted: 0, heat: 0, lastCrimeT: -999
};
let score = 0, mult = 1, lives = 4, level = 1;
let missionsDone = 0;
let targetScore = 60000;
const frenzy = { active: false, timer: 0, kills: 0, goal: 8, savedWeapon: 0, savedAmmo: 0 };
const gour = { count: 0, timer: 0 };
let resprayCooldown = 0;
let levelCompleteT = 0, gameOver = false;
let citySwitchPending = false, travelToName = '';
// ---------------- Фонова музика (mp3 с кросфейд) ----------------
const MusicSys = {
  tracks: ['audio/track0.mp3','audio/track1.mp3','audio/track2.mp3',
           'audio/track3.mp3','audio/track4.mp3','audio/track5.mp3'],
  bufs: {}, cur: null, idx: 0, fading: false, on: true, timer: null, pausedAt: null,
  order: [], pos: 0,
  FADE: 3.5, VOL: 0.16,
  shuffle(avoid) {
    const o = this.tracks.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = o[i]; o[i] = o[j]; o[j] = t;
    }
    // новият цикъл да не започва с парчето, което току-що е свършило
    if (avoid != null && o[0] === avoid && o.length > 1) {
      const t = o[0]; o[0] = o[o.length - 1]; o[o.length - 1] = t;
    }
    this.order = o; this.pos = 0;
  },
  advance() {
    if (this.pos + 1 >= this.order.length) {
      this.shuffle(this.order[this.order.length - 1]);
      return this.order[0];
    }
    this.pos++;
    return this.order[this.pos];
  },
  start() {
    if (this.timer || !AudioSys.ctx) return;
    this.bus = AudioSys.ctx.createGain();
    this.bus.gain.value = this.VOL;
    this.bus.connect(AudioSys.ctx.destination);   // музиката минава покрай ключа за ефектите
    this.shuffle(null);
    this.on = settings.music !== false;
    if (this.on) this.play(this.order[0], false, 0);
    this.timer = setInterval(() => {
      if (!this.on || this.fading || !this.cur) return;
      const played = this.cur.off + (AudioSys.ctx.currentTime - this.cur.t0);
      if (played > this.cur.dur - this.FADE) {
        this.fading = true;
        const next = this.advance();
        this.fadeOut();
        this.play(next, true, 0);
        setTimeout(() => { this.fading = false; }, this.FADE * 1000 + 250);
      }
    }, 400);
  },
  load(i, cb) {
    if (this.bufs[i]) { if (cb) cb(this.bufs[i]); return; }
    fetch(this.tracks[i])
      .then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(ab => AudioSys.ctx.decodeAudioData(ab))
      .then(buf => { this.bufs[i] = buf; if (cb) cb(buf); })
      .catch(() => {});
  },
  play(i, fadeIn, offset) {
    this.load(i, buf => {
      const c = AudioSys.ctx, g = c.createGain(), src = c.createBufferSource();
      src.buffer = buf; src.connect(g); g.connect(this.bus);
      const t = c.currentTime;
      if (fadeIn) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + this.FADE); }
      else g.gain.setValueAtTime(1, t);
      src.start(t, offset || 0);
      this.cur = { src, g, idx: i, t0: t, off: offset || 0, dur: buf.duration };
      this.idx = i;
      const nx = this.order[(this.pos + 1) % this.order.length];
      this.load(nx);                             // следващата по реда се тегли отрано
      for (const k in this.bufs)                 // пазим в паметта само текущата и следващата
        if (+k !== i && +k !== nx) delete this.bufs[k];
    });
  },
  fadeOut() {
    if (!this.cur) return;
    const t = AudioSys.ctx.currentTime, c = this.cur;
    c.g.gain.cancelScheduledValues(t);
    c.g.gain.setValueAtTime(1, t);
    c.g.gain.linearRampToValueAtTime(0.0001, t + this.FADE);
    try { c.src.stop(t + this.FADE + 0.1); } catch (e) {}
  },
  toggle() {
    this.on = !this.on;
    if (!this.on && this.cur) {
      this.pausedAt = { idx: this.cur.idx,
        off: (this.cur.off + (AudioSys.ctx.currentTime - this.cur.t0)) % this.cur.dur };
      try { this.cur.src.stop(); } catch (e) {}
      this.cur = null;
    } else if (this.on && !this.cur) {
      const p = this.pausedAt || { idx: this.idx, off: 0 };
      this.play(p.idx, false, p.off);
      this.pausedAt = null;
    }
    return this.on;
  }
};

let skidActive = false;  // играчът поднася в момента (за звука)

let camX = 0, camY = 0, camZoom = 1;
let gameT = 0, paused = false, started = false;
let startCityButtons = [];   // зони за избор на град на стартовия екран
function startWithCity(i) {
  if (!cityUnlocked(i)) return;
  if (!runLoaded) {
    runLoaded = true;
    if (applyAutoRun() !== null) showMsg('Продължаваш от последния запис.', 2.5);
  }
  if (i !== cityIdx) {
    genCityMap(i);
    playerToStart();
    spawnWorld();
  }
  started = true;
  AudioSys.init();
  MusicSys.start();
}
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
    citySwitchPending = true;
    travelToName = THEMES[(cityIdx + 1) % THEMES.length].name;
    AudioSys.gouranga();
  }
}

function playerToStart() {
  const s = nearestSideTile(MW / 2 * TILE, MH / 2 * TILE, 600);
  player.x = s ? s.x : MW / 2 * TILE;
  player.y = s ? s.y : MH / 2 * TILE;
  camX = player.x; camY = player.y;
}

// Населяване на града (извиква се при всяка смяна на град)
function spawnWorld() {
  cars.length = 0; peds.length = 0; pickups.length = 0;
  projectiles.length = 0; particles.length = 0; skids.length = 0; floaters.length = 0;
  for (let i = 0; i < 36; i++) {
    const s = randomRoadSpot();
    if (!s) continue;
    const r = R();
    const kind = (theme.starCar && r < 0.05) ? theme.starCar : r < 0.1 ? 'taxi' : r < 0.16 ? 'sport' : r < 0.18 ? 'toro' : r < 0.2 ? 'cavallo' : r < 0.24 ? 'volta' : r < 0.27 ? 'cabrio' : r < 0.34 ? 'bus' : r < 0.42 ? 'truck' : r < 0.47 ? 'police' : 'sedan';
    const c = makeCar(s.x, s.y, DIR_ANG[s.dir], kind);
    c.dir = s.dir;
    cars.push(c);
  }
  let placed = 0;
  for (let i = 0; i < 400 && placed < 7; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    if (tileAt(tx, ty) !== T.SIDE) continue;
    const c = makeCar(tx * TILE + TILE / 2, ty * TILE + TILE / 2, Math.floor(R() * 4) * Math.PI / 2,
      R() < 0.5 ? ['toro', 'cavallo', 'volta', 'cabrio', 'sport'][Math.floor(R() * 5)] : 'sedan');
    c.parked = true;
    cars.push(c); placed++;
  }
  for (let i = 0; i < 65; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    const t = tileAt(tx, ty);
    if (t === T.SIDE || t === T.PARK) peds.push(makePed(tx * TILE + TILE / 2, ty * TILE + TILE / 2));
  }
  // Пешеходните зони са пълни с хора (Витоша, Александровска, пл. Свобода)
  if (pedZoneTiles.length) {
    for (let i = 0; i < 20; i++) {
      const [tx, ty] = pedZoneTiles[Math.floor(R() * pedZoneTiles.length)];
      peds.push(makePed(tx * TILE + TILE / 2, ty * TILE + TILE / 2));
    }
  }
  const PICKS = ['health', 'money', 'pistol', 'mg', 'flame', 'rocket', 'armor', 'molotov', 'zap', 'dd', 'invis', 'bribe'];
  let pl = 0;
  for (let i = 0; i < 700 && pl < 26; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    const t = tileAt(tx, ty);
    if (t === T.SIDE || t === T.PARK) {
      pickups.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, type: PICKS[Math.floor(R() * PICKS.length)], spin: R() * 6 });
      pl++;
    }
  }
}

// ---------------- Метро (надземна обиколна линия) ----------------
const METRO = {
  xL: 12 * TILE, xR: 52 * TILE, yT: 12 * TILE, yB: 52 * TILE,
  f: 0.075,           // фактор на височина за проекцията
  carLen: 50, carGap: 7, carsPerTrain: 3
};
METRO.W = METRO.xR - METRO.xL;
METRO.H = METRO.yB - METRO.yT;
METRO.P = 2 * (METRO.W + METRO.H);
// Спирки: средите на четирите страни
METRO.stationS = [METRO.W / 2, METRO.W + METRO.H / 2, METRO.W + METRO.H + METRO.W / 2, 2 * METRO.W + METRO.H + METRO.H / 2];
const trains = [];
let stationEntrances = [];

function ringPoint(s) {
  const { xL, xR, yT, yB, W, H, P } = METRO;
  s = ((s % P) + P) % P;
  if (s < W) return { x: xL + s, y: yT, a: 0 };
  if (s < W + H) return { x: xR, y: yT + (s - W), a: Math.PI / 2 };
  if (s < 2 * W + H) return { x: xR - (s - W - H), y: yB, a: Math.PI };
  return { x: xL, y: yB - (s - 2 * W - H), a: -Math.PI / 2 };
}
function initMetro() {
  stationEntrances = METRO.stationS.map(s => {
    const p = ringPoint(s);
    return nearestSideTile(p.x, p.y, 400) || { x: p.x, y: p.y };
  });
  trains.length = 0;
  trains.push({ s: METRO.stationS[0], v: 0, dir: 1, dwell: 4, stationIdx: 0, nextIdx: 1 });
  trains.push({ s: METRO.stationS[2], v: 0, dir: -1, dwell: 4, stationIdx: 2, nextIdx: 1 });
  if (player) player.onTrain = null;
}
function distAhead(t, targetS) {
  const P = METRO.P;
  return (((targetS - t.s) * t.dir) % P + P) % P;
}
function updateMetro(dt) {
  for (const t of trains) {
    if (t.dwell > 0) {
      t.dwell -= dt; t.v = 0;
      if (t.dwell <= 0) {
        t.stationIdx = -1;
      }
      continue;
    }
    const targetS = METRO.stationS[t.nextIdx];
    const d = distAhead(t, targetS);
    const brakeDist = t.v * t.v / (2 * 170) + 10;
    const maxV = 360;
    if (d < brakeDist) t.v = Math.max(40, t.v - 200 * dt);
    else t.v = Math.min(maxV, t.v + 130 * dt);
    t.s = ((t.s + t.v * t.dir * dt) % METRO.P + METRO.P) % METRO.P;
    if (d < 8 || distAhead(t, targetS) > METRO.P - 30) {
      // Пристигане на спирка
      t.s = targetS; t.v = 0;
      t.stationIdx = t.nextIdx;
      t.dwell = 4.5;
      t.nextIdx = (t.nextIdx + (t.dir === 1 ? 1 : 3)) % 4;
      if (player.onTrain === t) AudioSys.blip(880, 0.15, 0.12);
    }
  }
}
function tryBoardTrain() {
  if (player.car) return false;
  for (let i = 0; i < 4; i++) {
    const e = stationEntrances[i];
    if (dist2(player.x, player.y, e.x, e.y) > 60 * 60) continue;
    for (const t of trains) {
      if (t.dwell > 0 && t.stationIdx === i) {
        player.onTrain = t;
        showMsg('Пътуваш от „' + theme.stations[i] + '“. Слизане с ' + (IS_TOUCH ? '🚗' : 'E') + '.', 3);
        AudioSys.pickup();
        return true;
      }
    }
    showMsg('Изчакай влака на спирката.', 1.5);
    return true;
  }
  return false;
}
function trainHeadPos(t) {
  return ringPoint(t.s);
}

// Първоначално зареждане
genCityMap(0);
playerToStart();
spawnWorld();

// ---------------- Частици и следи ----------------
function spawnParticles(x, y, n, opts) {
  for (let i = 0; i < n; i++) {
    if (particles.length > (settings.lowFx ? 90 : 260)) particles.shift();
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

// Кеширани светещи петна за огъня (бяло ядро -> жълто -> оранжево -> прозрачно)
const flameSprites = (() => {
  const defs = [
    ['rgba(255,255,235,1)', 'rgba(255,214,110,0.95)', 'rgba(255,122,26,0.55)'],  // горещо
    ['rgba(255,224,150,0.95)', 'rgba(255,140,40,0.85)', 'rgba(230,60,10,0.35)'], // средно
    ['rgba(255,150,60,0.8)',  'rgba(215,70,18,0.6)',  'rgba(120,25,8,0.15)'],    // догарящо
    ['rgba(120,116,112,0.5)', 'rgba(84,82,80,0.35)',  'rgba(60,58,56,0)']        // дим
  ];
  return defs.map(st => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, st[0]); gr.addColorStop(0.42, st[1]);
    gr.addColorStop(0.8, st[2]); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  });
})();

function spawnFlame(x, y, vx, vy, size, dur) {
  if (particles.length > (settings.lowFx ? 90 : 260)) particles.shift();
  particles.push({
    kind: 'flame', x, y, vx, vy, t: 0,
    dur: dur * (0.75 + R() * 0.5),
    size: size * (0.75 + R() * 0.5),
    grow: 0, drag: 2.6,
    wob: R() * Math.PI * 2, wobF: 7 + R() * 6
  });
}
const FX = {
  sparks: (x, y) => spawnParticles(x, y, 8, { speed: 160, dur: 0.4, size: 2.4, colors: ['#ffe27a', '#ffb347', '#fff'], drag: 3 }),
  smoke: (x, y) => spawnParticles(x, y, 1, { speed: 12, vy: -18, dur: 1.4, size: 6, colors: ['rgba(70,70,74,0.5)', 'rgba(96,96,100,0.45)'], grow: 9 }),
  fire: (x, y) => {
    spawnFlame(x + (R() - 0.5) * 7, y + (R() - 0.5) * 7,
      (R() - 0.5) * 16, -26 - R() * 26, 6.5, 0.55);
    if (R() < 0.30) FX.smoke(x + (R() - 0.5) * 6, y - 6);
    if (R() < 0.18) spawnParticles(x, y, 1,
      { speed: 55, vy: -70, dur: 0.55, size: 1.4, colors: ['#ffd23c', '#ffb347'], drag: 1.5 }); // въглен
  },
  // Струя на огнехвъргачката: частиците наследяват посоката, разширяват се и догарят в дим
  flameJet: (b) => {
    const frac = 1 - b.life / (b.life0 || 0.58);          // 0 при дулото -> 1 в края
    const spread = 24 + frac * 58;
    for (let i = 0; i < 2; i++)
      spawnFlame(b.x + (R() - 0.5) * 4, b.y + (R() - 0.5) * 4,
        b.vx * 0.28 + (R() - 0.5) * spread,
        b.vy * 0.28 + (R() - 0.5) * spread - 12 - frac * 26,
        3.2 + frac * 8.5,
        0.26 + frac * 0.30);
    if (frac > 0.55 && R() < 0.22) FX.smoke(b.x, b.y);
  },
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
  player.heat = Math.min(player.heat + amount * (theme.heatMult || 1), 400);
  player.lastCrimeT = gameT;
  recalcWanted();
}
function recalcWanted() {
  player.wanted = player.heat >= 360 ? 6 : player.heat >= 300 ? 5 : player.heat >= 260 ? 4 : player.heat >= 140 ? 3 : player.heat >= 60 ? 2 : player.heat >= 15 ? 1 : 0;
}
let copsSee = false, lastSeenX = null, lastSeenY = null, roadblockCd = 0;
function updateWanted(dt) {
  // GTA2: "треперещите глави" — знае ли полицията къде си?
  copsSee = false;
  if (player.wanted > 0 && player.invis <= 0 && !player.dead && !player.busted) {
    const SR = 520 * 520;
    for (const p of peds) if (p.cop && !p.dead && dist2(p.x, p.y, player.x, player.y) < SR) { copsSee = true; break; }
    if (!copsSee) for (const c of cars) {
      if (c.dead) continue;
      if ((c.kind === 'police' || c.kind === 'swatvan' || c.kind === 'fbi' || c.army) &&
          dist2(c.x, c.y, player.x, player.y) < SR) { copsSee = true; break; }
    }
  }
  if (copsSee) { lastSeenX = player.x; lastSeenY = player.y; }
  // Виждат ли те — нивото не пада. Скриеш ли се — пада (на 1 глава изчезва бързо).
  if (!copsSee && gameT - player.lastCrimeT > (player.wanted >= 2 ? 6 : 3)) {
    player.heat = Math.max(0, player.heat - dt * (player.wanted >= 4 ? 6 : 10));
    recalcWanted();
  }
  const W = player.wanted;
  let policeCars = 0, swatVans = 0, fbiCars = 0, armyTanks = 0, copPeds = 0;
  for (const c of cars) {
    if (c.dead) continue;
    if (c.army) armyTanks++;
    else if (c.kind === 'police' && !c.parked) policeCars++;
    else if (c.kind === 'swatvan') swatVans++;
    else if (c.kind === 'fbi') fbiCars++;
  }
  for (const p of peds) if (p.cop && !p.dead) copPeds++;
  // GTA2 таблица: 1 глава = една патрулка; 2-4 = две; 5 = FBI сменя полицията; 6 = армията сменя всички
  const wantPolice = (W === 0 || W >= 5) ? 0 : W === 1 ? 1 : 2;
  const wantSwat = W === 4 ? 2 : 0;
  const wantFbi = W === 5 ? 3 : 0;
  const wantArmy = W >= 6 ? 2 : 0;
  const spawnChaser = (kind) => {
    const sp = randomRoadSpot();
    if (!sp || dist2(sp.x, sp.y, player.x, player.y) < 450 * 450) return null;
    const c = makeCar(sp.x, sp.y, DIR_ANG[sp.dir], kind);
    c.dir = sp.dir;
    cars.push(c);
    return c;
  };
  if (policeCars < wantPolice && R() < dt * 0.6) spawnChaser('police');
  if (swatVans < wantSwat && R() < dt * 0.4) spawnChaser('swatvan');
  if (fbiCars < wantFbi && R() < dt * 0.5) spawnChaser('fbi');
  if (armyTanks < wantArmy && R() < dt * 0.3) {
    const t2 = spawnChaser('tank');
    if (t2) { t2.army = true; t2.turret = t2.angle; showMsg('АРМИЯТА Е НА УЛИЦАТА!', 2.5); }
  }
  // Пеши: полицаи от 2 глави, SWAT от 4, войници с узита на 6 (на 5 FBI рядко слизат)
  const wantFoot = W >= 6 ? 6 : W === 5 ? 1 : W >= 2 ? W * 2 : 0;
  if (copPeds < wantFoot && R() < dt * 0.4) {
    const sp = nearestSideTile(player.x + (R() - 0.5) * 900, player.y + (R() - 0.5) * 900, 500);
    if (sp && dist2(sp.x, sp.y, player.x, player.y) > 260 * 260) {
      const cp = makePed(sp.x, sp.y, true);
      if (W >= 6) { cp.soldier = true; cp.hp = 80; cp.shirt = '#3c4a2e'; }
      else if (W >= 4) { cp.swat = true; cp.hp = 90; cp.shirt = '#1d242b'; }
      peds.push(cp);
    }
  }
  // Барикади: GTA2 ги вдига от 3 глави; на 6 барикадата е танк
  roadblockCd -= dt;
  if (W >= 3 && copsSee && roadblockCd <= 0 && player.invis <= 0) {
    spawnRoadblock(W);
    roadblockCd = 9;
  }
}
function spawnRoadblock(W) {
  const a = player.car ? player.car.angle : player.angle;
  for (let i = 0; i < 24; i++) {
    const d = 520 + R() * 300;
    const sp = a + (R() - 0.5) * 0.9;
    const wx = player.x + Math.cos(sp) * d, wy = player.y + Math.sin(sp) * d;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (tileAt(tx, ty) !== T.ROAD) continue;
    const dir = laneDirAt(tx, ty);
    if (dir > 3) continue;
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    const across = DIR_ANG[dir] + Math.PI / 2;   // напречно на платното
    if (W >= 6) {
      const t2 = makeCar(cx, cy, across, 'tank');
      t2.army = true; t2.sentry = true;
      t2.turret = Math.atan2(player.y - cy, player.x - cx);
      cars.push(t2);
      showMsg('ТАНКОВА БАРИКАДА НАПРЕД!', 2);
    } else {
      for (const off of [-26, 26]) {
        const pc = makeCar(cx + Math.cos(across) * off, cy + Math.sin(across) * off, across, W >= 5 ? 'fbi' : 'police');
        pc.parked = true; pc.roadblock = true;
        cars.push(pc);
      }
      for (const off of [-20, 20]) {
        const cp = makePed(cx + Math.cos(across) * off - Math.cos(a) * 26, cy + Math.sin(across) * off - Math.sin(a) * 26, true);
        cp.hp = 60;                                        // бронирани (GTA2: barricade officers)
        if (W >= 4) { cp.swat = true; cp.hp = 90; cp.shirt = '#1d242b'; }
        peds.push(cp);
      }
      showMsg('🚧 Полицейска барикада напред!', 2);
    }
    return;
  }
}

// ---------------- Бой ----------------
function fireWeapon(shooter, angle, weaponIdx, fromPolice) {
  const w = WEAPONS[weaponIdx];
  const dmgX = (!fromPolice && player.dd > 0) ? 2 : 1;
  if (w.molotov) {
    const am = angle + (R() - 0.5) * w.spread * 2;
    projectiles.push({
      type: 'molotov',
      x: shooter.x + Math.cos(am) * 14, y: shooter.y + Math.sin(am) * 14,
      vx: Math.cos(am) * 330, vy: Math.sin(am) * 330,
      life: w.range / 330, dmg: w.dmg * dmgX, police: !!fromPolice
    });
    AudioSys.blip(300, 0.1, 0.1);
    return;
  }
  if (w.zap) {
    let best = null, bd = w.range * w.range;
    for (const p of peds) {
      if (p.dead || p === shooter) continue;
      const dv = dist2(p.x, p.y, shooter.x, shooter.y);
      if (dv > bd) continue;
      const aTo = Math.atan2(p.y - shooter.y, p.x - shooter.x);
      let da = aTo - angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 0.5) { bd = dv; best = p; }
    }
    AudioSys.blip(1600, 0.06, 0.09, 'square');
    if (best) {
      best.zap = 1.2;
      damagePed(best, w.dmg * dmgX, !fromPolice, 'bullet');
      const dd2 = Math.sqrt(dist2(best.x, best.y, shooter.x, shooter.y));
      for (let t = 0.15; t < 1; t += 0.14) {
        const lx = shooter.x + (best.x - shooter.x) * t + (R() - 0.5) * 10;
        const ly = shooter.y + (best.y - shooter.y) * t + (R() - 0.5) * 10;
        spawnParticles(lx, ly, 1, { speed: 14, dur: 0.14, size: 1.7, colors: ['#aaeeff', '#66ccff', '#ffffff'] });
      }
    }
    return;
  }
  if (w.melee) {
    const hx = shooter.x + Math.cos(angle) * w.range, hy = shooter.y + Math.sin(angle) * w.range;
    for (const p of peds) {
      if (p.dead || p === shooter) continue;
      if (dist2(p.x, p.y, hx, hy) < 26 * 26 || dist2(p.x, p.y, shooter.x, shooter.y) < 30 * 30) {
        damagePed(p, (w.dmg * dmgX), !fromPolice, 'melee');
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
      life: w.range / 260, life0: w.range / 260, dmg: (w.dmg * dmgX), police: !!fromPolice
    });
    spawnFlame(shooter.x + Math.cos(a) * 16, shooter.y + Math.sin(a) * 16,
      Math.cos(a) * 90, Math.sin(a) * 90 - 8, 3.4, 0.14);  // изблик при дулото
    AudioSys.flame();
  } else if (w.rocket) {
    projectiles.push({
      type: 'rocket',
      x: shooter.x + Math.cos(a) * 20, y: shooter.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
      life: w.range / 520, dmg: (w.dmg * dmgX), police: !!fromPolice
    });
    AudioSys.rocket();
  } else {
    projectiles.push({
      type: 'bullet',
      x: shooter.x + Math.cos(a) * 16, y: shooter.y + Math.sin(a) * 16,
      vx: Math.cos(a) * 950, vy: Math.sin(a) * 950,
      life: w.range / 950, dmg: (w.dmg * dmgX), police: !!fromPolice
    });
    weaponIdx === 2 ? AudioSys.mg() : AudioSys.shot();
  }
  if (!fromPolice) {
    addHeat(w.flame ? 0.3 : 0.7);
    panicNear(shooter.x, shooter.y, 280);
  }
}
function panicNear(x, y, r) {
  let anyone = false;
  for (const p of peds) {
    if (p.dead || p.cop) continue;
    if (dist2(p.x, p.y, x, y) < r * r) {
      if (p.panic <= 0) anyone = true;
      p.panic = 6 + R() * 4;
      p.angle = Math.atan2(p.y - y, p.x - x) + (R() - 0.5);
    }
  }
  if (anyone && R() < 0.6) AudioSys.scream(x);
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
    c.flying = false;
    if (player.car === c) { player.car = null; damagePlayer(c.kind === 'heli' ? 999 : 45); } // взривен хеликоптер = загубен живот
  }
}
function explode(x, y, byPlayer) {
  FX.boom(x, y);
  AudioSys.boom();
  panicNear(x, y, 420);
  for (const p of peds) if (!p.dead && dist2(p.x, p.y, x, y) < 75 * 75) damagePed(p, 100, byPlayer, 'explosion');
  for (const c of cars) if (!c.dead && !c.flying && dist2(c.x, c.y, x, y) < 85 * 85) damageCar(c, 65, byPlayer, 'explosion'); // височината пази летящия хеликоптер
  if (!player.car && !player.dead && dist2(player.x, player.y, x, y) < 85 * 85) damagePlayer(50);
  else if (player.car && !player.car.flying && dist2(player.car.x, player.car.y, x, y) < 85 * 85 && !player.car.dead) damageCar(player.car, 35, false, 'explosion');
}
function damagePlayer(dmg) {
  if (settings.vibro && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} }
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
  if (!mission.active) mission.cooldown -= dt;
  const ready = !mission.active && mission.cooldown <= 0 && !player.dead && !player.busted;
  for (let i = 0; i < phones.length; i++) {
    const ph = phones[i];
    const d = dist2(ph.x, ph.y, player.x, player.y);
    // GTA2: всеки телефон е отделна верига и звъни, когато си наблизо — ти избираш кой да вдигнеш
    ph.ringing = ready && d < 420 * 420;
    if (d > 600 * 600) ph.hinted = false;
    if (!ph.ringing) continue;
    if (!ph.hinted) { ph.hinted = true; showMsg('☎ ' + phonePreview(i), 3); }
    if (R() < dt * 0.9) AudioSys.ring();
    if (!player.car && d < 26 * 26) {
      for (const o of phones) o.ringing = false;
      mission.gangHint = gangAt(ph.x);
      mission.phoneIdx = i;
      startMission();
      return;
    }
  }
}
function roadNearTile(tx, ty, r) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (tileAt(tx + dx, ty + dy) === T.ROAD) return true;
  return false;
}
function randomSideSpotPx(minDistFromPlayer) {
  for (let i = 0; i < 300; i++) {
    const tx = 3 + Math.floor(R() * (MW - 6)), ty = 3 + Math.floor(R() * (MH - 6));
    if (tileAt(tx, ty) !== T.SIDE) continue;
    if (!roadNearTile(tx, ty, 2)) continue;   // без затворени дворове — до точката се стига с кола
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (dist2(x, y, player.x, player.y) > minDistFromPlayer * minDistFromPlayer) return { x, y };
  }
  return null;
}
function spawnGear(kind) {
  for (let i = 0; i < 80; i++) {
    const sp = randomRoadSpot();
    if (!sp) continue;
    const d = dist2(sp.x, sp.y, player.x, player.y);
    if (d < 260 * 260 || d > 1500 * 1500) continue;
    const c = makeCar(sp.x, sp.y, [0, Math.PI / 2, Math.PI, -Math.PI / 2][sp.dir] || 0, kind);
    c.parked = true; c.gear = true; c.marked = true; c.turret = c.angle;
    cars.push(c);
    return c;
  }
  return null;
}
const MISSION_TABLE = [
  { type: 'deliver', txt: 'Първа работа: шефът иска кола. Открадни я и я закарай в гаража.', reward: 2500, timer: 120 },
  { type: 'hit',     txt: 'Един бърборко говори с ченгетата. Накарай го да замълчи.', reward: 2500, timer: 90 },
  { type: 'race',    goal: 5, txt: 'Докажи, че си бърз — мини чекпойнтите преди да изтече времето.', reward: 3000 },
  { type: 'wreck',   goal: 3, txt: 'Конкуренцията ни дразни. Разбий 3 от колите им.', reward: 3000, timer: 100 },
  { type: 'deliver', kind: 'taxi', txt: 'Трябва ни такси за една маскировка. Докарай едно в гаража.', reward: 3000, timer: 110 },
  { type: 'fares',   goal: 3, txt: 'Слуховете се разнасят с таксита. Вземи едно, направи 3 курса и слушай.', reward: 3200, timer: 150 },
  { type: 'crush',   goal: 2, txt: 'Уликите трябва да изчезнат. Смачкай 2 коли в пресата.', reward: 3000, timer: 120 },
  { type: 'gangkill', goal: 4, txt: 'Онези с цветните ризи ни дишат във врата. Свали 4 от тях в квартала им.', reward: 3500, timer: 120 },
  { type: 'bomb',    txt: 'Пакетче за един счетоводител. Занеси го на адреса, въоръжи го и изчезвай.', reward: 4000, timer: 110 },
  { type: 'race',    goal: 3, stealth: true, txt: 'Огледай 3 адреса, тихо. Ако ченгетата те надушат — работата се отменя.', reward: 3500, timer: 150 },
  { type: 'chase',   kind: 'sport', txt: 'Един курир избяга с нашите пари. Настигни го и го спри — завинаги.', reward: 4000, timer: 100 },
  { type: 'wreck',   goal: 2, kind: 'police', txt: 'Две патрулки паркират пред гаража всяка вечер. Да не паркират повече.', reward: 4500, timer: 110 },
  { type: 'deliver', kind: 'sport', txt: 'Шефът иска нещо бързо за уикенда. Спортна кола, в гаража, без драскотина.', reward: 3500, timer: 110 },
  { type: 'survive', wanted: 2, goal: 45, txt: 'Отвлечи вниманието: вдигни 2 звезди и издържи 45 секунди без арест.', reward: 4000, timer: 120 },
  { type: 'army',    goal: 6, txt: 'Армията "забрави" техника из града. Вземи танк или оръдие и разбий 6 коли!', reward: 6000, timer: 110 },
  { type: 'hit',     txt: 'Съдия с прекалено дълга памет. Скъси я.', reward: 4500, timer: 80 },
  { type: 'race',    goal: 6, txt: 'Обзалагане с една от бандите: 6 чекпойнта срещу часовника.', reward: 4500 },
  { type: 'fares',   goal: 5, txt: 'Пет курса с такси за три минути. Гилдията ще ни дължи услуга.', reward: 4500, timer: 180 },
  { type: 'crush',   goal: 3, txt: 'Три горещи коли, три улики. Пресата ги чака.', reward: 4000, timer: 140 },
  { type: 'bomb',    txt: 'Складът на конкуренцията. Взриви го и не се оглеждай назад.', reward: 5500, timer: 110 },
  { type: 'deliver', kind: 'volta', txt: 'Тиха кола за тиха работа. Докарай Волта в гаража.', reward: 5000, timer: 130 },
  { type: 'gangkill', goal: 6, txt: 'Отговор на нападението им: шестима от техните, в техния квартал.', reward: 5000, timer: 130 },
  { type: 'raid',    goal: 8, txt: 'Отгоре градът е стрелбище. Вземи хеликоптера и бомбардирай 8 коли! Ще стрелят по теб.', reward: 8000, timer: 95 },
  { type: 'chase',   kind: 'toro', txt: 'Предател с нашия списък бяга с Торо. Спри го, преди да стигне до участъка.', reward: 5500, timer: 90 },
  { type: 'race',    goal: 4, stealth: true, txt: 'Четири адреса. Нито една звезда. Разбра ли?', reward: 5000, timer: 170 },
  { type: 'wreck',   goal: 6, txt: 'Показна сила: 6 коли за две минути.', reward: 5500, timer: 120 },
  { type: 'survive', wanted: 3, goal: 60, txt: 'Ченгетата трябва да са заети другаде. Вдигни 3 звезди и издържи цяла минута.', reward: 6000, timer: 150 },
  { type: 'deliver', kind: 'police', txt: 'Трябва ни патрулка. Открадни една и я докарай в гаража — без да ти стрелят в гърба.', reward: 6000, timer: 120 },
  { type: 'deliver', txt: 'Кола с нещо в багажника. Не питай — карай в гаража.', reward: 5000, timer: 100 },
  { type: 'hit',     txt: 'Един от босовете пие кафе на площада. Последното.', reward: 7000, timer: 90 },
  { type: 'crush',   goal: 4, txt: 'Четири коли, четири трупа улики. Пресата не задава въпроси.', reward: 5500, timer: 160 },
  { type: 'army',    goal: 8, txt: 'Армията пак забрави техника. Осем коли този път — покажи им.', reward: 8000, timer: 120 },
  { type: 'deliver', kind: 'cavallo', txt: 'Само едно Кавало в града. Направи го наше.', reward: 7500, timer: 150 },
  { type: 'bomb',    txt: 'Централата на конкуренцията. Голям взрив, голяма история.', reward: 8000, timer: 100 },
  { type: 'survive', wanted: 4, goal: 60, txt: 'Шест глави са за легенди. Вдигни четири и оцелей минута.', reward: 9000, timer: 160 },
  { type: 'chase',   kind: 'swatvan', hp: 320, txt: 'Босът на другата банда бяга с брониран ван. Спри го. Това е краят на тяхната история.', reward: 12000, timer: 120 },
  { type: 'hit',     goal: 2, txt: 'Двама свидетели, един следобед. И двамата.', reward: 5000, timer: 110 },
  { type: 'deliver', kind: 'bus', txt: 'Автобус, пълен с "туристи" на конкуренцията. Открадни го и го докарай в гаража.', reward: 4000, timer: 130 },
  { type: 'race',    goal: 7, txt: 'Уличната лига: 7 чекпойнта, без спирачки.', reward: 5000 },
  { type: 'wreck',   goal: 3, kind: 'taxi', txt: 'Таксиметровата гилдия отказа да плаща. Три жълти коли на скрап.', reward: 4500, timer: 120 },
  { type: 'crush',   goal: 3, txt: 'Пресата има нова поръчка: три коли до обяд.', reward: 4500, timer: 150 },
  { type: 'bomb',    txt: 'Кафенето, където ченгетата закусват. Без жертви — просто послание.', reward: 5500, timer: 100 },
  { type: 'chase',   kind: 'taxi', txt: 'Таксиджия видя твърде много. Настигни го, преди да стигне до участъка.', reward: 4500, timer: 90 },
  { type: 'survive', wanted: 2, goal: 60, txt: 'Дръж ченгетата заети една минута, докато момчетата свършат работата.', reward: 5000, timer: 130 },
  { type: 'gangkill', goal: 5, txt: 'Петима от тях, за да разберат кой командва.', reward: 5000, timer: 130 },
  { type: 'deliver', kind: 'cabrio', txt: 'Шефката иска кабрио за плажа. Без покрив, без въпроси.', reward: 5000, timer: 130 },
  { type: 'race',    goal: 4, stealth: true, txt: 'Четири срещи с информатори. Нито една звезда, иначе изчезват.', reward: 5500, timer: 180 },
  { type: 'hit',     goal: 3, txt: 'Трима братя, три квартала. До полунощ.', reward: 7000, timer: 150 },
  { type: 'wreck',   goal: 4, kind: 'police', txt: 'Четири патрулки. Ченгетата да разберат, че градът не е техен.', reward: 7000, timer: 140 },
  { type: 'deliver', kind: 'swatvan', txt: 'SWAT ван — с него влизаме навсякъде. Открадни един и го докарай.', reward: 7000, timer: 140 },
  { type: 'army',    goal: 7, txt: 'Танкова разходка: седем коли.', reward: 7500, timer: 120 },
  { type: 'bomb',    txt: 'Оръжейният склад на конкуренцията. Взриви го и се измъкни жив.', reward: 7000, timer: 100 },
  { type: 'chase',   kind: 'cavallo', hp: 140, txt: 'Крадец с нашето Кавало. Няма да го хванеш по права — притисни го в завоите.', reward: 7500, timer: 100 },
  { type: 'fares',   goal: 6, txt: 'Шест курса с такси. Един от клиентите носи плик — не питай.', reward: 6000, timer: 200 },
  { type: 'survive', wanted: 3, goal: 75, txt: 'Седемдесет и пет секунди на три звезди. За смелчаци.', reward: 7500, timer: 170 },
  { type: 'deliver', txt: 'Кола с труп в багажника. Гаражът, бързо, преди да замирише.', reward: 6000, timer: 90 },
  { type: 'hit',     txt: 'Ченге под прикритие в квартала. Разкрит е. Довърши го.', reward: 7500, timer: 90 },
  { type: 'race',    goal: 8, txt: 'Големият кръг: 8 чекпойнта през целия град.', reward: 7000 },
  { type: 'raid',    goal: 10, txt: 'Хеликоптерът пак е наш. Десет коли от въздуха.', reward: 10000, timer: 110 },
  { type: 'crush',   goal: 5, txt: 'Пет коли в пресата за три минути. Собственикът ще ни е длъжник.', reward: 7000, timer: 180 },
  { type: 'gangkill', goal: 8, txt: 'Война. Осем от тях.', reward: 8000, timer: 150 },
  { type: 'deliver', kind: 'tank', txt: 'Шефът иска ТАНК в гаража. Не питай откъде — потърси наоколо.', reward: 10000, timer: 200 },
  { type: 'chase',   kind: 'fbi', static: true, txt: 'Колата на FBI пред участъка. Разбий я, докато е паркирана, и се махни.', reward: 6000, timer: 100 },
  { type: 'bomb',    txt: 'Бензиностанцията на конкуренцията. Взривът ще се види от целия град.', reward: 8500, timer: 100 },
  { type: 'survive', wanted: 5, goal: 45, txt: 'Пет звезди — SWAT и FBI. Четиридесет и пет секунди.', reward: 10000, timer: 150 },
  { type: 'hit',     goal: 4, txt: 'Четирима съдебни заседатели. Процесът трябва да пропадне.', reward: 9000, timer: 180 },
  { type: 'wreck',   goal: 8, txt: 'Осем коли. Шоуто трябва да е незабравимо.', reward: 8000, timer: 150 },
  { type: 'deliver', kind: 'heli', txt: 'Хеликоптерът от покрива. Докарай го в гаража — кацни до вратата.', reward: 12000, timer: 150 },
  { type: 'race',    goal: 5, stealth: true, txt: 'Пет адреса, тихо като сянка.', reward: 7500, timer: 200 },
  { type: 'chase',   kind: 'volta', txt: 'Тиха кола, тих беглец. Няма да го чуеш — следвай маркера.', reward: 7500, timer: 100 },
  { type: 'fares',   goal: 8, txt: 'Осем курса за четири минути. Рекордът на гилдията.', reward: 8000, timer: 240 },
  { type: 'army',    goal: 10, txt: 'Десет коли с армейска техника. Легендата за танкиста.', reward: 11000, timer: 140 },
  { type: 'gangkill', goal: 10, txt: 'Десет. Това е последната им война.', reward: 10000, timer: 180 },
  { type: 'survive', wanted: 6, goal: 60, txt: 'Шест глави. Армията. Една минута. Оцелееш ли, си Кръстник.', reward: 15000, timer: 180 },
  { type: 'chase',   kind: 'tank', hp: 900, txt: 'Дезертьор с танк бяга през града. Спри го с каквото имаш.', reward: 15000, timer: 160 },
];
function spawnMissionCar(kind, minD, maxD) {
  for (let i = 0; i < 80; i++) {
    const sp = randomRoadSpot();
    if (!sp) continue;
    const d = dist2(sp.x, sp.y, player.x, player.y);
    if (d < minD * minD || d > maxD * maxD) continue;
    const c = makeCar(sp.x, sp.y, DIR_ANG[sp.dir] || 0, kind);
    c.dir = sp.dir; c.parked = true; c.marked = true;
    cars.push(c);
    return c;
  }
  return null;
}
function setupMission(m) {
  if (m.type === 'deliver') {
    let car = null;
    if (m.kind) {
      let bd = 1e18;
      for (const c of cars) {
        if (c.dead || c.kind !== m.kind || c === player.car) continue;
        const d = dist2(c.x, c.y, player.x, player.y);
        if (d > 250 * 250 && d < bd) { bd = d; car = c; }
      }
      if (!car) car = spawnMissionCar(m.kind, 400, 1500);
    } else {
      let bd = 1e18;
      for (const c of cars) {
        if (c.dead || c.kind === 'police' || c.army || c.gear || c === player.car) continue;
        const d = dist2(c.x, c.y, player.x, player.y);
        if (d > 300 * 300 && d < bd) { bd = d; car = c; }
      }
    }
    const drop = randomSideSpotPx(900);
    if (!car || !drop) return false;
    car.marked = true;
    mission.target = car; mission.drop = drop;
    return true;
  }
  if (m.type === 'hit') {
    const want = m.goal || 1;
    const cands = peds.filter(p => !p.dead && !p.cop && dist2(p.x, p.y, player.x, player.y) > 300 * 300);
    if (cands.length < want) return false;
    cands.sort(() => R() - 0.5);
    mission.targets = cands.slice(0, want);
    for (const p of mission.targets) p.markTarget = true;
    mission.target = mission.targets[0];
    return true;
  }
  if (m.type === 'race') {
    for (let i = 0; i < (m.goal || 5); i++) {
      const sp = randomRoadSpot();
      if (sp) mission.checkpoints.push({ x: sp.x, y: sp.y });
    }
    if (mission.checkpoints.length < 3) return false;
    if (!m.timer) mission.timer = 20 + mission.checkpoints.length * 13;
    return true;
  }
  if (m.type === 'army') {
    const gear = [spawnGear('tank'), spawnGear('tank'), spawnGear('cannon'), spawnGear('cannon')].filter(Boolean);
    if (!gear.length) return false;
    mission.gear = gear;
    return true;
  }
  if (m.type === 'raid') {
    const h = spawnGear('heli');
    if (!h) return false;
    mission.gear = [h];
    return true;
  }
  if (m.type === 'gangkill') {
    const gh = mission.gangHint;
    mission.gangTarget = (gh !== undefined && gh >= 0) ? 1 - gh : Math.floor(R() * 2);
    mission.text += ' Целта са ' + GANGS[mission.gangTarget].name + '.';
    return true;
  }
  if (m.type === 'bomb') {
    const spot = randomSideSpotPx(700);
    if (!spot) return false;
    mission.drop = spot; mission.bombState = 0; mission.armT = 0;
    return true;
  }
  if (m.type === 'chase') {
    const c = spawnMissionCar(m.kind || 'sport', 500, 900);
    if (!c) return false;
    c.parked = !!m.static; c.flee = !m.static;
    if (m.hp) { c.hp = m.hp; c.maxHp = m.hp; }
    mission.target = c;
    return true;
  }
  return true;   // wreck, fares, crush, survive — нямат подготовка
}
let doneMissions = [];
// Веригата на телефон №pi: мисиите с индекс ≡ pi (mod брой телефони). Дава първата недовършена,
// а свърши ли веригата — произволна от нея с бонус за нов кръг.
function chainNext(pi) {
  const nPh = Math.max(1, phones.length);
  const chain = [];
  for (let i = pi % nPh; i < MISSION_TABLE.length; i += nPh) chain.push(i);
  if (!chain.length) chain.push(pi % MISSION_TABLE.length);
  const undone = chain.filter(i => !doneMissions.includes(i));
  if (undone.length) return { idx: undone[0], cycle: 0 };
  return { idx: chain[Math.floor(R() * chain.length)], cycle: 1 + Math.floor(doneMissions.length / MISSION_TABLE.length) };
}
const MISSION_LABELS = { deliver: 'кражба', hit: 'удар', race: 'гонка', wreck: 'разбиване', fares: 'такси', crush: 'преса',
  gangkill: 'банди', bomb: 'бомба', chase: 'преследване', survive: 'оцеляване', army: 'танкове', raid: 'хеликоптер' };
function phonePreview(pi) {
  const pk = chainNext(pi), m = MISSION_TABLE[pk.idx];
  return 'Мисия ' + (pk.idx + 1) + ' · ' + (m.stealth ? 'разузнаване' : MISSION_LABELS[m.type] || m.type) + ' · ' + fmtMoney(m.reward);
}
function startMission() {
  const pick = chainNext(mission.phoneIdx || 0);
  const idx = pick.idx, cycle = pick.cycle;
  mission.tableIdx = idx;
  const m = MISSION_TABLE[idx];
  mission.type = m.type; mission.text = m.txt;
  mission.reward = Math.floor(m.reward * (1 + cycle * 0.25));
  mission.timer = m.timer || 120;
  mission.count = 0; mission.goal = m.goal || 0;
  mission.wrecks = 0; mission.wreckGoal = m.goal || 0; mission.wreckKind = m.type === 'wreck' ? (m.kind || null) : null;
  mission.stealth = !!m.stealth; mission.needWanted = m.wanted || 0; mission.surv = 0;
  mission.checkpoints = []; mission.target = null; mission.drop = null; mission.gear = null;
  if (!setupMission(m)) { mission.cooldown = 3; return; }
  mission.active = true;
  mission.text = (idx + 1) + '/' + MISSION_TABLE.length + (cycle ? ' (кръг ' + (cycle + 1) + ')' : '') + ' · ' + mission.text;
  mission.reward = Math.floor(mission.reward * (theme.payMult || 1));   // по-далечният град плаща повече
  mission.gang = (mission.gangHint !== undefined && mission.gangHint >= 0) ? mission.gangHint : -1;
  mission.gangHint = undefined;
  if (mission.gang >= 0) {
    mission.text = '[' + GANGS[mission.gang].name + '] ' + mission.text;
    if (respect[mission.gang] >= 40) mission.reward = Math.floor(mission.reward * 1.5);   // доверен човек = по-тлъсти пари
  }
  showMsg('☎ ' + mission.text, 5);
  AudioSys.pickup();
}
function endMission(win) {
  if (mission.type === 'deliver' && mission.target) mission.target.marked = false;
  if (mission.type === 'hit') for (const p of (mission.targets || [mission.target])) if (p) p.markTarget = false;
  mission.targets = null;
  if (mission.type === 'chase' && mission.target) { mission.target.flee = false; mission.target.marked = false; }
  if (win) {
    missionsDone++;
    if (mission.tableIdx != null && !doneMissions.includes(mission.tableIdx)) doneMissions.push(mission.tableIdx);
    meta.metaMissions++;
    { const nl = CITY_REQ.findIndex((r, i) => i > 0 && r === meta.metaMissions); if (nl > 0) openUnlockScreen(nl, 'offer'); }
    addRankXp(15);
    dailyProgress('missions', 1);
    autosaveRun();
    addScore(mission.reward, player.x, player.y - 20);
    let extra = '';
    if (player.wanted > 0) { player.heat = 0; recalcWanted(); extra = ' · Ченгетата те забравиха'; }
    if (missionsDone % 2 === 0 && mult < 8) { mult++; extra = ' · Множител x' + mult; }
    showMsg('РАБОТАТА Е СВЪРШЕНА! +' + fmtMoney(mission.reward * mult) + extra, 4);
    AudioSys.pickup();
  } else {
    // Шефът винаги си взима нещо при провал: пари, кръв или оръжие
    let msg = 'Провали работата. Шефът не е доволен';
    const pick = Math.floor(R() * 3);
    let done = false;
    if (pick === 0 && score >= 400) {
      const cut = Math.min(score, 400 + Math.floor(score * 0.1));
      score -= cut; msg += ' — хората му ти взеха ' + fmtMoney(cut) + '.'; done = true;
    } else if (pick === 1 && player.hp > 45) {
      player.hp -= 35; FX.blood(player.x, player.y); AudioSys.hit();
      msg += ' — момчетата му те понатупаха.'; done = true;
    }
    if (!done) {
      let took = -1;
      for (let w = WEAPONS.length - 1; w >= 1; w--) if (player.ammo[w] > 0) { took = w; break; }
      if (took > 0) {
        player.ammo[took] = 0;
        if (player.weapon === took) cycleWeapon();
        msg += ' — конфискува ти ' + WEAPONS[took].name.toLowerCase() + '.';
      } else if (score > 0) {
        const cut = Math.min(score, 400); score -= cut;
        msg += ' — хората му ти взеха ' + fmtMoney(cut) + '.';
      } else if (player.hp > 45) {
        player.hp -= 35; FX.blood(player.x, player.y); AudioSys.hit();
        msg += ' — момчетата му те понатупаха.';
      } else msg += '. Този път ти се размина.';
    }
    showMsg(msg, 4);
  }
  if (mission.type === 'army' || mission.type === 'raid') mission.gearRemove = true;
  if (mission.gang >= 0) {
    const g = mission.gang, r = 1 - g;
    if (win) {
      respect[g] = Math.min(100, respect[g] + 12);
      respect[r] = Math.max(-100, respect[r] - 8);
      showMsg(GANGS[g].name + ' те уважават повече (+12). ' + GANGS[r].name + ' те намразиха (-8).', 3.5);
    } else {
      respect[g] = Math.max(-100, respect[g] - 10);
    }
  }
  mission.gang = -1;
  mission.active = false; mission.target = null; mission.checkpoints = [];
  mission.cooldown = 8;
}
function updateMission(dt) {
  if (mission.gearRemove) {
    mission.gearRemove = false;
    for (let i = cars.length - 1; i >= 0; i--) if (cars[i].gear) {
      if (player.car === cars[i]) exitCar();
      cars.splice(i, 1);
    }
    mission.gear = null;
    showMsg('Армията си прибра техниката.', 2.5);
  }
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
    const alive = (mission.targets || [mission.target]).filter(p => !p.dead);
    if (!alive.length) { endMission(true); return; }
    let best = alive[0], bd = 1e18;                     // маркерът сочи най-близката жива цел
    for (const p of alive) { const d = dist2(p.x, p.y, player.x, player.y); if (d < bd) { bd = d; best = p; } }
    mission.target = best;
  } else if (mission.type === 'chase') {
    if (mission.target.dead) endMission(true);
  } else if (mission.type === 'survive') {
    if (player.wanted >= mission.needWanted) {
      mission.surv += dt;
      if (Math.floor(mission.surv) !== Math.floor(mission.surv - dt) && Math.floor(mission.surv) % 10 === 0)
        showMsg('Издържа ' + Math.floor(mission.surv) + '/' + mission.goal + ' сек', 1.5);
      if (mission.surv >= mission.goal) { endMission(true); return; }
    }
  } else if (mission.type === 'bomb') {
    const d = dist2(player.x, player.y, mission.drop.x, mission.drop.y);
    if (mission.bombState === 0) {
      if (!player.car && d < 45 * 45) {
        mission.armT += dt;
        if (mission.armT >= 2) {
          mission.bombState = 1; mission.fuse = 12;
          showMsg('💣 Въоръжена! Изчезвай — 12 секунди!', 3);
          AudioSys.blip(900, 0.1, 0.2, 'square');
        }
      } else mission.armT = 0;
    } else {
      mission.fuse -= dt;
      if (mission.fuse <= 0) {
        for (let k = 0; k < 3; k++) explode(mission.drop.x + (R() - 0.5) * 90, mission.drop.y + (R() - 0.5) * 90, true);
        weather.flash = 1;
        if (d < 180 * 180) damagePlayer(80);
        if (!player.dead) endMission(true);
        return;
      }
    }
  } else if (mission.type === 'race') {
    if (mission.stealth && player.wanted > 0) { showMsg('Видяха те. Работата се отменя.', 3); endMission(false); return; }
    const cp = mission.checkpoints[0];
    if (cp && dist2(player.x, player.y, cp.x, cp.y) < 60 * 60) {
      mission.checkpoints.shift();
      AudioSys.blip(660, 0.1, 0.15);
      addScore(200, player.x, player.y);
      if (!mission.checkpoints.length) endMission(true);
    }
  } else if (mission.type === 'army' || mission.type === 'raid') {
    if (mission.gear && mission.gear.every(g => g.dead)) { endMission(false); return; }
  }
  // 'wreck' се отчита в damageCar чрез брояч по-долу
}
// Брояч на унищожени коли за мисия 'wreck'
const _origDamageCar = damageCar;
damageCar = function (c, dmg, byPlayer, cause) {
  const wasDead = c.dead;
  _origDamageCar(c, dmg, byPlayer, cause);
  if (!wasDead && c.dead && byPlayer) dailyProgress('wreck', 1);
  if (!wasDead && c.dead && byPlayer && mission.active && !c.gear && (!mission.wreckKind || c.kind === mission.wreckKind) &&
      (mission.type === 'wreck' || mission.type === 'army' || mission.type === 'raid')) {
    mission.wrecks++;
    showMsg('Унищожени: ' + mission.wrecks + '/' + mission.wreckGoal, 2);
    if (mission.wrecks >= mission.wreckGoal) endMission(true);
  }
};

// Брояч на свалени членове на банда за мисия 'gangkill'
const _origDamagePed = damagePed;
damagePed = function (p, dmg, byPlayer, cause) {
  const wasDead = p.dead;
  _origDamagePed(p, dmg, byPlayer, cause);
  if (!wasDead && p.dead && byPlayer && mission.active && mission.type === 'gangkill' && p.gang === mission.gangTarget) {
    mission.count++;
    showMsg('Свалени: ' + mission.count + '/' + mission.goal, 2);
    if (mission.count >= mission.goal) endMission(true);
  }
};

// ---------------- Вход ----------------
const keys = {};
let actionPressed = false;
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (!started) {
    if (menuState !== 'cities') {
      if (e.key === 'Enter' || e.key === ' ') menuPrimary();
      else if (e.key === 'Escape') { menuState = 'main'; resetArmed = 0; }
      return;
    }
    if (e.key === 'Escape') { menuState = 'main'; return; }
    const n = parseInt(e.key, 10);
    startWithCity(!isNaN(n) && n >= 1 && n <= THEMES.length ? n - 1 : cityIdx);
    return;
  }
  if (unlockScreen) { if (e.key === 'Enter' || e.key === ' ') unlockTap(-1, -1); return; }
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
    const m = Math.min(VW, VH) * (settings.bigCtrl ? 1.25 : 1);
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
  if (!started) {
    const t0 = e.changedTouches[0];
    menuTap(t0.clientX, t0.clientY);
    return;
  }
  if (unlockScreen) { const t0 = e.changedTouches[0]; unlockTap(t0.clientX, t0.clientY); return; }
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
canvas.addEventListener('mousedown', e => {
  if (!started) menuTap(e.clientX, e.clientY);
  else if (unlockScreen) unlockTap(e.clientX, e.clientY);
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
    collectCar(best.kind);
  }
}
function exitCar() {
  const c = player.car;
  if (!c) return;
  c.speed *= 0.2;
  if (c.kind === 'heli') { c.flying = false; c.speed = 0; }
  const ex = c.x + Math.cos(c.angle + Math.PI / 2) * (c.w / 2 + 14);
  const ey = c.y + Math.sin(c.angle + Math.PI / 2) * (c.w / 2 + 14);
  const pos = collideCircle(ex, ey, 8);
  player.x = pos.x; player.y = pos.y;
  player.car = null;
}
function updateCrusher(dt) {
  crusherCd -= dt;
  if (!player.car || player.car.dead || crusherCd > 0) return;
  const c = player.car;
  if (dist2(c.x, c.y, crusherDoor.x, crusherDoor.y) > 60 * 60) return;
  if (c.gear || c.kind === 'tank' || c.kind === 'cannon' || c.kind === 'heli') {
    showMsg('Пресата: "Военна техника не приемаме..."', 2); crusherCd = 4; return;
  }
  const pay = (c.kind === 'toro' || c.kind === 'cavallo') ? 1500 : c.kind === 'police' ? 1200 : c.kind === 'volta' ? 1100 : c.kind === 'sport' ? 900 : c.kind === 'cabrio' ? 800
    : (c.kind === 'bus' || c.kind === 'truck') ? 700 : c.kind === 'taxi' ? 500 : 400;
  const payC = Math.floor(pay * (theme.payMult || 1));
  exitCar();
  const idx = cars.indexOf(c);
  if (idx >= 0) cars.splice(idx, 1);
  FX.sparks(c.x, c.y); FX.glass(c.x, c.y); AudioSys.hit();
  addScore(payC, c.x, c.y);
  showMsg('🗜 Пресата я глътна. +' + fmtMoney(payC), 2.5);
  dailyProgress('crush', 1);
  addRankXp(1);
  if (mission.active && mission.type === 'crush') {
    mission.count++;
    showMsg('Смачкани: ' + mission.count + '/' + mission.goal, 2);
    if (mission.count >= mission.goal) endMission(true);
  }
  crusherCd = 3;
}
function updateChurch(dt) {
  churchCd -= dt;
  if (player.car || churchCd > 0) return;
  if (dist2(player.x, player.y, churchDoor.x, churchDoor.y) > 45 * 45) return;
  if (score < 2000) { showMsg('✝ "Благословията иска дарение от $2,000, чадо."', 2.5); churchCd = 5; return; }
  score -= 2000;
  player.hp = 100; player.armor = 100;
  player.heat = 0; recalcWanted();
  autosaveRun();
  AudioSys.pickup();
  showMsg('✝ Благословен си: здраве, броня, чисто досие. Прогресът е записан. -$2,000', 3);
  churchCd = 8;
}
function updateTaxi(dt) {
  const inTaxi = player.car && player.car.kind === 'taxi' && !player.car.dead;
  if (!inTaxi) {
    if (taxiJob.fare || taxiJob.dest) {
      taxiJob.offCd += dt;
      if (taxiJob.offCd > 8) {
        taxiJob.fare = null; taxiJob.dest = null; taxiJob.offCd = 0;
        showMsg('🚕 Клиентът си хвана друго такси.', 2);
      }
    }
    return;
  }
  taxiJob.offCd = 0;
  if (!taxiJob.fare && !taxiJob.dest) {
    const spot = randomSideSpotPx(400);
    if (spot) { taxiJob.fare = spot; showMsg('🚕 Клиент те чака — следвай жълтата стрелка.', 2.5); }
    return;
  }
  if (taxiJob.fare) {
    if (dist2(player.car.x, player.car.y, taxiJob.fare.x, taxiJob.fare.y) < 80 * 80 && Math.abs(player.car.speed) < 40) {
      const dest = randomSideSpotPx(500);
      if (dest) {
        const d = Math.sqrt(dist2(player.car.x, player.car.y, dest.x, dest.y));
        taxiJob.dest = dest; taxiJob.fare = null;
        taxiJob.t = 12 + d / 90;
        taxiJob.pay = Math.floor((150 + d * 0.6) * (theme.payMult || 1));
        showMsg('🚕 Карай! ' + fmtMoney(taxiJob.pay) + ', ако стигнеш навреме.', 2.5);
        AudioSys.pickup();
      }
    }
  } else if (taxiJob.dest) {
    taxiJob.t -= dt;
    if (taxiJob.t <= 0) { showMsg('🚕 Клиентът избяга без да плати...', 2); taxiJob.dest = null; return; }
    if (dist2(player.car.x, player.car.y, taxiJob.dest.x, taxiJob.dest.y) < 80 * 80 && Math.abs(player.car.speed) < 40) {
      addScore(taxiJob.pay, player.car.x, player.car.y);
      AudioSys.pickup();
      showMsg('🚕 Доволен клиент! Огледай се за следващия.', 2);
      dailyProgress('taxi', taxiJob.pay);
      addRankXp(1);
      if (mission.active && mission.type === 'fares') {
        mission.count++;
        showMsg('Курсове: ' + mission.count + '/' + mission.goal, 2);
        if (mission.count >= mission.goal) endMission(true);
      }
      taxiJob.dest = null;
    }
  }
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
      player.ammo = [-1, 0, 0, 0, 0, 0, 0]; player.weapon = 0;
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
      if (adKeepWeapons) {
        adKeepWeapons = false;
        showMsg('Болницата те закърпи. Оръжията те чакат под възглавницата. Остават ' + (lives + 1) + ' живота.', 3);
      } else {
        player.ammo = [-1, 0, 0, 0, 0, 0, 0]; player.weapon = 0;
        showMsg('Болницата те закърпи, но оръжията ти изчезнаха. Остават ' + (lives + 1) + ' живота.', 3);
      }
      mult = Math.max(1, mult - 1);
      player.x = hospitalDoor.x; player.y = hospitalDoor.y;
    }
    return;
  }

  // Возене на метрото
  if (player.onTrain) {
    const t = player.onTrain;
    const g = trainHeadPos(t);
    player.x = g.x; player.y = g.y;
    player.angle = g.a + (t.dir === -1 ? Math.PI : 0);
    if (actionPressed) {
      actionPressed = false;
      if (t.dwell > 0 && t.stationIdx >= 0) {
        const e = stationEntrances[t.stationIdx];
        const stName = theme.stations[t.stationIdx];
        player.onTrain = null;
        player.x = e.x; player.y = e.y;
        showMsg('Слезе на „' + stName + '“.', 2);
      } else showMsg('Изчакай следващата спирка.', 1.5);
    }
    return;
  }

  if (actionPressed) {
    actionPressed = false;
    if (player.car) exitCar();
    else if (!tryBoardTrain()) tryEnterCar();
  }

  if (player.car && player.car.kind === 'heli') updatePlayerHeli(dt, inp, player.car);
  else if (player.car) updatePlayerCar(dt, inp, player.car);
  else updatePlayerFoot(dt, inp);

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
      else if (pk.type === 'molotov') { player.ammo[5] += 5; showMsg('+Молотови', 1); }
      else if (pk.type === 'zap') { player.ammo[6] += 30; showMsg('+Електрошок', 1); }
      else if (pk.type === 'dd') { player.dd = 30; showMsg('✖2 ДВОЙНИ ЩЕТИ — 30 сек!', 2.5); }
      else if (pk.type === 'invis') { player.invis = 20; showMsg('НЕВИДИМ ЗА ПОЛИЦИЯТА — 20 сек', 2.5); }
      else if (pk.type === 'bribe') { player.heat = 0; recalcWanted(); showMsg('💵 Подкупът мина. Досието е чисто.', 2.5); }
      else taken = false;
      if (taken) { pickups.splice(i, 1); AudioSys.pickup(); }
    }
  }

  player.fireT -= dt;
  if (player.dd > 0) player.dd -= dt;
  if (player.invis > 0) { player.invis -= dt; if (player.invis <= 0) showMsg('Полицията отново те вижда.', 1.5); }
  // Стрелба от военна техника
  if (player.car && !player.car.dead && inp.fire && player.fireT <= 0) {
    const c = player.car;
    if (c.kind === 'tank' || c.kind === 'cannon') {
      player.fireT = 1.15;
      const aim = (inp.mx || inp.my) ? Math.atan2(inp.my, inp.mx) : (c.turret !== undefined ? c.turret : c.angle);
      c.turret = aim;
      const mx2 = c.x + Math.cos(aim) * (c.l / 2 + 16), my2 = c.y + Math.sin(aim) * (c.l / 2 + 16);
      projectiles.push({ type: 'rocket', x: mx2, y: my2, vx: Math.cos(aim) * 560, vy: Math.sin(aim) * 560, life: 680 / 560, dmg: 45, police: false });
      FX.sparks(mx2, my2);
      AudioSys.rocket();
      addHeat(0.8);
      panicNear(c.x, c.y, 320);
    } else if (c.kind === 'heli') {
      player.fireT = 0.5;
      projectiles.push({
        type: 'bomb',
        x: c.x + Math.cos(c.angle) * 24, y: c.y + Math.sin(c.angle) * 24,
        vx: Math.cos(c.angle) * c.speed * 0.6, vy: Math.sin(c.angle) * c.speed * 0.6,
        life: 0.55, dmg: 0, police: false
      });
      AudioSys.blip(200, 0.08, 0.12, 'square');
      addHeat(0.8);
    }
  }
  // Стрелба (пеша)
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
  if (isSolid(tileAtPx(player.x, player.y))) {
    const safe = nearestSideTile(player.x, player.y, 600);
    if (safe) { player.x = safe.x; player.y = safe.y; }
  }
  if (inp.mx || inp.my) {
    player.angle = Math.atan2(inp.my, inp.mx);
    const nx = player.x + inp.mx * spd * dt;
    const ny = player.y + inp.my * spd * dt;
    const pos = collideCircle(nx, ny, 9);
    // Твърда гаранция: центърът никога не стъпва в плътна плочка (вода/сграда).
    if (!isSolid(tileAtPx(pos.x, pos.y))) { player.x = pos.x; player.y = pos.y; }
    else if (!isSolid(tileAtPx(nx, player.y))) player.x = nx;   // плъзгане по X
    else if (!isSolid(tileAtPx(player.x, ny))) player.y = ny;   // плъзгане по Y
    // иначе оставаме на място
    player.walkT = (player.walkT || 0) + spd * dt * 0.1;
    player.moving = 1;
    // Стъпки
    player.stepD = (player.stepD || 0) + spd * dt;
    if (player.stepD > 30) {
      player.stepD = 0;
      const idx = Math.floor(player.y / TILE) * MW + Math.floor(player.x / TILE);
      AudioSys.step(yellowRoad && yellowRoad[idx]);
    }
  }
}
function updatePlayerHeli(dt, inp, c) {
  c.flying = true;
  c.rotor = (c.rotor || 0) + dt * 26;
  if (inp.mx || inp.my) {
    const want = Math.atan2(inp.my, inp.mx);
    let da = want - c.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    c.angle += clamp(da, -2.3 * dt, 2.3 * dt);
    c.speed = Math.min(c.maxSpeed, c.speed + c.accel * dt);
  } else c.speed -= c.speed * 1.5 * dt;
  if (inp.brake) c.speed -= c.speed * 3 * dt;
  c.x = clamp(c.x + Math.cos(c.angle) * c.speed * dt, TILE * 2, (MW - 2) * TILE);
  c.y = clamp(c.y + Math.sin(c.angle) * c.speed * dt, TILE * 2, (MH - 2) * TILE);
  player.x = c.x; player.y = c.y; player.angle = c.angle;
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
  if (inp.brake) c.speed -= c.speed * (4.5 - weather.wet * 1.6) * dt; // на мокро се спира по-трудно
  c.speed = clamp(c.speed, -c.maxSpeed * 0.4, c.maxSpeed);

  const steerInput = inp.mx;
  const handbrakeBoost = inp.brake && Math.abs(c.speed) > 120 ? 1.7 : 1;
  const steerPow = clamp(Math.abs(c.speed) / 60, 0, 1) * 2.5 * handbrakeBoost * (1 - weather.wet * 0.15) / Math.sqrt(c.mass);
  if (Math.abs(c.speed) > 4) c.angle += steerInput * steerPow * dt * (c.speed > 0 ? 1 : -1);

  // Следи от гуми при дрифт/спиране (на мокро — по-лесно)
  if ((Math.abs(steerInput) > 0.65 && Math.abs(c.speed) > 230 - weather.wet * 60) || (inp.brake && Math.abs(c.speed) > 160 - weather.wet * 40)) {
    skidActive = true;
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

// Бягаща кола: държи се далеч от играча с пълна газ
function updateFleeCar(c, dt) {
  const ax = c.x - player.x, ay = c.y - player.y;
  const d = Math.sqrt(ax * ax + ay * ay) || 1;
  let ta = Math.atan2(ay, ax);
  const look = 70;
  if (isSolid(tileAtPx(c.x + Math.cos(c.angle) * look, c.y + Math.sin(c.angle) * look)))
    ta = c.angle + (R() < 0.5 ? 1.3 : -1.3);
  c.angle += clamp(angDiff(c.angle, ta), -2.6 * dt, 2.6 * dt);
  const want = d < 900 ? c.maxSpeed * 0.95 : 60;
  c.speed += clamp(want - c.speed, -300 * dt, c.accel * dt);
  const pos = collideCircle(c.x + Math.cos(c.angle) * c.speed * dt, c.y + Math.sin(c.angle) * c.speed * dt, c.r);
  if (pos.hit) { c.speed *= 0.2; c.angle += (R() - 0.5) * 1.5; }
  c.x = pos.x; c.y = pos.y;
  if (c.hp < c.maxHp * 0.5 && R() < dt * 6) FX.smoke(c.x, c.y);
}
// Армейски танк: гони играча и стреля със снаряди
function updateArmyTank(c, dt) {
  if (player.wanted < 5) { c.army = false; c.sentry = false; return; } // отбой — танкът е зарязан
  if (!copsSee) {                                        // изгубили са те — отиват на последната позиция
    if (lastSeenX === null) { c.speed *= (1 - 1.5 * dt); return; }
    const dls = dist2(c.x, c.y, lastSeenX, lastSeenY);
    if (dls < 200 * 200) { c.speed *= (1 - 1.5 * dt); return; }
  }
  if (c.sentry) {
    const want2 = Math.atan2(player.y - c.y, player.x - c.x);
    c.turret = want2;
    c.shellT = (c.shellT === undefined ? 1.2 : c.shellT) - dt;
    if (c.shellT <= 0 && copsSee && dist2(c.x, c.y, player.x, player.y) < 620 * 620 &&
        player.invis <= 0 && !player.dead && !player.busted) {
      c.shellT = 2.6;
      const mx3 = c.x + Math.cos(want2) * (c.l / 2 + 16), my3 = c.y + Math.sin(want2) * (c.l / 2 + 16);
      projectiles.push({ type: 'rocket', x: mx3, y: my3, vx: Math.cos(want2) * 520, vy: Math.sin(want2) * 520, life: 620 / 520, dmg: 40, police: true });
      FX.sparks(mx3, my3);
      AudioSys.rocket();
    }
    return;
  }
  const dx = player.x - c.x, dy = player.y - c.y;
  const want = Math.atan2(dy, dx);
  let da = want - c.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  c.angle += clamp(da, -0.9 * dt, 0.9 * dt);
  const d = Math.sqrt(dx * dx + dy * dy);
  c.speed += (d > 240 ? c.accel : -c.accel) * dt;
  c.speed = clamp(c.speed, 0, c.maxSpeed);
  const pos = collideCircle(c.x + Math.cos(c.angle) * c.speed * dt, c.y + Math.sin(c.angle) * c.speed * dt, c.r);
  if (pos.hit) c.speed *= 0.3;
  c.x = pos.x; c.y = pos.y;
  for (const o of cars) {                       // мачка всичко по пътя си
    if (o === c || o.dead || o.flying || o.army) continue;
    const rr = c.r + o.r - 8;
    if (dist2(c.x, c.y, o.x, o.y) < rr * rr && Math.abs(c.speed) > 40) damageCar(o, 90 * dt + 15, false);
  }
  c.shellT = (c.shellT === undefined ? 1.5 : c.shellT) - dt;
  if (c.shellT <= 0 && d < 560 && Math.abs(da) < 0.5 && player.wanted > 0 && player.invis <= 0 && !player.dead && !player.busted) {
    c.shellT = 2.4;
    c.turret = want;
    const mx2 = c.x + Math.cos(want) * (c.l / 2 + 16), my2 = c.y + Math.sin(want) * (c.l / 2 + 16);
    projectiles.push({ type: 'rocket', x: mx2, y: my2, vx: Math.cos(want) * 520, vy: Math.sin(want) * 520, life: 620 / 520, dmg: 40, police: true });
    FX.sparks(mx2, my2);
    AudioSys.rocket();
  }
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
  if (c.army && c !== player.car) { updateArmyTank(c, dt); return; }
  if (c.flee && c !== player.car) { updateFleeCar(c, dt); return; }
  // Барикадата се разпуска, щом издирването падне — иначе трафикът се трупа зад нея
  if (c.roadblock && player.wanted < 3) {
    c.roadblock = false; c.parked = false;
    c.dir = ((Math.round(c.angle / (Math.PI / 2)) % 4) + 4) % 4;
  }
  if (c === player.car || c.parked) return;

  if (c.patrolT > 0) c.patrolT -= dt;
  if ((c.kind === 'police' || c.kind === 'swatvan' || c.kind === 'fbi') && (c.patrolT <= 0 || copsSee) && player.wanted > 0 && player.invis <= 0 && !player.dead && !player.busted) {
    updatePoliceCar(c, dt);
    return;
  }
  c.aiPause -= dt;
  if (c.aiPause > 0) { c.speed *= 0.9; return; }

  const cruise = c.kind === 'bus' || c.kind === 'truck' ? 90 : 120;
  const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
  const inIntersection = laneDirAt(tx, ty) === 255;
  if (inIntersection && !c.turned) {
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (dist2(c.x, c.y, cx, cy) < 14 * 14) {
      c.turned = true;
      // Избери посока, но само по истински път (не пешеходна зона / река)
      const opts = c.dir % 2 === 0 ? [1, 3] : [0, 2];
      const wantTurn = R() < 0.45;
      const pick = opts[Math.floor(R() * 2)];
      const order = wantTurn ? [pick, c.dir, opts[0], opts[1]] : [c.dir, pick, opts[0], opts[1]];
      for (const d of order) {
        if (dirRoadOk(tx, ty, d)) { c.dir = d; break; }
      }
    }
  }
  if (!inIntersection) {
    c.turned = false;
    // Задънена улица / пешеходна зона напред — завий или обърни
    const dxs = [1, 0, -1, 0][c.dir], dys = [0, 1, 0, -1][c.dir];
    const ax2 = tx + dxs * 2, ay2 = ty + dys * 2;
    if (tileAt(ax2, ay2) !== T.ROAD || (pedRoad && pedRoad[ay2 * MW + ax2])) {
      const opts = c.dir % 2 === 0 ? [1, 3] : [0, 2];
      let done = false;
      const first = Math.floor(R() * 2);
      for (const d of [opts[first], opts[1 - first]]) {
        if (dirRoadOk(tx, ty, d)) { c.dir = d; done = true; break; }
      }
      if (!done) { c.dir = (c.dir + 2) % 4; c.speed *= 0.4; }
    }
  }

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

  // Заседнал (блокиран и почти спрял)? След 3 сек завива или обръща, вместо да чака вечно —
  // това разплита "две коли една срещу друга" и опашките зад препятствие.
  if (blocked && Math.abs(c.speed) < 15) { c.stuckT = (c.stuckT || 0) + dt; c.jamT = (c.jamT || 0) + dt; }
  else { c.stuckT = 0; if (Math.abs(c.speed) > 40) c.jamT = 0; }
  if (c.stuckT > 3) {
    c.stuckT = 0;
    const opts = c.dir % 2 === 0 ? [1, 3] : [0, 2];
    const first = Math.floor(R() * 2);
    let done = false;
    for (const d of [opts[first], opts[1 - first]]) if (dirRoadOk(tx, ty, d)) { c.dir = d; done = true; break; }
    if (!done) c.dir = (c.dir + 2) % 4;
    c.angle = DIR_ANG[c.dir];
    c.turned = true;
    c.unblockT = 1.2;                 // секунда не гледа кой е пред него — за да се измъкне
  }
  if (c.unblockT > 0) { c.unblockT -= dt; blocked = false; }
  const want = blocked ? 0 : cruise;
  c.speed += clamp(want - c.speed, -300 * dt, 120 * dt);
  // Нетърпелив шофьор — натиска клаксона, когато е блокиран
  if (blocked && Math.abs(c.speed) < 20 && R() < dt * 0.2) AudioSys.horn(c.x);

  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, c.r);
  if (pos.hit) { c.speed *= -0.3; c.dir = (c.dir + 2) % 4; }
  c.x = pos.x; c.y = pos.y;
}
function updatePoliceCar(c, dt) {
  c.siren += dt * 8;
  // GTA2: гонят те само ако те виждат; иначе отиват на последната позната позиция
  if (!copsSee && lastSeenX === null) { c.patrolT = 8; return; }  // няма следа — патрулират
  const px = copsSee ? (player.car ? player.car.x : player.x) : lastSeenX;
  const py = copsSee ? (player.car ? player.car.y : player.y) : lastSeenY;
  const ta = Math.atan2(py - c.y, px - c.x);
  c.angle += clamp(angDiff(c.angle, ta), -2.8 * dt, 2.8 * dt);
  const d = Math.sqrt(dist2(c.x, c.y, px, py));
  if (!copsSee && d < 130) {
    c.bored = (c.bored || 0) + dt;
    if (c.bored > 5) { c.bored = 0; c.patrolT = 14; return; }
  } else c.bored = 0;
  const aggr = 0.65 + level * 0.06 + player.wanted * 0.04;
  const want = d > 70 ? c.maxSpeed * clamp(aggr, 0.6, 0.98) : 30;
  c.speed += clamp(want - c.speed, -400 * dt, c.accel * dt);
  const nx = c.x + Math.cos(c.angle) * c.speed * dt;
  const ny = c.y + Math.sin(c.angle) * c.speed * dt;
  const pos = collideCircle(nx, ny, c.r);
  if (pos.hit) c.speed *= -0.4;
  c.x = pos.x; c.y = pos.y;

  if (player.car && !player.car.flying && dist2(c.x, c.y, player.car.x, player.car.y) < (c.r + player.car.r) * (c.r + player.car.r) && Math.abs(c.speed) > 100) {
    damageCar(player.car, 9, false);
    player.car.speed *= 0.82;
    c.speed *= 0.5;
    FX.sparks((c.x + player.car.x) / 2, (c.y + player.car.y) / 2);
    AudioSys.hit();
  }
  if (!player.car && !player.onTrain && !player.dead && dist2(c.x, c.y, player.x, player.y) < 22 * 22 && Math.abs(c.speed) > 60) {
    damagePlayer(35);
    c.speed *= 0.7;
  }
  // Спрялата патрулка сваля ченгета
  if (c.copsInside > 0 && d < 180 && Math.abs(c.speed) < 50 && R() < dt * 1.5) {
    c.copsInside--;
    const cop = makePed(c.x + (R() - 0.5) * 20, c.y + (R() - 0.5) * 20, true);
    if (c.kind === 'swatvan') { cop.swat = true; cop.hp = 90; cop.shirt = '#1d242b'; }
    peds.push(cop);
  }
  if (c.kind === 'fbi') {
    // Агентите стрелят с картечници направо от колата, дори в движение
    if (copsSee && d < 340 && R() < dt * 2.2) fireWeapon(c, ta + (R() - 0.5) * 0.12, 2, true);
  } else if (player.wanted >= 3 && d < 320 && R() < dt * (0.5 + level * 0.15)) {
    fireWeapon(c, ta + (R() - 0.5) * 0.15, 1, true);
  }
}

// ---------------- Ъпдейт: пешеходци и ченгета ----------------
function updatePed(p, dt) {
  if (p.dead) { p.deadT += dt; return; }
  if (p.gang === undefined) {
    p.gang = (!p.cop && R() < 0.28) ? gangAt(p.x) : -1;
    if (p.gang >= 0) p.shirt = GANGS[p.gang].color;
  }
  if (p.burn > 0) {
    p.burn -= dt;
    p.panic = 5;
    FX.fire(p.x, p.y);
    damagePed(p, 16 * dt, true, 'burning');
    if (p.dead) return;
  }
  if (p.zap > 0) { p.zap -= dt; p.moving = 0; return; }
  if (p.cop && player.wanted > 0 && player.invis <= 0 && !player.dead && !player.busted) { updateCopPed(p, dt); return; }
  if (p.gang >= 0 && respect[p.gang] <= -30 && gangAt(player.x) === p.gang &&
      player.invis <= 0 && !player.dead && !player.busted) {
    const dv = dist2(p.x, p.y, player.x, player.y);
    if (dv < 320 * 320) {
      const ta = Math.atan2(player.y - p.y, player.x - p.x);
      p.angle = ta; p.moving = 0;
      p.shootT -= dt;
      if (p.shootT <= 0 && dv > 40 * 40) {
        p.shootT = 1.4;
        fireWeapon(p, ta + (R() - 0.5) * 0.15, 1, true);
      }
      return;
    }
  }
  const spd = p.panic > 0 ? 150 : 45;
  if (p.panic > 0) p.panic -= dt;
  if (R() < dt * (p.panic > 0 ? 1.5 : 0.4)) p.angle += (R() - 0.5) * (p.panic > 0 ? 2.5 : 1.6);
  const nx = p.x + Math.cos(p.angle) * spd * dt;
  const ny = p.y + Math.sin(p.angle) * spd * dt;
  const nt = tileAtPx(nx, ny);
  const pidx = Math.floor(ny / TILE) * MW + Math.floor(nx / TILE);
  const inPedZone = (pedRoad && pedRoad[pidx]) || (crossWalkMap && crossWalkMap[pidx]);
  if (isSolid(nt) || (p.panic <= 0 && nt === T.ROAD && !inPedZone)) {
    p.angle += Math.PI / 2 + R();
    return;
  }
  const pos = collideCircle(nx, ny, 7);
  p.x = pos.x; p.y = pos.y;
  p.walkT += spd * dt * 0.1;
  p.moving = 1;
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
    p.walkT += spd * dt * 0.1;
    p.moving = 1;
    p.arrestT = 0;
  } else if (!player.car && !player.onTrain) {
    // Арест — ако ченгето те държи близо
    p.arrestT += dt;
    if (p.arrestT > 0.7) { bustPlayer(); p.arrestT = 0; }
  }
  // Стрелба при издирване ≥ 2; по летящ хеликоптер — от първата звезда и от по-далеч
  p.shootT -= dt;
  const vsHeli = player.car && player.car.kind === 'heli' && player.car.flying;
  if ((vsHeli ? player.wanted >= 1 && d < 430 : player.wanted >= 2 && d < 260) && d > 40 && p.shootT <= 0) {
    p.shootT = ((p.swat || p.soldier) ? 0.55 : 1.2) - level * 0.08;
    fireWeapon(p, ta + (R() - 0.5) * 0.12, (p.swat || p.soldier) ? 2 : 1, true);
  }
}

// ---------------- Ъпдейт: снаряди ----------------
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const b = projectiles[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.type === 'molotov') {
      if (R() < 0.5) spawnFlame(b.x, b.y, 0, -12, 2.2, 0.2);
      if (b.life <= 0 || isSolid(tileAtPx(b.x, b.y))) {
        for (let k = 0; k < 14; k++)
          spawnFlame(b.x + (R() - 0.5) * 46, b.y + (R() - 0.5) * 46, (R() - 0.5) * 30, -20 - R() * 30, 6, 0.8);
        for (const p of peds) if (!p.dead && dist2(p.x, p.y, b.x, b.y) < 70 * 70) { p.burn = Math.max(p.burn, 2.5); damagePed(p, b.dmg, !b.police, 'fire'); }
        for (const c2 of cars) if (!c2.dead && !c2.flying && dist2(c2.x, c2.y, b.x, b.y) < 80 * 80) damageCar(c2, 30, !b.police, 'fire');
        AudioSys.flame();
        panicNear(b.x, b.y, 260);
        projectiles.splice(i, 1);
      }
      continue;
    }
    if (b.type === 'bomb') {          // бомбата пада с фитил и гърми на земята
      if (R() < 0.4) FX.smoke(b.x, b.y);
      if (b.life <= 0) { explode(b.x, b.y, !b.police); projectiles.splice(i, 1); }
      continue;
    }
    const solid = isSolid(tileAtPx(b.x, b.y));
    let gone = b.life <= 0 || solid;
    if (b.type === 'rocket') FX.smoke(b.x, b.y);
    if (b.type === 'flame') FX.flameJet(b);
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
    if (!gone && b.police && !player.car && !player.onTrain && !player.dead) {
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
    if (p.kind === 'flame') {
      const k = p.t / p.dur;
      p.vy -= 46 * k * dt;                                   // топлината тегли нагоре
      p.vx += Math.sin(p.wob + p.t * p.wobF) * 34 * dt;      // турбуленция
      p.size += (2.2 + k * 7) * dt;                          // пламъкът се разтваря
    }
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
    if ((!c.parked || c.roadblock) && dist2(c.x, c.y, player.x, player.y) > FAR) { cars.splice(i, 1); continue; }
    // Задръстване далеч от погледа се разтваря
    if (c.jamT > 10 && !c.parked && dist2(c.x, c.y, player.x, player.y) > 700 * 700) cars.splice(i, 1);
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
  if (liveCars < (player.wanted >= 6 ? 10 : 36) && R() < dt * 3) {
    const s = randomRoadSpot();
    if (s) {
      const d = dist2(s.x, s.y, player.x, player.y);
      if (d > 600 * 600 && d < FAR) {
        const r = R();
        const kind = (theme.starCar && r < 0.05) ? theme.starCar : r < 0.1 ? 'taxi' : r < 0.16 ? 'sport' : r < 0.18 ? 'toro' : r < 0.2 ? 'cavallo' : r < 0.24 ? 'volta' : r < 0.27 ? 'cabrio' : r < 0.34 ? 'bus' : r < 0.42 ? 'truck' : r < 0.46 ? 'police' : 'sedan';
        const c = makeCar(s.x, s.y, DIR_ANG[s.dir], kind);
        c.dir = s.dir;
        cars.push(c);
      }
    }
  }
  if (player.wanted < 6 && livePeds < 48 && R() < dt * 4) {
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
  return clamp(Math.sin(phase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5 + (theme.nightBias || 0), 0, 1);
}
// Метеорологично време: ясно ↔ дъжд, мокър асфалт, гръмотевици
const weather = {
  state: 'clear', timer: 55 + Math.random() * 70,
  rain: 0,      // интензивност на дъжда (0..1)
  wet: 0,       // колко е мокра настилката (0..1), съхне бавно
  thunderT: 14, flash: 0
};
function updateWeather(dt) {
  weather.timer -= dt;
  if (weather.timer <= 0) {
    if (weather.state === 'clear') {
      if (R() < 0.65 * (theme.rainBias === undefined ? 1 : theme.rainBias)) { weather.state = 'rain'; weather.timer = 45 + R() * 55; showMsg('Заваля дъжд...', 2.5); }
      else weather.timer = 50 + R() * 70;
    }
    else { weather.state = 'clear'; weather.timer = 100 + R() * 130; }
  }
  const target = weather.state === 'rain' ? 1 : 0;
  weather.rain += clamp(target - weather.rain, -dt * 0.12, dt * 0.12);
  if (weather.rain > 0.4) weather.wet = Math.min(1, weather.wet + dt * 0.09);
  else weather.wet = Math.max(0, weather.wet - dt * 0.012);
  weather.flash = Math.max(0, weather.flash - dt * 2.5);
  if (weather.rain > 0.5) {
    weather.thunderT -= dt;
    if (weather.thunderT <= 0) {
      weather.thunderT = 14 + R() * 32;
      weather.flash = 0.7;
      AudioSys.thunder();
    }
  }
}
// Слънце: посока и дължина на сенките се менят с часа на деня;
// при дъжд облаците скриват сенките
function sunState() {
  const p = (gameT % DAY_LENGTH) / DAY_LENGTH;      // 0 = обед
  const a = Math.sin(p * Math.PI * 2);               // -1..1 през деня
  const ang = Math.PI * 0.5 + a * 0.65;              // около "юг", люлее се изток-запад
  const night = nightAmount();
  return {
    dx: Math.cos(ang), dy: Math.sin(ang),
    len: 0.8 + 1.0 * Math.abs(a),
    alpha: (1 - night) * 0.42 * (1 - weather.rain * 0.85)
  };
}
// Сенки от сгради и дървета — рисуват се плътно върху отделен слой,
// после се наслагват с една прозрачност (без двойно затъмняване)
function drawShadows() {
  const sun = sunState();
  if (sun.alpha < 0.03) return;
  const sc = shadowCanvas.getContext('2d');
  sc.setTransform(0.5, 0, 0, 0.5, 0, 0);
  sc.clearRect(0, 0, VW, VH);
  sc.fillStyle = '#000';
  const halfW = VW / 2 / camZoom, halfH = VH / 2 / camZoom;
  const minTx = Math.floor((camX - halfW) / TILE) - 3, maxTx = Math.floor((camX + halfW) / TILE) + 3;
  const minTy = Math.floor((camY - halfH) / TILE) - 3, maxTy = Math.floor((camY + halfH) / TILE) + 3;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const t = tileAt(tx, ty);
      if (t === T.BUILD) {
        const h = blockHeight[blockKeyOf(tx, ty)] || 1;
        const s = worldToScreen(tx * TILE, ty * TILE);
        const sz = TILE * camZoom + 1;
        const ox = sun.dx * h * 19 * camZoom * sun.len;
        const oy = sun.dy * h * 19 * camZoom * sun.len;
        const x0 = s.x, y0 = s.y, x1 = s.x + sz, y1 = s.y + sz;
        sc.beginPath();
        if (sun.dx >= 0) {
          sc.moveTo(x0, y0); sc.lineTo(x1, y0); sc.lineTo(x1 + ox, y0 + oy);
          sc.lineTo(x1 + ox, y1 + oy); sc.lineTo(x0 + ox, y1 + oy); sc.lineTo(x0, y1);
        } else {
          sc.moveTo(x1, y0); sc.lineTo(x0, y0); sc.lineTo(x0 + ox, y0 + oy);
          sc.lineTo(x0 + ox, y1 + oy); sc.lineTo(x1 + ox, y1 + oy); sc.lineTo(x1, y1);
        }
        sc.closePath();
        sc.fill();
      } else if (t === T.PARK && hash2(tx, ty) > 0.72) {
        const wx = tx * TILE + TILE / 2 + (hash2(tx + 9, ty) - 0.5) * 22;
        const wy = ty * TILE + TILE / 2 + (hash2(tx, ty + 9) - 0.5) * 22;
        const s = worldToScreen(wx, wy);
        sc.beginPath();
        sc.ellipse(s.x + sun.dx * 16 * camZoom * sun.len, s.y + sun.dy * 16 * camZoom * sun.len,
          10 * camZoom, 8 * camZoom, 0, 0, Math.PI * 2);
        sc.fill();
      }
    }
  }
  ctx.globalAlpha = sun.alpha;
  ctx.drawImage(shadowCanvas, 0, 0, shadowCanvas.width, shadowCanvas.height, 0, 0, VW, VH);
  ctx.globalAlpha = 1;
}
function switchCity(target) {
  genCityMap(target === undefined ? (cityIdx + 1) % THEMES.length : target);
  player.car = null; player.onTrain = null;
  player.heat = 0; recalcWanted();
  mission.active = false; mission.target = null; mission.checkpoints = [];
  mission.cooldown = 6;
  frenzy.active = false;
  gour.count = 0;
  playerToStart();
  spawnWorld();
  showMsg('Добре дошъл в ' + theme.name + '!', 5);
}
function restartGame() {
  score = 0; mult = 1; lives = 4; level = 1;
  targetScore = 60000; missionsDone = 0; doneMissions = [];
  gameOver = false; citySwitchPending = false;
  player.hp = 100; player.armor = 0; player.dead = false; player.busted = false;
  player.car = null; player.onTrain = null;
  player.heat = 0; recalcWanted();
  player.ammo = [-1, 30, 0, 0, 0, 0, 0]; player.weapon = 1;
  player.dd = 0; player.invis = 0;
  taxiJob.fare = null; taxiJob.dest = null;
  mission.active = false; mission.target = null; mission.checkpoints = [];
  mission.cooldown = 3;
  const savedCity = applyAutoRun();
  let city = (savedCity !== null && cityUnlocked(savedCity)) ? savedCity : 0;
  if (savedCity !== null) showMsg('Продължаваш от последния запис.', 3);
  genCityMap(city);
  playerToStart();
  spawnWorld();
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
        case T.ROAD: fill = h < 0.5 ? theme.road[0] : theme.road[1]; break;
        case T.SIDE: fill = h < 0.5 ? theme.side[0] : theme.side[1]; break;
        case T.BUILD: fill = '#2c2c30'; break; // под сградата — тъмна основа
        case T.WATER: fill = theme.water; break;
        case T.PARK: fill = h < 0.5 ? theme.park[0] : theme.park[1]; break;
        default: fill = theme.grass;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(s.x, s.y, sz, sz);

      // Текстурен слой — зърно като на въздушна снимка (подравнено между съседни плочки)
      const gsx = (tx & 3) * 48, gsy = (ty & 3) * 48;
      if (t === T.WATER) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(TEX.organic, gsx, gsy, 48, 48, s.x, s.y, sz, sz);
        ctx.globalAlpha = 1;
      } else if (t === T.GRASS || t === T.PARK) {
        ctx.globalAlpha = 0.75;
        ctx.drawImage(TEX.organic, gsx, gsy, 48, 48, s.x, s.y, sz, sz);
        ctx.globalAlpha = 1;
      } else if (t !== T.BUILD) {
        ctx.globalAlpha = 0.65;
        ctx.drawImage(TEX.grain, gsx, gsy, 48, 48, s.x, s.y, sz, sz);
        ctx.globalAlpha = 1;
      }

      if (t === T.ROAD) {
        const idx = ty * MW + tx;
        const isYellow = yellowRoad && yellowRoad[idx];
        const isPed = pedRoad && pedRoad[idx];
        const ld = laneDirMap ? laneDirMap[idx] : 255;
        const inter = ld === 255;
        const horizLane = ld === 0 || ld === 2;
        if (isPed) {
          // Пешеходната зона на Витоша — светла настилка, плочки, кашпи
          ctx.fillStyle = '#bdb094';
          ctx.fillRect(s.x, s.y, sz, sz);
          ctx.globalAlpha = 0.5;
          ctx.drawImage(TEX.grain, gsx, gsy, 48, 48, s.x, s.y, sz, sz);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(90,75,50,0.16)';
          ctx.lineWidth = 1;
          for (let k = 1; k < 4; k++) {
            ctx.beginPath(); ctx.moveTo(s.x + sz * k / 4, s.y); ctx.lineTo(s.x + sz * k / 4, s.y + sz); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s.x, s.y + sz * k / 4); ctx.lineTo(s.x + sz, s.y + sz * k / 4); ctx.stroke();
          }
          if (h > 0.8) {
            // Кашпа с храст
            ctx.fillStyle = '#8a8078';
            ctx.beginPath(); ctx.arc(s.x + sz / 2, s.y + sz / 2, 7 * camZoom, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#3e6b34';
            ctx.beginPath(); ctx.arc(s.x + sz / 2, s.y + sz / 2, 5.2 * camZoom, 0, Math.PI * 2); ctx.fill();
          }
        } else if (isYellow) {
          // Жълтите павета
          ctx.fillStyle = '#c3a04c';
          ctx.fillRect(s.x, s.y, sz, sz);
          ctx.globalAlpha = 0.55;
          ctx.drawImage(TEX.grain, gsx, gsy, 48, 48, s.x, s.y, sz, sz);
          ctx.globalAlpha = 1;
          // Мрежа от павета (леко разместена като зидария)
          ctx.strokeStyle = 'rgba(110,85,30,0.28)';
          ctx.lineWidth = 1;
          for (let k = 0; k < 6; k++) {
            ctx.beginPath(); ctx.moveTo(s.x, s.y + sz * k / 6); ctx.lineTo(s.x + sz, s.y + sz * k / 6); ctx.stroke();
          }
          for (let k = 0; k < 6; k++) {
            const off = (k % 2) * sz / 12;
            ctx.beginPath(); ctx.moveTo(s.x + sz * k / 6 + off, s.y); ctx.lineTo(s.x + sz * k / 6 + off, s.y + sz); ctx.stroke();
          }
        } else if (!inter) {
          // Износване от гуми по лентите
          ctx.fillStyle = 'rgba(0,0,0,0.10)';
          if (horizLane) {
            ctx.fillRect(s.x, s.y + sz * 0.2, sz, sz * 0.16);
            ctx.fillRect(s.x, s.y + sz * 0.64, sz, sz * 0.16);
          } else {
            ctx.fillRect(s.x + sz * 0.2, s.y, sz * 0.16, sz);
            ctx.fillRect(s.x + sz * 0.64, s.y, sz * 0.16, sz);
          }
          // Кръпки и петна от масло
          if (h > 0.88) {
            ctx.fillStyle = 'rgba(0,0,0,0.14)';
            ctx.beginPath();
            ctx.ellipse(s.x + sz * (0.3 + h * 0.4), s.y + sz * 0.5, sz * 0.16, sz * 0.1, h * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          // Осева линия — по границата между двете ленти
          ctx.fillStyle = theme.lane;
          if (ld === 0) {
            for (let k = 0; k < 2; k++) ctx.fillRect(s.x + (5 + k * 26) * camZoom, s.y - 1 * camZoom, 9 * camZoom, 2 * camZoom);
          } else if (ld === 3) {
            for (let k = 0; k < 2; k++) ctx.fillRect(s.x - 1 * camZoom, s.y + (5 + k * 26) * camZoom, 2 * camZoom, 9 * camZoom);
          }
          // Пешеходни пътеки преди кръстовище
          ctx.fillStyle = 'rgba(220,220,225,0.75)';
          if (horizLane && (laneDirAt(tx - 1, ty) === 255 || laneDirAt(tx + 1, ty) === 255)) {
            const zx = laneDirAt(tx + 1, ty) === 255 ? s.x + sz - 12 * camZoom : s.x + 4 * camZoom;
            for (let k = 0; k < 4; k++) ctx.fillRect(zx, s.y + (4 + k * 12) * camZoom, 8 * camZoom, 6 * camZoom);
          } else if (!horizLane && (laneDirAt(tx, ty - 1) === 255 || laneDirAt(tx, ty + 1) === 255)) {
            const zy = laneDirAt(tx, ty + 1) === 255 ? s.y + sz - 12 * camZoom : s.y + 4 * camZoom;
            for (let k = 0; k < 4; k++) ctx.fillRect(s.x + (4 + k * 12) * camZoom, zy, 6 * camZoom, 8 * camZoom);
          }
          // Зебра, където пешеходна улица пресича булевард
          if (crossWalkMap && crossWalkMap[idx]) {
            ctx.fillStyle = 'rgba(225,225,230,0.8)';
            if (horizLane) {
              for (let k = 0; k < 4; k++) ctx.fillRect(s.x + 4 * camZoom, s.y + (3 + k * 12) * camZoom, sz - 8 * camZoom, 6 * camZoom);
            } else {
              for (let k = 0; k < 4; k++) ctx.fillRect(s.x + (3 + k * 12) * camZoom, s.y + 4 * camZoom, 6 * camZoom, sz - 8 * camZoom);
            }
          }
          // Шахта
          if (h > 0.93) {
            ctx.fillStyle = '#2e2e33';
            ctx.beginPath(); ctx.arc(s.x + sz / 2, s.y + sz / 2, 5 * camZoom, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Парапети на мостовете (път, граничещ с вода)
        ctx.fillStyle = 'rgba(225,228,232,0.85)';
        if (tileAt(tx, ty - 1) === T.WATER) ctx.fillRect(s.x, s.y, sz, 2.2 * camZoom);
        if (tileAt(tx, ty + 1) === T.WATER) ctx.fillRect(s.x, s.y + sz - 2.2 * camZoom, sz, 2.2 * camZoom);
        if (tileAt(tx - 1, ty) === T.WATER) ctx.fillRect(s.x, s.y, 2.2 * camZoom, sz);
        if (tileAt(tx + 1, ty) === T.WATER) ctx.fillRect(s.x + sz - 2.2 * camZoom, s.y, 2.2 * camZoom, sz);
        // Мокра настилка: потъмняване + локви, отразяващи небето
        if (weather.wet > 0.05) {
          ctx.fillStyle = 'rgba(12,14,24,' + (0.24 * weather.wet) + ')';
          ctx.fillRect(s.x, s.y, sz, sz);
          if (h > 0.52 && h < 0.75) {
            const shimmer = 0.05 * Math.sin(gameT * 2.2 + tx * 3.1 + ty * 1.7);
            ctx.fillStyle = (night > 0.5 ? 'rgba(130,150,190,' : 'rgba(175,195,220,') +
              (weather.wet * (0.17 + shimmer)) + ')';
            ctx.beginPath();
            ctx.ellipse(s.x + sz * (0.25 + h * 0.5), s.y + sz * 0.55,
              sz * (0.18 + h * 0.14), sz * (0.1 + h * 0.07), (h - 0.6) * 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (t === T.SIDE) {
        // Бордюр към пътя
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        if (tileAt(tx, ty + 1) === T.ROAD) ctx.fillRect(s.x, s.y + sz - 2.5 * camZoom, sz, 2.5 * camZoom);
        if (tileAt(tx, ty - 1) === T.ROAD) ctx.fillRect(s.x, s.y, sz, 2.5 * camZoom);
        if (tileAt(tx + 1, ty) === T.ROAD) ctx.fillRect(s.x + sz - 2.5 * camZoom, s.y, 2.5 * camZoom, sz);
        if (tileAt(tx - 1, ty) === T.ROAD) ctx.fillRect(s.x, s.y, 2.5 * camZoom, sz);
        // Плочки
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x, s.y, sz / 2, sz / 2);
        ctx.strokeRect(s.x + sz / 2, s.y + sz / 2, sz / 2, sz / 2);
      } else if (t === T.WATER) {
        const ph = Math.sin(gameT * 1.5 + tx * 0.7 + ty * 1.3) * 0.5 + 0.5;
        ctx.fillStyle = 'rgba(120,170,220,' + (0.05 + ph * 0.06) + ')';
        ctx.fillRect(s.x, s.y + sz * (0.3 + 0.3 * ph), sz, 2 * camZoom);
        // Пяна край брега
        const foam = 0.28 + 0.14 * Math.sin(gameT * 2 + tx * 1.7 + ty);
        ctx.fillStyle = 'rgba(215,232,242,' + foam + ')';
        if (tileAt(tx, ty - 1) !== T.WATER) ctx.fillRect(s.x, s.y, sz, 2.5 * camZoom);
        if (tileAt(tx, ty + 1) !== T.WATER) ctx.fillRect(s.x, s.y + sz - 2.5 * camZoom, sz, 2.5 * camZoom);
        if (tileAt(tx - 1, ty) !== T.WATER) ctx.fillRect(s.x, s.y, 2.5 * camZoom, sz);
        if (tileAt(tx + 1, ty) !== T.WATER) ctx.fillRect(s.x + sz - 2.5 * camZoom, s.y, 2.5 * camZoom, sz);
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
    const icons = { health: '➕', armor: '🛡', money: '💰', pistol: '🔫', mg: '🔫', flame: '🔥', rocket: '🚀', molotov: '🍾', zap: '⚡', dd: '✖', invis: '👁', bribe: '💵' };
    ctx.fillText(icons[pk.type] || '?', 0, 0);
    ctx.restore();
  }
}

// ---------- Реалистични спрайтове на коли (кеширани) ----------
const carSpriteCache = new Map();
function rrPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function glassPane(g, x, y, w, h) {
  g.fillStyle = '#141f29';
  g.fillRect(x, y, w, h);
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, 'rgba(190,225,245,0.5)');
  gr.addColorStop(0.35, 'rgba(190,225,245,0.06)');
  gr.addColorStop(1, 'rgba(120,165,195,0.28)');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
}
function getCarSprite(kind, color, burned) {
  const key = kind + '|' + color + (burned ? '|b' : '');
  let s = carSpriteCache.get(key);
  if (!s) { s = renderCarSprite(kind, color, burned); carSpriteCache.set(key, s); }
  return s;
}
function renderCarSprite(kind, color, burned) {
  const k = CAR_KINDS[kind];
  const SS = 4, L = k.l, W = k.w;
  const c = makeCanvas(Math.ceil(L * SS), Math.ceil(W * SS));
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const body = burned ? '#212122' : color;

  // Основа на купето
  rrPath(g, 0, 0, L, W, 5);
  g.fillStyle = body; g.fill();
  // Странична кривина: светло откъм слънцето, тъмно долу
  let grad = g.createLinearGradient(0, 0, 0, W);
  grad.addColorStop(0, 'rgba(255,255,255,0.32)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.05)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.32)');
  rrPath(g, 0, 0, L, W, 5); g.fillStyle = grad; g.fill();
  // Надлъжен блясък на лака
  grad = g.createLinearGradient(0, 0, L, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.14)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  rrPath(g, 0, 0, L, W, 5); g.fillStyle = grad; g.fill();

  // Колела (загатнати арки отстрани)
  g.fillStyle = 'rgba(10,10,12,0.55)';
  for (const wx of [L * 0.14, L * 0.76]) {
    g.fillRect(wx, -0.2, L * 0.11, 1.6);
    g.fillRect(wx, W - 1.4, L * 0.11, 1.6);
  }

  if (kind === 'bus') {
    glassPane(g, L - 7, 2.5, 4.5, W - 5);                      // предно стъкло
    for (let i = 0; i < 6; i++) {                              // странични прозорци
      const x = 5 + i * (L - 16) / 6;
      glassPane(g, x, 1.2, (L - 20) / 6, 2.6);
      glassPane(g, x, W - 3.8, (L - 20) / 6, 2.6);
    }
    g.fillStyle = shade(body, 0.82);                           // климатик на покрива
    g.fillRect(L * 0.2, W / 2 - 3, L * 0.45, 6);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(L * 0.2, W / 2 - 3, L * 0.45, 1.6);
  } else if (kind === 'truck') {
    glassPane(g, L * 0.72, 2.5, 4, W - 5);                     // кабина
    g.fillStyle = shade(body, 0.66);                           // контейнер
    g.fillRect(2, 1.5, L * 0.62, W - 3);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.8;
    g.strokeRect(2, 1.5, L * 0.62, W - 3);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let x = 6; x < L * 0.62; x += 5) {                    // ребра на контейнера
      g.beginPath(); g.moveTo(x, 1.5); g.lineTo(x, W - 1.5); g.stroke();
    }
  } else if (kind === 'toro' || kind === 'cavallo') {
    // Суперкола: кабина напред, двигател с решетки зад нея, спойлер
    const cab0 = L * 0.42, cab1 = L * 0.70;
    glassPane(g, cab0, 1.8, cab1 - cab0, W - 3.6);
    g.fillStyle = shade(body, 0.88);
    g.fillRect(cab0 + (cab1 - cab0) * 0.30, 3, (cab1 - cab0) * 0.45, W - 6);
    g.fillStyle = 'rgba(0,0,0,0.55)';                       // решетки над двигателя
    for (let x = L * 0.14; x < L * 0.36; x += 2.6) g.fillRect(x, 3, 1.3, W - 6);
    g.fillRect(cab0 - 5, 0.8, 4, 2.2);                      // странични въздухозаборници
    g.fillRect(cab0 - 5, W - 3, 4, 2.2);
    g.fillStyle = shade(body, 0.6);                         // заден спойлер
    g.fillRect(0.8, 1.2, 2.4, W - 2.4);
    if (kind === 'cavallo') {                               // жълт щит на капака
      g.fillStyle = '#f2c718';
      g.fillRect(L * 0.80, W / 2 - 1.6, 2.6, 3.2);
    }
  } else if (kind === 'volta') {
    // Електрическа: панорамен стъклен таван, чисти линии, без фуги
    glassPane(g, L * 0.24, 1.6, L * 0.55, W - 3.2);
    grad = g.createLinearGradient(0, 2, 0, W - 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.30)');
    grad.addColorStop(1, 'rgba(0,0,0,0.20)');
    g.fillStyle = grad;
    g.fillRect(L * 0.24, 1.6, L * 0.55, W - 3.2);
    g.fillStyle = 'rgba(255,255,255,0.5)';                  // хромирана Т-емблема
    g.fillRect(L * 0.86, W / 2 - 0.5, 3, 1);
    g.fillRect(L * 0.88, W / 2 - 1.6, 1, 3.2);
  } else if (kind === 'cabrio') {
    // Кабриолет: отворен — вана, седалки, само предно стъкло, сгънат гюрук
    g.fillStyle = shade(body, 0.55);
    g.fillRect(L * 0.28, 2.2, L * 0.40, W - 4.4);
    g.fillStyle = '#2a2126';
    g.fillRect(L * 0.34, 3, 4.5, (W - 6) / 2 - 0.5);
    g.fillRect(L * 0.34, W / 2 + 0.5, 4.5, (W - 6) / 2 - 0.5);
    g.fillRect(L * 0.46, 3, 4.5, W - 6);
    glassPane(g, L * 0.66, 2, 2.6, W - 4);
    g.fillStyle = '#1c1c20';
    g.fillRect(L * 0.20, 1.8, 3.4, W - 3.6);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(L * 0.20, 1.8, 3.4, 1.2);
  } else {
    // Седан / спортна / такси / патрулка
    const cabX0 = kind === 'sport' ? L * 0.24 : L * 0.28;
    const cabX1 = kind === 'sport' ? L * 0.66 : L * 0.72;
    if (kind === 'police') {
      g.fillStyle = '#f2f2f5';
      g.fillRect(L * 0.30, 0.8, L * 0.34, W - 1.6);
    }
    if (kind === 'taxi') {
      g.fillStyle = '#181818';                                  // шахматна лента
      for (let x = 3; x < L - 3; x += 4) {
        g.fillRect(x, 0.6, 2, 1.2);
        g.fillRect(x + 2, W - 1.8, 2, 1.2);
      }
    }
    glassPane(g, cabX0, 2, cabX1 - cabX0, W - 4);              // стъклен пръстен
    g.fillStyle = kind === 'police' ? '#e8e8ee' : shade(body, 0.86);  // покрив
    g.fillRect(cabX0 + (cabX1 - cabX0) * 0.32, 3.2, (cabX1 - cabX0) * 0.42, W - 6.4);
    grad = g.createLinearGradient(0, 3, 0, W - 3);             // обем на покрива
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grad;
    g.fillRect(cabX0 + (cabX1 - cabX0) * 0.32, 3.2, (cabX1 - cabX0) * 0.42, W - 6.4);
    g.strokeStyle = 'rgba(0,0,0,0.22)';                        // фуги на капака и багажника
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(L * 0.8, 1); g.lineTo(L * 0.8, W - 1); g.stroke();
    g.beginPath(); g.moveTo(L * 0.2, 1); g.lineTo(L * 0.2, W - 1); g.stroke();
    if (kind === 'taxi') {
      g.fillStyle = '#111';                                     // табела на покрива
      g.fillRect(L * 0.44, W / 2 - 3.6, 6, 7.2);
      g.fillStyle = '#ffd23c';
      g.fillRect(L * 0.44 + 1.2, W / 2 - 1.4, 3.6, 2.8);
    }
  }

  // Фарове и стопове
  g.fillStyle = burned ? '#333' : '#fff4c8';
  g.fillRect(L - 2.6, 1.6, 2.2, 3.6);
  g.fillRect(L - 2.6, W - 5.2, 2.2, 3.6);
  g.fillStyle = burned ? '#333' : '#b81f1f';
  g.fillRect(0.4, 1.6, 1.8, 3.6);
  g.fillRect(0.4, W - 5.2, 1.8, 3.6);

  // Контур (сглобки)
  rrPath(g, 0.4, 0.4, L - 0.8, W - 0.8, 5);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 0.8;
  g.stroke();

  if (burned) {
    rrPath(g, 0, 0, L, W, 5);
    g.fillStyle = 'rgba(12,12,14,0.68)'; g.fill();
    g.fillStyle = 'rgba(60,50,40,0.5)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(4 + (i * 137) % (L - 8), 3 + (i * 71) % (W - 6), 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

function drawArmor(c) {
  const s = worldToScreen(c.x, c.y);
  const margin = 100;
  if (s.x < -margin || s.y < -margin || s.x > VW + margin || s.y > VH + margin) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(camZoom, camZoom);
  ctx.save();
  ctx.rotate(c.angle);
  if (c.kind === 'tank') {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(-c.l / 2 + 3, -c.w / 2 + 4, c.l, c.w);
    ctx.fillStyle = '#2e3626';
    ctx.fillRect(-c.l / 2, -c.w / 2, c.l, 8);
    ctx.fillRect(-c.l / 2, c.w / 2 - 8, c.l, 8);
    ctx.fillStyle = '#171d12';
    for (let x = -c.l / 2 + 3; x < c.l / 2; x += 7) { ctx.fillRect(x, -c.w / 2 + 1, 3, 6); ctx.fillRect(x, c.w / 2 - 7, 3, 6); }
    ctx.fillStyle = c.dead ? '#3a3a34' : '#4d5a3c';
    ctx.fillRect(-c.l / 2 + 2, -c.w / 2 + 7, c.l - 4, c.w - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-c.l / 2 + 2, -c.w / 2 + 7, c.l - 4, 3);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(3, 4, c.w * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20261a';
    ctx.fillRect(-4, -c.w / 2 - 3, 10, 6);
    ctx.fillRect(-4, c.w / 2 - 3, 10, 6);
    ctx.fillStyle = c.dead ? '#3a3a34' : '#44503a';
    ctx.beginPath(); ctx.arc(0, 0, c.w * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  const ta = (c.turret !== undefined ? c.turret : c.angle);
  ctx.rotate(ta);
  ctx.fillStyle = c.dead ? '#2e2e2a' : (c.kind === 'tank' ? '#3f4a30' : '#37422c');
  ctx.beginPath(); ctx.arc(0, 0, c.kind === 'tank' ? 9 : 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#242b1c';
  ctx.fillRect(0, -2.2, c.kind === 'tank' ? 30 : 26, 4.4);
  ctx.fillRect(c.kind === 'tank' ? 26 : 22, -3.2, 4, 6.4);
  ctx.restore();
}
function drawHeli(c, flying) {
  const s = worldToScreen(c.x, c.y);
  const margin = 140;
  if (s.x < -margin || s.y < -margin || s.x > VW + margin || s.y > VH + margin) return;
  const lift = flying ? 1.22 : 1;
  ctx.save();
  ctx.translate(s.x + (flying ? 26 : 4) * camZoom, s.y + (flying ? 34 : 5) * camZoom);
  ctx.rotate(c.angle);
  ctx.scale(camZoom, camZoom);
  ctx.fillStyle = flying ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(c.angle);
  ctx.scale(camZoom * lift, camZoom * lift);
  ctx.strokeStyle = '#22262b'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(12, -12); ctx.moveTo(-14, 12); ctx.lineTo(12, 12); ctx.stroke();
  ctx.fillStyle = c.dead ? '#33363a' : '#3b444d';
  ctx.fillRect(-30, -2.6, 22, 5.2);
  ctx.save(); ctx.translate(-30, 0); ctx.rotate((c.rotor || 0) * 3);
  ctx.strokeStyle = '#1a1d20'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke(); ctx.restore();
  ctx.fillStyle = c.dead ? '#3a3d40' : '#37414a';
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.dead ? '#4a4d50' : '#9fc4d8';
  ctx.beginPath(); ctx.ellipse(6, 0, 6.5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#20242a';
  ctx.fillRect(2, -9.5, 10, 2.4); ctx.fillRect(2, 7.1, 10, 2.4);
  ctx.save(); ctx.rotate(c.rotor || 0);
  ctx.strokeStyle = 'rgba(20,22,25,0.85)'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.moveTo(0, -26); ctx.lineTo(0, 26); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(180,190,200,0.18)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function drawFlyingHelis() {
  for (const c of cars) if (c.kind === 'heli' && c.flying && !c.dead) drawHeli(c, true);
}
function drawCar(c) {
  if (c.kind === 'tank' || c.kind === 'cannon') { drawArmor(c); return; }
  if (c.kind === 'heli') { if (!c.flying) drawHeli(c, false); return; }
  const s = worldToScreen(c.x, c.y);
  const margin = 100;
  if (s.x < -margin || s.y < -margin || s.x > VW + margin || s.y > VH + margin) return;
  const L = c.l, W = c.w;
  const sun = sunState();
  const shx = (1 + sun.dx * 4 * sun.len * (sun.alpha * 3)) * camZoom;
  const shy = (1 + sun.dy * 4 * sun.len * (sun.alpha * 3)) * camZoom;

  // Сянка по посока на слънцето
  ctx.save();
  ctx.translate(s.x + shx, s.y + shy);
  ctx.rotate(c.angle);
  ctx.scale(camZoom, camZoom);
  rrPath(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fill();
  ctx.restore();

  // Купе (кеширан спрайт)
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(c.angle);
  ctx.scale(camZoom, camZoom);
  ctx.drawImage(getCarSprite(c.kind, c.color, c.dead), -L / 2, -W / 2, L, W);
  if (!c.dead) {
    const dmg = c.hp / c.maxHp;
    if (dmg < 0.6) {
      // Вдлъбнатини и сажди при щети
      ctx.fillStyle = 'rgba(20,20,22,' + (0.5 - dmg * 0.6) + ')';
      ctx.beginPath(); ctx.arc(L * 0.3, -W * 0.24, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-L * 0.28, W * 0.2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(L * 0.05, W * 0.05, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    if (c.kind === 'police') {
      const on = Math.floor(c.siren) % 2 === 0;
      ctx.fillStyle = on ? '#ff3b30' : '#2660ff';
      ctx.fillRect(-4.5, -4.5, 9, 3.6);
      ctx.fillStyle = on ? '#2660ff' : '#ff3b30';
      ctx.fillRect(-4.5, 0.9, 9, 3.6);
    }
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
    // Отражение на фаровете в мокрия асфалт — тясна ярка ивица
    if (weather.wet > 0.15) {
      ctx.fillStyle = 'rgba(255,244,190,' + (0.16 * night * weather.wet) + ')';
      ctx.fillRect(c.l / 2 * camZoom, -3 * camZoom, 70 * camZoom, 6 * camZoom);
    }
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
    // Проснато тяло с разперени крайници
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(-7, -5, 1.6, 0, Math.PI * 2); ctx.fill();  // ръка
    ctx.beginPath(); ctx.arc(-3, 6, 1.6, 0, Math.PI * 2); ctx.fill();   // ръка
    ctx.fillStyle = '#14141a';
    ctx.beginPath(); ctx.arc(-9, 2, 1.7, 0, Math.PI * 2); ctx.fill();   // крак
    ctx.beginPath(); ctx.arc(-8, -1, 1.7, 0, Math.PI * 2); ctx.fill();  // крак
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.ellipse(-1, 0, 7, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(7.5, 1.5, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.arc(8.3, 2, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(p.angle);
  // Сянка
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(1.5, 1.5, 6.2, 0, Math.PI * 2); ctx.fill();
  // Походка: краката и ръцете се люлеят в противофаза
  const step = p.moving ? Math.sin(p.walkT) : 0;
  const stride = p.panic > 0 || p.cop ? 4 : 3;
  // Стъпала
  ctx.fillStyle = '#14141a';
  ctx.beginPath(); ctx.arc(step * stride, -2.5, 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-step * stride, 2.5, 1.7, 0, Math.PI * 2); ctx.fill();
  // Ръкави + длани (обратно на краката)
  const arm = -step;
  ctx.fillStyle = shade(p.shirt, 0.78);
  ctx.beginPath(); ctx.arc(arm * 1.6, -5.1, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-arm * 1.6, 5.1, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(arm * 3.1 + 0.6, -5.7, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-arm * 3.1 + 0.6, 5.7, 1.4, 0, Math.PI * 2); ctx.fill();
  // Торс — раменете са широки напречно на движението
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath(); ctx.ellipse(0.9, -1, 2.8, 4, 0, 0, Math.PI * 2); ctx.fill();
  // Чанта през рамо
  if (p.bag) {
    ctx.fillStyle = '#54432e';
    ctx.fillRect(-2.2, 5.4, 4, 2.4);
  }
  // Глава с коса
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(1.7, 0, 3.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0.6, 0, 2.7, 0, Math.PI * 2); ctx.fill();
  if (p.cop) {
    // Фуражка с кокарда
    ctx.fillStyle = '#20375c';
    ctx.beginPath(); ctx.arc(1.4, 0, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9b23c';
    ctx.fillRect(3.4, -0.9, 1.6, 1.8);
  }
  ctx.restore();
  p.moving = 0;
  if (p.markTarget) {
    ctx.strokeStyle = 'rgba(230,80,80,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (16 + Math.sin(gameT * 6) * 3) * camZoom, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPlayer() {
  if (player.car || player.onTrain || player.dead || player.busted) return;
  const s = worldToScreen(player.x, player.y);
  ctx.save();
  if (player.invis > 0) ctx.globalAlpha = 0.45;
  ctx.translate(s.x, s.y);
  ctx.scale(camZoom, camZoom);
  ctx.rotate(player.angle);
  // Сянка
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(1.8, 1.8, 6.6, 0, Math.PI * 2); ctx.fill();
  const step = player.moving ? Math.sin(player.walkT) : 0;
  const w = WEAPONS[player.weapon];
  // Стъпала
  ctx.fillStyle = '#0c0c12';
  ctx.beginPath(); ctx.arc(step * 3.4, -2.6, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-step * 3.4, 2.6, 1.8, 0, Math.PI * 2); ctx.fill();
  if (w.melee) {
    // Свободни ръце, люлеят се при ходене
    const arm = -step;
    ctx.fillStyle = '#0e0e14';
    ctx.beginPath(); ctx.arc(arm * 1.6, -5.3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-arm * 1.6, 5.3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0b090';
    ctx.beginPath(); ctx.arc(arm * 3.2 + 0.6, -5.9, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-arm * 3.2 + 0.6, 5.9, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  // Торс — черно яке с презрамка
  ctx.fillStyle = '#16161e';
  ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 6.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.ellipse(1, -1.2, 3, 4.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2a36';
  ctx.fillRect(-1, -6, 2, 12);
  if (!w.melee) {
    // Двете ръце държат оръжието напред
    ctx.fillStyle = '#333';
    ctx.fillRect(4, -1.4, w.rocket ? 12 : 9, 2.8);
    if (w.rocket) { ctx.fillStyle = '#722'; ctx.fillRect(13, -2.2, 4, 4.4); }
    ctx.fillStyle = '#e0b090';
    ctx.beginPath(); ctx.arc(4.6, -1.8, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5.2, 1.8, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  // Глава с тъмна коса
  ctx.fillStyle = '#e0b090';
  ctx.beginPath(); ctx.arc(2, 0, 3.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c140c';
  ctx.beginPath(); ctx.arc(0.9, 0, 2.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  player.moving = 0;
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
    } else if (b.type === 'bomb') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.scale(camZoom, camZoom);
      ctx.fillStyle = '#23272b';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3c4248';
      ctx.fillRect(-7, -2.6, 3, 5.2);
      ctx.restore();
    }
    // flame се вижда чрез частиците
  }
}
function drawParticles() {
  let hasFlame = false;
  for (const p of particles) {
    if (p.kind === 'flame') { hasFlame = true; continue; }
    const s = worldToScreen(p.x, p.y);
    const k = p.t / p.dur;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, p.size) * camZoom, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!hasFlame) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';   // пламъците се наслагват и греят
  for (const p of particles) {
    if (p.kind !== 'flame') continue;
    const s = worldToScreen(p.x, p.y);
    const k = p.t / p.dur;
    // горещо ядро -> оранжево -> догарящо; последната четвърт е дим без греене
    if (k > 0.75) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (1 - k) * 1.6;
      const r = p.size * 1.25 * camZoom;
      ctx.drawImage(flameSprites[3], s.x - r, s.y - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'lighter';
    } else {
      const idx = k < 0.28 ? 0 : k < 0.55 ? 1 : 2;
      ctx.globalAlpha = 0.9 * (1 - k * 0.85);
      const r = p.size * camZoom;
      ctx.drawImage(flameSprites[idx], s.x - r, s.y - r, r * 2, r * 2);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Съседна плочка част ли е от същата сграда (същия блок или същата забележителност)?
function sameBuildingTile(ntx, nty, key, lmId) {
  if (tileAt(ntx, nty) !== T.BUILD) return false;
  const nId = lmMap ? lmMap[nty * MW + ntx] : -1;
  if (lmId >= 0 || nId >= 0) return lmId === nId;
  return blockKeyOf(ntx, nty) === key;
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
  const sun = sunState();
  for (const tI of tiles) {
    const { tx, ty } = tI;
    const key = blockKeyOf(tx, ty);
    const lmId = lmMap ? lmMap[ty * MW + tx] : -1;
    const lm = lmId >= 0 ? landmarks[lmId] : null;
    const h = lm ? lm.h : (blockHeight[key] || 1);
    const f = 0.035 * h;
    const wall = lm ? lm.wall : (blockColor[key] || '#888');
    const roof = lm ? lm.roof : (blockRoof[key] || '#6e6a66');

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
      if (sameBuildingTile(ntx, nty, key, lmId)) continue;
      ctx.fillStyle = shade(wall, e.sh);
      ctx.beginPath();
      ctx.moveTo(g[e.a].x, g[e.a].y);
      ctx.lineTo(g[e.b].x, g[e.b].y);
      ctx.lineTo(rf[e.b].x, rf[e.b].y);
      ctx.lineTo(rf[e.a].x, rf[e.a].y);
      ctx.closePath();
      ctx.fill();
      // Прозорци по стената — отразяват небето и слънцето според ориентацията
      if (h >= 2 && camZoom > 0.8) {
        const sunDot = -(e.nx * sun.dx + e.ny * sun.dy); // стената гледа ли към слънцето
        for (let wi = 1; wi <= 2; wi++) {
          const t0 = wi / 3;
          const wx1 = g[e.a].x + (rf[e.a].x - g[e.a].x) * t0;
          const wy1 = g[e.a].y + (rf[e.a].y - g[e.a].y) * t0;
          const wx2 = g[e.b].x + (rf[e.b].x - g[e.b].x) * t0;
          const wy2 = g[e.b].y + (rf[e.b].y - g[e.b].y) * t0;
          let si = 0;
          for (let seg = 0.15; seg < 0.85; seg += 0.24, si++) {
            const wseed = hash2(tx * 13 + wi * 7 + si, ty * 17 + e.a * 5);
            if (night > 0.5) {
              // Нощем: някои прозорци светят топло, други са тъмни
              ctx.fillStyle = wseed > 0.45
                ? 'rgba(255,214,120,' + (0.3 + wseed * 0.45) + ')'
                : 'rgba(12,16,24,0.55)';
            } else if (wseed > 0.9 && sunDot > 0.2 && sun.alpha > 0.1) {
              ctx.fillStyle = 'rgba(255,250,230,0.9)';                       // блик от слънцето
            } else if (sunDot > 0.1) {
              ctx.fillStyle = 'rgba(185,210,235,' + (0.28 + sunDot * 0.28) + ')'; // отражение на небето
            } else {
              ctx.fillStyle = 'rgba(28,38,52,0.5)';                          // сенчеста фасада
            }
            const px = wx1 + (wx2 - wx1) * seg, py = wy1 + (wy2 - wy1) * seg;
            ctx.fillRect(px, py, 4 * camZoom, 3 * camZoom);
          }
        }
      }
    }

    // Покрив (проекцията запазва правоъгълника — рисуваме текстуриран правоъгълник)
    const rx = rf[0].x, ry = rf[0].y, rw = rf[2].x - rf[0].x, rh = rf[2].y - rf[0].y;
    ctx.fillStyle = roof;
    ctx.fillRect(rx, ry, rw, rh);
    // Чакълеста текстура (подравнена, за да няма шевове между плочките)
    ctx.globalAlpha = 0.6;
    ctx.drawImage(TEX.grain, (tx & 3) * 48, (ty & 3) * 48, 48, 48, rx, ry, rw, rh);
    ctx.globalAlpha = 1;
    // Парапет — само по външните ръбове на сградата (не между плочките)
    ctx.lineWidth = Math.max(1, 2.2 * camZoom);
    for (const e of edges) {
      const ntx = tx + e.nx, nty = ty + e.ny;
      if (sameBuildingTile(ntx, nty, key, lmId)) continue;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.moveTo(rf[e.a].x, rf[e.a].y);
      ctx.lineTo(rf[e.b].x, rf[e.b].y);
      ctx.stroke();
      // Светъл вътрешен кант на парапета
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      const inset = 2.5 * camZoom;
      ctx.beginPath();
      ctx.moveTo(rf[e.a].x - e.nx * inset, rf[e.a].y - e.ny * inset);
      ctx.lineTo(rf[e.b].x - e.nx * inset, rf[e.b].y - e.ny * inset);
      ctx.stroke();
    }

    // Детайли на покрива (детерминистични)
    const hh = hash2(tx, ty);
    const rcx = rx + rw / 2, rcy = ry + rh / 2;
    const rsz = Math.min(rw, rh);
    if (hh > 0.78) {
      // Климатик с перка и сянка
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(rcx - rsz * 0.15 + 2 * camZoom, rcy - rsz * 0.12 + 2 * camZoom, rsz * 0.32, rsz * 0.26);
      ctx.fillStyle = shade(roof, 1.25);
      ctx.fillRect(rcx - rsz * 0.16, rcy - rsz * 0.13, rsz * 0.32, rsz * 0.26);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rcx - rsz * 0.16, rcy - rsz * 0.13, rsz * 0.32, rsz * 0.26);
      ctx.beginPath();
      ctx.arc(rcx, rcy, rsz * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = shade(roof, 0.55);
      ctx.fill();
    } else if (hh > 0.62) {
      // Капандура (стъклен люк)
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(rcx - rsz * 0.14 + 1.5 * camZoom, rcy - rsz * 0.1 + 1.5 * camZoom, rsz * 0.3, rsz * 0.2);
      const gl = ctx.createLinearGradient(rcx - rsz * 0.14, rcy - rsz * 0.1, rcx + rsz * 0.16, rcy + rsz * 0.1);
      gl.addColorStop(0, '#9cc4dc'); gl.addColorStop(1, '#3a586e');
      ctx.fillStyle = gl;
      ctx.fillRect(rcx - rsz * 0.14, rcy - rsz * 0.1, rsz * 0.3, rsz * 0.2);
    } else if (hh > 0.5) {
      // Вентилационни тръби
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(rcx + rsz * 0.16 + camZoom, rcy - rsz * 0.1 + camZoom, rsz * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(roof, 0.6);
      ctx.beginPath(); ctx.arc(rcx + rsz * 0.16, rcy - rsz * 0.1, rsz * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rcx - rsz * 0.12, rcy + rsz * 0.14, rsz * 0.045, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Знаци на специалните сгради (над входовете им)
  drawDoorLabel(hospitalDoor, '#e04545', '➕', 'БОЛНИЦА');
  drawDoorLabel(crusherDoor, '#e8a020', '🗜', 'ПРЕСА');
  drawDoorLabel(churchDoor, '#c8b060', '✝', 'ЦЪРКВА');
  drawDoorLabel(policeDoor, '#8ab6e8', '🛡', 'УЧАСТЪК');
  drawDoorLabel(resprayDoor, '#50b4ff', '🎨', 'БОЯДЖИЙНИЦА');

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
      if (theme.palm) {
        // Палма — тънък извит ствол и ветрилни листа
        ctx.strokeStyle = '#8a6a42';
        ctx.lineWidth = 2.2 * camZoom;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo((s.x + topX) / 2 + 4 * camZoom, (s.y + topY) / 2, topX, topY); ctx.stroke();
        ctx.strokeStyle = '#3a7a34';
        ctx.lineWidth = 2.4 * camZoom;
        for (let fr = 0; fr < 6; fr++) {
          const fa = fr * Math.PI / 3 + hash2(tx, ty) * 2;
          const fx = topX + Math.cos(fa) * 11 * camZoom, fy = topY + Math.sin(fa) * 11 * camZoom;
          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(topX + Math.cos(fa) * 7 * camZoom, topY + Math.sin(fa) * 7 * camZoom - 3 * camZoom, fx, fy + 2.5 * camZoom);
          ctx.stroke();
        }
        ctx.fillStyle = '#2c5a28';
        ctx.beginPath(); ctx.arc(topX, topY, 3 * camZoom, 0, Math.PI * 2); ctx.fill();
      } else {
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
}
// Надземното метро: колони, релси, спирки и влакове (проектирани на височина)
function elevPt(wx, wy) {
  const s = worldToScreen(wx, wy);
  return { x: s.x + (s.x - VW / 2) * METRO.f, y: s.y + (s.y - VH / 2) * METRO.f, g: s };
}
function drawMetro() {
  const { xL, xR, yT, yB } = METRO;
  const corners = [[xL, yT], [xR, yT], [xR, yB], [xL, yB]];
  const margin = 260;
  // Колони на всеки 3 плочки по видимите сегменти
  ctx.lineCap = 'round';
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = corners[e], [bx, by] = corners[(e + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.round(len / (TILE * 3));
    for (let i = 0; i <= steps; i++) {
      const wx = ax + (bx - ax) * i / steps, wy = ay + (by - ay) * i / steps;
      const p = elevPt(wx, wy);
      if (p.g.x < -margin || p.g.y < -margin || p.g.x > VW + margin || p.g.y > VH + margin) continue;
      ctx.strokeStyle = '#3e3e46';
      ctx.lineWidth = 5 * camZoom;
      ctx.beginPath(); ctx.moveTo(p.g.x, p.g.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(p.g.x, p.g.y, 6 * camZoom, 3.5 * camZoom, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Релсово платно (затворен контур през проектираните ъгли)
  const ep = corners.map(c => elevPt(c[0], c[1]));
  ctx.beginPath();
  ctx.moveTo(ep[0].x, ep[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(ep[i].x, ep[i].y);
  ctx.closePath();
  ctx.strokeStyle = '#33333a';
  ctx.lineWidth = 15 * camZoom;
  ctx.stroke();
  ctx.strokeStyle = '#4a4a52';
  ctx.lineWidth = 11 * camZoom;
  ctx.stroke();
  ctx.setLineDash([2 * camZoom, 7 * camZoom]);
  ctx.strokeStyle = '#8a8a92';
  ctx.lineWidth = 7 * camZoom;
  ctx.stroke();
  ctx.setLineDash([]);
  // Спирки: перон + знак Ⓜ на входа
  for (let i = 0; i < 4; i++) {
    const sp = ringPoint(METRO.stationS[i]);
    const p = elevPt(sp.x, sp.y);
    if (p.g.x > -margin && p.g.y > -margin && p.g.x < VW + margin && p.g.y < VH + margin) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(sp.a);
      ctx.fillStyle = '#71717c';
      ctx.fillRect(-46 * camZoom, -15 * camZoom, 92 * camZoom, 30 * camZoom);
      ctx.fillStyle = '#c9b23c';
      ctx.fillRect(-46 * camZoom, -15 * camZoom, 92 * camZoom, 2.5 * camZoom);
      ctx.fillRect(-46 * camZoom, 12.5 * camZoom, 92 * camZoom, 2.5 * camZoom);
      ctx.restore();
      // Знак на входа долу
      const e = stationEntrances[i];
      const es = worldToScreen(e.x, e.y);
      ctx.fillStyle = '#1d4d7a';
      ctx.beginPath(); ctx.arc(es.x, es.y, 9 * camZoom, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(11 * camZoom) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('М', es.x, es.y + 0.5);
      // Име на спирката
      ctx.font = 'bold ' + Math.round(8.5 * camZoom) + 'px sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(theme.stations[i], es.x, es.y + 17 * camZoom);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(theme.stations[i], es.x, es.y + 17 * camZoom);
      // Подсказка, когато влак чака на спирката
      for (const t of trains) {
        if (t.dwell > 0 && t.stationIdx === i && !player.car && !player.onTrain &&
            dist2(player.x, player.y, e.x, e.y) < 120 * 120) {
          ctx.fillStyle = '#7ee08a';
          ctx.font = 'bold ' + Math.round(11 * camZoom) + 'px sans-serif';
          ctx.fillText(IS_TOUCH ? '🚗 качи се' : 'E: качи се', es.x, es.y - 18 * camZoom);
        }
      }
    }
  }
  // Влакове
  for (const t of trains) {
    for (let i = 0; i < METRO.carsPerTrain; i++) {
      const s = t.s - t.dir * i * (METRO.carLen + METRO.carGap);
      const rp = ringPoint(s);
      const p = elevPt(rp.x, rp.y);
      if (p.g.x < -margin || p.g.y < -margin || p.g.x > VW + margin || p.g.y > VH + margin) continue;
      // Сянка на земята
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.save();
      ctx.translate(p.g.x, p.g.y);
      ctx.rotate(rp.a);
      ctx.fillRect(-METRO.carLen / 2 * camZoom, -8 * camZoom, METRO.carLen * camZoom, 16 * camZoom);
      ctx.restore();
      // Вагон
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(rp.a + (t.dir === -1 ? Math.PI : 0));
      ctx.scale(camZoom, camZoom);
      const L = METRO.carLen, W = 18;
      ctx.fillStyle = theme.metro;
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(-L / 2 + r, -W / 2);
      ctx.lineTo(L / 2 - r, -W / 2); ctx.quadraticCurveTo(L / 2, -W / 2, L / 2, -W / 2 + r);
      ctx.lineTo(L / 2, W / 2 - r); ctx.quadraticCurveTo(L / 2, W / 2, L / 2 - r, W / 2);
      ctx.lineTo(-L / 2 + r, W / 2); ctx.quadraticCurveTo(-L / 2, W / 2, -L / 2, W / 2 - r);
      ctx.lineTo(-L / 2, -W / 2 + r); ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + r, -W / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(-L / 2 + 2, -W / 2 + 1.5, L - 4, 2.5);
      // Прозорци
      ctx.fillStyle = 'rgba(190,225,245,0.9)';
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(-L / 2 + 6 + k * (L - 10) / 4, -W / 2 + 4, (L - 14) / 4 - 3, 3.5);
        ctx.fillRect(-L / 2 + 6 + k * (L - 10) / 4, W / 2 - 7.5, (L - 14) / 4 - 3, 3.5);
      }
      // Фар на първия вагон
      if (i === 0) {
        ctx.fillStyle = '#ffe9a0';
        ctx.fillRect(L / 2 - 2.5, -3, 2.5, 6);
      }
      ctx.restore();
    }
  }
}
// ---------- Забележителности на София ----------
function domeShape(x, y, r, light, dark) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}
function drawLandmarks() {
  if (!landmarks.length) return;
  const night = nightAmount();
  for (const lm of landmarks) {
    const s = worldToScreen(lm.x, lm.y);
    if (s.x < -280 || s.y < -280 || s.x > VW + 280 || s.y > VH + 280) continue;
    const f = 0.035 * lm.h;
    const px = s.x + (s.x - VW / 2) * f, py = s.y + (s.y - VH / 2) * f;
    const z = camZoom;
    if (lm.type === 'nevski') {
      // Златни куполи на кръст, зелени в диагоналите
      if (night > 0.35) {
        const gl = ctx.createRadialGradient(px, py, 4 * z, px, py, 60 * z);
        gl.addColorStop(0, 'rgba(255,214,110,' + (0.35 * night) + ')');
        gl.addColorStop(1, 'rgba(255,214,110,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(px - 60 * z, py - 60 * z, 120 * z, 120 * z);
      }
      for (const [ox, oy] of [[-58, -34], [58, -34], [-58, 34], [58, 34]]) {
        domeShape(px + ox * z, py + oy * z, 10 * z, '#79a888', '#3e6852');
      }
      for (const [ox, oy] of [[-58, 0], [58, 0], [0, -36], [0, 36]]) {
        domeShape(px + ox * z, py + oy * z, 13 * z, '#f4dc82', '#a8842e');
      }
      domeShape(px, py, 23 * z, '#f8e498', '#b08a30');
      ctx.strokeStyle = '#f8e8b0';
      ctx.lineWidth = 1.6 * z;
      ctx.beginPath(); ctx.moveTo(px, py - 30 * z); ctx.lineTo(px, py - 23 * z); ctx.stroke();
    } else if (lm.type === 'su') {
      // Ректоратът — двор и два зелени купола отпред
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(px - 28 * z, py - 20 * z, 56 * z, 40 * z);
      domeShape(px - 62 * z, py - 52 * z, 9 * z, '#79a888', '#3e6852');
      domeShape(px + 62 * z, py - 52 * z, 9 * z, '#79a888', '#3e6852');
    } else if (lm.type === 'ndk') {
      // Осмоъгълникът на НДК с радиални ребра
      const R8 = 74 * z;
      for (const [rr, col] of [[1, '#e6e2d6'], [0.72, '#d6d2c6'], [0.45, '#c6c2b6'], [0.2, '#b6b2a6']]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = Math.PI / 8 + k * Math.PI / 4;
          const vx = px + Math.cos(a) * R8 * rr, vy = py + Math.sin(a) * R8 * rr * 0.82;
          k === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + k * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * R8, py + Math.sin(a) * R8 * 0.82);
        ctx.stroke();
      }
    } else if (lm.type === 'stadium') {
      // Овалният стадион — на нивото на земята
      const gx = s.x, gy = s.y;
      ctx.fillStyle = '#8f8a82';
      ctx.beginPath(); ctx.ellipse(gx, gy, 122 * z, 84 * z, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a85a40';
      ctx.beginPath(); ctx.ellipse(gx, gy, 98 * z, 64 * z, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f7d36';
      ctx.beginPath(); ctx.ellipse(gx, gy, 74 * z, 44 * z, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.4 * z;
      ctx.strokeRect(gx - 58 * z, gy - 34 * z, 116 * z, 68 * z);
      ctx.beginPath(); ctx.moveTo(gx, gy - 34 * z); ctx.lineTo(gx, gy + 34 * z); ctx.stroke();
      ctx.beginPath(); ctx.arc(gx, gy, 12 * z, 0, Math.PI * 2); ctx.stroke();
      // Прожектори
      ctx.fillStyle = night > 0.4 ? '#fff6c8' : '#d8d8dc';
      for (const [ox, oy] of [[-110, -74], [110, -74], [-110, 74], [110, 74]]) {
        ctx.beginPath(); ctx.arc(gx + ox * z, gy + oy * z, 3.2 * z, 0, Math.PI * 2); ctx.fill();
      }
    } else if (lm.type === 'fountain') {
      const gx = s.x, gy = s.y;
      ctx.fillStyle = '#9a948a';
      ctx.beginPath(); ctx.arc(gx, gy, 17 * z, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a9cc4';
      ctx.beginPath(); ctx.arc(gx, gy, 13.5 * z, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = 0; k < 7; k++) {
        const a = k * Math.PI * 2 / 7 + gameT * 1.5;
        const rr = (4 + Math.sin(gameT * 4 + k) * 2.5) * z;
        ctx.beginPath(); ctx.arc(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr - 2 * z, 1.6 * z, 0, Math.PI * 2); ctx.fill();
      }
    } else if (lm.type === 'monument') {
      // Паметникът на Свободата — постамент, колона и статуя
      const gx = s.x, gy = s.y;
      ctx.fillStyle = '#8f8a80';
      ctx.beginPath(); ctx.arc(gx, gy, 15 * z, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      ctx.stroke();
      // Колоната се проектира нависоко
      const mf = 0.09;
      const px2 = gx + (gx - VW / 2) * mf, py2 = gy + (gy - VH / 2) * mf;
      ctx.strokeStyle = '#d8d2c4';
      ctx.lineWidth = 6 * z;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(px2, py2); ctx.stroke();
      ctx.fillStyle = '#e6e0d2';
      ctx.beginPath(); ctx.arc(px2, py2, 4.5 * z, 0, Math.PI * 2); ctx.fill();
      // Статуята на свободата с вдигната ръка
      ctx.fillStyle = '#3e6852';
      ctx.beginPath(); ctx.arc(px2, py2, 3 * z, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3e6852';
      ctx.lineWidth = 1.6 * z;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(px2 + 5 * z, py2 - 5 * z); ctx.stroke();
    } else if (lm.type === 'dohodno') {
      // Доходното здание — зелен покрив, фронтон и статуи по ръба
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(px - 40 * z, py - 18 * z, 80 * z, 36 * z);
      ctx.fillStyle = '#3e7a5e';
      ctx.fillRect(px - 34 * z, py - 14 * z, 68 * z, 28 * z);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
      ctx.strokeRect(px - 34 * z, py - 14 * z, 68 * z, 28 * z);
      // Фронтон към площада (север)
      ctx.fillStyle = '#e8dcc4';
      ctx.beginPath();
      ctx.moveTo(px - 14 * z, py - 14 * z);
      ctx.lineTo(px, py - 24 * z);
      ctx.lineTo(px + 14 * z, py - 14 * z);
      ctx.closePath(); ctx.fill();
      // Статуи по покрива
      ctx.fillStyle = '#d8d0be';
      for (const ox of [-28, -14, 0, 14, 28]) {
        ctx.beginPath(); ctx.arc(px + ox * z, py - 16 * z, 1.8 * z, 0, Math.PI * 2); ctx.fill();
      }
    } else if (lm.type === 'court') {
      // Съдебната палата — колонада
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(px - 26 * z, py - 20 * z, 52 * z, 40 * z);
      ctx.fillStyle = '#d8d0c0';
      for (let k = 0; k < 6; k++) {
        ctx.beginPath(); ctx.arc(px - 20 * z + k * 8 * z, py - 16 * z, 2 * z, 0, Math.PI * 2); ctx.fill();
      }
    } else if (lm.type === 'opera') {
      // Операта — червен покрив със светъл фронтон
      ctx.fillStyle = '#96513a';
      ctx.fillRect(px - 26 * z, py - 16 * z, 52 * z, 32 * z);
      ctx.fillStyle = '#e6d0a8';
      ctx.beginPath();
      ctx.moveTo(px - 12 * z, py - 16 * z);
      ctx.lineTo(px, py - 25 * z);
      ctx.lineTo(px + 12 * z, py - 16 * z);
      ctx.closePath(); ctx.fill();
    } else if (lm.type === 'pantheon') {
      // Пантеонът на Възрожденците — златен купол
      if (night > 0.35) {
        const gl = ctx.createRadialGradient(px, py, 4 * z, px, py, 46 * z);
        gl.addColorStop(0, 'rgba(255,214,110,' + (0.3 * night) + ')');
        gl.addColorStop(1, 'rgba(255,214,110,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(px - 46 * z, py - 46 * z, 92 * z, 92 * z);
      }
      domeShape(px, py, 21 * z, '#f6dc7e', '#a8842e');
      ctx.strokeStyle = 'rgba(120,90,20,0.4)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * 21 * z, py + Math.sin(a) * 21 * z);
        ctx.stroke();
      }
    } else if (lm.type === 'trinity') {
      // „Св. Троица" — зелен купол и камбанария
      domeShape(px, py, 11 * z, '#79a888', '#3e6852');
      domeShape(px + 22 * z, py - 14 * z, 6.5 * z, '#79a888', '#3e6852');
      ctx.strokeStyle = '#e8e2d4';
      ctx.lineWidth = 1.4 * z;
      ctx.beginPath(); ctx.moveTo(px + 22 * z, py - 24 * z); ctx.lineTo(px + 22 * z, py - 20 * z); ctx.stroke();
    } else if (lm.type === 'boat') {
      // Шлеп по Дунава — поклаща се леко
      const gx = s.x + Math.sin(gameT * 0.5 + lm.y) * 2 * z;
      const gy = s.y + Math.cos(gameT * 0.4 + lm.x) * 1.5 * z;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(0.12 + Math.sin(gameT * 0.3 + lm.y) * 0.04);
      ctx.scale(z, z);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(2, 2, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a4a3a';
      ctx.beginPath();
      ctx.moveTo(-26, -6); ctx.lineTo(20, -6); ctx.quadraticCurveTo(30, 0, 20, 6);
      ctx.lineTo(-26, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a6a55';
      ctx.fillRect(-22, -4, 34, 8);
      ctx.fillStyle = '#3a3a40';
      ctx.fillRect(-20, -3, 12, 6);
      ctx.fillRect(-6, -3, 12, 6);
      ctx.fillStyle = '#d8d2c4';
      ctx.fillRect(14, -3, 7, 6);
      ctx.restore();
      // Следа във водата
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2 * z;
      ctx.beginPath();
      ctx.moveTo(gx - 30 * z, gy + 2 * z);
      ctx.quadraticCurveTo(gx - 44 * z, gy + (Math.sin(gameT) * 3 + 4) * z, gx - 58 * z, gy + 3 * z);
      ctx.stroke();
    }
  }
}

function drawDoorLabel(door, color, icon, label) {
  if (!door) return;
  const s = worldToScreen(door.x, door.y);
  if (s.x < -100 || s.y < -100 || s.x > VW + 100 || s.y > VH + 100) return;
  ctx.font = 'bold ' + Math.round(15 * camZoom) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(icon, s.x, s.y - 14 * camZoom);
  ctx.font = 'bold ' + Math.round(8 * camZoom) + 'px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(label, s.x, s.y - 28 * camZoom);
}

function drawTaxiMarker() {
  if (!(player.car && player.car.kind === 'taxi' && !player.car.dead)) return;
  const pt = taxiJob.dest || taxiJob.fare;
  if (!pt) return;
  const s = worldToScreen(pt.x, pt.y);
  ctx.strokeStyle = '#e8b800'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(s.x, s.y, (34 + Math.sin(gameT * 4) * 6) * camZoom, 0, Math.PI * 2);
  ctx.stroke();
  if (s.x < 0 || s.y < 0 || s.x > VW || s.y > VH) {
    const a = Math.atan2(pt.y - player.y, pt.x - player.x);
    const mx = VW / 2 + Math.cos(a) * Math.min(VW, VH) * 0.36;
    const my = VH / 2 + Math.sin(a) * Math.min(VW, VH) * 0.36;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
    ctx.fillStyle = '#e8b800';
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, 8); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if (taxiJob.dest) {
    ctx.fillStyle = '#e8b800';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('🚕 ' + Math.ceil(taxiJob.t) + ' сек · ' + fmtMoney(taxiJob.pay), VW / 2, 58);
    ctx.textAlign = 'left';
  }
}
function drawMissionMarkers() {
  if (!mission.active) return;
  let tx = null, ty = null, color = '#5c8';
  if (mission.type === 'deliver') {
    if (player.car === mission.target) { tx = mission.drop.x; ty = mission.drop.y; }
    else { tx = mission.target.x; ty = mission.target.y; }
  } else if (mission.type === 'hit') { tx = mission.target.x; ty = mission.target.y; color = '#e55'; }
  else if (mission.type === 'chase' && mission.target) { tx = mission.target.x; ty = mission.target.y; color = '#e55'; }
  else if (mission.type === 'bomb' && mission.drop) { tx = mission.drop.x; ty = mission.drop.y; color = mission.bombState ? '#f60' : '#fc5'; }
  else if ((mission.type === 'army' || mission.type === 'raid') && mission.gear && !(player.car && player.car.gear)) {
    let best = null, bd = 1e18;
    for (const g of mission.gear) {
      if (g.dead) continue;
      const dv = dist2(g.x, g.y, player.x, player.y);
      if (dv < bd) { bd = dv; best = g; }
    }
    if (best) { tx = best.x; ty = best.y; color = '#8ac'; }
  }
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

// Минимапа (miniCanvas се рендерира в renderMini при смяна на град)
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
  // Линия на метрото
  ctx.strokeStyle = 'rgba(230,200,80,0.8)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x0 + METRO.xL * sx, y0 + METRO.yT * sy, (METRO.xR - METRO.xL) * sx, (METRO.yB - METRO.yT) * sy);
  ctx.fillStyle = '#e8e8f0';
  for (const ss of METRO.stationS) {
    const p = ringPoint(ss);
    ctx.fillRect(x0 + p.x * sx - 1.5, y0 + p.y * sy - 1.5, 3, 3);
  }
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
    else if (mission.type === 'chase' && mission.target) { tx = mission.target.x; ty = mission.target.y; color = '#e55'; }
    else if (mission.type === 'bomb' && mission.drop) { tx = mission.drop.x; ty = mission.drop.y; color = '#fc5'; }
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
  } else if (player.onTrain) {
    ctx.fillStyle = '#aac';
    ctx.fillText('Метро', pad, pad + 62);
  }
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(theme.name + ' · ниво ' + level, pad, pad + 80);
  // Име на улицата (София — по решетката; Русе — по картата на улиците)
  if ((theme.streetsH || theme.streetNames) && !player.onTrain) {
    const txp = Math.floor(player.x / TILE), typ = Math.floor(player.y / TILE);
    let street = null;
    if (theme.streetNames && streetIdxMap) {
      // Търси име на текущата или съседна плочка
      const probes = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
      for (const [dx, dy] of probes) {
        const xx = txp + dx, yy = typ + dy;
        if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
        const si = streetIdxMap[yy * MW + xx];
        if (si !== 255) { street = theme.streetNames[si]; break; }
      }
    } else if (theme.streetsH) {
      const mv = ((txp % 8) + 8) % 8, mh = ((typ % 8) + 8) % 8;
      if (mv === 3 || mv === 4) street = theme.streetsV[clamp(Math.floor(txp / 8), 0, 7)];
      else if (mh === 3 || mh === 4) street = theme.streetsH[clamp(Math.floor(typ / 8), 0, 7)];
      else if (mv === 2 || mv === 5) street = theme.streetsV[clamp(Math.floor(txp / 8), 0, 7)];
      else if (mh === 2 || mh === 5) street = theme.streetsH[clamp(Math.floor(typ / 8), 0, 7)];
    }
    if (street) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('📍 ' + street, pad, pad + 96);
    }
  }

  // === Дясно: издирване под минимапата ===
  const mini = { x0: VW - clamp(Math.min(VW, VH) * 0.22, 90, 150) - 10, y0: 10, size: clamp(Math.min(VW, VH) * 0.22, 90, 150) };
  const headR = 8;
  const headStep = Math.min(headR * 2.4, (mini.size - 16) / 5);
  for (let i = 0; i < 6; i++) {
    const shake = (copsSee && i < player.wanted) ? Math.sin(gameT * 26 + i * 1.7) * 1.8 : 0;
    drawPoliceHead(mini.x0 + 10 + i * headStep, mini.y0 + mini.size + 16 + shake, headR, i < player.wanted);
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
    bigCenterText('ГРАДЪТ Е ТВОЙ!', '#ffd23c');
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('Заминаваш за ' + travelToName + ' · Нова цел: ' + fmtMoney(targetScore) + ' · +1 живот', VW / 2, VH / 2 + 44);
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
  if (unlockScreen) drawUnlockScreen();
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
  if (menuState === 'main') { drawMainMenu(); return; }
  if (menuState === 'settings') { drawSettingsMenu(); return; }
  menuButtons = [];
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.min(64, VW * 0.1) + 'px sans-serif';
  ctx.fillStyle = '#ffd23c';
  ctx.fillText('GANG CITY', VW / 2, VH * 0.22);
  ctx.font = 'bold 13px sans-serif';
  menuBtn('← Меню', 12, 12, 90, 30, 'back');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Избор на начален град — редове с бутони
  startCityButtons = [];
  ctx.font = 'bold 15px sans-serif';
  const bh = 30, gap = 10;
  const labels = THEMES.map((t, i) => cityUnlocked(i) ? (i + 1) + '. ' + t.name : '🔒 ' + t.name);
  const widths = labels.map(l => ctx.measureText(l).width + 20);
  // Разпредели в редове, които се събират на екрана
  const rows = [[]];
  let rowW = 0;
  THEMES.forEach((t, i) => {
    if (rowW + widths[i] + gap > VW - 24 && rows[rows.length - 1].length) { rows.push([]); rowW = 0; }
    rows[rows.length - 1].push(i);
    rowW += widths[i] + gap;
  });
  let by = VH * 0.30 - 12;
  for (const row of rows) {
    const total = row.reduce((a, i) => a + widths[i], 0) + gap * (row.length - 1);
    let bx = VW / 2 - total / 2;
    for (const i of row) {
      const sel = i === cityIdx;
      ctx.fillStyle = sel ? 'rgba(122,182,255,0.25)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(bx, by, widths[i], bh);
      ctx.strokeStyle = sel ? '#7ab6ff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(bx, by, widths[i], bh);
      ctx.fillStyle = !cityUnlocked(i) ? '#666' : sel ? '#cfe4ff' : '#ccc';
      ctx.fillText(labels[i], bx + widths[i] / 2, by + bh / 2);
      startCityButtons.push({ x: bx, y: by, w: widths[i], h: bh, idx: i });
      bx += widths[i] + gap;
    }
    by += bh + 8;
  }
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#8aa';
  ctx.fillText(IS_TOUCH ? 'Докосни град, за да започнеш от него' : 'Натисни 1–' + THEMES.length + ', за да избереш начален град', VW / 2, by + 4);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#ccc';
  const lines = IS_TOUCH ? [
    'Събери ' + fmtMoney(targetScore) + ', за да превземеш града!',
    'Отговаряй на звънящите телефони ☎ за работа от шефа.',
    'Метрото Ⓜ те превозва бързо — качи се от спирка.',
    '',
    'Ляв палец — движение / волан',
    '🚗 влез/излез · 🔫 стрелба · 🛑 спирачка/дрифт · 🔁 оръжие',
    'Внимавай: полицията арестува, а болницата взима живот.',
    '',
    'Докосни екрана, за да започнеш'
  ] : [
    'Събери ' + fmtMoney(targetScore) + ', за да превземеш града!',
    'Отговаряй на звънящите телефони ☎ за работа от шефа.',
    'Метрото Ⓜ те превозва бързо — качи се от спирка.',
    '',
    'WASD / стрелки — движение и шофиране',
    'E — влез/излез · F — стрелба · Q — оръжие · Space — спирачка/дрифт · P — пауза',
    'Внимавай: полицията арестува, а болницата взима живот.',
    '',
    'Натисни клавиш, за да започнеш'
  ];
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, VH * 0.5 + i * 22));
  if (scoreBest > 0) {
    ctx.fillStyle = '#7ee08a';
    ctx.fillText('Рекорд: ' + fmtMoney(scoreBest), VW / 2, VH * 0.5 + lines.length * 22 + 16);
  }
  // Постоянният прогрес: ранг, колекция, дневна задача, следващо отключване
  ensureDaily();
  let py = VH * 0.5 + lines.length * 22 + 40;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#ffd23c';
  ctx.fillText('⭐ Ранг: ' + rankOf(meta.rankXp).name + ' (' + meta.rankXp + ' т.)', VW / 2, py); py += 21;
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#9fc4d8';
  ctx.fillText('🚗 Колекция: ' + meta.collection.length + '/' + Object.keys(CAR_KINDS).length + ' модела', VW / 2, py); py += 20;
  const dTask = DAILY_TASKS[meta.daily.taskIdx];
  ctx.fillStyle = meta.daily.done ? '#7ee08a' : '#e8b800';
  ctx.fillText('📅 Днес: ' + (meta.daily.done ? 'изпълнена ✓' : dTask.txt) +
    (meta.daily.streak > 1 ? ' · серия ' + meta.daily.streak + ' дни' : ''), VW / 2, py); py += 20;
  const nextLock = THEMES.findIndex((t, i) => !cityUnlocked(i));
  if (nextLock >= 0) {
    ctx.fillStyle = '#b09040';
    ctx.fillText('🔒 ' + THEMES[nextLock].name + ': още ' + (CITY_REQ[nextLock] - meta.metaMissions) + ' мисии', VW / 2, py);
  }
  ctx.textBaseline = 'top';
}

// ---------------- Главен цикъл ----------------
let lastT = performance.now();
let fpsEMA = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.001) fpsEMA += (1 / dt - fpsEMA) * 0.05;
  if (dt > 0.1) dt = 0.1;

  if (!started) { drawStartScreen(); return; }

  if (unlockScreen) unlockScreen.t += dt;
  if (!paused && !gameOver && !unlockScreen) {
    gameT += dt;
    if (messageT > 0) messageT -= dt;
    if (levelCompleteT > 0) {
      levelCompleteT -= dt;
      if (citySwitchPending && levelCompleteT <= 0) {
        citySwitchPending = false;
        const nextIdx = (cityIdx + 1) % THEMES.length;
        meta.metaMissions = Math.max(meta.metaMissions, CITY_REQ[nextIdx] || 0);
        saveMeta();
        switchCity();
        openUnlockScreen(cityIdx, 'arrived');
      }
    }

    const inp = inputState();
    skidActive = false;
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
    updateCrusher(dt);
    updateChurch(dt);
    updateTaxi(dt);
    AdBridge.update();
    autoT -= dt;
    if (autoT <= 0) { autoT = 12; if (started && !gameOver && !player.dead) autosaveRun(); }
    {
      const z = gangAt(player.x);
      if (z !== gangZoneLast && gameT - (window._zoneMsgT || -99) > 6) {
        gangZoneLast = z;
        window._zoneMsgT = gameT;
        if (z >= 0) {
          const r = Math.round(respect[z]);
          showMsg(GANGS[z].name + ' държат този район. Уважение: ' + (r > 0 ? '+' : '') + r +
            (r <= -30 ? ' — ВНИМАВАЙ!' : ''), 2.5);
        }
      }
    }
    updateMetro(dt);
    updateWeather(dt);
    recycle(dt);

    // Звуково състояние на света
    let sirenProx = 0;
    if (player.wanted > 0) {
      for (const c of cars) {
        if (c.kind === 'police' && !c.dead) {
          const d = Math.sqrt(dist2(c.x, c.y, player.x, player.y));
          if (d < 800) sirenProx = Math.max(sirenProx, 1 - d / 800);
        }
      }
    }
    let pedNear = 0;
    for (const p of peds) {
      if (!p.dead && dist2(p.x, p.y, player.x, player.y) < 240 * 240) pedNear++;
    }
    const parkNear =
      tileAtPx(player.x + 90, player.y) === T.PARK || tileAtPx(player.x - 90, player.y) === T.PARK ||
      tileAtPx(player.x, player.y + 90) === T.PARK || tileAtPx(player.x, player.y - 90) === T.PARK;
    const nearCathedral = !!(theme.sofia && landmarks.length &&
      dist2(player.x, player.y, landmarks[0].x, landmarks[0].y) < 500 * 500);
    AudioSys.update(dt, {
      inCar: !!player.car,
      speed: player.car ? Math.abs(player.car.speed) * (player.car.kind === 'volta' ? 0.25 : 1) : 0,
      skid: skidActive,
      wet: weather.wet, rain: weather.rain,
      night: nightAmount(),
      siren: sirenProx,
      pedNear, parkNear, nearCathedral
    });

    if (score > scoreBest) {
      scoreBest = score;
      try { localStorage.setItem('gangcity_best', String(scoreBest)); } catch (e) {}
    }

    // Камера — по-силен зуум навън при скорост (както в класиката)
    const spd = player.car ? Math.abs(player.car.speed) : 0;
    const targetZoom = player.onTrain ? 0.78 : player.car ? clamp(1.12 - spd / 620, 0.62, 1.05) : 1.15;
    camZoom += (targetZoom - camZoom) * dt * 1.8;
    const lookAhead = player.car ? clamp(player.car.speed * 0.4, -150, 150) : 0;
    const txp = player.x + Math.cos(player.angle) * lookAhead;
    const typ = player.y + Math.sin(player.angle) * lookAhead;
    camX += (txp - camX) * dt * 5;
    camY += (typ - camY) * dt * 5;
  }

  // ---- Рендер ----
  drawGround();
  drawShadows();            // слънчеви сенки от сгради и дървета
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
  drawTaxiMarker();
  drawBuildings();          // сградите закриват всичко зад тях (както в класиката)
  drawLandmarks();          // куполи, НДК, стадионът, фонтанът
  drawMetro();              // метрото е над всичко — то е надземна линия

  drawFlyingHelis();        // летящият хеликоптер е над сградите

  // Цветният подпис на града — лек оттенък върху целия свят (преди нощта и HUD-а)
  if (theme.cast && !settings.lowFx) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = theme.cast;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
  }

  const night = nightAmount();
  if (night > 0.02) {
    ctx.fillStyle = 'rgba(8,8,34,' + (night * 0.42) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }

  // Дъжд: мрачно небе, диагонални капки, пръски и светкавици
  if (weather.rain > 0.02) {
    ctx.fillStyle = 'rgba(38,46,60,' + (weather.rain * 0.2) + ')';
    ctx.fillRect(0, 0, VW, VH);
    const n = Math.floor(95 * weather.rain);
    const wind = 3 + Math.sin(gameT * 0.3) * 2.5;
    ctx.strokeStyle = 'rgba(200,220,245,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const rx = Math.random() * VW, ry = Math.random() * VH;
      const l = 9 + Math.random() * 11;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + wind, ry + l);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(215,230,245,0.22)';
    for (let i = 0; i < n / 3; i++) {
      ctx.fillRect(Math.random() * VW, Math.random() * VH, 2, 1);
    }
  }
  if (weather.flash > 0) {
    ctx.fillStyle = 'rgba(240,246,255,' + (weather.flash * 0.45) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }

  // "Дрон" пост-обработка: златист час, филмово зърно, винетка
  const sunNow = sunState();
  if (sunNow.alpha > 0.05 && sunNow.len > 1.4) {
    ctx.fillStyle = 'rgba(255,180,90,' + ((sunNow.len - 1.4) * 0.22) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
  ctx.globalAlpha = 0.4;
  const gox = -((Math.random() * 256) | 0), goy = -((Math.random() * 256) | 0);
  for (let gy = goy; gy < VH; gy += 256)
    for (let gx = gox; gx < VW; gx += 256)
      ctx.drawImage(TEX.grain, gx, gy);
  ctx.globalAlpha = 1;
  ctx.drawImage(TEX.vignette, 0, 0, VW, VH);

  drawMiniMap();
  drawHUD();
}
requestAnimationFrame(frame);

// Дебъг интерфейс за автоматизирани тестове (не влияе на играта)
window.__gc = {
  get player() { return player; },
  get trains() { return trains; },
  get stationEntrances() { return stationEntrances; },
  get themeName() { return theme.name; },
  get cars() { return cars; },
  get score() { return score; },
  get fps() { return fpsEMA; },
  get sun() { return sunState(); },
  setTime(t) { gameT = t; },
  setRain(v) { weather.state = v > 0 ? 'rain' : 'clear'; weather.rain = v; weather.wet = v; weather.timer = 60; },
  setCity(i) { genCityMap(i); playerToStart(); spawnWorld(); },
  teleport(x, y) { player.x = x; player.y = y; camX = x; camY = y; },
  cheatScore(n) { addScore(n); },
  forceStart() { started = true; }
};
