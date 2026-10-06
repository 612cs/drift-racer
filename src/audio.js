import { TRACKS } from './data.js';

const MAX_VOICES = 16;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

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
    this.samples = null;
    this.tracks = Object.create(null);
    this._worker = null;
    this._workerError = null;
    this._requests = new Map();
    this._requestId = 0;
    this._initialization = null;
    this._trackTasks = new Map();
    this.onError = null;
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
    }
    // Resume inside the user gesture; PCM arrives asynchronously from the Worker.
    const resume = this._audible && this.context.state !== 'running' ? this.context.resume() : Promise.resolve();
    await Promise.all([resume, this._initialize()]);
    if (this._closed) return false;
    if (this.settings.music && this.trackId) await this._ensureTrack(this.trackId);
    if (this._closed) return false;
    this._startMusic();
    return true;
  }

  _initialize() {
    if (this._initialization) return this._initialization;
    try {
      this._worker = new Worker(new URL('./audio-worker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = ({ data }) => {
        const request = this._requests.get(data.id);
        if (!request) return;
        this._requests.delete(data.id);
        if (data.error) request.reject(new Error(data.error));
        else request.resolve(data);
      };
      this._worker.onerror = event => this._failWorker(new Error(event.message || '音频生成线程不可用'));
      this._worker.onmessageerror = () => this._failWorker(new Error('音频生成数据无法接收'));
    } catch (error) {
      this._workerError = error;
      this._initialization = Promise.reject(error);
      return this._initialization;
    }
    this._initialization = this._request('init', this.settings.music ? this.trackId : null).then(data => {
      if (this._closed) throw new Error('音频已关闭');
      this.samples = Object.create(null);
      for (const [name, pcm] of Object.entries(data.samples)) this.samples[name] = this._buffer(pcm);
      if (data.track) this.tracks[data.trackId] = this._buffer(data.track);
      this._build();
      this._ready = true;
      this.configure(this.settings);
      this._applyActivity();
    });
    return this._initialization;
  }

  _request(type, trackId) {
    if (this._closed || this._workerError) return Promise.reject(this._workerError || new Error('音频已关闭'));
    const id = ++this._requestId;
    return new Promise((resolve, reject) => {
      this._requests.set(id, { resolve, reject });
      try { this._worker.postMessage({ id, type, trackId }); }
      catch (error) { this._requests.delete(id); reject(error); }
    });
  }

  _buffer(pcm) {
    const buffer = this.context.createBuffer(pcm.channels.length, pcm.channels[0].length, pcm.sampleRate);
    for (let channel = 0; channel < pcm.channels.length; channel++) buffer.copyToChannel(pcm.channels[channel], channel);
    return buffer;
  }

  _ensureTrack(trackId) {
    if (this.tracks[trackId]) return Promise.resolve(this.tracks[trackId]);
    if (this._trackTasks.has(trackId)) return this._trackTasks.get(trackId);
    const task = this._request('track', trackId).then(data => {
      if (this._closed) throw new Error('音频已关闭');
      const buffer = this._buffer(data.track);
      this.tracks[trackId] = buffer;
      this._trackTasks.delete(trackId);
      return buffer;
    });
    this._trackTasks.set(trackId, task);
    return task;
  }

  _failWorker(error) {
    this._workerError = error;
    this._worker?.terminate();
    this._worker = null;
    for (const request of this._requests.values()) request.reject(error);
    this._requests.clear();
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
    if (trackId !== null && !TRACKS.some(track => track.id === trackId)) return;
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
    if (!this.tracks[this.trackId]) {
      if (this._workerError || this._trackTasks.has(this.trackId)) return;
      const trackId = this.trackId;
      this._ensureTrack(trackId).then(() => {
        if (this.trackId === trackId) this._startMusic();
      }, error => {
        if (!this._closed) { this._failWorker(error); this.onError?.(error); }
      });
      return;
    }
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
    this._failWorker(new Error('音频已关闭'));
    this._trackTasks.clear();
    if (!this.context) return;
    if (!this._ready) {
      if (this.context.state !== 'closed') await this.context.close();
      return;
    }
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
