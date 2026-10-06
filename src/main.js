import { TRACKS, CARS, ACHIEVEMENTS, formatTime } from './data.js';
import { Race } from './race.js';
import { Store } from './save.js';
import { Renderer, drawCar } from './renderer.js';
import { AudioEngine } from './audio.js';

const $ = id => document.getElementById(id);
const store = new Store();
const renderer = new Renderer($('world'));
const audio = new AudioEngine();
const keys = new Set();
const input = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
const renderOptions = { time: 0, idealLine: true, quality: 'auto', paint: 'standard', goldTrail: false, preview: true };
const preview = { track: TRACKS[0], car: CARS[0], phase: 'menu', countdown: 0, z: 0, x: 0, speed: 80, steer: 0, angle: 0, driftTime: 0, combo: 0, nitro: 0, boostTimer: 0, nitroTimer: 0, shake: 0, jump: 0, lap: 1, lapTime: 0, totalTime: 0, bestLap: Infinity, ghost: null, ghostDelta: null };
let trackIndex = 0;
let carIndex = 0;
let mode = 'time';
let race = null;
let lastTime = performance.now();
let accumulator = 0;
let lastHud = 0;
let lastPreview = 0;
let toastTimer;
let goUntil = 0;
let slowFrames = 0;
let effectiveQuality = 'high';
let generation = 0;
let starting = false;
let nitroPressed = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const medalNames = { gold: '金牌', silver: '银牌', bronze: '铜牌' };
const trackButtons = [];

function notice(message, duration = 4500) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
}
function storageStatus() {
  $('storage-warning').hidden = !store.error;
  $('storage-warning').textContent = store.error || '';
}
function configureAudio() {
  audio.configure({ ...store.data.settings, enhancedEngine: store.data.achievements.includes('speed_demon') });
}
async function unlockAudio() {
  try {
    const enabled = await audio.unlock();
    if (!enabled) notice('当前浏览器无法启用 Web Audio，游戏将无声运行。');
    configureAudio();
  }
  catch (error) { notice(`音频不可用：${error.message}。游戏仍可继续。`); }
}
async function uiSound() {
  await unlockAudio();
  audio.play('ui');
}
function requirement(item) {
  if (!item.unlock) return '初始可用';
  if (item.unlock.allGold) return '三条赛道全金牌后解锁';
  const track = TRACKS.find(t => t.id === item.unlock.trackId);
  return `${track.name}${medalNames[item.unlock.medal]}后解锁`;
}
function showAchievements(ids) {
  for (const id of ids || []) {
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    if (achievement) notice(`成就达成 · ${achievement.name} / ${achievement.reward}`);
  }
  configureAudio();
  storageStatus();
}

for (const [index, track] of TRACKS.entries()) {
  const button = document.createElement('button');
  button.className = 'track-card';
  button.dataset.track = track.id;
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = `<canvas width="620" height="170" aria-hidden="true"></canvas><span class="card-tag">${String(index + 1).padStart(2, '0')} / ${track.theme.toUpperCase()}</span><span class="selected-mark" hidden>✓</span><div class="track-text"><div class="track-title"><strong>${track.name}</strong><span>${(track.length / 1000).toFixed(1)} KM</span></div><p>${track.title}</p><div class="track-meta"><span class="difficulty">${'★'.repeat(track.difficulty)}${'☆'.repeat(5-track.difficulty)}</span><b class="record"></b></div></div>`;
  button.addEventListener('click', () => { trackIndex = index; uiSound(); updateMenu(); });
  $('tracks').append(button);
  trackButtons.push(button);
  const thumb = new Renderer(button.querySelector('canvas'));
  thumb.render({ ...preview, track, z: track.length * .17 }, { ...renderOptions, preview: true, time: index * 28, quality: 'low' });
}

