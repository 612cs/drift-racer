const SAMPLE_RATE = 22050;
const TABLE_SIZE = 2048;
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

let tables;

function makeSample(duration, synth) {
  const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  for (let i = 0; i < samples.length; i++) samples[i] = synth(i / SAMPLE_RATE, i);
  return { sampleRate: SAMPLE_RATE, channels: [samples] };
}

/** Generate the original mono event samples as independently owned PCM buffers. */
export function synthesizeSamples() {
  const noise = makeRandom(0x51f2a71);
  let previousNoise = 0;
  const samples = {};
  samples.kick = makeSample(.42, t => {
    const phase = TAU * (48 * t + 95 * .026 * (1 - Math.exp(-t / .026)));
    return Math.sin(phase) * Math.exp(-t * 11) * .85;
  });
  samples.snare = makeSample(.23, t =>
    (noise() * .67 + Math.sin(TAU * 175 * t) * .3) * Math.exp(-t * 20) * Math.min(t * 1600, 1));
  samples.hat = makeSample(.09, t => {
    const value = noise();
    const high = value - previousNoise;
    previousNoise = value;
    return high * .26 * Math.exp(-t * 65) * Math.min(t * 1800, 1);
  });
  samples.ui = makeSample(.1, t =>
    (Math.sin(TAU * 1450 * t) * .36 + noise() * .16) * Math.exp(-t * 65) * Math.min(t * 1800, 1));
  samples.boost = makeSample(.65, t => {
    const sub = Math.sin(TAU * (48 * t + 45 * .045 * (1 - Math.exp(-t / .045))));
    const rise = Math.sin(TAU * (180 * t + 190 * t * t));
    return (sub * .58 + noise() * .24 + rise * .14) * Math.exp(-t * 5) * Math.min(t * 500, 1);
  });
  samples.nitro = makeSample(.9, t => {
    const envelope = Math.sin(Math.PI * Math.min(t / .9, 1)) ** .65;
    return (noise() * .5 + Math.sin(TAU * (65 * t + 95 * t * t)) * .23) * envelope;
  });
  samples.collision = makeSample(.85, t => {
    const metal = Math.sin(TAU * 311 * t) * .25 + Math.sin(TAU * 527 * t) * .2
      + Math.sin(TAU * 913 * t) * .15 + Math.sin(TAU * 1517 * t) * .1;
    const glass = noise() * .42 * Math.exp(-t * 14) * (.65 + .35 * Math.sin(TAU * 43 * t));
    return (metal * Math.exp(-t * 7) + glass) * Math.min(t * 1200, 1);
  });
  for (const [name, frequency] of [['countLow', 330], ['countHigh', 660], ['go', 880]]) {
    const duration = name === 'go' ? .48 : .23;
    samples[name] = makeSample(duration, t => {
      const envelope = Math.min(t / .006, 1) * Math.min((duration - t) / .08, 1);
      return (Math.sin(TAU * frequency * t) + .2 * Math.sin(TAU * frequency * 2 * t)) * envelope * .4;
    });
  }
  let crowdLow = 0;
  samples.finish = makeSample(2.6, t => {
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
  samples.noise = makeSample(2, () => noise() * .65);
  const loop = samples.noise.channels[0];
  // Ease the last 11 ms into the first sample to avoid a discontinuity at the join.
  for (let i = 0; i < 256; i++) {
    const blend = i / 255;
    loop[loop.length - 256 + i] = loop[loop.length - 256 + i] * (1 - blend) + loop[0] * blend;
  }
  return samples;
}

/** Render one stereo, 32-beat loop using retained kick/snare/hat mono PCM. */
export function synthesizeTrack(trackId, drums) {
  if (!Object.hasOwn(SCORES, trackId)) throw new Error(`Unknown audio track: ${trackId}`);
  for (const name of ['kick', 'snare', 'hat']) {
    const sample = drums?.[name];
    if (sample?.sampleRate !== SAMPLE_RATE || sample.channels?.length !== 1
      || !(sample.channels[0] instanceof Float32Array) || sample.channels[0].length === 0) {
      throw new Error(`Missing or unusable ${name} PCM`);
    }
  }
  tables ??= makeTables();
  const score = SCORES[trackId];
  const beat = 60 / score.bpm;
  const length = Math.round(32 * beat * SAMPLE_RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
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
    const data = sample.channels[0];
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
      drum(drums.hat, time, step % 2 ? .19 : .31, step % 2 ? .4 : -.4);
    }
    for (let step = 0; step < 16; step++) {
      note(root + 12 + chord[(step + bar) % 4], bar * 4 + step * .25, .2,
        score.voice === 'bright' ? .043 : .027, 'pulse', step % 2 ? .65 : -.65, .004, .06);
      if (score.voice !== 'warm' && step % 2) drum(drums.hat, bar * 4 + step * .25, .12, .5);
    }
    for (let step = 0; step < 4; step++) drum(drums.kick, bar * 4 + step, .64);
    drum(drums.snare, bar * 4 + 1, .48);
    drum(drums.snare, bar * 4 + 3, .53);
    if (score.voice === 'pulse') drum(drums.kick, bar * 4 + 2.75, .42);
    if (score.voice === 'bright' && bar % 2) drum(drums.snare, bar * 4 + 3.75, .25);
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = .8 / Math.max(peak, .8);
  for (let i = 0; i < length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
  return { sampleRate: SAMPLE_RATE, channels: [left, right] };
}
