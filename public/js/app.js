import { RINGS, MODES, THEMES } from './data.js';
import { Visualizer, demoLevels, ringColor } from './engine.js';
import { startMic, startDisplay, RelaySource, canMic, canDisplay, CODE_RE } from './audio.js';

const $ = (id) => document.getElementById(id);
const tg = window.Telegram && window.Telegram.WebApp;
const inTg = !!(tg && tg.initData);

if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor && tg.setHeaderColor('#000000');
    tg.setBackgroundColor && tg.setBackgroundColor('#000000');
    tg.disableVerticalSwipes && tg.disableVerticalSwipes();
  } catch {}
}

/* ---------- настройки ---------- */
const KEY = 'skycoder.v1';
const DEFAULTS = {
  mode: 8, theme: 6, sens: 16, speed: 1, size: 1,
  ag: { device: true, pc: true },
  haptic: false, tab: 'device', code: '',
};
let S = structuredClone(DEFAULTS);

function merge(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o && typeof o === 'object') S = { ...S, ...o, ag: { ...S.ag, ...(o.ag || {}) } };
  } catch {}
}
let hadSaved = false; // были ли у пользователя сохранённые настройки (для выбора вкладки по умолчанию)
try { hadSaved = !!localStorage.getItem(KEY); merge(localStorage.getItem(KEY)); } catch {}
let PUB = null; // код общего эфира с сервера (/config)

const cloudOk = !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9') && inTg);
function save() {
  const json = JSON.stringify(S);
  try { localStorage.setItem(KEY, json); } catch {}
  if (cloudOk) { try { tg.CloudStorage.setItem(KEY, json); } catch {} }
}
// Код компьютера из ссылки (?code=XXXXXX) или из параметра startapp мини-аппа
function applyParamCode() {
  let c = '';
  try { c = new URLSearchParams(location.search).get('code') || ''; } catch {}
  if (!c && tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) c = tg.initDataUnsafe.start_param;
  c = c.toUpperCase();
  if (CODE_RE.test(c)) { S.code = c; S.tab = 'pc'; save(); }
}
applyParamCode();

if (cloudOk) {
  try {
    tg.CloudStorage.getItem(KEY, (err, val) => {
      if (!err && val) { hadSaved = true; merge(val); applyParamCode(); applyAll(); autoConnectPc(); }
    });
  } catch {}
}

/* ---------- кольца (SVG) ---------- */
const NS = 'http://www.w3.org/2000/svg';
const svg = $('rings');
const els = RINGS.map((r) => {
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', 194);
  c.setAttribute('cy', 194);
  c.setAttribute('r', r.r);
  if (r.fill) {
    c.setAttribute('fill', '#000');
  } else {
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', r.w);
    if (r.dashes) c.setAttribute('stroke-dasharray', r.dashes.map((d) => (d * r.w).toFixed(3)).join(' '));
  }
  svg.appendChild(c);
  return c;
});

const lastCol = new Array(RINGS.length).fill('');
const lastTr = new Array(RINGS.length).fill('');
const viz = new Visualizer();
const dbBuf = new Float32Array(10);
const lv = new Float32Array(10);

/* ---------- источник звука ---------- */
let src = null;
let srcKind = null; // 'mic' | 'direct' | 'relay'
let relayState = 'connecting';
let relaySince = 0;
let userStoppedPc = false;
let wakeLock = null;

async function keepAwake() {
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function releaseAwake() {
  try { wakeLock && wakeLock.release(); } catch {}
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && src) keepAwake();
});

function stopSource() {
  if (src) { try { src.stop(); } catch {} }
  src = null;
  srcKind = null;
  releaseAwake();
  viz.reset();
}

async function useSource(s, kind) {
  stopSource();
  src = s;
  srcKind = kind;
  if (s.onEnded === null) s.onEnded = () => { stopSource(); render(); };
  keepAwake();
  render();
}

