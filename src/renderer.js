import { SEGMENT_LENGTH, segmentAt } from './data.js';

const VIEW_SEGMENTS = 142;
const CURVE_SCALE = .105;
const WIDTH_SCALE = 250;
const TAU = Math.PI * 2;
const BLUE = '#54d8ff';
const PURPLE = '#be86ff';
const GOLD = '#ffd363';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = (value, length) => ((value % length) + length) % length;

function quad(ctx, color, x1, y1, w1, x2, y2, w2) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x2 - w2, y2);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x1 + w1, y1);
  ctx.closePath();
  ctx.fill();
}

function line(ctx, color, width, x1, y1, x2, y2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function polygon(ctx, color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fill();
}

// Sprite coordinates are retained once, rather than rebuilt for each car/frame.
const HATCH = [-61,43,-72,16,-64,-25,-45,-52,45,-52,64,-25,72,16,61,43];
const SPORT = [-70,40,-79,14,-67,-13,-35,-43,35,-43,67,-13,79,14,70,40];
const DRIFTER = [-68,42,-76,15,-66,-25,-42,-48,42,-48,66,-25,76,15,68,42];
const PROTOTYPE = [-72,43,-81,13,-63,-8,-31,-51,31,-51,63,-8,81,13,72,43];
const HATCH_GLASS = [-48,-23,-34,-43,34,-43,48,-23];
const SPORT_GLASS = [-45,-10,-29,-34,29,-34,45,-10];
const PROTO_GLASS = [-38,-9,-23,-39,23,-39,38,-9];
const BODY_OPTIONS = Object.freeze({ paint: 'standard' });

/** Rear-facing procedural sprite; (x,y) is its centre, scale 1 is ~160px wide. */
export function drawCar(ctx, car, x, y, scale, angle = 0, options = BODY_OPTIONS) {
  const body = car.body;
  const prototype = body === 'prototype';
  const sport = body === 'sport';
  const drifter = body === 'drifter';
  const ghost = options.ghost || options.paint === 'ghost';
  const paint = options.paint === 'aurora' ? '#80eadb' : ghost ? '#a4eeff' : car.color;
  const time = options.time || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(angle * .48);
  ctx.transform(1, 0, -Math.sin(angle) * .18, 1, 0, 0);
  if (ghost) ctx.globalAlpha *= options.ghost ? .46 : .76;
  if (options.shadow !== false) {
    ctx.fillStyle = ghost ? '#70def72b' : '#00000065';
    ctx.beginPath();
    ctx.ellipse(0, 47, 83, 13, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#070a12';
  ctx.fillRect(-76, 8, 14, 36);
  ctx.fillRect(62, 8, 14, 36);
  if (prototype) {
    ctx.fillStyle = GOLD;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 12;
    ctx.fillRect(-77, 20, 5, 19);
    ctx.fillRect(72, 20, 5, 19);
    ctx.shadowBlur = 0;
  }
  polygon(ctx, paint, prototype ? PROTOTYPE : sport ? SPORT : drifter ? DRIFTER : HATCH);
  ctx.fillStyle = '#050a1740';
  ctx.fillRect(-60, 15, 120, 22);
  polygon(ctx, '#122337', prototype ? PROTO_GLASS : sport ? SPORT_GLASS : HATCH_GLASS);
  line(ctx, '#bbe2f58a', 2, -30, sport ? -30 : -40, 27, sport ? -30 : -40);
  line(ctx, '#ffffff65', 2, -61, -12, -67, 12);
  line(ctx, '#ffffff65', 2, 61, -12, 67, 12);
  line(ctx, '#ffffff4a', 2, -58, 7, 58, 7);
  ctx.fillStyle = '#08101c';
  ctx.fillRect(-61, 32, 122, 13);
  ctx.fillStyle = '#f6f7ed';
  ctx.fillRect(-13, 33, 26, 9);
  ctx.fillStyle = '#3a4759';
  ctx.fillRect(-9, 36, 18, 2);
  ctx.shadowColor = '#ff4b61';
  ctx.shadowBlur = options.brake ? 16 : 5;
  ctx.fillStyle = options.brake ? '#ff8496' : '#ff4159';
  if (prototype) {
    ctx.fillRect(-66, 20, 132, 3);
    ctx.fillStyle = '#ffe5a0';
    ctx.fillRect(-48, -4, 96, 2);
  } else if (sport) {
    for (let i = 0; i < 2; i++) {
      ctx.beginPath(); ctx.ellipse(-54 + i * 15, 22, 5, 4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(54 - i * 15, 22, 5, 4, 0, 0, TAU); ctx.fill();
    }
  } else {
    ctx.fillRect(-61, 18, drifter ? 27 : 22, 8);
    ctx.fillRect(drifter ? 34 : 39, 18, drifter ? 27 : 22, 8);
  }
  ctx.shadowBlur = 0;
  if (drifter || prototype) {
    ctx.fillStyle = '#111722';
    ctx.fillRect(-53, 1, 8, 11);
    ctx.fillRect(45, 1, 8, 11);
    ctx.fillStyle = prototype ? '#e8be63' : '#c7a4fb';
    ctx.fillRect(-79, -1, 158, 7);
    line(ctx, '#ffffff6a', 1, -75, 0, 75, 0);
  }
  if (options.paint === 'aurora') {
    line(ctx, '#ffb1ee', 4, -51, -14, -35, 27);
    line(ctx, '#b4ffdf', 3, 48, -14, 33, 27);
  }
  ctx.fillStyle = '#777d91';
  ctx.fillRect(-47, 40, 10, 6);
  ctx.fillRect(37, 40, 10, 6);
  if (options.nitro) {
    const flicker = 13 + Math.sin(time * 61) * 6;
    ctx.shadowColor = BLUE;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#4ecfff';
    for (let side = -1; side <= 1; side += 2) {
      const exhaust = side * 42;
      ctx.beginPath();
      ctx.moveTo(exhaust - 7, 45); ctx.lineTo(exhaust + 7, 45);
      ctx.lineTo(exhaust + 4, 62); ctx.lineTo(exhaust, 73 + flicker);
      ctx.lineTo(exhaust - 4, 62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eafcff'; ctx.fillRect(exhaust - 3, 46, 6, 15);
      ctx.fillStyle = '#4ecfff';
    }
  }
  ctx.restore();
}

class ParticlePool {
  constructor(capacity) {
    this.capacity = capacity;
    this.cursor = 0;
    this.z = new Float32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.type = new Uint8Array(capacity);
    this.color = new Uint8Array(capacity);
  }
  clear() { this.life.fill(0); }
  emit(z, x, type, color) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    this.z[i] = z;
    this.x[i] = x;
    this.y[i] = type === 1 ? .03 : .18;
    this.vx[i] = type === 1 ? 0 : (Math.random() - .5) * 1.6;
    this.vy[i] = type === 1 ? 0 : type === 2 ? 1.7 + Math.random() : .65;
    this.age[i] = 0;
    this.life[i] = type === 1 ? 1.8 : type === 2 ? .48 : .9;
    this.type[i] = type;
    this.color[i] = color;
  }
  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.life[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.life[i] = 0; continue; }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      if (this.type[i] === 2) this.vy[i] -= 5 * dt;
    }
  }
}

const COLORS = [BLUE, PURPLE, GOLD];
const THEMES = {
  coast: { ground: '#294145', alternate: '#2c494b', road: '#303b4c', roadAlt: '#344052', edge: '#eabdb0', stripe: '#fae5c8', fog: '#d48782', skyTop: '#17162f', skyBottom: '#df8f79' },
  mountain: { ground: '#19312e', alternate: '#1d3731', road: '#283b3f', roadAlt: '#2d4044', edge: '#91a39b', stripe: '#dfd5b5', fog: '#88aaa5', skyTop: '#101e32', skyBottom: '#7faaa5' },
  city: { ground: '#080d20', alternate: '#0b1027', road: '#20213b', roadAlt: '#26253f', edge: '#ec6ccb', stripe: '#b7bdde', fog: '#2e204d', skyTop: '#060b20', skyBottom: '#3a2458' },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.track = null;
    this.previousTime = null;
    this.previousZ = 0;
    this.emitTime = 0;
    this.dayBucket = -1;
    this.sky = null;
    this.edgeGlow = null;
    this.low = false;
    this.boostBlur = null;
    this.x = new Float64Array(VIEW_SEGMENTS + 1);
    this.y = new Float64Array(VIEW_SEGMENTS + 1);
    this.w = new Float64Array(VIEW_SEGMENTS + 1);
    this.scale = new Float64Array(VIEW_SEGMENTS + 1);
    this.rawX = new Float64Array(VIEW_SEGMENTS + 1);
    this.clip = new Float64Array(VIEW_SEGMENTS + 1);
    this.indices = new Uint16Array(VIEW_SEGMENTS + 1);
    this.visible = new Uint8Array(VIEW_SEGMENTS + 1);
    this.particles = new ParticlePool(320);
    this.carOptions = { paint: 'standard', time: 0, nitro: false, shadow: true, brake: false };
    this.ghostOptions = { paint: 'ghost', ghost: true, shadow: false, time: 0 };
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 1280));
    const height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 720));
    const dpr = Math.min(this.low ? 1 : 2, globalThis.devicePixelRatio || 1);
    if (this.width === width && this.height === height && this.dpr === dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.dayBucket = -1;
    const edge = this.ctx.createLinearGradient(0, 0, width, 0);
    edge.addColorStop(0, '#76cfff30');
    edge.addColorStop(.13, '#63a9ff00');
    edge.addColorStop(.87, '#63a9ff00');
    edge.addColorStop(1, '#b777ff38');
    this.edgeGlow = edge;
  }

  render(state, options = {}) {
    const time = options.time || 0;
    this.low = options.quality === 'low' || (options.quality !== 'high' && this.width < 700);
    this.resize();
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    let dt = this.previousTime === null ? 0 : clamp(time - this.previousTime, 0, .07);
    this.previousTime = time;
    if (state.phase === 'paused' || state.phase === 'result') dt = 0;
    if (this.track !== state.track || Math.abs(state.z - this.previousZ) > state.track.length * .65) {
      this.dayBucket = -1;
      this.particles.clear();
      this.emitTime = 0;
    }
    this.track = state.track;
    this.previousZ = state.z;
    const theme = THEMES[state.track.theme] || THEMES.coast;
    this.time = time;
    this.focal = H * 1.35 * (state.nitroTimer > 0 ? .94 + Math.sin(time * 31) * .004 : 1);
    this.horizon = H * .46;
    this.cameraDistance = Math.max(14, H / W * 15.5);
    this.cameraZ = state.z - this.cameraDistance;
    const playerIndex = Math.floor(wrap(state.z, state.track.length) / SEGMENT_LENGTH);
    const fraction = wrap(state.z, SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const here = state.track.segments[playerIndex];
    const next = state.track.segments[(playerIndex + 1) % state.track.segments.length];
    this.playerY = here.y + (next.y - here.y) * fraction;
    this.cameraSlope = (next.y - here.y) / SEGMENT_LENGTH;
    this.cameraY = this.playerY - this.cameraSlope * this.cameraDistance + this.cameraDistance * H * .36 / this.focal;
    this.cameraX = state.x * here.width / WIDTH_SCALE;
    this.prepareGeometry(state.track);
    const shake = clamp(state.shake || 0, 0, 1) * 10 + (state.boostTimer > 0 ? 1.5 : 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    if (shake) ctx.translate(Math.sin(time * 97) * shake, Math.cos(time * 83) * shake * .55);
    this.drawSky(state.track.theme, theme, time, here.curve);
    if (here.tunnel) this.drawTunnelInterior(state.track);
    this.drawRoad(state, options, theme);
    this.particles.update(dt);
    const drift = state.driftTime > 0 && state.speed > 20;
    if (drift && dt) {
      this.emitTime += dt;
      const cadence = this.low ? .055 : .022;
      const color = options.goldTrail || state.combo >= 3 ? 2 : state.combo >= 2 ? 1 : 0;
      while (this.emitTime >= cadence) {
        this.emitTime -= cadence;
        for (let side = -1; side <= 1; side += 2) {
          const tireX = state.x * here.width / WIDTH_SCALE + side * .76;
          const z = wrap(state.z - .9 - this.emitTime * state.speed / 3.6, state.track.length);
          this.particles.emit(z, tireX, 1, color);
          this.particles.emit(z, tireX, 0, color);
          if (color === 2 && !this.low) this.particles.emit(z, tireX, 2, color);
        }
      }
    } else this.emitTime = 0;
    this.drawGhost(state);
    this.drawParticles(state.track);
    if (!options.preview) this.drawPlayer(state, options);
    this.drawVelocity(state, time);
    ctx.restore();
  }

  prepareGeometry(track) {
    const start = Math.floor(this.cameraZ / SEGMENT_LENGTH);
    this.startZ = start * SEGMENT_LENGTH;
    let center = 0;
    let delta = -segmentAt(track, this.cameraZ).curve * CURVE_SCALE * wrap(this.cameraZ, SEGMENT_LENGTH) / SEGMENT_LENGTH;
    for (let i = 0; i <= VIEW_SEGMENTS; i++) {
      const index = wrap(start + i, track.segments.length);
      this.indices[i] = index;
      this.rawX[i] = center;
      center += delta;
      delta += track.segments[index].curve * CURVE_SCALE;
    }
    const playerPoint = (this.cameraZ + this.cameraDistance - this.startZ) / SEGMENT_LENGTH;
    const p = Math.floor(playerPoint);
    const t = playerPoint - p;
    this.roadOrigin = this.rawX[p] + (this.rawX[p + 1] - this.rawX[p]) * t;
    let highest = this.height;
    for (let i = 0; i <= VIEW_SEGMENTS; i++) {
      const segment = track.segments[this.indices[i]];
      const distance = this.startZ + i * SEGMENT_LENGTH - this.cameraZ;
      const scale = distance > .5 ? this.focal / distance : 0;
      this.scale[i] = scale;
      this.x[i] = this.width * .5 + (this.rawX[i] - this.roadOrigin - this.cameraX) * scale;
      this.y[i] = scale ? this.horizon + (this.cameraY + this.cameraSlope * distance - segment.y) * scale : this.height * 100;
      this.w[i] = segment.width / WIDTH_SCALE * scale;
      this.clip[i] = highest;
      this.visible[i] = 0;
      if (i > 0 && this.scale[i] && this.scale[i - 1] && this.y[i] < this.y[i - 1] && this.y[i] < highest) {
        this.visible[i - 1] = 1;
        highest = Math.min(highest, this.y[i]);
      }
    }
  }

  drawSky(kind, theme, time, curve) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const horizon = this.horizon;
    const day = .5 + .5 * Math.cos(time / 52);
    const bucket = Math.floor(day * 48);
    if (bucket !== this.dayBucket) {
      this.dayBucket = bucket;
      this.sky = ctx.createLinearGradient(0, 0, 0, horizon + H * .16);
      this.sky.addColorStop(0, theme.skyTop);
      this.sky.addColorStop(.65, kind === 'coast' ? '#634265' : kind === 'mountain' ? '#405d69' : '#1c163d');
      this.sky.addColorStop(1, theme.skyBottom);
    }
    ctx.fillStyle = this.sky;
    ctx.fillRect(-12, -12, W + 24, H + 24);
    ctx.fillStyle = '#030716';
    ctx.globalAlpha = (1 - day) * (kind === 'city' ? .28 : .58);
    ctx.fillRect(-12, -12, W + 24, H + 24);
    ctx.globalAlpha = 1;
    if (day < .58 || kind === 'city') {
      ctx.fillStyle = '#c1d9ff';
      ctx.globalAlpha = kind === 'city' ? .6 : .7 * (1 - day);
      for (let i = 0; i < (this.low ? 22 : 65); i++) {
        const x = ((i * 173.31) % 997) / 997 * W;
        const y = ((i * i * 19.7 + 31) % 283) / 283 * horizon * .7;
        ctx.fillRect(x, y, i % 8 === 0 ? 2 : 1, i % 8 === 0 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
    }
    const sunX = W * .73 - curve * W * .025;
    const sunY = horizon - H * (.11 + .04 * day);
    const radius = Math.min(W * .083, H * .12);
    if (kind === 'coast') {
      ctx.fillStyle = '#ffbd9b';
      ctx.beginPath(); ctx.arc(sunX, sunY, radius, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ad6c853b';
      for (let i = 0; i < 6; i++) ctx.fillRect(sunX - radius, sunY + i * radius * .15, radius * 2, 3 + i);
      ctx.fillStyle = '#397078';
      ctx.fillRect(0, horizon - 2, W, H - horizon + 2);
      ctx.globalAlpha = .18;
      ctx.fillStyle = '#ffcfa5';
      for (let i = 0; i < 25; i++) {
        const y = horizon + 4 + i * i * .48;
        const width = radius * .3 + i * 6;
        ctx.fillRect(sunX - width * .5 + Math.sin(i * 4 + time) * 7, y, width, 1 + i * .07);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'city') {
      ctx.fillStyle = '#efd9ff';
      ctx.beginPath(); ctx.arc(W * .78, horizon - H * .23, H * .035, 0, TAU); ctx.fill();
      this.drawSkyline(curve, horizon);
    }
    if (kind !== 'city') {
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = kind === 'coast' ? (layer === 0 ? '#7c6d87' : layer === 1 ? '#555d78' : '#354d63') : (layer === 0 ? '#6c898e' : layer === 1 ? '#456970' : '#2b5159');
        ctx.beginPath();
        ctx.moveTo(-W * .1, horizon + H * .08);
        for (let i = -2; i <= 24; i++) {
          const x = i * W / 22 - curve * W * .025 * (layer + 1);
          const peak = Math.sin(i * .93 + layer * 1.2) * .5 + Math.sin(i * 1.91 + layer) * .24;
          const y = horizon - (kind === 'mountain' ? H * .12 : H * .025) * (1 + peak) * (1 - layer * .15) + layer * 13;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W * 1.1, horizon + H * .08);
        ctx.closePath(); ctx.fill();
      }
    }
    if (kind === 'mountain') {
      ctx.fillStyle = '#cee5de';
      ctx.globalAlpha = .13;
      ctx.fillRect(0, horizon - H * .035, W, H * .075);
      ctx.globalAlpha = 1;
    }
  }

  drawSkyline(curve, horizon) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    ctx.fillStyle = '#090e23';
    ctx.fillRect(0, horizon, W, H - horizon);
    for (let layer = 0; layer < 2; layer++) {
      for (let i = -2; i < 35; i++) {
        const width = W / 31 * (.6 + ((i * i + 7) % 8) / 10);
        const height = H * (.055 + ((i * i * 13 + layer * 19 + 97) % 101) / 101 * .19);
        const x = i * W / 30 - curve * W * .03 * (layer + 1);
        const y = horizon - height + layer * 20;
        ctx.fillStyle = layer ? '#10142d' : '#22223f';
        ctx.fillRect(x, y, width, height);
        if (i % 5 === 0) {
          line(ctx, i % 2 ? '#f05baa' : '#67cce1', 1, x, y, x + width, y);
          line(ctx, '#656d9b', 1, x + width * .5, y, x + width * .5, y - 18);
        }
        if (!this.low) {
          ctx.fillStyle = i % 3 ? '#6c83a74f' : '#eb87dd70';
          for (let yy = y + 9; yy < horizon; yy += 13) {
            for (let xx = x + 5; xx < x + width - 2; xx += 8) {
              if (Math.floor(xx + yy) % 3) ctx.fillRect(xx, yy, 2, 4);
            }
          }
        }
      }
    }
    // A distant intersecting deck sells the multi-level skyway.
    line(ctx, '#3b3458', 5, 0, horizon + 14, W, horizon - 11);
    line(ctx, '#7e61aa', 1, 0, horizon + 11, W, horizon - 14);
  }

  drawRoad(state, options, theme) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const track = state.track;
    const city = track.theme === 'city';
    const mountain = track.theme === 'mountain';
    const drawDistance = (VIEW_SEGMENTS - 1) * SEGMENT_LENGTH;
    for (let i = VIEW_SEGMENTS - 1; i >= 0; i--) {
      if (!this.visible[i]) continue;
      const segment = track.segments[this.indices[i]];
      let y1 = this.y[i];
      const y2 = this.y[i + 1];
      let x1 = this.x[i];
      const x2 = this.x[i + 1];
      let w1 = this.w[i];
      const w2 = this.w[i + 1];
      const ceiling = Math.min(H, this.clip[i + 1]);
      if (y1 > ceiling) {
        const fraction = (y1 - ceiling) / (y1 - y2);
        x1 += (x2 - x1) * fraction;
        w1 += (w2 - w1) * fraction;
        y1 = ceiling;
      }
      if (y1 <= y2) continue;
      const alternating = Math.floor(this.indices[i] / 3) % 2;
      if (!city) {
        ctx.fillStyle = segment.tunnel ? (alternating ? '#1e2b33' : '#17252d') : alternating ? theme.alternate : theme.ground;
        ctx.fillRect(0, y2, W, y1 - y2 + .5);
        if (track.theme === 'coast') {
          quad(ctx, '#bdab88', x1, y1, w1 * 1.34, x2, y2, w2 * 1.34);
          // Ocean remains visible along the seaward shoulder.
          ctx.fillStyle = alternating ? '#336974' : '#376f78';
          ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(x1 - w1 * 1.75, y1);
          ctx.lineTo(x2 - w2 * 1.75, y2); ctx.lineTo(0, y2); ctx.fill();
        }
      } else {
        quad(ctx, '#10172b', x1, y1 + w1 * .11, w1 * 1.12, x2, y2 + w2 * .11, w2 * 1.12);
        quad(ctx, '#4b4663', x1, y1, w1 * 1.1, x2, y2, w2 * 1.1);
      }
      quad(ctx, alternating ? '#515566' : theme.edge, x1, y1, w1 * 1.045, x2, y2, w2 * 1.045);
      quad(ctx, segment.tunnel ? (alternating ? '#242e36' : '#202a32') : alternating ? theme.roadAlt : theme.road, x1, y1, w1, x2, y2, w2);
      const edgeStripe = city ? '#7b659c' : '#ebd9b7';
      for (let side = -1; side <= 1; side += 2) {
        quad(ctx, edgeStripe, x1 + side * w1 * .93, y1, w1 * .006, x2 + side * w2 * .93, y2, w2 * .006);
      }
      if (Math.floor(this.indices[i] / 2) % 3 !== 0) {
        const lanes = track.theme === 'coast' ? 4 : mountain ? 1 : 3;
        for (let lane = 1; lane < lanes; lane++) {
          const offset = -1 + lane * 2 / lanes;
          quad(ctx, theme.stripe, x1 + w1 * offset, y1, w1 * .006, x2 + w2 * offset, y2, w2 * .006);
        }
      }
      if (options.idealLine && (state.mode === 'practice' || options.practice) && this.indices[i] % 3 !== 0) {
        const ideal = -segment.curve * .38;
        const farIdeal = -track.segments[this.indices[i + 1]].curve * .38;
        quad(ctx, '#73f3cba8', x1 + w1 * ideal, y1, w1 * .013, x2 + w2 * farIdeal, y2, w2 * .013);
      }
      if (segment.jump) {
        quad(ctx, alternating ? '#e6b37b' : '#3b2b43', x1, y1, w1 * .88, x2, y2, w2 * .88);
        for (let side = -1; side <= 1; side += 2) {
          line(ctx, '#ffd57a', Math.max(1, w1 * .009), x1 + side * w1 * .7, y1, x2 + side * w2 * .7, y2);
        }
      }
      const fog = segment.tunnel ? .08 : Math.pow(i * SEGMENT_LENGTH / drawDistance, mountain ? 1.1 : 2.1) * (mountain ? .8 : .52);
      ctx.fillStyle = theme.fog;
      ctx.globalAlpha = fog;
      if (city) quad(ctx, theme.fog, x1, y1, w1 * 1.1, x2, y2, w2 * 1.1);
      else ctx.fillRect(0, y2, W, y1 - y2 + .5);
      ctx.globalAlpha = 1;
      if (city || mountain || segment.tunnel) this.drawRail(i, x1, y1, w1, x2, y2, w2, city, segment.tunnel);
      if (segment.decor && !segment.tunnel && (!this.low || this.indices[i] % 2 === 0)) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, ceiling)); ctx.clip();
        this.drawScenery(track.theme, i, segment, fog);
        ctx.restore();
      }
      if (segment.tunnel && (this.indices[i] % 4 === 0 || !track.segments[wrap(this.indices[i] - 1, track.segments.length)].tunnel)) this.drawTunnel(i, ceiling);
      if (this.indices[i] === 0) {
        const tiles = 12;
        for (let j = 0; j < tiles; j++) {
          const offset = -1 + (j + .5) * 2 / tiles;
          quad(ctx, j % 2 ? '#eff1df' : '#121c2c', x1 + w1 * offset, y1, w1 / tiles, x2 + w2 * offset, y2, w2 / tiles);
        }
      }
    }
    if (segmentAt(track, state.z).tunnel) {
      ctx.fillStyle = '#020610'; ctx.globalAlpha = .2; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }

  drawRail(i, x1, y1, w1, x2, y2, w2, city, tunnel) {
    const ctx = this.ctx;
    const height1 = w1 * (city ? .11 : .075);
    const height2 = w2 * (city ? .11 : .075);
    for (let side = -1; side <= 1; side += 2) {
      const a = x1 + side * w1 * 1.08;
      const b = x2 + side * w2 * 1.08;
      quad(ctx, tunnel ? '#53616c' : city ? '#514b6d' : '#87948e', a, y1 - height1, w1 * .017, b, y2 - height2, w2 * .017);
      line(ctx, tunnel ? '#f4db9b' : city ? (side === -1 ? '#59cced' : '#df72d9') : '#c6d4c6', Math.max(1, w1 * .006), a, y1 - height1, b, y2 - height2);
      if (this.indices[i] % 3 === 0) line(ctx, city ? '#667387' : '#788987', Math.max(1, w1 * .012), a, y1, a, y1 - height1);
    }
  }

  drawScenery(kind, i, segment, fog) {
    const ctx = this.ctx;
    const scale = this.scale[i];
    if (scale < .6) return;
    ctx.globalAlpha = 1 - fog * .75;
    const half = this.w[i];
    const y = this.y[i];
    if (kind === 'coast') {
      this.drawPalm(this.x[i] + half * 1.52, y, scale * .055, this.indices[i] % 2 ? 1 : -1);
      if (this.indices[i] % 3 === 0) this.drawPalm(this.x[i] - half * 1.66, y, scale * .045, -1);
      if (this.indices[i] % 5 === 0) {
        const x = this.x[i] + half * 2;
        ctx.fillStyle = '#dae0cc'; ctx.fillRect(x, y - scale * 1.3, scale * .8, scale * 1.3);
        ctx.fillStyle = '#b87973'; ctx.fillRect(x - scale * .1, y - scale * 1.5, scale, scale * .25);
        ctx.fillStyle = '#244c59'; ctx.fillRect(x + scale * .2, y - scale, scale * .27, scale * .42);
      }
    } else if (kind === 'mountain') {
      for (let side = -1; side <= 1; side += 2) {
        const x = this.x[i] + side * half * 1.6;
        this.drawPine(x, y, scale * .066, this.indices[i] % 3 === 0 ? '#203e37' : '#285349');
        if (!this.low) this.drawPine(x + side * scale * 1.6, y + scale * .2, scale * .079, '#1b3a35');
      }
    } else {
      const side = this.indices[i] % 2 ? -1 : 1;
      const x = this.x[i] + side * half * 1.55;
      const tall = scale * 4;
      line(ctx, '#5b6382', Math.max(1, scale * .06), x, y, x, y - tall);
      line(ctx, '#df7bdd', Math.max(1, scale * .06), x, y - tall, x - side * scale * 1.2, y - tall);
      ctx.fillStyle = '#fcc8f1'; ctx.fillRect(x - side * scale * 1.2 - scale * .2, y - tall, scale * .4, scale * .08);
      if (this.indices[i] % 4 === 0) {
        const px = this.x[i] + side * half * 1.16;
        line(ctx, '#21243d', Math.max(2, scale * .26), px, y, px, y + scale * 8);
      }
    }
    if (Math.abs(segment.curve) > .6 && this.indices[i] % 3 === 0 && !segment.tunnel) {
      const direction = Math.sign(segment.curve);
      const x = this.x[i] - direction * half * 1.18;
      const size = scale * .75;
      ctx.fillStyle = '#111c2f'; ctx.fillRect(x - size * .5, y - size * 1.5, size, size * .7);
      line(ctx, '#f6d77c', Math.max(1, size * .08), x - direction * size * .18, y - size * 1.36, x + direction * size * .13, y - size * 1.15);
      line(ctx, '#f6d77c', Math.max(1, size * .08), x + direction * size * .13, y - size * 1.15, x - direction * size * .18, y - size * .94);
    }
    ctx.globalAlpha = 1;
  }

  drawPalm(x, y, scale, direction) {
    const ctx = this.ctx;
    if (x < -scale * 100 || x > this.width + scale * 100) return;
    const topX = x + direction * scale * 16;
    const topY = y - scale * 116;
    ctx.strokeStyle = '#80644f'; ctx.lineWidth = Math.max(1, scale * 7);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y - scale * 62, topX, topY); ctx.stroke();
    ctx.strokeStyle = '#224839'; ctx.lineWidth = Math.max(1, scale * 7);
    for (let leaf = 0; leaf < 7; leaf++) {
      const angle = leaf / 6 * Math.PI + Math.PI;
      ctx.beginPath(); ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(topX + Math.cos(angle) * scale * 44, topY + Math.sin(angle) * scale * 36, topX + Math.cos(angle) * scale * 61, topY + scale * 18);
      ctx.stroke();
    }
  }

  drawPine(x, y, scale, color) {
    const ctx = this.ctx;
    if (x < -scale * 60 || x > this.width + scale * 60) return;
    ctx.fillStyle = '#574d3c'; ctx.fillRect(x - 4 * scale, y - 25 * scale, 8 * scale, 25 * scale);
    ctx.fillStyle = color;
    for (let tier = 0; tier < 3; tier++) {
      const top = y - (125 - tier * 28) * scale;
      const width = (25 + tier * 12) * scale;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + width, top + scale * 57); ctx.lineTo(x - width, top + scale * 57); ctx.closePath(); ctx.fill();
    }
  }

  drawTunnel(i, ceiling) {
    const ctx = this.ctx;
    const x = this.x[i];
    const y = this.y[i];
    const w = this.w[i] * 1.16;
    const h = w * .95;
    if (w < 3) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, this.width, Math.max(0, ceiling)); ctx.clip();
    ctx.strokeStyle = '#4b6165'; ctx.lineWidth = Math.max(2, w * .08);
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w, y - h * .55);
    ctx.quadraticCurveTo(x - w, y - h, x, y - h);
    ctx.quadraticCurveTo(x + w, y - h, x + w, y - h * .55);
    ctx.lineTo(x + w, y); ctx.stroke();
    line(ctx, '#d4c491', Math.max(1, w * .016), x - w * .63, y - h * .78, x - w * .25, y - h * .91);
    line(ctx, '#d4c491', Math.max(1, w * .016), x + w * .63, y - h * .78, x + w * .25, y - h * .91);
    ctx.restore();
  }

  drawGhost(state) {
    const ghost = state.ghost;
    if (!ghost || !Number.isFinite(ghost.z) || !Number.isFinite(ghost.x)) return;
    const length = state.track.length;
    const relative = wrap(ghost.z - state.z + length * .5, length) - length * .5;
    if (relative < -this.cameraDistance + 2 || relative > 450) return;
    const distance = relative + this.cameraDistance;
    const location = (this.cameraZ + distance - this.startZ) / SEGMENT_LENGTH;
    const i = Math.floor(location);
    if (i < 0 || i >= VIEW_SEGMENTS || !this.scale[i]) return;
    const fraction = location - i;
    const center = this.rawX[i] + (this.rawX[i + 1] - this.rawX[i]) * fraction;
    const near = state.track.segments[this.indices[i]];
    const far = state.track.segments[this.indices[i + 1]];
    const elevation = near.y + (far.y - near.y) * fraction;
    const projection = this.focal / distance;
    const x = this.width * .5 + (center - this.roadOrigin - this.cameraX + ghost.x * near.width / WIDTH_SCALE) * projection;
    const groundY = this.horizon + (this.cameraY + this.cameraSlope * distance - elevation) * projection;
    if (groundY > this.clip[i] + 2 && i > 2) return;
    const carScale = clamp(projection * 2.15 / 160, .06, 2.8);
    const y = groundY - 46 * carScale - (ghost.jump || 0) * projection;
    this.ghostOptions.time = this.time;
    this.ctx.save();
    this.ctx.beginPath(); this.ctx.rect(0, 0, this.width, Math.min(this.height, this.clip[i])); this.ctx.clip();
    drawCar(this.ctx, state.car, x, y, carScale, ghost.angle || 0, this.ghostOptions);
    this.ctx.restore();
  }

  drawParticles(track) {
    const pool = this.particles;
    const ctx = this.ctx;
    for (let n = 0; n < pool.capacity; n++) {
      if (!pool.life[n]) continue;
      const distance = wrap(pool.z[n] - this.cameraZ, track.length);
      if (distance < 2 || distance > 350) continue;
      const location = (this.cameraZ + distance - this.startZ) / SEGMENT_LENGTH;
      const i = Math.floor(location);
      if (i < 0 || i >= VIEW_SEGMENTS) continue;
      const fraction = location - i;
      const center = this.rawX[i] + (this.rawX[i + 1] - this.rawX[i]) * fraction;
      const segment = track.segments[this.indices[i]];
      const far = track.segments[this.indices[i + 1]];
      const elevation = segment.y + (far.y - segment.y) * fraction;
      const projection = this.focal / distance;
      const x = this.width * .5 + (center - this.roadOrigin - this.cameraX + pool.x[n]) * projection;
      const y = this.horizon + (this.cameraY + this.cameraSlope * distance - elevation - pool.y[n]) * projection;
      if (y > this.clip[i] + 3 || y > this.height + 30) continue;
      const progress = pool.age[n] / pool.life[n];
      const color = COLORS[pool.color[n]];
      ctx.globalAlpha = (1 - progress) * (pool.type[n] === 0 ? .24 : .7);
      if (pool.type[n] === 1) {
        line(ctx, color, Math.max(1, projection * .1), x, y, x + pool.vx[n] * projection, y + projection * .22);
      } else if (pool.type[n] === 2) {
        line(ctx, color, Math.max(1, projection * .015), x, y, x - pool.vx[n] * projection * .06, y + projection * .12);
      } else {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, projection * (.13 + progress * .3)), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPlayer(state, options) {
    const ctx = this.ctx;
    const projection = this.focal / this.cameraDistance;
    const scale = projection * 2.15 / 160;
    const groundY = this.horizon + (this.cameraY + this.cameraSlope * this.cameraDistance - this.playerY) * projection;
    const x = this.width * .5 + (state.steer || 0) * Math.min(10, this.width * .012);
    const jump = Math.max(0, state.jump || 0);
    const y = groundY - scale * 46 - jump * projection;
    ctx.fillStyle = '#02071180';
    ctx.beginPath(); ctx.ellipse(x, groundY, 80 * scale / (1 + jump * .2), 11 * scale / (1 + jump * .2), 0, 0, TAU); ctx.fill();
    const carOptions = this.carOptions;
    carOptions.paint = options.paint || 'standard';
    carOptions.time = this.time;
    carOptions.nitro = state.nitroTimer > 0 || state.boostTimer > 0;
    carOptions.shadow = false;
    carOptions.brake = state.braking || false;
    drawCar(ctx, state.car, x, y, scale, state.angle || 0, carOptions);
  }

  drawTunnelInterior(track) {
    const ctx = this.ctx;
    ctx.fillStyle = '#101923';
    ctx.fillRect(-12, -12, this.width + 24, this.height + 24);
    for (let i = Math.ceil(this.cameraDistance / SEGMENT_LENGTH) + 1; i < VIEW_SEGMENTS; i++) {
      if (track.segments[this.indices[i]].tunnel || !this.visible[i]) continue;
      const w = this.w[i] * 1.15;
      ctx.fillStyle = this.sky;
      ctx.beginPath();
      ctx.ellipse(this.x[i], this.y[i] - w * .43, w, w * .69, 0, 0, TAU);
      ctx.fill();
      break;
    }
  }

  getBoostBlur() {
    const width = Math.round(this.width * this.dpr);
    const height = Math.round(this.height * this.dpr);
    if (this.boostBlur?.width === width && this.boostBlur.height === height) return this.boostBlur;
    if (!this.boostBlur) this.boostBlur = document.createElement('canvas');
    const canvas = this.boostBlur;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.filter = 'blur(2px)';
    ctx.globalAlpha = .11;
    // Rasterize the static streaks only on viewport changes, not 24 blurred strokes per frame.
    for (let side = -1; side <= 1; side += 2) {
      const x = side === -1 ? 0 : this.width;
      for (let j = 0; j < 12; j++) line(ctx, side === -1 ? BLUE : PURPLE, 2 + j % 3, x, this.height * .46, x - side * (12 + j * 4), this.height * (j / 11));
    }
    return canvas;
  }

  drawVelocity(state, time) {
    const speed = clamp(state.speed / state.car.maxSpeed, 0, 1.8);
    const boost = state.nitroTimer > 0 || state.boostTimer > 0;
    if (speed < .65 && !boost) return;
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const count = this.low ? 12 : boost ? 35 : 16;
    ctx.save();
    ctx.globalAlpha = boost ? .4 : clamp((speed - .65) * .2, 0, .13);
    ctx.strokeStyle = boost ? '#9adeff' : '#d7e2f3';
    ctx.lineWidth = boost ? 1.5 : 1;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = (i * 2.39996) % TAU;
      const phase = (time * (boost ? 2.4 : 1.2) + i * .137) % 1;
      const radial = .38 + phase * .52;
      const x = Math.cos(angle) * W * radial;
      const y = Math.sin(angle) * H * radial;
      const tail = boost ? .12 : .045;
      if (Math.abs(x) < W * .32 && Math.abs(y) < H * .28) continue;
      ctx.moveTo(W * .5 + x, H * .46 + y);
      ctx.lineTo(W * .5 + x * (1 + tail), H * .46 + y * (1 + tail));
    }
    ctx.stroke();
    if (boost) {
      ctx.globalAlpha = .7 + Math.sin(time * 24) * .15;
      ctx.fillStyle = this.edgeGlow; ctx.fillRect(0, 0, W, H);
      if (this.low) {
        ctx.globalAlpha = .11;
        for (let side = -1; side <= 1; side += 2) {
          const x = side === -1 ? 0 : W;
          for (let j = 0; j < 12; j++) line(ctx, side === -1 ? BLUE : PURPLE, 2 + j % 3, x, H * .46, x - side * (12 + j * 4), H * (j / 11));
        }
      } else {
        ctx.globalAlpha = 1;
        ctx.drawImage(this.getBoostBlur(), 0, 0, W, H);
      }
    }
    ctx.restore();
  }
}
