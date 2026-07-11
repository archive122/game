// 동트기 3분 전 (Dokkaebi Dawn) — 밸런스·튜닝 상수
// 원칙: 난이도 곡선의 튜닝 노브는 coeff 식 하나. 나머지는 여기서 파생된다.

export const CONFIG = {
  RUN_TIME: 180,            // 3분 하드캡 (초)
  ARENA_RADIUS: 70,         // 이동 가능 반경 (유닛)

  player: {
    hp: 100,
    speed: 8,               // u/s
    accel: 40,              // u/s²
    frictionK: 10,          // v *= exp(-k·dt)
    pickupRadius: 2.5,
    hurtInvuln: 0.5,        // 피격 후 무적 (초)
    lowHpThreshold: 30,
    dash: { impulse: 24, invuln: 0.35, cooldown: 2.5, grazeDist: 0.5, grazeMax: 3 },
  },

  camera: {
    offset: { x: 0, y: 18, z: 10 },
    lerpK: 6,               // 지수 추적 계수
    lookAhead: 0.2,         // aimPoint 방향 선행 비율
    baseFov: 55,
  },

  // 적 기본치 — HP는 ×(0.8 + 0.2×coeff) 스케일
  enemies: {
    mob:    { hp: 10, speed: 3.2, contact: 8,  xp: 1, cost: 1, scale: 1.0, color: 0xe84545 },
    honbul: { hp: 6,  speed: 5.5, contact: 5,  xp: 2, cost: 2, scale: 0.7, color: 0x4dd8e6 },
    tanker: { hp: 60, speed: 2.2, contact: 15, xp: 8, cost: 6, scale: 1.5, color: 0xc98a3d },
  },
  elite: {
    hpMult: 8, costMult: 6, scaleMult: 1.6, contactMult: 1.5, xp: 20, coinBonus: 3,
    blazing: { color: 0xff5b22, trailDps: 6, trailLife: 3, trailGap: 0.5 },
    frost:   { color: 0x7fb8ff, slowPct: 0.30, slowDur: 2, slowCap: 0.40 },
  },
  boss: {
    hp: 900, speed: 2.6, contact: 25, scale: 4,
    slamPeriod: 5, slamTelegraph: 0.8, slamRadius: 5, slamDamage: 30,
    spawnAt: 60 * 2, name: '어둑시니', coin: 15, gems: 20,
  },

  spawner: {
    creditRate: 1.6,        // × coeff /s
    coeffT: 45,             // coeff = (1 + t/45) × nightMult
    ringMin: 22, ringMax: 28,
    maxAlive: 600,
    unlocks: { honbul: 30, tanker: 70, elite: 80 },
    weights: { mob: 60, honbul: 25, tanker: 10, elite: 5 },
    hpScale: (coeff) => 0.8 + 0.2 * coeff,
    // 타임라인 스크립트 이벤트
    preRing: { count: 12, radius: 9 },              // 0:00
    siegeRing: { at: 60, count: 40, radius: 18 },   // 1:00
    chestAt: 90,                                    // 1:30
    frenzy: { from: 150, to: 170, mult: 3 },        // 2:30~2:50 광란
    finalSurge: { at: 170, count: 60 },             // 2:50 혼불 링
  },

  // XP 레벨 곡선: 레벨 2→10 필요 XP (20~25초당 1회, 총 8~9회)
  xpCurve: [8, 12, 18, 24, 33, 45, 60, 80, 100],

  combo: {
    gauge: 3.0,             // 초 (킬마다 리필)
    tiers: [ [0, 1], [10, 2], [25, 3], [50, 4], [100, 5] ], // [콤보, 배율]
    tierColors: ['#f5f5f5', '#4dd8e6', '#ffd166', '#ff9a3c', '#e84545'],
    grazeBonus: 5, grazeGaugeBonus: 0.5,
    multikill: { window: 0.5, kills: 8, slowmo: 0.3, dur: 0.3 },
    lanternDecayMult: 0.5,  // 등불 웅덩이 내 게이지 감쇠 -50%
  },
  score: {
    perKill: 10,            // XP값 × 10 × 배율
    survivalPer10s: 100,
    victoryBonus: 5000,
    skinMilestones: [5000, 20000, 50000],
  },

  cards: {
    rarity: [ ['common', 0.60, 1.0], ['rare', 0.30, 1.5], ['hero', 0.10, 2.0] ],
    weaponSlots: 4, passiveSlots: 3, weaponMaxLv: 5, passiveMaxLv: 3,
  },

  lanterns: {
    count: 6, ringMin: 18, ringMax: 30,
    poolRadius: 5, regen: 2,          // HP/s
    relightRadius: 2, relightTime: 2, // 초
    lightColor: 0xffb04d, intensity: 3, distance: 12,
  },

  chest: { dropDist: [25, 35], fallTime: 3, openRadius: 1.5, gems: 10 },

  juice: {
    hitstop: { kill: 0.06, eliteKill: 0.15, byeok: 0.04 },  // 초
    trauma: { hurt: 0.4, eliteKill: 0.25, slam: 0.5, chestLand: 0.3, decay: 1.2, maxDeg: 4 },
    flashDur: 0.08, debrisMob: 12, debrisElite: 24, debrisGravity: -15,
    knockback: { hit: 6, killMult: 3, decayK: 8 },
    fov: { dash: 4, byeok: 2, big: 6, recover: 0.2 },
    maxDebrisFloor: 200,
  },

  moon: { radius: 6, startAlt: 60 * Math.PI / 180 }, // 고도 60° → 0° / 180초

  colors: {
    fog: 0x1a1a2e, fogNear: 26, fogFar: 88,
    terrainLow: 0x23233d, terrainHigh: 0x2e2e52,
    hemiSky: 0x3a3a5e, hemiGround: 0x16162a, moonlight: 0xb0c4ff,
    gem: 0xaef1ff, tracer: 0xffd166,
    darkestSky: 0x12101f, dawnHorizon: 0xff9a3c, dawnZenith: 0xffd9a0,
    moonBlood: 0xff4444,
    playerSkins: [0xf5f5f5, 0x4dd8e6, 0xffd166, 0xe84545], // 기본/청록/금/진홍
  },

  economy: {
    // 엽전 = floor(킬/10) + floor(생존초/10) + 정예당 3 + 보스 15 + 승리 100
    killDiv: 10, surviveDiv: 10, victory: 100,
    shop: {
      bat:   { name: '도깨비 방망이', desc: '피해 +10%', costs: [60, 120, 240], per: 0.10 },
      bell:  { name: '놋쇠 요령',     desc: '자석 반경 +1u', costs: [50, 100, 200], per: 1.0 },
      charm: { name: '오래된 부적',   desc: '시작 레벨 +1', costs: [100, 250], per: 1 },
    },
  },

  missions: [
    { id: 'wisp50',   name: '도깨비불 50개 수집',    goal: 50 },
    { id: 'graze10',  name: '아슬아슬 10회',         goal: 10 },
    { id: 'survive2', name: '2분 생존',              goal: 120 },
    { id: 'combo50',  name: '콤보 50 달성',          goal: 50 },
    { id: 'relight3', name: '등불 3개 재점화',       goal: 3 },
    { id: 'byeok30',  name: '벽력일섬으로 30킬',     goal: 30 },
    { id: 'elite3',   name: '정예 도깨비 3마리 처치', goal: 3 },
    { id: 'dash20',   name: '대시 20회',             goal: 20 },
    { id: 'boss1',    name: '어둑시니 처치',         goal: 1 },
  ],
  missionReward: { coins: 30, baseMultCap: 3 },
};

