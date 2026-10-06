export const SEGMENT_LENGTH = 10;

function makeTrack(config, bends) {
  const segments = [];
  for (let z = 0; z < config.length; z += SEGMENT_LENGTH) {
    const progress = z / config.length;
    let curve = 0;
    for (const [start, end, strength] of bends) {
      if (progress >= start && progress <= end) {
        curve += Math.sin((progress - start) / (end - start) * Math.PI) * strength;
      }
    }
    const city = config.theme === 'city';
    const mountain = config.theme === 'mountain';
    let ramp = 0;
    if (city) {
      for (const crest of [.27, .71]) {
        const distance = (progress - crest) * config.length;
        if (distance >= -60 && distance <= 70) {
          ramp += distance <= 0 ? 4 * (1 + distance / 60) ** 2 : 4 * (1 - distance / 70) ** 2;
        }
      }
    }
    segments.push({
      z, curve,
      y: (mountain ? Math.sin(progress * Math.PI * 6) * 8 : city ? Math.sin(progress * Math.PI * 4) * 6 : Math.sin(progress * Math.PI * 2) * 2) + ramp,
      width: config.roadWidth * (city && progress > .62 && progress < .8 ? .8 : 1),
      tunnel: mountain && progress > .43 && progress < .56,
      jump: city && ((progress > .27 && progress < .29) || (progress > .71 && progress < .73)),
      decor: Math.floor(z / SEGMENT_LENGTH) % 7 === 0,
    });
  }
  return { ...config, segments };
}

export const TRACKS = [
  makeTrack({ id: 'coastal_highway', name: '海岸公路', title: 'COASTAL HIGHWAY', subtitle: '追着落日，沿海疾驰', theme: 'coast', length: 2800, difficulty: 1, roadWidth: 1500, gold: 105, silver: 120, bronze: 165, color: '#ffad72', unlock: null }, [[.12,.29,.55],[.4,.57,-.58],[.69,.88,.6]]),
  makeTrack({ id: 'touge_pass', name: '山道发卡弯', title: 'TOUGE PASS', subtitle: '八连急弯，寻找完美切线', theme: 'mountain', length: 3200, difficulty: 3, roadWidth: 920, gold: 130, silver: 150, bronze: 200, color: '#8ed8c0', unlock: { trackId: 'coastal_highway', medal: 'silver' } }, [[.06,.13,1.1],[.16,.23,-1.2],[.27,.34,1.15],[.38,.45,-1.3],[.49,.56,1.2],[.61,.68,-1.3],[.72,.8,1.25],[.84,.94,-1.1]]),
  makeTrack({ id: 'neon_skyway', name: '城市高架', title: 'NEON SKYWAY', subtitle: '霓虹夜色，两次腾空', theme: 'city', length: 3500, difficulty: 4, roadWidth: 1000, gold: 125, silver: 145, bronze: 195, color: '#c394ff', unlock: { trackId: 'touge_pass', medal: 'gold' } }, [[.07,.2,.8],[.24,.35,-.9],[.41,.53,1.05],[.59,.7,-1.15],[.77,.9,1.1]]),
];

export const CARS = [
  { id: 'car_a', name: '街头小钢炮', title: 'STREET HATCHBACK', description: '平衡可靠，每一道弯都从容', body: 'hatchback', color: '#f65464', stats: [3,4,3,3], maxSpeed: 94, acceleration: 25, handling: 1, drift: 1, unlock: null },
  { id: 'car_b', name: '直线怪兽', title: 'SPEEDSTER GT', description: '极速冲刺，提前准备入弯', body: 'sport', color: '#c9d5e5', stats: [5,4,2,2], maxSpeed: 114, acceleration: 25, handling: .8, drift: .8, unlock: { trackId: 'coastal_highway', medal: 'gold' } },
  { id: 'car_c', name: '漂移之王', title: 'DRIFT DEMON', description: '连续切弯，掌控每一次连击', body: 'drifter', color: '#ba8dff', stats: [2,3,5,5], maxSpeed: 88, acceleration: 22, handling: 1.3, drift: 1.35, unlock: { trackId: 'touge_pass', medal: 'gold' } },
  { id: 'car_d', name: '传奇战车', title: 'LEGEND PROTOTYPE', description: '献给征服三条赛道的传奇', body: 'prototype', color: '#ffd76e', stats: [5,5,4,4], maxSpeed: 118, acceleration: 29, handling: 1.15, drift: 1.15, unlock: { allGold: true } },
];

export const ACHIEVEMENTS = [
  { id: 'first_drift', name: '初次漂移', description: '完成一次成功的漂移 Boost', reward: '漂移教学完成' },
  { id: 'combo_master', name: '连击大师', description: '单圈达成 ×3 Combo 五次', reward: '金色轨迹特效' },
  { id: 'perfect_line', name: '完美路线', description: '零撞墙完成一场计时赛', reward: '极光彩蛋车漆' },
  { id: 'speed_demon', name: '速度恶魔', description: '一场计时赛使用五次氮气', reward: '强化引擎音效' },
  { id: 'legend_driver', name: '传奇车手', description: '三条赛道全部获得金牌', reward: 'Legend Prototype' },
  { id: 'ghost_hunter', name: 'Ghost 杀手', description: '十次战胜已有个人最佳 Ghost', reward: '幽灵车漆' },
];

export function segmentAt(track, z) {
  return track.segments[Math.floor(((z % track.length) + track.length) % track.length / SEGMENT_LENGTH)];
}
export function medalFor(track, time) {
  return time <= track.gold ? 'gold' : time <= track.silver ? 'silver' : time <= track.bronze ? 'bronze' : null;
}
export function formatTime(time) {
  if (!Number.isFinite(time)) return '—:——.———';
  const milliseconds = Math.max(0, Math.floor(time * 1000));
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}
export const recordKey = (trackId, carId) => `${trackId}:${carId}`;
