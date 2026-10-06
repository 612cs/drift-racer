import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality, canvasSize } from '../src/performance.js';

const frame60 = 1000 / 60;
const clock = () => ({ policy: new AdaptiveQuality(), now: 0 });
function advance(state, frameMs, count) {
  let quality = state.policy.quality;
  for (let i = 0; i < count; i++) {
    state.now += frameMs;
    quality = state.policy.update(frameMs, state.now);
  }
  return quality;
}

function assertBudget(size, budget) {
  assert.ok(Number.isInteger(size.pixelWidth) && size.pixelWidth >= 1);
  assert.ok(Number.isInteger(size.pixelHeight) && size.pixelHeight >= 1);
  assert.ok(size.pixelWidth * size.pixelHeight <= Math.max(1, Math.floor(budget)));
}

test('manual quality retains native resolution with the original high/low DPR limits', () => {
  const high = canvasSize(1920, 1080, 3, 'high');
  assert.equal(high.dpr, 2);
  assert.equal(high.pixelWidth, 3840);
  assert.equal(high.pixelHeight, 2160);
  const low = canvasSize(1920, 1080, 3, 'low');
  assert.equal(low.dpr, 1);
  assert.equal(low.pixelWidth, 1920);
  assert.equal(low.pixelHeight, 1080);
  const fractional = canvasSize(101, 81, 1.25, 'high');
  assert.equal(fractional.dpr, 1.25);
  assert.equal(fractional.pixelWidth, 126);
  assert.equal(fractional.pixelHeight, 101);
  const normal = canvasSize(640, 360, 1, 'high', 3_000_000);
  assert.equal(normal.pixelWidth, 640);
  assert.equal(normal.pixelHeight, 360);
});

test('finite budgets bound physical pixels even at rounding boundaries and tiny sizes', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [333, 211], [1, 1]]) {
    for (const budget of [1, 2, 3, 7, 63, 39999, 100001, 1_500_000, 3_000_000]) {
      for (const quality of ['high', 'low']) {
        const size = canvasSize(width, height, 2.75, quality, budget);
        assertBudget(size, budget);
        assert.ok(size.dpr <= (quality === 'low' ? 1 : 2));
      }
    }
  }
  assertBudget(canvasSize(1e9, 1, 2, 'high', 3), 3);
  assertBudget(canvasSize(1, 1e9, 2, 'high', 3), 3);
  const minimum = canvasSize(0, 0, 2, 'high', .5);
  assert.equal(minimum.pixelWidth, 1);
  assert.equal(minimum.pixelHeight, 1);
});

test('budget scaling preserves landscape and portrait aspect ratios within integer pixels', () => {
  for (const [width, height] of [[3840, 2160], [2160, 3840], [3440, 1440], [901, 1301]]) {
    for (const budget of [1_500_000, 3_000_000]) {
      const size = canvasSize(width, height, 3, 'high', budget);
      assertBudget(size, budget);
      assert.ok(Math.abs(size.pixelWidth / size.pixelHeight - width / height) < .005);
      // The scaled surface should use the budget, not collapse to a fixed small preset.
      assert.ok(size.pixelWidth * size.pixelHeight > budget * .99);
    }
  }
});

test('sustained 50fps lowers quality, rather than treating it as acceptable 60fps performance', () => {
  const state = clock();
  assert.equal(advance(state, 20, 50), 'high');
  assert.equal(advance(state, 20, 50), 'low');
  assert.equal(advance(state, 20, 300), 'low');
});

test('one short stall does not lower quality in either a fresh or a warm sample window', () => {
  for (const warmup of [0, 120]) {
    const state = clock();
    advance(state, frame60, warmup);
    state.now += 200;
    assert.equal(state.policy.update(200, state.now), 'high');
    for (let i = 0; i < 360; i++) assert.equal(advance(state, frame60, 1), 'high');
  }
});

test('stable recovery waits, and changes cannot bounce immediately in either direction', () => {
  const state = clock();
  assert.equal(advance(state, 20, 100), 'low');
  assert.equal(advance(state, frame60, 240), 'low');
  assert.equal(advance(state, frame60, 90), 'high');
  assert.equal(advance(state, 20, 25), 'high');
  assert.equal(advance(state, 20, 100), 'low');
  assert.equal(advance(state, frame60, 120), 'low');
  assert.equal(advance(state, frame60, 240), 'high');
});

test('the hysteresis band keeps the current quality rather than oscillating', () => {
  const state = clock();
  assert.equal(advance(state, 18, 400), 'high');
  assert.equal(advance(state, 20, 150), 'low');
  assert.equal(advance(state, 18, 500), 'low');
});

test('a long sampling gap discards pending degradation and does not count as recovery', () => {
  const state = clock();
  assert.equal(advance(state, 20, 70), 'high');
  state.now += 10_000;
  // A caller may provide a small current-frame duration even after a long pause.
  assert.equal(state.policy.update(frame60, state.now), 'high');
  assert.equal(advance(state, 20, 50), 'high');
  assert.equal(advance(state, 20, 50), 'low');
  assert.equal(advance(state, frame60, 210), 'low');
  state.now += 60_000;
  assert.equal(state.policy.update(frame60, state.now), 'low');
  assert.equal(advance(state, frame60, 270), 'low');
  assert.equal(advance(state, frame60, 60), 'high');
});

test('a background-length frame is ignored even when the wall-clock gap is short', () => {
  const state = clock();
  assert.equal(advance(state, 20, 100), 'low');
  assert.equal(advance(state, frame60, 210), 'low');
  state.now += frame60;
  assert.equal(state.policy.update(10_000, state.now), 'low');
  assert.equal(advance(state, frame60, 270), 'low');
  assert.equal(advance(state, frame60, 60), 'high');
});

test('a new race resets quality and pending sample history without inheriting the old race', () => {
  const state = clock();
  assert.equal(advance(state, 20, 100), 'low');
  state.policy.reset();
  assert.equal(state.policy.quality, 'high');
  assert.equal(advance(state, 20, 50), 'high');
  assert.equal(advance(state, 20, 50), 'low');
});