// 무기 정의 — 레벨 1~5 스탯 테이블
export const WEAPONS = {
  beam: {
    name: '빛살', icon: '☄',
    desc: (lv) => ['피해 10 · 3.5발/s', '투사체 +1', '연사 4.5발/s', '피해 15', '투사체 +1 · 관통 1'][lv - 1],
    levels: [
      { dmg: 10, rate: 3.5, count: 1, pierce: 0 },
      { dmg: 10, rate: 3.5, count: 2, pierce: 0 },
      { dmg: 10, rate: 4.5, count: 2, pierce: 0 },
      { dmg: 15, rate: 4.5, count: 2, pierce: 0 },
      { dmg: 15, rate: 4.5, count: 3, pierce: 1 },
    ],
    speed: 40, spread: 3, range: 30, recoil: 0.6,
  },
  talisman: {
    name: '회전 부적', icon: '符',
    desc: (lv) => ['궤도 부적 2개 · 피해 18', '부적 3개', '피해 28 · 반경 2.6', '부적 4개 · 240°/s', '피해 40 · 반경 3.0'][lv - 1],
    levels: [
      { count: 2, dmg: 18, radius: 2.2, degPerSec: 200 },
      { count: 3, dmg: 18, radius: 2.2, degPerSec: 200 },
      { count: 3, dmg: 28, radius: 2.6, degPerSec: 200 },
      { count: 4, dmg: 28, radius: 2.6, degPerSec: 240 },
      { count: 4, dmg: 40, radius: 3.0, degPerSec: 240 },
    ],
    rehitCd: 0.5,
  },
  wave: {
    name: '지면 파동', icon: '波',
    desc: (lv) => ['3.5초마다 충격파 · 피해 15', '피해 22', '주기 2.8초 · 반경 7.5', '피해 32 · 넉백 9', '주기 2.2초 · 반경 9 · 피해 45'][lv - 1],
    levels: [
      { period: 3.5, radius: 6.0, dmg: 15, knock: 6 },
      { period: 3.5, radius: 6.0, dmg: 22, knock: 6 },
      { period: 2.8, radius: 7.5, dmg: 22, knock: 6 },
      { period: 2.8, radius: 7.5, dmg: 32, knock: 9 },
      { period: 2.2, radius: 9.0, dmg: 45, knock: 9 },
    ],
    expandTime: 0.6,
  },
  wisp: {
    name: '유도 혼불', icon: '魂',
    desc: (lv) => ['유도탄 1구 · 피해 25', '2구', '피해 38', '3구 · 속도 18', '피해 55 + 폭발'][lv - 1],
    levels: [
      { period: 2.0, count: 1, dmg: 25, speed: 14, blast: 0 },
      { period: 2.0, count: 2, dmg: 25, speed: 14, blast: 0 },
      { period: 2.0, count: 2, dmg: 38, speed: 14, blast: 0 },
      { period: 2.0, count: 3, dmg: 38, speed: 18, blast: 0 },
      { period: 2.0, count: 3, dmg: 55, speed: 18, blast: 2 },
    ],
    turnDeg: 240, life: 3,
  },
  aura: {
    name: '정화 오라', icon: '淨',
    desc: (lv) => ['반경 3.0 · 8dps', '반경 3.6 · 12dps', '반경 4.2 · 18dps', '반경 4.8 · 26dps + 슬로우', '반경 5.5 · 38dps + 슬로우 20%'][lv - 1],
    levels: [
      { radius: 3.0, dps: 8,  slow: 0 },
      { radius: 3.6, dps: 12, slow: 0 },
      { radius: 4.2, dps: 18, slow: 0 },
      { radius: 4.8, dps: 26, slow: 0.10 },
      { radius: 5.5, dps: 38, slow: 0.20 },
    ],
    tickRate: 4,
  },
  totem: {
    name: '수호 등불', icon: '燈',
    desc: (lv) => ['8초마다 등불 토템 · 슬로우 40%', '수명 8초 · 10dps', '반경 5 · 슬로우 50%', '6초마다 · 16dps', '반경 6 · 수명 10초 · 24dps'][lv - 1],
    levels: [
      { period: 8, life: 6,  radius: 4, slow: 0.40, dps: 6,  vuln: 0 },
      { period: 8, life: 8,  radius: 4, slow: 0.40, dps: 10, vuln: 0 },
      { period: 8, life: 8,  radius: 5, slow: 0.50, dps: 10, vuln: 0 },
      { period: 6, life: 8,  radius: 5, slow: 0.50, dps: 16, vuln: 0 },
      { period: 6, life: 10, radius: 6, slow: 0.50, dps: 24, vuln: 0.15 },
    ],
  },
  palgwae: {
    name: '팔괘진', icon: '卦', evolved: true,
    desc: () => '궤도 부적 8개 · 피해 60 · 300°/s',
    levels: [ { count: 8, dmg: 60, radius: 3.5, degPerSec: 300 } ],
    rehitCd: 0.5,
  },
};

// 벽력일섬 (수동 스킬 — 무기 슬롯 밖)
export const BYEOK = {
  name: '벽력일섬', cooldown: 2.5, count: 5, spreadDeg: 10,
  dmgMult: 2.5, knockMult: 3, range: 30, recoil: 2, speed: 55,
};

export const PASSIVES = {
  magnet:  { name: '놋쇠 요령',     icon: '鈴', desc: (lv) => `픽업 반경 +${1.5 * lv}u`,   per: 1.5, max: 3 },
  shoes:   { name: '짚신',         icon: '履', desc: (lv) => `이동속도 +${8 * lv}%`,      per: 0.08, max: 3 },
  bat:     { name: '도깨비 방망이', icon: '棒', desc: (lv) => `피해 +${15 * lv}%`,         per: 0.15, max: 3 },
  clone:   { name: '분신',         icon: '影', desc: (lv) => `투사체 +${lv}`,             per: 1, max: 2 },
};
