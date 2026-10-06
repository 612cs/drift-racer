import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../src/race.js';
import { Store } from '../src/save.js';
import { TRACKS, CARS, medalFor } from '../src/data.js';

const step = 1 / 60;
const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};
const advance = (race, seconds, input = {}) => {
  const events = [];
  for (let tick = 0; tick < Math.round(seconds / step); tick++) {
    race.update(step, input);
    events.push(...race.events);
  }
  return events;
};
function result(track = TRACKS[0], car = CARS[0], times = [110, 111, 112], stats = {}) {
  const time = Math.min(...times);
  return { trackId: track.id, carId: car.id, bestLap: time, totalTime: times.reduce((a,b) => a+b), lapTimes: times, collisions: 1, nitroUses: 0, maxCombo: 0, combo3: 0, successBoosts: 0, ghostWins: 0,
    ghost: { time, frames: [[0,0,0,0],[time/2,track.length/2,.2,.1],[time,track.length,0,0]] }, ...stats };
}
function running(track = TRACKS[0], car = CARS[0], mode = 'time', ghost = null) {
  const race = new Race(track, car, mode, ghost);
  advance(race, 3);
  assert.equal(race.state.phase, 'racing');
  return race;
}

test('drift release converts the three duration tiers into boost and nitro', () => {
  for (const [duration,combo,nitro,timer] of [[.6,1,5,1.5],[1.2,2,15,2.25],[2.05,3,30,3]]) {
    const race = running();
    race.state.speed = 70;
    race.state.x = -.7;
    advance(race, duration, { throttle: 1, steer: 1, drift: true });
    assert.equal(race.state.combo, combo);
    const speed = race.state.speed;
    const events = advance(race, step, { throttle:1 });
    assert.equal(events.find(event => event.type === 'boost')?.combo, combo);
    assert.equal(race.state.nitro, nitro);
    assert.ok(race.state.speed > speed * 1.15);
    assert.ok(Math.abs(race.state.boostTimer - timer) < .02);
  }
});

test('offroad and collision break a drift; wall impact rebounds and slows the car', () => {
  const race = running();
  race.state.speed = 90;
  race.state.x = .98;
  advance(race, .3, { throttle:1, steer:1, drift:true });
  assert.equal(race.state.combo, 0);
  assert.equal(race.state.drifting, false);
  assert.ok(race.state.speed <= race.state.car.maxSpeed * .5 + .1);
  race.state.x = 1.179;
  race.state.speed = 90;
  const events = advance(race, .1, { throttle:1, steer:1 });
  assert.ok(events.some(event => event.type === 'collision'));
  assert.equal(race.state.collisions, 1);
  assert.ok(race.state.x < 1);
  assert.ok(race.state.speed < 40);
});

test('nitro needs 50%, fires once per press, and lasts three simulation seconds', () => {
  const race = running();
  race.state.speed = 80;
  race.state.nitro = 49;
  assert.equal(advance(race, step, { nitro:true }).filter(e=>e.type==='nitro').length, 0);
  advance(race, step);
  race.state.nitro = 100;
  const events = advance(race, .5, { throttle:1, nitro:true });
  assert.equal(events.filter(e=>e.type==='nitro').length, 1);
  assert.equal(race.state.nitro, 50);
  assert.equal(race.state.nitroUses, 1);
  advance(race, 3, { throttle:1 });
  assert.equal(race.state.nitroTimer, 0);
});

test('pause freezes clocks and a held drift cannot release a free boost on resume', () => {
  const race = running();
  race.state.speed = 70;
  race.state.x = -.7;
  advance(race, 1.2, { throttle:1, steer:1, drift:true });
  race.pause();
  const before = { time:race.state.totalTime,z:race.state.z,nitro:race.state.nitro };
  advance(race, 5, { throttle:1,drift:true,nitro:true });
  assert.deepEqual({ time:race.state.totalTime,z:race.state.z,nitro:race.state.nitro }, before);
  race.resume();
  assert.equal(advance(race, .3, { throttle:1 }).filter(e=>e.type==='boost').length, 0);
  assert.equal(race.state.nitro, before.nitro);
});

test('lap crossing has exact ghost endpoints; restart drops only the unfinished lap', () => {
  const shortTrack = { ...TRACKS[0], length: 50 };
  const race = running(shortTrack);
  while (race.state.lap === 1) race.update(step,{throttle:1});
  const first = race.state.lapTimes[0];
  assert.equal(race.state.lap,2);
  race.state.x = 1.2;
  advance(race, step,{ throttle:1 });
  assert.equal(race.state.collisions,1);
  race.restartLap();
  assert.equal(race.state.lap,2);
  assert.deepEqual(race.state.lapTimes,[first]);
  assert.equal(race.state.totalTime,first);
  assert.equal(race.state.collisions,0);
  for(let tick=0;tick<3000 && race.state.phase!=='result';tick++) race.update(step,{throttle:1});
  assert.equal(race.state.phase,'result');
  assert.equal(race.result.lapTimes.length,3);
  assert.equal(race.result.collisions,0);
  assert.ok(Math.abs(race.result.totalTime-race.result.lapTimes.reduce((a,b)=>a+b))<1e-8);
  assert.equal(race.result.ghost.frames.at(-1)[1],shortTrack.length);
  assert.equal(race.result.ghost.frames.at(-1)[0],race.result.bestLap);
});

