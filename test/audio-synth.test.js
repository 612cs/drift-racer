import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { synthesizeSamples, synthesizeTrack } from '../src/audio-synth.js';

const SAMPLE_RATE = 22050;
const TEMPOS = { coastal_highway: 124, touge_pass: 132, neon_skyway: 138 };
const EFFECTS = {
  kick: [.42, .10, .30],
  snare: [.23, .06, .20],
  hat: [.09, .015, .12],
  ui: [.10, .015, .12],
  boost: [.65, .06, .25],
  nitro: [.90, .15, .38],
  collision: [.85, .05, .25],
  countLow: [.23, .15, .32],
  countHigh: [.23, .15, .32],
  go: [.48, .18, .33],
  finish: [2.6, .03, .30],
  noise: [2, .33, .40],
};

function levels(channel) {
  let energy = 0;
  let peak = 0;
  let finite = true;
  for (const value of channel) {
    finite &&= Number.isFinite(value);
    energy += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return { rms: Math.sqrt(energy / channel.length), peak, finite };
}

function assertEffects(samples) {
  for (const [name, [duration, minRms, maxRms]] of Object.entries(EFFECTS)) {
    const pcm = samples[name];
    assert.equal(pcm.sampleRate, SAMPLE_RATE, `${name}: playback sample rate`);
    assert.equal(pcm.channels.length, 1, `${name}: mono playback`);
    const channel = pcm.channels[0];
    assert.ok(Math.abs(channel.length / pcm.sampleRate - duration) < 1 / SAMPLE_RATE,
      `${name}: original audible duration`);
    const { rms, peak, finite } = levels(channel);
    assert.ok(finite, `${name}: all PCM amplitudes must be finite`);
    assert.ok(rms >= minRms && rms <= maxRms, `${name}: audible RMS ${rms}`);
    assert.ok(peak > minRms && peak <= 1, `${name}: unclipped peak ${peak}`);
  }
  const noise = samples.noise.channels[0];
  assert.ok(Math.abs(noise[0] - noise.at(-1)) < 1e-6, 'engine/skid noise loops without a join discontinuity');
}

function assertTrack(pcm, trackId, kick) {
  assert.equal(pcm.sampleRate, SAMPLE_RATE, `${trackId}: playback sample rate`);
  assert.equal(pcm.channels.length, 2, `${trackId}: stereo playback`);
  const [left, right] = pcm.channels;
  const seconds = 32 * 60 / TEMPOS[trackId];
  for (const channel of pcm.channels) {
    assert.ok(Math.abs(channel.length / pcm.sampleRate - seconds) <= .5 / SAMPLE_RATE + 1e-10,
      `${trackId}: exact 32-beat loop at its original BPM`);
    const { rms, peak, finite } = levels(channel);
    assert.ok(finite, `${trackId}: all PCM amplitudes must be finite`);
    assert.ok(rms >= .08 && rms <= .35, `${trackId}: audible music RMS ${rms}`);
    assert.ok(peak >= .45 && peak <= .800001, `${trackId}: music peak ${peak} preserves headroom`);
    assert.ok(Math.abs(channel[0] - channel.at(-1)) <= .04,
      `${trackId}: loop seam must not introduce an audible amplitude step`);
  }
  let stereoEnergy = 0;
  for (let i = 0; i < left.length; i++) stereoEnergy += (left[i] - right[i]) ** 2;
  assert.ok(Math.sqrt(stereoEnergy / left.length) > .005, `${trackId}: panned instruments remain audible`);

  // Measure the audible kick at every quantized beat, rather than inspecting
  // worker state or transfer-list wiring. Missing retained drums lose this pulse.
  const pulseLength = Math.floor(.15 * SAMPLE_RATE);
  let pulseCorrelation = 0;
  for (let beat = 0; beat < 32; beat++) {
    const start = Math.round(beat * left.length / 32);
    for (let i = 0; i < pulseLength; i++) {
      pulseCorrelation += (left[(start + i) % left.length] + right[(start + i) % right.length])
        * .5 * kick[i];
    }
  }
  assert.ok(pulseCorrelation / (32 * pulseLength) > .015,
    `${trackId}: the four-on-the-floor kick must remain audible on all eight bars`);
}

function makeAudioWorker() {
  const moduleURL = new URL('../src/audio-worker.js', import.meta.url).href;
  // Node supplies the browser worker's message transport; synthesis and real
  // transferable detachment both run in the production worker module.
  const source = `
    import { parentPort } from 'node:worker_threads';
    globalThis.self = {
      postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
    };
    await import(${JSON.stringify(moduleURL)});
    parentPort.on('message', data => self.onmessage({ data }));
  `;
  return new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`));
}

async function request(worker, message) {
  const reply = once(worker, 'message');
  worker.postMessage(message);
  const [response] = await reply;
  if (response.error) throw new Error(response.error);
  return response;
}

test('all event samples retain their audible duration, loudness, headroom and noise-loop seam', () => {
  assertEffects(synthesizeSamples());
});

test('all original scores retain stereo, tempo, beat pulses, loudness and smooth loop seams', () => {
  const drums = synthesizeSamples();
  for (const trackId of Object.keys(TEMPOS)) {
    assertTrack(synthesizeTrack(trackId, drums), trackId, drums.kick.channels[0]);
  }
});

test('transferred startup audio and later second/third tracks remain fully audible', async t => {
  const worker = makeAudioWorker();
  t.after(() => worker.terminate());
  const initial = await request(worker, { id: 1, type: 'init', trackId: 'coastal_highway' });
  assertEffects(initial.samples);
  const kick = initial.samples.kick.channels[0];
  assertTrack(initial.track, 'coastal_highway', kick);
  const second = await request(worker, { id: 2, type: 'track', trackId: 'touge_pass' });
  assertTrack(second.track, 'touge_pass', kick);
  const third = await request(worker, { id: 3, type: 'track', trackId: 'neon_skyway' });
  assertTrack(third.track, 'neon_skyway', kick);
});

test('an effects-only startup still produces a playable music loop when a race later begins', async t => {
  const worker = makeAudioWorker();
  t.after(() => worker.terminate());
  const initial = await request(worker, { id: 1, type: 'init', trackId: null });
  assertEffects(initial.samples);
  const race = await request(worker, { id: 2, type: 'track', trackId: 'neon_skyway' });
  assertTrack(race.track, 'neon_skyway', initial.samples.kick.channels[0]);
});