const errText = (e, kind) => {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError')
    return kind === 'mic'
      ? 'Доступ к микрофону запрещён. Разрешите его для Telegram (или браузера) в настройках устройства и нажмите ещё раз.'
      : 'Захват не разрешён или отменён.';
  if (n === 'NotFoundError') return 'Микрофон не найден.';
  if (n === 'NoAudioTrack') return 'Звук не выбран. Повторите и включите «Поделиться звуком» (нужен Chrome/Edge и пункт «Весь экран»).';
  if (n === 'NotSupportedError' || n === 'TypeError') return 'Этот режим не поддерживается в текущем окне. Используйте код с компьютера.';
  return 'Не удалось включить: ' + ((e && e.message) || n || 'ошибка');
};
const showErr = (id, text) => { const el = $(id); el.textContent = text || ''; el.hidden = !text; };

$('btnMic').addEventListener('click', async () => {
  showErr('errDevice', '');
  if (!canMic()) return showErr('errDevice', 'Микрофон недоступен в этом окне (нужен HTTPS и поддержка Web Audio).');
  try { await useSource(await startMic(), 'mic'); } catch (e) { showErr('errDevice', errText(e, 'mic')); }
});

$('btnDirect').addEventListener('click', async () => {
  showErr('errPc', '');
  try { await useSource(await startDisplay(), 'direct'); } catch (e) { showErr('errPc', errText(e, 'direct')); }
});

function connectRelay(code) {
  userStoppedPc = false;
  relayState = 'connecting';
  relaySince = performance.now();
  useSource(new RelaySource(code, (st) => {
    relayState = st;
    relaySince = st === 'connecting' ? relaySince || performance.now() : 0;
    render();
  }), 'relay');
}
// куда подключаться на вкладке «Компьютер»: свой код, иначе общий эфир
const pcTarget = () => (CODE_RE.test(S.code) ? S.code : PUB);
function autoConnectPc() {
  const code = pcTarget();
  if (S.tab === 'pc' && !src && !userStoppedPc && code) connectRelay(code);
  render();
}
$('btnPub').addEventListener('click', () => {
  if (!PUB) return;
  S.code = '';
  codeIn.value = '';
  save();
  showErr('errPc', '');
  connectRelay(PUB);
});

// общий эфир: при первом открытии показываем его сразу
fetch('/config', { cache: 'no-store' })
  .then((r) => r.json())
  .then((c) => {
    PUB = c && CODE_RE.test(c.room || '') ? c.room : null;
    if (PUB && !hadSaved && !CODE_RE.test(S.code)) S.tab = 'pc';
    applyAll();
    autoConnectPc();
  })
  .catch(() => {});

const codeIn = $('codeIn');
codeIn.addEventListener('input', () => {
  codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});
codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnConnect').click(); });
$('btnConnect').addEventListener('click', () => {
  const code = codeIn.value.trim().toUpperCase();
  if (!CODE_RE.test(code)) return showErr('errPc', 'Код состоит из 6 символов — посмотрите его на странице компьютера.');
  showErr('errPc', '');
  S.code = code;
  save();
  connectRelay(code);
});
$('btnStop').addEventListener('click', () => {
  if (srcKind === 'relay') userStoppedPc = true;
  stopSource();
  render();
});

/* ---------- интерфейс ---------- */
const hostPath = location.origin + '/host';
$('hostUrl').textContent = location.host + '/host';
document.querySelectorAll('.hostLink').forEach((n) => (n.textContent = hostPath));
$('btnDirect').hidden = !canDisplay();

function setTab(t) {
  if (S.tab === t) return;
  stopSource();
  S.tab = t;
  userStoppedPc = false;
  save();
  applyAll();
  autoConnectPc();
}
$('tabDevice').addEventListener('click', () => setTab('device'));
$('tabPc').addEventListener('click', () => setTab('pc'));

