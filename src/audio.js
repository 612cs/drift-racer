const SAMPLE_RATE = 22050;
const TABLE_SIZE = 2048;
const MAX_VOICES = 16;
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const hz = note => 440 * 2 ** ((note - 69) / 12);

// Original eight-bar scores. All notes, percussion and effects are synthesized locally.
const SCORES = {
  coastal_highway: {
    title: 'Sunset Vector', bpm: 124, voice: 'warm',
    roots: [57, 53, 60, 55, 57, 53, 62, 55],
    minor: [true, false, false, false, true, false, true, false],
    melody: [7, 12, 10, 7, 3, 7, 5, 3],
  },
  touge_pass: {
    title: 'Midnight Switchbacks', bpm: 132, voice: 'pulse',
    roots: [54, 50, 57, 52, 54, 59, 50, 52],
    minor: [true, false, false, false, true, true, false, false],
    melody: [0, 7, 3, 10, 12, 7, 5, 7],
  },
  neon_skyway: {
    title: 'Neon Overdrive', bpm: 138, voice: 'bright',
    roots: [60, 56, 63, 58, 60, 65, 56, 58],
    minor: [true, false, false, false, true, true, false, false],
    melody: [12, 7, 10, 12, 15, 14, 7, 10],
  },
};

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  };
}

function makeTables() {
  const tables = {};
  for (const name of ['warm', 'pulse', 'bright', 'sine']) {
    const table = new Float32Array(TABLE_SIZE);
    for (let i = 0; i < TABLE_SIZE; i++) {
      const phase = TAU * i / TABLE_SIZE;
      table[i] = name === 'sine' ? Math.sin(phase)
        : name === 'warm' ? (Math.sin(phase) + .23 * Math.sin(phase * 2) + .12 * Math.sin(phase * 3)) / 1.35
          : name === 'pulse' ? (Math.sin(phase) + Math.sin(phase * 3) / 3 + Math.sin(phase * 5) / 5) / 1.54
            : (Math.sin(phase) + .5 * Math.sin(phase * 2) + .33 * Math.sin(phase * 3) + .2 * Math.sin(phase * 4)) / 2.03;
    }
    tables[name] = table;
  }
  return tables;
}

