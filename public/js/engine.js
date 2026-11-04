// Порт расчётной цепочки Skycoder (PeakX -> NormX -> AvgX -> DriveX -> LvlX + MeasureRotate*).
// Rainmeter обновляет скин каждые 15 мс, поэтому все «покадровые» коэффициенты масштабируются на dt/15.

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const TICK_MS = 15;
export const SCALE = 1.8; // как SCALE в settings.inc: влияет на период вращения
// Верх шкалы анализатора в dB. Rainmeter Sensitivity = ширина окна в dB ниже этого значения.
export const TOP_DB = -22;
// Музыка к высоким частотам тише на десятки dB; поднимаем верхние полосы, чтобы они не были «мёртвыми».
export const TILT_DB = 2.5; // dB на номер полосы

export function dbToLevel(db, sens, band) {
  return clamp(1 + (db + TILT_DB * band - TOP_DB) / sens, 0, 1);
}

export class Visualizer {
  constructor() {
    this.reset();
  }

  reset() {
    this.sm = new Float32Array(10); // сглаженные уровни 10 полос (0..1)
    this.peak = [0, 0, 0, 0];
    this.norm = [0, 0, 0, 0];
    this.avg = [0, 0, 0, 0];
    this.drive = [0, 0, 0, 0];
    this.lvl = [0, 0, 0, 0];
    this.rot = new Float64Array(8); // накопленное вращение колец
    this.deg = new Float64Array(8); // угол для отрисовки
  }

  /**
   * @param {number} dt  мс с прошлого кадра
   * @param {ArrayLike<number>} levels  10 уровней 0..1 (после чувствительности)
   * @param {object} p  параметры режима/настроек
   * @param {Array} rings  описание колец из data.js
   */
  step(dt, levels, p, rings) {
    const steps = dt / TICK_MS;

    // Attack/Decay (мс), 0 = мгновенно
    for (let i = 0; i < 10; i++) {
      const v = levels[i] || 0;
      const t = v > this.sm[i] ? p.att : p.dec;
      const k = t <= 0 ? 1 : 1 - Math.exp(-dt / t);
      this.sm[i] += (v - this.sm[i]) * k;
    }

    const pf = Math.pow(p.peakFall, steps);
    const ak = 1 - Math.pow(0.92, steps);
    for (let g = 0; g < 4; g++) {
      const v = this.sm[p.bands[g]];
      this.peak[g] = Math.max(this.peak[g] * pf, v);
      const norm = clamp((v * p.mult) / (1 + p.autoGain * (Math.max(this.peak[g], p.autoFloor) - 1)), 0, 1.5);
      this.norm[g] = norm;
      this.avg[g] += (norm - this.avg[g]) * ak;
      this.drive[g] = clamp(
        Math.pow(norm, p.contrast) + p.punch * clamp((norm - this.avg[g]) * 4, 0, 1),
        0,
        1.5
      );
      this.lvl[g] = clamp(p.idle + (1 - p.idle) * this.drive[g], 0, 1);
    }

    // вращение
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i].rot;
      if (!r) continue;
      const M = r.s * SCALE;
      const inc = (this.drive[r.drive] * (r.i * SCALE) + 1) * p.speed * steps;
      this.rot[i] = Math.min((this.rot[i] % M) + inc, M);
      this.deg[i] = r.dir * (this.rot[i] / M) * 360;
    }
  }
}

// Цвет кольца: от чёрного (Default 0,0,0) к цвету темы по уровню группы
export function ringColor(rgb, lvl) {
  return `rgb(${(rgb[0] * lvl) | 0},${(rgb[1] * lvl) | 0},${(rgb[2] * lvl) | 0})`;
}

// Синтетический «бит» для демо на стартовом экране (уровни 0..1 по 10 полосам)
export function demoLevels(tMs, out) {
  const t = tMs / 1000;
  const beat = (t * 2) % 1; // 120 BPM
  const kick = Math.exp(-beat * 5);
  const off = ((t * 2 + 0.5) % 1);
  const snare = Math.exp(-off * 7) * (Math.floor(t * 2) % 2 ? 1 : 0.0);
  const hat = Math.exp(-(((t * 4) % 1)) * 9);
  for (let i = 0; i < 10; i++) {
    const low = i < 4 ? kick * (1 - i * 0.12) : 0;
    const mid = i >= 3 && i < 7 ? snare * 0.9 + 0.12 * Math.sin(t * 1.3 + i) : 0;
    const hi = i >= 6 ? hat * 0.7 : 0;
    out[i] = clamp(low + mid + hi, 0, 1);
  }
  return out;
}
