import { TRACKS, CARS, ACHIEVEMENTS, medalFor, recordKey } from './data.js';

const STORAGE_KEY = 'drift-racer-v1';
const MAX_GHOST_FRAMES = 320;
const MEDALS = { bronze: 1, silver: 2, gold: 3 };
const DEFAULT_SETTINGS = Object.freeze({ volume: .65, music: true, sfx: true, quality: 'auto', paint: 'standard', idealLine: true });
const positive = value => Number.isFinite(value) && value > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const rounded = (value, places) => Number(value.toFixed(places));

function freshData() {
  return {
    records: {}, unlockedTracks: TRACKS.filter(track => !track.unlock).map(track => track.id),
    unlockedCars: CARS.filter(car => !car.unlock).map(car => car.id),
    achievements: [], ghostWins: 0, settings: { ...DEFAULT_SETTINGS },
  };
}

function validGhost(ghost, track, time) {
  if (!ghost || !positive(ghost.time) || Math.abs(ghost.time - time) > .001 || !Array.isArray(ghost.frames) || ghost.frames.length < 2) return false;
  let previousTime = -1;
  let previousZ = -1;
  for (const frame of ghost.frames) {
    if (!Array.isArray(frame) || frame.length !== 4 || !frame.every(Number.isFinite)) return false;
    const [t, z, x, angle] = frame;
    if (t <= previousTime || z < previousZ || t > ghost.time + .001 || z < 0 || z > track.length + .01 || Math.abs(x) > 1.5 || Math.abs(angle) > Math.PI) return false;
    previousTime = t;
    previousZ = z;
  }
  const first = ghost.frames[0];
  const last = ghost.frames[ghost.frames.length - 1];
  return first[0] === 0 && first[1] === 0 && Math.abs(last[0] - ghost.time) < .001 && Math.abs(last[1] - track.length) < .01;
}

// Uniform time sampling, not frame deletion with renumbered times: replay speed,
// stationary waits, and the exact finish timestamp remain unchanged.
function compressGhost(ghost) {
  const source = ghost.frames;
  const length = Math.min(MAX_GHOST_FRAMES, source.length);
  const frames = new Array(length);
  frames[0] = [...source[0]];
  frames[length - 1] = [...source[source.length - 1]];
  let cursor = 0;
  let previousTime = 0;
  for (let i = 1; i < length - 1; i++) {
    const requestedTime = ghost.time * i / (length - 1);
    let t = rounded(requestedTime, 3);
    if (t <= previousTime || t >= ghost.time) t = requestedTime;
    while (cursor + 1 < source.length - 1 && source[cursor + 1][0] < t) cursor++;
    const a = source[cursor];
    const b = source[cursor + 1];
    const mix = (t - a[0]) / (b[0] - a[0]);
    frames[i] = [t, rounded(a[1] + (b[1] - a[1]) * mix, 2), rounded(a[2] + (b[2] - a[2]) * mix, 3), rounded(a[3] + (b[3] - a[3]) * mix, 3)];
    previousTime = t;
  }
  return { time: ghost.time, frames };
}

export class Store {
  constructor(storage) {
    this.data = freshData();
    this.error = null;
    this._storage = null;
    this._recordedResults = new WeakSet();
    try {
      this._storage = storage === undefined ? globalThis.localStorage : storage;
      if (!this._storage || typeof this._storage.getItem !== 'function' || typeof this._storage.setItem !== 'function') throw new Error('浏览器不提供本地存储');
      const raw = this._storage.getItem(STORAGE_KEY);
      if (raw !== null) this._load(JSON.parse(raw));
    } catch (error) {
      this.error = `无法读取本地存档：${error.message || String(error)}。进度暂存于内存，刷新后可能丢失。`;
    }
  }

  isUnlocked(kind, id) {
    return kind === 'track' ? this.data.unlockedTracks.includes(id) : kind === 'car' ? this.data.unlockedCars.includes(id) : false;
  }

  getRecord(trackId, carId) {
    return this.data.records[recordKey(trackId, carId)] || null;
  }

  getGhost(trackId, carId) {
    return this.getRecord(trackId, carId)?.ghost || null;
  }

  recordEvent(event) {
    if (!event || event.type !== 'boost' || event.mode === 'practice' || (event.combo !== undefined && event.combo < 1)) return [];
    const granted = [];
    this._grant('first_drift', granted);
    if (granted.length) this._save();
    return granted;
  }

  record(result) {
    const outcome = { unlocked: [], achievements: [], newBest: false, medal: null };
    if (!this._validResult(result) || this._recordedResults.has(result)) return outcome;
    this._recordedResults.add(result);
    const track = TRACKS.find(item => item.id === result.trackId);
    const key = recordKey(result.trackId, result.carId);
    const previous = this.data.records[key];
    const oldGhost = previous?.ghost || null;
    const medal = medalFor(track, result.bestLap);
    const newLap = !previous || result.bestLap < previous.bestLap;
    const newTotal = !previous || result.totalTime < previous.bestTotal;
    const bestLap = newLap ? result.bestLap : previous.bestLap;
    const bestTotal = newTotal ? result.totalTime : previous.bestTotal;
    const bestMedal = (MEDALS[medal] || 0) > (MEDALS[previous?.medal] || 0) ? medal : previous?.medal || null;
    let ghost = previous?.ghost || null;
    if ((newLap || (!ghost && Math.abs(result.bestLap - bestLap) < .001)) && validGhost(result.ghost, track, result.bestLap)) ghost = compressGhost(result.ghost);
    // A prior slower ghost must never masquerade as the new personal best.
    if (ghost && Math.abs(ghost.time - bestLap) > .001) ghost = null;
    this.data.records[key] = { bestLap, bestTotal, medal: bestMedal, ghost };
    outcome.newBest = newLap || newTotal;
    outcome.medal = medal;