function render() {
  const running = !!src;
  $('tabDevice').classList.toggle('on', S.tab === 'device');
  $('tabPc').classList.toggle('on', S.tab === 'pc');
  $('cardDevice').hidden = running || S.tab !== 'device';
  $('cardPc').hidden = running || S.tab !== 'pc';
  $('cardStop').hidden = !running;
  if (!running && S.code && !codeIn.value) codeIn.value = S.code;
  $('btnPub').hidden = !PUB;
  $('pcLead').textContent = PUB ? 'Свой компьютер: введите код со страницы ' : 'Введите код со страницы ';

  let dot = '', text = '';
  if (!running) {
    text = 'Демо-режим · выберите источник звука';
  } else if (srcKind === 'mic') {
    dot = 'live'; text = '<b>Слушаю микрофон</b> этого устройства';
  } else if (srcKind === 'direct') {
    dot = 'live'; text = '<b>Звук этого компьютера</b> (захват экрана)';
  } else if (srcKind === 'relay') {
    const pub = !!PUB && src.code === PUB;
    if (relayState === 'live') {
      dot = 'live';
      text = pub ? '<b>Прямой эфир</b> · звук компьютера владельца' : `<b>Компьютер подключён</b> · код ${src.code}`;
    } else if (relayState === 'waiting') {
      dot = 'warn';
      text = pub ? 'Эфир сейчас не идёт: владелец не транслирует звук. Откроется сам, когда начнёт.'
                 : `Код ${src.code} · компьютер сейчас не транслирует звук`;
    }
    else {
      dot = 'warn';
      text = relaySince && performance.now() - relaySince > 4000
        ? 'Сервер просыпается (бесплатный Render), это может занять до минуты…'
        : 'Подключаюсь к серверу…';
    }
  }
  if (running && dot === 'live') text += '<br><span class="sub">Нажмите на кольцо, чтобы скрыть интерфейс</span>';
  $('status').innerHTML = (dot ? `<span class="dot ${dot}"></span>` : '') + text;
  if (!running && document.body.classList.contains('immersive')) setImmersive(false);
}
setInterval(() => { if (srcKind === 'relay' && relayState === 'connecting') render(); }, 1000);

/* режим «только кольцо»: тап по кольцу прячет интерфейс (+ полный экран в Telegram) */
function setImmersive(on) {
  document.body.classList.toggle('immersive', on);
  try {
    if (tg && inTg && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
      if (on) tg.requestFullscreen(); else tg.exitFullscreen();
    }
  } catch {}
}
document.querySelector('.stage').addEventListener('click', () => {
  if (!src || sheet.classList.contains('on')) return;
  setImmersive(!document.body.classList.contains('immersive'));
});

/* панель настроек */
const sheet = $('sheet'), backdrop = $('backdrop');
const toggleSheet = (on) => { sheet.classList.toggle('on', on); backdrop.classList.toggle('on', on); };
$('gear').addEventListener('click', () => toggleSheet(!sheet.classList.contains('on')));
backdrop.addEventListener('click', () => toggleSheet(false));

const TIPS = [
  'Основной вид: кольца реагируют на средние и верхние средние частоты',
  'Для басовой музыки и хороших колонок: кольца ведёт глубокий бас',
  'Для слабого баса (ноутбук, наушники): игнорирует пустой глубокий бас, усиливает низкие средние',
  'Высокие частоты и хай-хэты ведут кольца',
  'Равномерно по всему спектру',
  'Мягко и плавно, медленные реакции',
  'Агрессивно и резко, сильные реакции',
  'Ваш шаблон (настройки из вашего Rainmeter: полосы 2, 3, 5, 8, Punch 0.76)',
];
const modeChips = $('modeChips');
MODES.forEach((m, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = m.name;
  b.addEventListener('click', () => { S.mode = i + 1; save(); applyAll(); });
  modeChips.appendChild(b);
});
const themeChips = $('themeChips');
const norm255 = (c) => { const m = Math.max(...c, 1); return c.map((x) => Math.round((x * 255) / m)); };
THEMES.forEach((t, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  const [r, g, bl] = norm255(t.c);
  b.innerHTML = `<i style="background:rgb(${r},${g},${bl})"></i>${t.name}`;
  b.addEventListener('click', () => { S.theme = i + 1; save(); applyAll(); });
  themeChips.appendChild(b);
});