function updateMenu() {
  const track = TRACKS[trackIndex];
  const car = CARS[carIndex];
  preview.track = track;
  preview.car = car;
  trackButtons.forEach((button, index) => {
    const item = TRACKS[index];
    const unlocked = store.isUnlocked('track', item.id);
    const record = store.getRecord(item.id, car.id);
    button.disabled = !unlocked;
    button.setAttribute('aria-pressed', String(index === trackIndex));
    button.querySelector('.selected-mark').hidden = index !== trackIndex;
    button.querySelector('.record').textContent = unlocked ? record ? `${medalNames[record.medal] || 'PB'} ${formatTime(record.bestLap)}` : '未有纪录' : `锁定 · ${requirement(item)}`;
    button.setAttribute('aria-label', `${item.name}，${item.length / 1000}公里，${unlocked ? record ? `最佳圈速 ${formatTime(record.bestLap)}` : '未有纪录' : requirement(item)}`);
  });
  $('car-title').textContent = car.title;
  $('car-name').textContent = car.name;
  $('car-description').textContent = car.description;
  $('car-index').textContent = `${String(carIndex + 1).padStart(2, '0')} / 04`;
  $('car-stats').innerHTML = ['极速', '加速', '操控', '漂移'].map((name, index) => `<div class="stat" aria-label="${name} ${car.stats[index]}分，满分5分"><span>${name}</span>${[1,2,3,4,5].map(n => `<i class="${n <= car.stats[index] ? 'on' : ''}" aria-hidden="true"></i>`).join('')}</div>`).join('');
  const unlockedCar = store.isUnlocked('car', car.id);
  $('car-lock').hidden = unlockedCar;
  $('car-lock').textContent = `锁定 · ${requirement(car)}`;
  $('start').disabled = !unlockedCar || !store.isUnlocked('track', track.id) || starting;
  $('start').innerHTML = `${mode === 'time' ? '开始计时赛' : '进入自由练习'} <span>↗</span>`;
  $('mode-time').setAttribute('aria-pressed', String(mode === 'time'));
  $('mode-practice').setAttribute('aria-pressed', String(mode === 'practice'));
  $('ideal-line').closest('label').hidden = mode !== 'practice';
  $('achievement-count').textContent = `${store.data.achievements.length} / 6`;
  const canvas = $('car-preview');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCar(ctx, car, 150, 80, 1, 0, { paint: store.data.settings.paint });
  storageStatus();
}
function switchCar(direction) {
  carIndex = (carIndex + direction + CARS.length) % CARS.length;
  uiSound();
  updateMenu();
}
function chooseMode(value) { mode = value; uiSound(); updateMenu(); }
function clearInput() {
  keys.clear();
  nitroPressed = false;
  input.throttle = input.brake = input.steer = 0;
  input.drift = input.nitro = false;
}
function closeDialogs() {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}
async function startRace() {
  if (starting) return;
  const track = TRACKS[trackIndex];
  const car = CARS[carIndex];
  if (!store.isUnlocked('track', track.id) || !store.isUnlocked('car', car.id)) {
    notice('所选赛道或赛车尚未解锁。');
    return;
  }
  starting = true;
  const token = ++generation;
  $('start').disabled = true;
  audio.setActive(true);
  await unlockAudio();
  if (token !== generation) { starting = false; return; }
  starting = false;
  clearInput();
  closeDialogs();
  race = new Race(track, car, mode, mode === 'time' ? store.getGhost(track.id, car.id) : null);
  audio.setTrack(track.id);
  audio.setActive(true);
  document.body.classList.add('driving');
  $('menu').hidden = true;
  $('hud').hidden = false;
  $('practice-line').hidden = mode !== 'practice';
  $('race-ideal-line').checked = store.data.settings.idealLine;
  $('hud-track').textContent = track.title;
  $('countdown').hidden = false;
  $('countdown').textContent = '3';
  accumulator = 0;
  goUntil = 0;
  updateHud();
  $('pause-button').focus({ preventScroll: true });
}
function returnToMenu() {
  ++generation;
  starting = false;
  closeDialogs();
  race = null;
  clearInput();
  $('countdown').hidden = true;
  $('hud').hidden = true;
  $('menu').hidden = false;
  document.body.classList.remove('driving');
  audio.setActive(true);
  audio.update(preview);
  updateMenu();
  $('start').focus({ preventScroll: true });
}
function pauseRace() {
  if (!race || !['racing', 'countdown'].includes(race.state.phase)) return;
  race.pause();
  clearInput();
  $('countdown').hidden = true;
  audio.setActive(false);
  $('pause-stats').textContent = `第 ${race.state.lap} 圈 · ${formatTime(race.state.lapTime)} / 总时间 ${formatTime(race.state.totalTime)}`;
  $('pause-dialog').showModal();
}
function resumeRace() {
  if (!race || race.state.phase !== 'paused') return;
  $('pause-dialog').close();
  clearInput();
  race.resume();
  accumulator = 0;
  audio.setActive(true);
  $('pause-button').focus({ preventScroll: true });
}
function finishRace() {
  const result = race.result;
  const saved = store.record(result);
  audio.play('finish');
  $('countdown').hidden = true;
  $('result-medal').textContent = saved.medal ? `${saved.medal.toUpperCase()} MEDAL / ${medalNames[saved.medal]}` : 'FINISHED / 完成挑战';
  $('result-title').textContent = saved.newBest ? '新的自己，新的纪录。' : '漂亮的三圈。';
  $('result-track').textContent = `${race.state.track.name} / ${race.state.car.name}`;
  $('result-best').textContent = formatTime(result.bestLap);
  $('result-total').textContent = formatTime(result.totalTime);
  $('result-laps').innerHTML = result.lapTimes.map((time,index) => `<span>L${index+1} ${formatTime(time)}</span>`).join('');
  $('result-detail').textContent = `最高 Combo ×${result.maxCombo} · 氮气 ${result.nitroUses} 次 · 撞墙 ${result.collisions} 次 · 击败 Ghost ${result.ghostWins} 圈`;
  const achieved = (saved.achievements || []).map(id => ACHIEVEMENTS.find(a => a.id === id));
  const lines = [...(saved.unlocked || []).map(name => `新解锁 · ${name}`), ...achieved.filter(Boolean).map(a => `成就 · ${a.name} / ${a.reward}`)];
  $('result-unlocks').replaceChildren(...lines.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
  configureAudio();
  storageStatus();
  $('result-dialog').showModal();
}
function updateHud() {
  if (!race) return;
  const s = race.state;
  const practice = mode === 'practice';
  $('lap-label').textContent = practice ? 'FREE PRACTICE / 自由练习' : `LAP ${String(Math.min(s.lap,3)).padStart(2,'0')} / 03`;
  $('lap-time').textContent = practice ? '寻找你的路线' : formatTime(s.lapTime);
  $('best-time').textContent = formatTime(Math.min(s.bestLap, store.getRecord(s.track.id, s.car.id)?.bestLap ?? Infinity));
  $('total-time').textContent = practice ? '不限圈数' : formatTime(s.totalTime);
  $('speed').textContent = String(Math.round(s.speed)).padStart(3, '0');
  $('needle').style.transform = `rotate(${-120 + Math.min(s.speed / 280,1)*240}deg)`;
  document.querySelector('.gauge-fill').style.strokeDashoffset = String(400 - Math.min(s.speed / 280, 1)*400);
  $('nitro-fill').style.width = `${s.nitro}%`;
  $('nitro-number').textContent = `${Math.floor(s.nitro)}%`;
  document.querySelector('.nitro-meter').setAttribute('aria-valuenow', String(Math.round(s.nitro)));
  $('combo').textContent = s.combo ? `DRIFT ×${s.combo}` : '';
  $('combo').style.color = s.combo >= 3 ? '#ffd76e' : s.combo >= 2 ? '#c394ff' : '#7ad9ed';
  $('boost-label').textContent = s.nitroTimer > 0 ? 'NITRO IGNITION' : s.boostTimer > 0 ? 'BOOST RELEASE' : '';
  const delta = s.ghostDelta;
  $('ghost-delta').textContent = delta === null ? practice ? '' : 'GHOST / 首次挑战，创造你的纪录' : `${delta >= 0 ? '领先 +' : '落后 −'}${Math.abs(delta).toFixed(2)}s`;
  $('ghost-delta').style.color = delta === null ? '#ddd' : delta >= 0 ? '#82e9b5' : '#ff8793';
  if (s.phase === 'countdown') {
    $('countdown').hidden = false;
    $('countdown').textContent = String(Math.max(1, Math.ceil(s.countdown)));
  } else if (s.phase === 'racing' && performance.now() < goUntil) {
    $('countdown').hidden = false;
    $('countdown').textContent = 'GO!';
  } else $('countdown').hidden = true;
}
function processEvent(event) {
  if (event.type === 'finish') { finishRace(); return; }
  if (event.type === 'go') { goUntil = performance.now() + 700; audio.play('countdown', 'go'); }
  else if (event.type === 'countdown') audio.play('countdown', event.value ?? event.count ?? Math.ceil(race.state.countdown));
  else if (['boost','nitro','collision'].includes(event.type)) audio.play(event.type);
  else if (event.type === 'lap' && mode === 'time') notice(`第 ${race.state.lap - 1} 圈完成 · ${formatTime(event.time ?? race.state.lapTimes.at(-1))}`, 2200);
  showAchievements(store.recordEvent(event));
}
function renderFrame(now) {
  const frameDt = Math.min((now - lastTime) / 1000, .1);
  lastTime = now;
  slowFrames = frameDt > .023 ? slowFrames + 1 : Math.max(0, slowFrames - .25);
  if (slowFrames > 30) effectiveQuality = 'low';
  else if (slowFrames < 2) effectiveQuality = 'high';
  renderOptions.time = now / 1000;
  renderOptions.quality = store.data.settings.quality === 'auto' ? effectiveQuality : store.data.settings.quality;
  renderOptions.paint = store.data.settings.paint;
  renderOptions.goldTrail = store.data.achievements.includes('combo_master');
  if (race) {
    input.throttle = keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
    input.brake = keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0;
    input.steer = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    input.drift = keys.has('Space');
    input.nitro = nitroPressed || keys.has('ShiftLeft') || keys.has('ShiftRight');
    accumulator += frameDt;
    while (accumulator >= 1/60) {
      race.update(1/60, input);
      nitroPressed = false;
      input.nitro = keys.has('ShiftLeft') || keys.has('ShiftRight');
      for (const event of race.events) processEvent(event);
      accumulator -= 1/60;
    }
    renderOptions.preview = false;
    renderOptions.idealLine = mode === 'practice' && store.data.settings.idealLine;
    renderer.render(race.state, renderOptions);
    audio.update(race.state);
    if (now - lastHud > 33) { updateHud(); lastHud = now; }
  } else if (now - lastPreview >= (reducedMotion.matches ? 1000 : 50)) {
    preview.z = reducedMotion.matches ? 180 : (now / 1000 * 24) % preview.track.length;
    renderOptions.preview = true;
    renderOptions.idealLine = false;
    renderer.render(preview, renderOptions);
    audio.update(preview);
    lastPreview = now;
  }
  requestAnimationFrame(renderFrame);
}

$('previous-car').addEventListener('click', () => switchCar(-1));
$('next-car').addEventListener('click', () => switchCar(1));
$('mode-time').addEventListener('click', () => chooseMode('time'));
$('mode-practice').addEventListener('click', () => chooseMode('practice'));
$('start').addEventListener('click', startRace);
$('pause-button').addEventListener('click', pauseRace);
$('resume').addEventListener('click', resumeRace);
$('restart-race').addEventListener('click', startRace);
$('exit-race').addEventListener('click', returnToMenu);
$('try-again').addEventListener('click', startRace);
$('result-menu').addEventListener('click', returnToMenu);
$('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); resumeRace(); });
$('result-dialog').addEventListener('cancel', event => { event.preventDefault(); returnToMenu(); });

function saveSettings(patch) {
  store.settings(patch);
  configureAudio();
  storageStatus();
}
for (const id of ['ideal-line','race-ideal-line']) $(id).addEventListener('change', event => {
  saveSettings({ idealLine: event.target.checked });
  $('ideal-line').checked = $('race-ideal-line').checked = event.target.checked;
});
$('settings-button').addEventListener('click', () => {
  const settings = store.data.settings;
  $('volume').value = String(settings.volume*100);
  $('volume-value').textContent = `${Math.round(settings.volume*100)}%`;
  $('music').checked = settings.music;
  $('sfx').checked = settings.sfx;
  $('quality').value = settings.quality;
  $('paint').value = settings.paint;
  $('paint').querySelector('[value=aurora]').disabled = !store.data.achievements.includes('perfect_line');
  $('paint').querySelector('[value=ghost]').disabled = !store.data.achievements.includes('ghost_hunter');
  $('settings-dialog').showModal();
  uiSound();
});
$('volume').addEventListener('input', event => {
  $('volume-value').textContent = `${event.target.value}%`;
  saveSettings({ volume: Number(event.target.value)/100 });
});
for (const id of ['music','sfx']) $(id).addEventListener('change', event => saveSettings({ [id]: event.target.checked }));
for (const id of ['quality','paint']) $(id).addEventListener('change', event => { saveSettings({ [id]: event.target.value }); updateMenu(); });
$('settings-close').addEventListener('click', () => { uiSound(); $('settings-dialog').close(); });
$('achievements-button').addEventListener('click', () => {
  $('achievements').innerHTML = ACHIEVEMENTS.map((a,index) => {
    const earned = store.data.achievements.includes(a.id);
    return `<article class="achievement ${earned ? 'earned' : ''}"><span class="micro">${String(index+1).padStart(2,'0')} / ${earned ? '已达成' : '未解锁'}</span><h3>${a.name}</h3><p>${a.description}</p><p class="reward">奖励 · ${a.reward}</p></article>`;
  }).join('');
  uiSound();
  $('achievements-dialog').showModal();
});
$('achievements-close').addEventListener('click', () => { uiSound(); $('achievements-dialog').close(); });
const gameKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','KeyR']);
addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
  const dialogOpen = document.querySelector('dialog[open]');
  if (dialogOpen) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (!race) {
    if (event.code === 'Enter' && event.target instanceof HTMLButtonElement) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'ArrowLeft') switchCar(-1);
    else if (event.code === 'ArrowRight') switchCar(1);
    else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') { trackIndex = (trackIndex + (event.code === 'ArrowDown' ? 1 : -1) + TRACKS.length) % TRACKS.length; updateMenu(); }
    else if (event.code === 'Enter') startRace();
    return;
  }
  if (gameKeys.has(event.code) || event.code === 'Escape') event.preventDefault();
  if (event.code === 'Escape' && !event.repeat) { pauseRace(); return; }
  if (event.code === 'KeyR' && !event.repeat && race.state.phase === 'racing') {
    race.restartLap(); clearInput(); notice('当前圈已重新开始，已完成的圈速保留。'); return;
  }
  if (gameKeys.has(event.code)) keys.add(event.code);
  if (!event.repeat && (event.code === 'ShiftLeft' || event.code === 'ShiftRight')) nitroPressed = true;
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => { clearInput(); pauseRace(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInput(); pauseRace(); audio.setActive(false); }
  else if (!race || race.state.phase !== 'paused') audio.setActive(true);
});
addEventListener('pagehide', () => audio.close());
configureAudio();
$('ideal-line').checked = store.data.settings.idealLine;
updateMenu();
requestAnimationFrame(renderFrame);
