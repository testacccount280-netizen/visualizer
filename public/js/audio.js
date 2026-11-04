// Источники звука. Единый интерфейс: read(outDb: Float32Array(10)) -> заполняет dB по 10 полосам, stop().

export const FREQ_MIN = 47;
export const FREQ_MAX = 14000;
export const BANDS = 10;

const AC = window.AudioContext || window.webkitAudioContext;

const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export function canMic() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && AC);
}
export function canDisplay() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && AC);
}

// AudioContext создаём синхронно, пока действует жест пользователя (иначе iOS/Safari оставят его «спящим»)
function makeCtx() {
  const c = new AC();
  if (c.resume) c.resume().catch(() => {});
  return c;
}

export async function startMic() {
  const ctx = makeCtx();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...RAW_AUDIO, channelCount: 1 }, video: false });
    return new LocalSource(stream, ctx);
  } catch (e) {
    try { ctx.close(); } catch {}
    throw e;
  }
}

export async function startDisplay() {
  const ctx = makeCtx();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1, width: 320, height: 180 },
      audio: { ...RAW_AUDIO, channelCount: 2 },
      systemAudio: 'include',
    });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      const e = new Error('no-audio-track');
      e.name = 'NoAudioTrack';
      throw e;
    }
    return new LocalSource(stream, ctx);
  } catch (e) {
    try { ctx.close(); } catch {}
    throw e;
  }
}

// Анализ MediaStream: 10 логарифмических полос 47..14000 Гц (как AudioLevel в Rainmeter)
export class LocalSource {
  constructor(stream, ctx) {
    this.stream = stream;
    this.ctx = ctx || new AC();
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 2048;
    this.an.smoothingTimeConstant = 0;
    this.an.minDecibels = -120;
    this.an.maxDecibels = 0;
    // звук в динамики НЕ подключаем, чтобы не было эха/удвоения
    const audioOnly = new MediaStream(stream.getAudioTracks());
    this.node = this.ctx.createMediaStreamSource(audioOnly);
    this.node.connect(this.an);
    this.buf = new Float32Array(this.an.frequencyBinCount);
    this.edges = [];
    const nyq = this.ctx.sampleRate / 2;
    const n = this.buf.length;
    const ratio = Math.pow(FREQ_MAX / FREQ_MIN, 1 / BANDS);
    for (let b = 0; b < BANDS; b++) {
      const f0 = FREQ_MIN * Math.pow(ratio, b);
      const f1 = f0 * ratio;
      const lo = Math.min(n - 2, Math.floor((f0 / nyq) * n));
      const hi = Math.min(n - 1, Math.max(lo + 1, Math.ceil((f1 / nyq) * n)));
      this.edges.push([lo, hi]);
    }
    this.onEnded = null;
    stream.getTracks().forEach((t) => t.addEventListener('ended', () => this.onEnded && this.onEnded()));
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  read(out) {
    this.an.getFloatFrequencyData(this.buf);
    for (let b = 0; b < BANDS; b++) {
      const [lo, hi] = this.edges[b];
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += Math.pow(10, this.buf[i] / 10);
      out[b] = 10 * Math.log10(sum / (hi - lo) + 1e-12);
    }
    return out;
  }

  stop() {
    try { this.node.disconnect(); } catch {}
    this.stream.getTracks().forEach((t) => t.stop());
    try { this.ctx.close(); } catch {}
  }
}

// dB (-100..0) <-> байт для передачи по WebSocket
export const dbToByte = (db) => Math.max(0, Math.min(255, Math.round(((db + 100) / 100) * 255)));
export const byteToDb = (b) => (b / 255) * 100 - 100;

export function wsUrl(role, room) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws?role=${role}&room=${encodeURIComponent(room)}`;
}

export const CODE_RE = /^[A-Z0-9]{6}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => ALPHABET[x % ALPHABET.length]).join('');
}

// Приём полос с компьютера через релей
export class RelaySource {
  constructor(code, onStatus) {
    this.code = code;
    this.onStatus = onStatus || (() => {});
    this.db = new Float32Array(BANDS).fill(-100);
    // Сеть доставляет пакеты неровно (по 2-3 сразу, потом пауза). Между кадрами копим максимум пакетов,
    // чтобы удар не терялся, если вслед за ним в тот же кадр пришёл более тихий пакет.
    this.peak = new Float32Array(BANDS).fill(-100);
    this.pending = false;
    this.peakHold = true;
    this.last = 0;
    this.hostOn = false;
    this.closed = false;
    this.retry = 1000;
    this.open();
  }

  open() {
    if (this.closed) return;
    this.onStatus('connecting');
    const ws = new WebSocket(wsUrl('view', this.code));
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.onStatus(this.hostOn ? 'live' : 'waiting');
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const m = JSON.parse(e.data);
          if (m.t === 'host') {
            this.hostOn = !!m.on;
            this.onStatus(this.hostOn ? 'live' : 'waiting');
          }
        } catch {}
        return;
      }
      const b = new Uint8Array(e.data);
      if (b.length < BANDS) return;
      if (this.peakHold) {
        for (let i = 0; i < BANDS; i++) {
          const v = byteToDb(b[i]);
          this.peak[i] = this.pending && this.peak[i] > v ? this.peak[i] : v;
        }
        this.pending = true;
      } else {
        for (let i = 0; i < BANDS; i++) this.db[i] = byteToDb(b[i]);
      }
      this.last = performance.now();
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.hostOn = false;
      this.onStatus('connecting');
      setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 1.6, 6000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  read(out) {
    if (this.pending) {
      for (let i = 0; i < BANDS; i++) this.db[i] = this.peak[i];
      this.pending = false;
    }
    const stale = performance.now() - this.last > 500;
    for (let i = 0; i < BANDS; i++) out[i] = stale ? -100 : this.db[i];
    return out;
  }

  stop() {
    this.closed = true;
    try { this.ws.close(); } catch {}
  }
}