    // A first-ever ghost is not an opponent. Only completed, strictly faster
    // laps than the stored opponent count; restart-aborted stats are absent.
    const fasterLaps = oldGhost ? result.lapTimes.filter(time => time < oldGhost.time - 1e-9).length : 0;
    this.data.ghostWins += Math.min(result.ghostWins, fasterLaps);
    if (result.successBoosts > 0) this._grant('first_drift', outcome.achievements);
    if (result.combo3 >= 5) this._grant('combo_master', outcome.achievements);
    if (result.collisions === 0) this._grant('perfect_line', outcome.achievements);
    if (result.nitroUses >= 5) this._grant('speed_demon', outcome.achievements);
    if (this.data.ghostWins >= 10) this._grant('ghost_hunter', outcome.achievements);
    this._deriveUnlocks(outcome.unlocked);
    if (this._allGold()) this._grant('legend_driver', outcome.achievements);
    this._save();
    return outcome;
  }

  settings(patch = {}) {
    this._applySettings(patch);
    this._save();
    return this.data.settings;
  }

  _applySettings(patch) {
    if (!patch || typeof patch !== 'object') return;
    const settings = this.data.settings;
    if (Number.isFinite(patch.volume)) settings.volume = Math.max(0, Math.min(1, patch.volume));
    for (const key of ['music', 'sfx', 'idealLine']) if (typeof patch[key] === 'boolean') settings[key] = patch[key];
    if (['auto', 'high', 'low'].includes(patch.quality)) settings.quality = patch.quality;
    if (patch.paint === 'standard' || (patch.paint === 'aurora' && this.data.achievements.includes('perfect_line')) || (patch.paint === 'ghost' && this.data.achievements.includes('ghost_hunter'))) settings.paint = patch.paint;
  }

  _grant(id, newlyGranted) {
    if (!this.data.achievements.includes(id)) {
      this.data.achievements.push(id);
      newlyGranted.push(id);
    }
  }

  _trackMedal(trackId) {
    let medal = null;
    for (const car of CARS) {
      const candidate = this.getRecord(trackId, car.id)?.medal;
      if ((MEDALS[candidate] || 0) > (MEDALS[medal] || 0)) medal = candidate;
    }
    return medal;
  }

  _allGold() {
    return TRACKS.every(track => this._trackMedal(track.id) === 'gold');
  }

  _deriveUnlocks(newlyUnlocked) {
    for (const [items, field] of [[TRACKS, 'unlockedTracks'], [CARS, 'unlockedCars']]) {
      for (const item of items) {
        const condition = item.unlock;
        const eligible = !condition || (condition.allGold ? this._allGold() : (MEDALS[this._trackMedal(condition.trackId)] || 0) >= MEDALS[condition.medal]);
        if (eligible && !this.data[field].includes(item.id)) {
          this.data[field].push(item.id);
          newlyUnlocked.push(item.name);
        }
      }
    }
  }

  _validResult(result) {
    if (!result || typeof result !== 'object' || result.mode === 'practice' || !TRACKS.some(track => track.id === result.trackId) || !CARS.some(car => car.id === result.carId)) return false;
    if (!Array.isArray(result.lapTimes) || result.lapTimes.length !== 3 || !result.lapTimes.every(positive) || !positive(result.totalTime) || !positive(result.bestLap)) return false;
    if (Math.abs(result.totalTime - result.lapTimes.reduce((sum, time) => sum + time, 0)) > .01 || Math.abs(result.bestLap - Math.min(...result.lapTimes)) > .001) return false;
    for (const key of ['collisions', 'nitroUses', 'successBoosts', 'combo3', 'maxCombo', 'ghostWins']) if (!count(result[key])) return false;
    return result.ghostWins <= 3 && result.maxCombo <= 3 && result.combo3 <= result.successBoosts;
  }

  _load(saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !saved.records || typeof saved.records !== 'object' || Array.isArray(saved.records)) throw new Error('存档格式已损坏');
    const data = freshData();
    for (const track of TRACKS) {
      for (const car of CARS) {
        const key = recordKey(track.id, car.id);
        const record = saved.records[key];
        if (!record || !positive(record.bestLap) || !positive(record.bestTotal) || record.bestTotal + .001 < record.bestLap * 3) continue;
        const ghost = validGhost(record.ghost, track, record.bestLap) ? compressGhost(record.ghost) : null;
        data.records[key] = { bestLap: record.bestLap, bestTotal: record.bestTotal, medal: medalFor(track, record.bestLap), ghost };
      }
    }
    data.achievements = Array.isArray(saved.achievements) ? ACHIEVEMENTS.filter(achievement => saved.achievements.includes(achievement.id)).map(achievement => achievement.id) : [];
    data.ghostWins = count(saved.ghostWins) ? saved.ghostWins : 0;
    this.data = data;
    this._deriveUnlocks([]);
    if (this._allGold()) this._grant('legend_driver', []);
    if (data.ghostWins >= 10) this._grant('ghost_hunter', []);
    this._applySettings(saved.settings);
  }

  _save() {
    try {
      if (!this._storage) throw new Error('本地存储不可用');
      this._storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this.error = null;
    } catch (error) {
      this.error = `无法保存本地存档：${error.message || String(error)}。进度仅保存在内存，刷新后将丢失；请允许本地存储或释放浏览器存储空间。`;
    }
  }
}
