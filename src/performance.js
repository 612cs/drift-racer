// Called only when the viewport, quality, DPR or pixel budget changes.
export function canvasSize(cssWidth, cssHeight, devicePixelRatio = 1, quality = 'high', pixelBudget = Infinity) {
  const width = Math.max(1, Math.round(cssWidth));
  const height = Math.max(1, Math.round(cssHeight));
  let dpr = Math.min(quality === 'low' ? 1 : 2, devicePixelRatio || 1);
  let pixelWidth = Math.max(1, Math.round(width * dpr));
  let pixelHeight = Math.max(1, Math.round(height * dpr));
  if (Number.isFinite(pixelBudget)) {
    // A canvas needs at least one pixel, including for sub-pixel budgets.
    const budget = Math.max(1, Math.floor(pixelBudget));
    if (pixelWidth * pixelHeight > budget) {
      dpr = Math.min(dpr, Math.sqrt(budget / (width * height)));
      pixelWidth = Math.max(1, Math.floor(width * dpr));
      pixelHeight = Math.max(1, Math.floor(height * dpr));
      // Extremely thin viewports can hit the one-pixel minimum on one axis.
      if (pixelWidth * pixelHeight > budget) {
        if (pixelWidth >= pixelHeight) pixelWidth = Math.max(1, Math.floor(budget / pixelHeight));
        else pixelHeight = Math.max(1, Math.floor(budget / pixelWidth));
      }
    }
  }
  return { width, height, pixelWidth, pixelHeight, dpr };
}

const SAMPLE_COUNT = 60;
const MIN_SAMPLES = 30;
const MAX_GAP_MS = 250;
const DOWN_FRAME_MS = 18.5;
const UP_FRAME_MS = 17.2;
const DOWN_WAIT_MS = 1000;
const UP_WAIT_MS = 4000;
const LOW_HOLD_MS = 5000;

export class AdaptiveQuality {
  constructor() {
    this.samples = new Float64Array(SAMPLE_COUNT);
    this.reset();
  }

  reset() {
    this.quality = 'high';
    this.lastNow = null;
    this.changedAt = null;
    this.clearSamples();
  }

  clearSamples() {
    this.cursor = 0;
    this.count = 0;
    this.sum = 0;
    this.slowSince = null;
    this.fastSince = null;
  }

  update(frameMs, nowMs) {
    if (!Number.isFinite(nowMs)) return this.quality;
    const gap = this.lastNow === null ? 0 : nowMs - this.lastNow;
    this.lastNow = nowMs;
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > MAX_GAP_MS || gap > MAX_GAP_MS || gap < 0) {
      // Pauses/background time do not count as bad frames or recovery time.
      this.clearSamples();
      this.changedAt = nowMs;
      return this.quality;
    }
    if (this.changedAt === null) this.changedAt = nowMs;
    // A one-off stall cannot dominate the moving average for a full window.
    const sample = Math.min(frameMs, 50);
    if (this.count === SAMPLE_COUNT) this.sum -= this.samples[this.cursor];
    else this.count++;
    this.samples[this.cursor] = sample;
    this.sum += sample;
    this.cursor = (this.cursor + 1) % SAMPLE_COUNT;
    if (this.count < MIN_SAMPLES) return this.quality;

    const average = this.sum / this.count;
    if (this.quality === 'high') {
      if (average < DOWN_FRAME_MS) this.slowSince = null;
      else {
        if (this.slowSince === null) this.slowSince = nowMs;
        if (nowMs - this.slowSince >= DOWN_WAIT_MS) {
          this.quality = 'low';
          this.changedAt = nowMs;
          this.slowSince = null;
          this.fastSince = null;
        }
      }
    } else {
      if (average > UP_FRAME_MS) this.fastSince = null;
      else {
        if (this.fastSince === null) this.fastSince = nowMs;
        if (nowMs - this.fastSince >= UP_WAIT_MS && nowMs - this.changedAt >= LOW_HOLD_MS) {
          this.quality = 'high';
          this.changedAt = nowMs;
          this.slowSince = null;
          this.fastSince = null;
        }
      }
    }
    return this.quality;
  }
}
