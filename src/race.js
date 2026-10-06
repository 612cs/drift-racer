import { segmentAt } from './data.js';

const STEP = 1 / 60;
const EPSILON = 1e-9;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export class Race {
  constructor(track, car, mode = 'time', ghost = null) {
    this.mode = mode === 'practice' ? 'practice' : 'time';
    this.state = {
      track, car, mode: this.mode, phase: 'countdown', countdown: 3, z: 0, x: 0, speed: 0,
      steer: 0, angle: 0, driftTime: 0, combo: 0, nitro: 0,
      boostTimer: 0, nitroTimer: 0, shake: 0, jump: 0, lap: 1,
      lapTime: 0, totalTime: 0, bestLap: Infinity, lapTimes: [],
      collisions: 0, lapCollisions: 0, lapCombo3: 0, maxCombo: 0,
      nitroUses: 0, ghost: null, ghostDelta: null, drifting: false,
      offroad: false, successBoosts: 0, combo3: 0, ghostWins: 0,
    };
    this.events = [];
    this.result = null;
    this._ghost = this._validGhost(ghost) ? ghost : null;
    this._accumulator = 0;
    this._announcedCountdown = 0;
    this._completedTime = 0;
    this._completed = { collisions: 0, nitroUses: 0, successBoosts: 0, combo3: 0, maxCombo: 0, ghostWins: 0 };
    this._bestGhost = null;
    this._resetLapStats();
    this._resetControls(false);
    this._resetDynamics();
    this._frames = [[0, 0, 0, 0]];
    this._updateGhost();
  }

  update(dt, input = {}) {
    this.events.length = 0;
    if (this.state.phase === 'paused' || this.state.phase === 'result') return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const controls = {
      throttle: clamp(number(input.throttle), 0, 1),
      brake: clamp(number(input.brake), 0, 1),
      steer: clamp(number(input.steer), -1, 1),
      drift: Boolean(input.drift), nitro: Boolean(input.nitro),
    };
    this._accumulator += dt;
    while (this._accumulator + EPSILON >= STEP && this.state.phase !== 'result') {
      this._accumulator = Math.max(0, this._accumulator - STEP);
      if (this.state.phase === 'countdown') this._countdown(STEP);
      else this._step(STEP, controls);
    }
    this._updateGhost();
  }

  pause() {
    if (this.state.phase !== 'racing' && this.state.phase !== 'countdown') return;
    this._pausedPhase = this.state.phase;
    this.state.phase = 'paused';
    this._accumulator = 0;
    this._resetControls(true);
    this.events.length = 0;
  }

  resume() {
    if (this.state.phase !== 'paused') return;
    this.state.phase = this._pausedPhase || 'racing';
    this._resetControls(true);
    this._accumulator = 0;
  }

  restartLap() {
    if (this.state.phase === 'result') return;
    const s = this.state;
    Object.assign(s, {
      phase: 'countdown', countdown: 3, z: 0, x: 0, speed: 0,
      steer: 0, angle: 0, nitro: 0, boostTimer: 0, nitroTimer: 0,
      shake: 0, jump: 0, lapTime: 0, totalTime: this._completedTime,
      offroad: false,
    });
    this._resetLapStats();
    this._resetControls(true);
    this._resetDynamics();
    this._syncStats();
    this._frames = [[0, 0, 0, 0]];
    this._accumulator = 0;
    this._announcedCountdown = 0;
    this.events.length = 0;
    this._updateGhost();
  }

  _resetLapStats() {
    this._lapStats = { collisions: 0, nitroUses: 0, successBoosts: 0, combo3: 0, maxCombo: 0 };
    this.state.lapCollisions = 0;
    this.state.lapCombo3 = 0;
  }

  _resetControls(blockHeld) {
    this.state.drifting = false;
    this.state.driftTime = 0;
    this.state.combo = 0;
    this.state.steer = 0;
    this._driftHeld = false;
    this._nitroHeld = false;
    this._driftBlocked = blockHeld;
    this._nitroBlocked = blockHeld;
    this._comboIdle = 0;
  }

  _resetDynamics() {
    this._lateralVelocity = 0;
    this._lockTimer = 0;
    this._wallCooldown = 0;
    this._boostBonus = 0;
    this._jumpVelocity = 0;
    this._onJumpSegment = false;
  }

  _countdown(dt) {
    const s = this.state;
    const value = Math.max(1, Math.ceil(s.countdown - EPSILON));
    if (value !== this._announcedCountdown) {
      this.events.push({ type: 'countdown', value });
      this._announcedCountdown = value;
    }
    s.countdown = Math.max(0, s.countdown - dt);
    if (s.countdown < EPSILON) {
      s.countdown = 0;
      s.phase = 'racing';
      this.events.push({ type: 'go' });
    }
  }

  _step(dt, input) {
    const s = this.state;
    const segment = segmentAt(s.track, s.z);
    const oldZ = s.z;
    const oldX = s.x;
    const oldAngle = s.angle;
    const oldLapTime = s.lapTime;
    s.shake = Math.max(0, s.shake - dt * 2.5);
    s.boostTimer = Math.max(0, s.boostTimer - dt);
    s.nitroTimer = Math.max(0, s.nitroTimer - dt);
    this._lockTimer = Math.max(0, this._lockTimer - dt);
    this._wallCooldown = Math.max(0, this._wallCooldown - dt);
    if (!input.drift) this._driftBlocked = false;
    if (!input.nitro) this._nitroBlocked = false;
    const driftHeld = input.drift && !this._driftBlocked;
    const nitroHeld = input.nitro && !this._nitroBlocked;
    s.steer = this._lockTimer > 0 ? 0 : input.steer;
    s.offroad = Math.abs(s.x) > 1;

    if (!driftHeld && this._driftHeld && !s.offroad && this._lockTimer === 0) this._releaseDrift();
    s.drifting = driftHeld && s.speed >= 30 && Math.abs(s.steer) > .08 && !s.offroad && this._lockTimer === 0 && s.jump < .15;
    if (s.drifting) {
      s.driftTime += dt;
      s.combo = s.driftTime + EPSILON >= 2 ? 3 : s.driftTime + EPSILON >= 1 ? 2 : s.driftTime + EPSILON >= .5 ? 1 : 0;
      this._lapStats.maxCombo = Math.max(this._lapStats.maxCombo, s.combo);
      this._comboIdle = 0;
    } else if (driftHeld || s.offroad) {
      this._interruptDrift();
    } else {
      this._comboIdle += dt;
      if (this._comboIdle >= 5) s.combo = 0;
    }
    this._driftHeld = driftHeld;

    if (nitroHeld && !this._nitroHeld && s.nitro >= 50 && this._lockTimer === 0) {
      s.nitro -= 50;
      s.nitroTimer = 3;
      s.speed = Math.min(s.car.maxSpeed * (1.4 + (s.boostTimer > 0 ? this._boostBonus : 0)), s.speed * 1.4);
      s.shake = Math.max(s.shake, .3);
      this._lapStats.nitroUses++;
      this.events.push({ type: 'nitro', duration: 3, mode: this.mode });
    }
    this._nitroHeld = nitroHeld;

    const ratio = clamp(s.speed / s.car.maxSpeed, 0, 1.8);
    const boost = s.boostTimer > 0 ? this._boostBonus : 0;
    const nitro = s.nitroTimer > 0 ? .4 : 0;
    const cornerLimit = 1 + Math.abs(segment.curve) * .16 * (s.drifting ? .35 : 1);
    const speedLimit = s.car.maxSpeed * (1 + boost + nitro) / cornerLimit;
    const acceleration = s.car.acceleration * input.throttle * (1 + boost + nitro) - input.brake * 90 - (input.throttle > 0 ? 2 : 18) - (s.drifting ? 3 / s.car.drift : 0);
    s.speed = Math.max(0, s.speed + acceleration * dt);
    if (s.speed > speedLimit) s.speed = Math.max(speedLimit, s.speed - dt * 65);

    const widthScale = s.track.roadWidth / segment.width;
    const steeringForce = s.steer * s.car.handling * .28 * (.25 + .75 * Math.min(ratio, 1.3)) * (s.drifting ? 2 : 1) * widthScale;
    const curveForce = segment.curve * ratio * ratio * .48 * widthScale * (s.drifting ? .48 / s.car.drift : 1);
    const targetLateral = (steeringForce - curveForce) * (s.offroad ? .45 : 1) * (s.jump > .15 ? .35 : 1) * Math.min(1, s.speed / 30);
    const response = s.drifting ? 7 * s.car.drift : 13;
    this._lateralVelocity += (targetLateral - this._lateralVelocity) * Math.min(1, dt * response);
    s.x += this._lateralVelocity * dt;
    const targetAngle = s.drifting ? s.steer * (Math.PI / 180) * (15 + 10 * Math.min(1, s.driftTime / 2)) : s.steer * .07;
    s.angle += (targetAngle - s.angle) * Math.min(1, dt * 9);

    const offroadNow = Math.abs(s.x) > 1;
    const speedBeforeOffroad = s.speed;
    if (offroadNow) {
      if (!s.offroad) s.speed *= .5;
      s.speed = Math.min(s.speed, s.car.maxSpeed * .5);
      this._interruptDrift();
    }
    s.offroad = offroadNow;
    if (Math.abs(s.x) >= 1.18 && this._wallCooldown === 0) {
      const side = Math.sign(s.x);
      s.x = side * .96;
      s.speed = speedBeforeOffroad * .3;
      this._lateralVelocity = -side * .8;
      this._lockTimer = .5;
      this._wallCooldown = .55;
      s.shake = 1;
      s.offroad = false;
      s.boostTimer = 0;
      s.nitroTimer = 0;
      this._interruptDrift();
      this._lapStats.collisions++;
      this.events.push({ type: 'collision', side, mode: this.mode });
    }
    s.x = clamp(s.x, -1.18, 1.18);

    if (segment.jump && !this._onJumpSegment && s.speed > 65 && s.jump === 0) this._jumpVelocity = 7 + Math.min(3, s.speed / 80);
    this._onJumpSegment = segment.jump;
    if (this._jumpVelocity !== 0 || s.jump > 0) {
      s.jump = Math.max(0, s.jump + this._jumpVelocity * dt);
      this._jumpVelocity -= 18 * dt;
      if (s.jump === 0 && this._jumpVelocity < 0) this._jumpVelocity = 0;
    }

    const distance = s.speed / 3.6 * dt;
    s.z += distance;
    s.lapTime += dt;
    s.totalTime = this._completedTime + s.lapTime;
    this._syncStats();
    if (s.z >= s.track.length) {
      const fraction = distance > 0 ? clamp((s.track.length - oldZ) / distance, 0, 1) : 1;
      const finishTime = oldLapTime + dt * fraction;
      const finishX = oldX + (s.x - oldX) * fraction;
      const finishAngle = oldAngle + (s.angle - oldAngle) * fraction;
      if (this.mode === 'time') this._frames.push([finishTime, s.track.length, finishX, finishAngle]);
      this._completeLap(finishTime);
      if (s.phase === 'result') {
        s.z = s.track.length;
        s.x = finishX;
        s.angle = finishAngle;
        s.totalTime = this._completedTime;
        return;
      }
      s.z -= s.track.length;
      s.lapTime = dt * (1 - fraction);
      s.totalTime = this._completedTime + s.lapTime;
      this._frames = [[0, 0, finishX, finishAngle]];
      if (this.mode === 'time' && s.lapTime > EPSILON) this._frames.push([s.lapTime, s.z, s.x, s.angle]);
    } else if (this.mode === 'time') {
      this._frames.push([s.lapTime, s.z, s.x, s.angle]);
    }
  }

  _interruptDrift() {
    this.state.drifting = false;
    this.state.driftTime = 0;
    this.state.combo = 0;
    this._comboIdle = 0;
  }

  _releaseDrift() {
    const s = this.state;
    if (s.driftTime + EPSILON < .5) {
      s.driftTime = 0;
      return;
    }
    const combo = s.driftTime + EPSILON >= 2 ? 3 : s.driftTime + EPSILON >= 1 ? 2 : 1;
    const bonus = .2 + (combo - 1) * .1;
    this._boostBonus = bonus;
    s.boostTimer = 1.5 + (combo - 1) * .75;
    s.speed = Math.min(s.car.maxSpeed * (1 + bonus + (s.nitroTimer > 0 ? .4 : 0)), s.speed * (1 + bonus));
    s.nitro = Math.min(100, s.nitro + [0, 5, 15, 30][combo]);
    s.shake = Math.max(s.shake, .18);
    s.combo = combo;
    this._lapStats.successBoosts++;
    if (combo === 3) this._lapStats.combo3++;
    this.events.push({ type: 'boost', combo, duration: s.boostTimer, driftTime: s.driftTime, mode: this.mode });
    s.driftTime = 0;
    this._comboIdle = 0;
  }

  _syncStats() {
    const s = this.state;
    for (const key of ['collisions', 'nitroUses', 'successBoosts', 'combo3']) s[key] = this._completed[key] + this._lapStats[key];
    s.maxCombo = Math.max(this._completed.maxCombo, this._lapStats.maxCombo);
    s.ghostWins = this._completed.ghostWins;
    s.lapCollisions = this._lapStats.collisions;
    s.lapCombo3 = this._lapStats.combo3;
  }

  _completeLap(time) {
    const s = this.state;
    const beatGhost = this.mode === 'time' && this._ghost !== null && time < this._ghost.time - EPSILON;
    if (time < s.bestLap) {
      s.bestLap = time;
      if (this.mode === 'time') this._bestGhost = { time, frames: this._frames };
    }
    s.lapTimes.push(time);
    if (this.mode === 'practice' && s.lapTimes.length > 3) s.lapTimes.shift();
    this._completedTime += time;
    for (const key of ['collisions', 'nitroUses', 'successBoosts', 'combo3']) this._completed[key] += this._lapStats[key];
    this._completed.maxCombo = Math.max(this._completed.maxCombo, this._lapStats.maxCombo);
    this._completed.ghostWins += beatGhost ? 1 : 0;
    this._maxLapCombo3 = Math.max(this._maxLapCombo3 || 0, this._lapStats.combo3);
    this.events.push({ type: 'lap', lap: s.lap, time, beatGhost, mode: this.mode });
    if (this.mode === 'time' && s.lap === 3) {
      s.phase = 'result';
      s.lapTime = time;
      this.result = {
        trackId: s.track.id, carId: s.car.id, totalTime: this._completedTime,
        bestLap: s.bestLap, lapTimes: [...s.lapTimes],
        collisions: this._completed.collisions, nitroUses: this._completed.nitroUses,
        maxCombo: this._completed.maxCombo, combo3: this._maxLapCombo3,
        successBoosts: this._completed.successBoosts, ghostWins: this._completed.ghostWins,
        ghost: this._bestGhost,
      };
      s.collisions = this._completed.collisions;
      s.nitroUses = this._completed.nitroUses;
      s.successBoosts = this._completed.successBoosts;
      s.combo3 = this._completed.combo3;
      s.maxCombo = this._completed.maxCombo;
      s.ghostWins = this._completed.ghostWins;
      s.drifting = false;
      this.events.push({ type: 'finish', result: this.result });
    } else {
      s.lap++;
      this._resetLapStats();
      // A drift cannot straddle the line and be credited to two laps.
      this._interruptDrift();
      this._syncStats();
    }
  }

  _validGhost(ghost) {
    if (!ghost || !Number.isFinite(ghost.time) || ghost.time <= 0 || !Array.isArray(ghost.frames) || ghost.frames.length < 2) return false;
    let lastTime = -Infinity;
    let lastZ = -Infinity;
    for (const frame of ghost.frames) {
      if (!Array.isArray(frame) || frame.length !== 4 || !frame.every(Number.isFinite) || frame[0] <= lastTime || frame[1] < lastZ) return false;
      lastTime = frame[0];
      lastZ = frame[1];
    }
    const first = ghost.frames[0];
    const last = ghost.frames[ghost.frames.length - 1];
    return first[0] === 0 && first[1] === 0 && Math.abs(last[0] - ghost.time) < .001 && Math.abs(last[1] - this.state.track.length) < .01;
  }

  _updateGhost() {
    const s = this.state;
    if (!this._ghost) { s.ghost = null; s.ghostDelta = null; return; }
    const frames = this._ghost.frames;
    const interpolate = (value, coordinate) => {
      let lo = 0;
      let hi = frames.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (frames[mid][coordinate] < value) lo = mid + 1;
        else hi = mid;
      }
      const a = frames[Math.max(0, lo - 1)];
      const b = frames[lo];
      const span = b[coordinate] - a[coordinate];
      return [a, b, span > 0 ? clamp((value - a[coordinate]) / span, 0, 1) : 0];
    };
    const [a, b, mix] = interpolate(s.lapTime, 0);
    if (!s.ghost) s.ghost = { z: 0, x: 0, angle: 0 };
    s.ghost.z = a[1] + (b[1] - a[1]) * mix;
    s.ghost.x = a[2] + (b[2] - a[2]) * mix;
    s.ghost.angle = a[3] + (b[3] - a[3]) * mix;
    const [near, far, positionMix] = interpolate(s.z, 1);
    const ghostTimeAtDistance = near[0] + (far[0] - near[0]) * positionMix;
    s.ghostDelta = ghostTimeAtDistance - s.lapTime;
  }
}