test('free practice stays open beyond three laps and produces no race result', () => {
  const race = running({ ...TRACKS[0], length:50 },CARS[0],'practice');
  for(let tick=0;tick<1600;tick++) race.update(step,{throttle:1});
  assert.ok(race.state.lap>3);
  assert.equal(race.state.phase,'racing');
  assert.equal(race.result,null);
  assert.ok(race.state.lapTimes.length<=3);
});

test('medal boundaries unlock the real content IDs and never downgrade', () => {
  const storage = memory();
  const store = new Store(storage);
  assert.equal(medalFor(TRACKS[0],105),'gold');
  assert.equal(medalFor(TRACKS[0],105.001),'silver');
  store.record(result(TRACKS[0],CARS[0],[120,121,122]));
  assert.equal(store.isUnlocked('track','touge_pass'),true);
  assert.equal(store.isUnlocked('car','car_b'),false);
  store.record(result(TRACKS[0],CARS[0],[105,106,107]));
  assert.equal(store.isUnlocked('car','car_b'),true);
  store.record(result(TRACKS[1],CARS[0],[150,151,152]));
  assert.equal(store.isUnlocked('track','neon_skyway'),false);
  store.record(result(TRACKS[1],CARS[0],[130,131,132]));
  assert.equal(store.isUnlocked('track','neon_skyway'),true);
  assert.equal(store.isUnlocked('car','car_c'),true);
  store.record(result(TRACKS[2],CARS[0],[125,126,127]));
  assert.equal(store.isUnlocked('car','car_d'),true);
  assert.ok(store.data.achievements.includes('legend_driver'));
  store.record(result(TRACKS[0],CARS[0],[160,161,162]));
  const restored = new Store(storage);
  assert.equal(restored.getRecord('coastal_highway','car_a').medal,'gold');
  assert.equal(restored.isUnlocked('car','car_d'),true);
});

test('best lap/total are independent and stored ghost stays attached to that car and lap', () => {
  const store = new Store(memory());
  store.record(result(TRACKS[0],CARS[0],[100,110,110]));
  store.record(result(TRACKS[0],CARS[0],[104,104,104]));
  const record = store.getRecord('coastal_highway','car_a');
  assert.equal(record.bestLap,100);
  assert.equal(record.bestTotal,312);
  assert.equal(record.ghost.time,100);
  assert.equal(store.getGhost('coastal_highway','car_b'),null);
});

test('ghost sampling preserves stationary time and exact finish; playback delta is positive when leading', () => {
  const storage = memory();
  const store = new Store(storage);
  const submitted = result(TRACKS[0],CARS[0],[110,111,112]);
  submitted.ghost.frames = [];
  for(let tick=0;tick<=6600;tick++) { const t=tick/60; submitted.ghost.frames.push([t, t<10 ? 0 : (t-10)/100*2800,.2,.1]); }
  store.record(submitted);
  const ghost = new Store(storage).getGhost('coastal_highway','car_a');
  assert.equal(ghost.frames.at(-1)[0],110);
  assert.equal(ghost.frames.at(-1)[1],2800);
  assert.ok(ghost.frames.length<=320);
  assert.equal(ghost.frames.find(frame=>frame[0]>5)[1],0);
  const race = running(TRACKS[0],CARS[0],'time',ghost);
  advance(race,5,{ throttle:1 });
  assert.ok(race.state.ghostDelta>0);
  assert.equal(race.state.ghost.z,0);
});

test('six achievements require their actual criteria; ten Ghost wins cannot be farmed by duplicate results', () => {
  const store = new Store(memory());
  assert.deepEqual(store.recordEvent({type:'boost',combo:3,mode:'practice'}),[]);
  store.record(result(TRACKS[0],CARS[0],[115,116,117],{collisions:0,nitroUses:5,combo3:5,maxCombo:3,successBoosts:5,ghostWins:3}));
  assert.equal(store.data.ghostWins,0);
  for(const id of ['first_drift','combo_master','perfect_line','speed_demon']) assert.ok(store.data.achievements.includes(id));
  for(let i=0;i<4;i++) {
    const submitted=result(TRACKS[0],CARS[0],[110-i*3,111-i*3,112-i*3],{ghostWins:3});
    store.record(submitted);
    store.record(submitted);
  }
  assert.equal(store.data.ghostWins,12);
  assert.ok(store.data.achievements.includes('ghost_hunter'));
  store.settings({paint:'ghost'});
  assert.equal(store.data.settings.paint,'ghost');
});

test('storage rejection is visible while in-memory play remains available', () => {
  const store = new Store({ getItem:()=>null,setItem:()=>{throw new Error('quota exceeded');} });
  store.record(result());
  assert.match(store.error,/quota exceeded/);
  assert.equal(store.getRecord('coastal_highway','car_a').bestLap,110);
  const denied = new Store({ getItem:()=>{throw new Error('access denied');},setItem:()=>{} });
  assert.match(denied.error,/access denied/);
});