function bindRange(id, key, fmt) {
  const el = $(id), out = $(id + 'O');
  el.addEventListener('input', () => { S[key] = parseFloat(el.value); out.textContent = fmt(S[key]); apply(); });
  el.addEventListener('change', save);
}
bindRange('sens', 'sens', (v) => v + ' dB');
bindRange('speed', 'speed', (v) => '×' + v.toFixed(1));
bindRange('size', 'size', (v) => Math.round(v * 100) + '%');
$('ag').addEventListener('change', (e) => { S.ag[S.tab] = e.target.checked; save(); });
$('haptic').addEventListener('change', (e) => { S.haptic = e.target.checked; save(); });
if (!(tg && tg.HapticFeedback && inTg)) $('hapticRow').hidden = true;

function apply() {
  svg.style.setProperty('--size', S.size);
  const th = THEMES[S.theme - 1];
  document.documentElement.style.setProperty('--acc', `rgb(${norm255(th.c).join(',')})`);
}
function applyAll() {
  apply();
  [...modeChips.children].forEach((c, i) => c.classList.toggle('on', i + 1 === S.mode));
  [...themeChips.children].forEach((c, i) => c.classList.toggle('on', i + 1 === S.theme));
  $('modeTip').textContent = TIPS[S.mode - 1];
  $('sens').value = S.sens; $('sensO').textContent = S.sens + ' dB';
  $('speed').value = S.speed; $('speedO').textContent = '×' + S.speed.toFixed(1);
  $('size').value = S.size; $('sizeO').textContent = Math.round(S.size * 100) + '%';
  $('ag').checked = !!S.ag[S.tab];
  $('haptic').checked = !!S.haptic;
  render();
}

/* ---------- главный цикл ---------- */
let last = performance.now();
let lastHap = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(now - last, 100);
  last = now;
  if (dt <= 0) return;

  const m = MODES[S.mode - 1];
  const p = {
    bands: m.bands, mult: m.mult, att: m.att, dec: m.dec, contrast: m.contrast, punch: m.punch,
    peakFall: 0.999, autoFloor: 0.15, idle: 0, speed: S.speed,
    autoGain: S.ag[S.tab] ? 1 : 0,
  };

  if (src) {
    src.read(dbBuf);
    viz.mapLevels(dt, dbBuf, S.sens, !!S.ag[S.tab], lv);
  } else {
    demoLevels(now, lv);
  }
  viz.step(dt, lv, p, RINGS);

  const th = THEMES[S.theme - 1];
  for (let i = 0; i < RINGS.length; i++) {
    const r = RINGS[i];
    const col = ringColor(r.set ? th.cb : th.c, viz.lvl[r.level]);
    if (col !== lastCol[i]) { lastCol[i] = col; els[i].setAttribute(r.fill ? 'fill' : 'stroke', col); }
    if (r.rot) {
      const tr = `rotate(${viz.deg[i].toFixed(2)} 194 194)`;
      if (tr !== lastTr[i]) { lastTr[i] = tr; els[i].setAttribute('transform', tr); }
    }
  }

  if (S.haptic && src && inTg && tg.HapticFeedback && viz.norm[0] - viz.avg[0] > 0.22 && now - lastHap > 140) {
    lastHap = now;
    try { tg.HapticFeedback.impactOccurred('light'); } catch {}
  }
}

applyAll();
autoConnectPc();
requestAnimationFrame(frame);

// для отладки/тестов
window.__sk = { viz, get src() { return src; }, get S() { return S; } };