function makeSample(context, duration, synth) {
  const buffer = context.createBuffer(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = synth(i / SAMPLE_RATE, i);
  return buffer;
}

function makeSamples(context) {
  const noise = makeRandom(0x51f2a71);
  let previousNoise = 0;
  const samples = {};
  samples.kick = makeSample(context, .42, t => {
    const phase = TAU * (48 * t + 95 * .026 * (1 - Math.exp(-t / .026)));
    return Math.sin(phase) * Math.exp(-t * 11) * .85;
  });
  samples.snare = makeSample(context, .23, t =>
    (noise() * .67 + Math.sin(TAU * 175 * t) * .3) * Math.exp(-t * 20) * Math.min(t * 1600, 1));
  samples.hat = makeSample(context, .09, t => {
    const value = noise();
    const high = value - previousNoise;
    previousNoise = value;
    return high * .26 * Math.exp(-t * 65) * Math.min(t * 1800, 1);
  });
  samples.ui = makeSample(context, .1, t =>
    (Math.sin(TAU * 1450 * t) * .36 + noise() * .16) * Math.exp(-t * 65) * Math.min(t * 1800, 1));
  samples.boost = makeSample(context, .65, t => {
    const sub = Math.sin(TAU * (48 * t + 45 * .045 * (1 - Math.exp(-t / .045))));
    const rise = Math.sin(TAU * (180 * t + 190 * t * t));
    return (sub * .58 + noise() * .24 + rise * .14) * Math.exp(-t * 5) * Math.min(t * 500, 1);
  });
  samples.nitro = makeSample(context, .9, t => {
    const envelope = Math.sin(Math.PI * Math.min(t / .9, 1)) ** .65;
    return (noise() * .5 + Math.sin(TAU * (65 * t + 95 * t * t)) * .23) * envelope;
  });
  samples.collision = makeSample(context, .85, t => {
    const metal = Math.sin(TAU * 311 * t) * .25 + Math.sin(TAU * 527 * t) * .2
      + Math.sin(TAU * 913 * t) * .15 + Math.sin(TAU * 1517 * t) * .1;
    const glass = noise() * .42 * Math.exp(-t * 14) * (.65 + .35 * Math.sin(TAU * 43 * t));
    return (metal * Math.exp(-t * 7) + glass) * Math.min(t * 1200, 1);
  });
  for (const [name, frequency] of [['countLow', 330], ['countHigh', 660], ['go', 880]]) {
    const duration = name === 'go' ? .48 : .23;
    samples[name] = makeSample(context, duration, t => {
      const envelope = Math.min(t / .006, 1) * Math.min((duration - t) / .08, 1);
      return (Math.sin(TAU * frequency * t) + .2 * Math.sin(TAU * frequency * 2 * t)) * envelope * .4;
    });
  }
  let crowdLow = 0;
  samples.finish = makeSample(context, 2.6, t => {
    const raw = noise();
    crowdLow += (raw - crowdLow) * .17;
    const cheerEnvelope = Math.sin(Math.PI * t / 2.6) ** .7;
    const crowd = crowdLow * (1.8 + .7 * Math.sin(TAU * 3.3 * t))
      + Math.sin(TAU * (520 * t + 48 * Math.sin(t * 5))) * .045
      + Math.sin(TAU * (735 * t + 32 * Math.sin(t * 4.2))) * .04;
    const chordEnvelope = Math.min(t / .03, 1) * Math.max(0, 1 - t / 2.6) ** .7;
    let chord = 0;
    for (const note of [57, 61, 64, 69, 76]) chord += Math.sin(TAU * hz(note) * t) * .085;
    return crowd * cheerEnvelope * .48 + chord * chordEnvelope;
  });
  samples.noise = makeSample(context, 2, () => noise() * .65);
  const loop = samples.noise.getChannelData(0);
  // Ease the last 11 ms into the first sample to avoid a discontinuity at the join.
  for (let i = 0; i < 256; i++) {
    const blend = i / 255;
    loop[loop.length - 256 + i] = loop[loop.length - 256 + i] * (1 - blend) + loop[0] * blend;
  }
  return samples;
}

function renderScore(context, score, samples, tables) {
  const beat = 60 / score.bpm;
  const length = Math.round(32 * beat * SAMPLE_RATE);
  const buffer = context.createBuffer(2, length, SAMPLE_RATE);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  // Quantize the beat to the exact buffer duration so the repeat never drifts.
  const exactBeat = length / SAMPLE_RATE / 32;
  function note(midi, startBeat, durationBeats, level, voice, pan = 0, attack = .012, release = .08) {
    const table = tables[voice];
    const frequency = hz(midi);
    const duration = durationBeats * exactBeat;
    const count = Math.ceil(duration * SAMPLE_RATE);
    const start = Math.round(startBeat * exactBeat * SAMPLE_RATE);
    const step = frequency * TABLE_SIZE / SAMPLE_RATE;
    let phase = 0;
    const leftLevel = level * Math.sqrt((1 - pan) / 2);
    const rightLevel = level * Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < count; i++) {
      const time = i / SAMPLE_RATE;
      const envelope = Math.min(time / attack, 1) * clamp((duration - time) / release, 0, 1);
      const position = (start + i) % length;
      const value = table[Math.floor(phase)] * envelope;
      left[position] += value * leftLevel;
      right[position] += value * rightLevel;
      phase += step;
      if (phase >= TABLE_SIZE) phase -= TABLE_SIZE;
    }
  }
  function drum(sample, startBeat, level, pan = 0) {
    const data = sample.getChannelData(0);
    const start = Math.round(startBeat * exactBeat * SAMPLE_RATE);
    for (let i = 0; i < data.length; i++) {
      const position = (start + i) % length;
      left[position] += data[i] * level * (1 - pan * .4);
      right[position] += data[i] * level * (1 + pan * .4);
    }
  }
  for (let bar = 0; bar < 8; bar++) {
    const root = score.roots[bar];
    const third = score.minor[bar] ? 3 : 4;
    const chord = [0, third, 7, 12];
    for (let degree = 0; degree < 3; degree++) {
      note(root + chord[degree], bar * 4, 4.2, .072, 'warm', (degree - 1) * .65, .12, .35);
      note(root + chord[degree] + 12.04, bar * 4, 4.2, .026, 'sine', (1 - degree) * .7, .16, .4);
    }
    for (let step = 0; step < 8; step++) {
      const time = bar * 4 + step * .5;
      note(root - 12 + (step === 7 ? 7 : 0), time, .43, .16, score.voice, 0, .008, .07);
      let melody = score.melody[(step + (bar % 2) * 2) % 8];
      if (melody === 3 && !score.minor[bar]) melody = 4;
      if (melody === 15 && !score.minor[bar]) melody = 16;
      const skip = score.voice === 'pulse' && step === 3;
      if (!skip) note(root + 12 + melody, time + (score.voice === 'pulse' ? .125 : 0), .38,
        score.voice === 'bright' ? .075 : .067, score.voice, Math.sin(step * 1.2) * .3, .006, .11);
      drum(samples.hat, time, step % 2 ? .19 : .31, step % 2 ? .4 : -.4);
    }
    for (let step = 0; step < 16; step++) {
      note(root + 12 + chord[(step + bar) % 4], bar * 4 + step * .25, .2,
        score.voice === 'bright' ? .043 : .027, 'pulse', step % 2 ? .65 : -.65, .004, .06);
      if (score.voice !== 'warm' && step % 2) drum(samples.hat, bar * 4 + step * .25, .12, .5);
    }
    for (let step = 0; step < 4; step++) drum(samples.kick, bar * 4 + step, .64);
    drum(samples.snare, bar * 4 + 1, .48);
    drum(samples.snare, bar * 4 + 3, .53);
    if (score.voice === 'pulse') drum(samples.kick, bar * 4 + 2.75, .42);
    if (score.voice === 'bright' && bar % 2) drum(samples.snare, bar * 4 + 3.75, .25);
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = .8 / Math.max(peak, .8);
  for (let i = 0; i < length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
  return buffer;
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.settings = { volume: .65, music: true, sfx: true, enhancedEngine: false };
    this.trackId = 'coastal_highway';
    this._active = true;
    this._closed = false;
    this._ready = false;
    this._music = null;
    this._retiringMusic = null;
    this._musicOffset = 0;
    this._voices = new Set();
    this._continuous = [];
    this._targets = new WeakMap();
    this._activityTask = Promise.resolve();
    this._onVisibility = () => this._applyActivity();
    globalThis.document?.addEventListener('visibilitychange', this._onVisibility);
  }

  get _audible() {
    return this._active && !globalThis.document?.hidden && !this._closed;
  }

  async unlock() {
    if (this._closed) return false;
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return false;
      this.context = new Context({ latencyHint: 'interactive' });
      // Resume synchronously inside the gesture, before doing any PCM generation.
      const resume = this.context.resume();
      this._build();
      this._ready = true;
      this.configure(this.settings);
      this._applyActivity();
      await resume;
    } else if (this._audible && this.context.state !== 'running') {
      await this.context.resume();
    }
    this._startMusic();
    return true;
  }

  _build() {
    const context = this.context;
    this.master = context.createGain();
    this.master.gain.value = this.settings.volume;
    this.gate = context.createGain();
    this.gate.gain.value = this._audible ? 1 : 0;
    this.musicBus = context.createGain();
    this.musicBus.gain.value = .48;
    this.sfxBus = context.createGain();
    this.sfxBus.gain.value = this.settings.sfx ? 1 : 0;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -9;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = .006;
    this.compressor.release.value = .18;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.gate);
    this.gate.connect(this.compressor);
    this.compressor.connect(context.destination);
    this.samples = makeSamples(context);
    const tables = makeTables();
    this.tracks = {};
    for (const [id, score] of Object.entries(SCORES)) this.tracks[id] = renderScore(context, score, this.samples, tables);

    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 750;
    this.engineFilter.Q.value = .7;
    this.engine = context.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 100;
    this.engine.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxBus);
    this.engine.start();
    this._continuous.push(this.engine);

    this.enhancedGain = context.createGain();
    this.enhancedGain.gain.value = 0;
    this.enhanced = context.createOscillator();
    this.enhanced.type = 'square';
    this.enhanced.frequency.value = 200;
    this.enhanced.detune.value = -8;
    this.enhanced.connect(this.enhancedGain);
    this.enhancedGain.connect(this.engineFilter);
    this.enhanced.start();
    this._continuous.push(this.enhanced);

    this.driftGain = context.createGain();
    this.driftGain.gain.value = 0;
    this.driftFilter = context.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.value = 1800;
    this.driftFilter.Q.value = 1.1;
    const driftNoise = context.createBufferSource();
    driftNoise.buffer = this.samples.noise;
    driftNoise.loop = true;
    driftNoise.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.sfxBus);
    driftNoise.start();
    this._continuous.push(driftNoise);
    this.squeal = context.createOscillator();
    this.squeal.type = 'triangle';
    this.squeal.frequency.value = 1400;
    this.squealGain = context.createGain();
    this.squealGain.gain.value = 0;
    this.squeal.connect(this.squealGain);
    this.squealGain.connect(this.sfxBus);
    this.squeal.start();
    this._continuous.push(this.squeal);

    this.rocketGain = context.createGain();
    this.rocketGain.gain.value = 0;
    this.rocketFilter = context.createBiquadFilter();
    this.rocketFilter.type = 'lowpass';
    this.rocketFilter.frequency.value = 1100;
    const rocket = context.createBufferSource();
    rocket.buffer = this.samples.noise;
    rocket.loop = true;
    rocket.playbackRate.value = .72;
    rocket.connect(this.rocketFilter);
    this.rocketFilter.connect(this.rocketGain);
    this.rocketGain.connect(this.sfxBus);
    rocket.start();
    this._continuous.push(rocket);
  }

  _target(parameter, value, timeConstant = .04) {
    if (!this.context || this.context.state === 'closed') return;
    if (this._targets.get(parameter) === value) return;
    this._targets.set(parameter, value);
    parameter.setTargetAtTime(value, this.context.currentTime, timeConstant);
  }

  configure(settings = {}) {
    if (Number.isFinite(settings.volume)) this.settings.volume = clamp(settings.volume, 0, 1);
    for (const key of ['music', 'sfx', 'enhancedEngine']) {
      if (typeof settings[key] === 'boolean') this.settings[key] = settings[key];
    }
    if (!this._ready || this._closed) return;
    this._target(this.master.gain, this.settings.volume, .025);
    this._target(this.sfxBus.gain, this.settings.sfx ? 1 : 0, .015);
    if (!this.settings.sfx) this._stopVoices();
    if (!this.settings.music) this._stopMusic();
    else this._startMusic();
  }

  setTrack(trackId) {
    if (trackId !== null && !Object.hasOwn(SCORES, trackId)) return;
    if (trackId === this.trackId) return;
    this._stopMusic();
    this.trackId = trackId;
    this._musicOffset = 0;
    this._startMusic();
  }

  _startMusic() {
    if (!this._ready || !this._audible || !this.settings.music || !this.trackId || this._music) return;
    const context = this.context;
    if (context.state === 'closed') return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.tracks[this.trackId];
    source.loop = true;
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(1, context.currentTime + .035);
    source.connect(gain);
    gain.connect(this.musicBus);
    const music = { source, gain, offset: this._musicOffset, startedAt: context.currentTime };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this._retiringMusic === music) this._retiringMusic = null;
      if (this._music === music) this._music = null;
    };
    source.start(0, music.offset % source.buffer.duration);
    this._music = music;
  }

  _stopMusic() {
    const music = this._music;
    if (!music) return;
    this._musicOffset = (music.offset + this.context.currentTime - music.startedAt) % music.source.buffer.duration;
    this._music = null;
    if (this._retiringMusic) {
      this._retiringMusic.source.onended = null;
      this._retiringMusic.source.stop();
      this._retiringMusic.source.disconnect();
      this._retiringMusic.gain.disconnect();
    }
    this._retiringMusic = music;
    music.gain.gain.cancelScheduledValues(this.context.currentTime);
    music.gain.gain.setTargetAtTime(0, this.context.currentTime, .004);
    music.source.stop(this.context.currentTime + .025);
  }

  update(state) {
    if (!this._ready || this._closed) return;
    const racing = this._audible && state?.phase === 'racing';
    if (!racing) {
      this._quiet();
      return;
    }
    const speed = Math.max(0, Number(state.speed) || 0);
    const maxSpeed = Math.max(1, Number(state.car?.maxSpeed) || 180);
    const boosted = (state.boostTimer > 0 ? .14 : 0) + (state.nitroTimer > 0 ? .2 : 0);
    const ratio = clamp(speed / maxSpeed + boosted, 0, 1);
    const frequency = 100 + ratio * 200;
    this._target(this.engine.frequency, frequency, .055);
    this._target(this.engineFilter.frequency, 580 + ratio * (this.settings.enhancedEngine ? 2200 : 1050), .08);
    this._target(this.engineGain.gain, .045 + ratio * .055, .06);
    this._target(this.enhanced.frequency, frequency * 2, .055);
    this._target(this.enhancedGain.gain, this.settings.enhancedEngine ? .4 : 0, .08);
    const drifting = state.driftTime > 0 && speed > 15;
    const combo = clamp(Number(state.combo) || 0, 0, 3);
    const intensity = drifting ? clamp(.3 + Math.abs(state.angle || 0) * .7 + combo * .16, 0, 1) : 0;
    this._target(this.driftGain.gain, intensity * .48, .05);
    this._target(this.driftFilter.frequency, 1350 + combo * 420 + ratio * 500, .08);
    this._target(this.squeal.frequency, 1100 + combo * 240 + ratio * 300, .09);
    this._target(this.squealGain.gain, intensity * .045, .05);
    this._target(this.rocketGain.gain, state.nitroTimer > 0 ? .22 : 0, .07);
  }

  _quiet() {
    this._target(this.engineGain.gain, 0, .025);
    this._target(this.enhancedGain.gain, 0, .025);
    this._target(this.driftGain.gain, 0, .025);
    this._target(this.squealGain.gain, 0, .025);
    this._target(this.rocketGain.gain, 0, .025);
  }

  play(eventType, value) {
    if (!this._ready || !this._audible || !this.settings.sfx || this.context.state !== 'running') return;
    let name = eventType;
    if (eventType === 'countdown') {
      const count = typeof value === 'object' ? value?.value ?? value?.countdown : value;
      name = count === 'go' || count === 0 ? 'go' : Number(count) === 1 ? 'countHigh' : 'countLow';
    }
    const sample = this.samples[name];
    if (!sample || name === 'noise' || name === 'kick' || name === 'snare' || name === 'hat') return;
    while (this._voices.size >= MAX_VOICES) this._disposeVoice(this._voices.values().next().value);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = sample;
    gain.gain.value = name === 'collision' ? .75 : name === 'finish' ? .9 : .65;
    source.connect(gain);
    gain.connect(this.sfxBus);
    const voice = { source, gain };
    this._voices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this._voices.delete(voice);
    };
    source.start();
    // The buffer is finite; this explicit stop also bounds its lifecycle in suspended contexts.
    source.stop(this.context.currentTime + sample.duration + .01);
  }

  _disposeVoice(voice) {
    voice.source.onended = null;
    voice.source.stop();
    voice.source.disconnect();
    voice.gain.disconnect();
    this._voices.delete(voice);
  }

  _stopVoices() {
    for (const voice of this._voices) this._disposeVoice(voice);
  }

  setActive(active) {
    this._active = Boolean(active);
    this._applyActivity();
  }

  _applyActivity() {
    if (!this._ready || this._closed) return;
    const audible = this._audible;
    this._target(this.gate.gain, audible ? 1 : 0, .008);
    if (audible) this._startMusic();
    else {
      this._stopMusic();
      this._stopVoices();
      this._quiet();
    }
    // Serialize suspend/resume so rapid visibility changes cannot leave the context suspended.
    this._activityTask = this._activityTask.catch(() => {}).then(async () => {
      if (this._closed || this.context.state === 'closed') return;
      if (this._audible && this.context.state !== 'running') await this.context.resume();
      else if (!this._audible && this.context.state === 'running') await this.context.suspend();
    });
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    globalThis.document?.removeEventListener('visibilitychange', this._onVisibility);
    if (!this.context) return;
    this._stopVoices();
    for (const music of [this._music, this._retiringMusic]) {
      if (!music) continue;
      music.source.onended = null;
      music.source.stop();
      music.source.disconnect();
      music.gain.disconnect();
    }
    this._music = null;
    this._retiringMusic = null;
    for (const source of this._continuous) {
      source.stop();
      source.disconnect();
    }
    for (const node of [this.engineFilter, this.engineGain, this.enhancedGain, this.driftFilter,
      this.driftGain, this.squealGain, this.rocketFilter, this.rocketGain, this.musicBus,
      this.sfxBus, this.master, this.gate, this.compressor]) node.disconnect();
    this._continuous.length = 0;
    this.samples = null;
    this.tracks = null;
    if (this.context.state !== 'closed') await this.context.close();
  }
}
