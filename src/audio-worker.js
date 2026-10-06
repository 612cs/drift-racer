import { synthesizeSamples, synthesizeTrack } from './audio-synth.js';

let drums = null;

function transferBuffers(samples, track) {
  const buffers = [];
  for (const sample of Object.values(samples)) {
    for (const channel of sample.channels) buffers.push(channel.buffer);
  }
  if (track) for (const channel of track.channels) buffers.push(channel.buffer);
  return buffers;
}

self.onmessage = ({ data }) => {
  const id = data?.id;
  try {
    if (data?.type === 'init') {
      if (drums) throw new Error('Audio worker is already initialized');
      const samples = synthesizeSamples();
      const retained = { kick: samples.kick, snare: samples.snare, hat: samples.hat };
      const track = data.trackId === null ? null : synthesizeTrack(data.trackId, retained);
      // Only these three mono samples must remain usable after postMessage detaches
      // its transfer list. Event PCM and the requested music leave the worker once.
      for (const name of ['kick', 'snare', 'hat']) {
        samples[name] = {
          sampleRate: retained[name].sampleRate,
          channels: [retained[name].channels[0].slice()],
        };
      }
      self.postMessage({ id, samples, trackId: data.trackId, track }, transferBuffers(samples, track));
      drums = retained;
      return;
    }
    if (data?.type === 'track') {
      if (!drums) throw new Error('Audio worker has not been initialized');
      const track = synthesizeTrack(data.trackId, drums);
      self.postMessage({ id, trackId: data.trackId, track }, transferBuffers({}, track));
      return;
    }
    throw new Error(`Unknown audio worker request: ${data?.type}`);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
