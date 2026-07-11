// ═══════════════════════════════════════════════════════════════════════════
// 잿불의 결투 — TUNING: 모든 게임필/전투/렌더 수치의 단일 출처
// ═══════════════════════════════════════════════════════════════════════════

export const TUNING = {
  // ── 아레나 ────────────────────────────────────────────────────────────────
  arena: {
    radius: 19,          // 플레이어 이동 한계 (벽)
    bossRadius: 15.5,    // 보스 중심 이동 한계
    gateAngle: -Math.PI / 2,  // 입구 방향 (-Z 쪽에서 진입)
  },

  // ── 플레이어 ──────────────────────────────────────────────────────────────
  hero: {
    hp: 100,
    stamina: 100,
    staminaRegen: 35,        // 초당
    staminaDelay: 0.4,       // 액션 후 회복 지연
    exhaustDuration: 1.0,    // 스태미나 0 도달 시 탈진
    moveSpeed: 5.2,
    strafeSpeed: 4.2,        // 록온 시
    turnRate: 14,            // rad/s (이동 방향 회전)
    flasks: 3,
    flaskHeal: 0.45,         // 최대 HP 비율
    flaskTime: 1.2,          // 시전 경직
    roll: {
      duration: 0.52,
      iframeStart: 0.04,
      iframeEnd: 0.34,
      speed: 9.5,
      stamina: 25,
      cooldown: 0.12,
    },
    light: {
      stamina: 15,
      damage: [5.2, 5.2, 7.5],     // 3타 콤보
      groggy: [6, 6, 9],
      range: 3.1,                   // 보스 표면까지
      arc: 1.5,                     // 판정 부채꼴 반각(rad)
      hitstop: 0.07,
    },
    heavy: {
      stamina: 35,
      damage: 11,
      groggy: 15,
      chargeMax: 1.1,               // 풀차지 시간
      chargeBonus: 1.8,             // 풀차지 배율
      range: 3.4,
      arc: 1.4,
      hitstop: 0.14,
    },
    punishMult: 1.5,                // 후딜 창 타격 그로기 배율
    executeDamage: 60,              // 처형 대미지 (그로기 시)
    inputBuffer: 0.22,
    hurtInvuln: 0.45,               // 피격 후 무적
  },

  // ── 보스 ─────────────────────────────────────────────────────────────────
  boss: {
    hp: 1000,
    name: '잿불 파수꾼',
    title: '몰락한 자',
    height: 7.6,
    walkSpeed: 2.1,
    turnRate: 1.8,                  // rad/s — 육중함
    phase2At: 0.65,
    phase3At: 0.30,
    phaseSpeedup: 0.87,             // 2페이즈부터 패턴 duration 배율
    groggy: {
      max: 100,
      decay: 4,                     // 초당 자연 감소
      duration: 5.0,                // 그로기 유지
      recoverInvuln: 1.2,
    },
    contactDamage: 0,               // 몸 비비기는 밟기 패턴이 처벌
  },

  // ── 게임필 ────────────────────────────────────────────────────────────────
  feel: {
    hitstopScale: 0.05,
    executeHitstop: 0.2,
    killSlowmo: 0.1,
    killSlowmoRecover: 2.2,
    shakeHit: 0.24,       // trauma 가산
    shakeHurt: 0.42,
    shakeSlam: 0.5,
    shakeRoar: 0.65,
    traumaDecay: 1.4,     // 초당
    fovBase: 58,
    fovSprint: 64,
    fovChargePinch: 50,
  },

  // ── 카메라 ────────────────────────────────────────────────────────────────
  camera: {
    distance: 5.6,
    height: 2.0,
    shoulder: 0.75,          // 어깨 오프셋
    lag: 9,                  // 지수 감쇠 계수
    pitchMin: -0.55,
    pitchMax: 0.85,
    sensitivity: 0.0023,
    lockonBossBias: 0.34,    // 록온 시 보스 쪽 시선 편향
  },

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  render: {
    pixelRatioCap: 1.5,
    shadowSize: 2048,
    bloom: { strength: 0.75, radius: 0.6, threshold: 1.0 },
    exposure: 1.45,
    grain: 0.032,
    vignette: 0.42,
    chroma: 1.4,             // px
    fogDensity: 0.024,
    heightFogStrength: 3.2,
    heightFogFalloff: 0.35,
  },

  // ── 페이즈 팔레트 (남색의 밤 → 잿불의 진홍) ────────────────────────────────
  palette: {
    p1: {
      fog: 0x0b1220, sky: 0x0d1526, horizon: 0x1a2438,
      moon: 0xbfd9ff, key: 0x9fc4ff, keyIntensity: 3.4,
      hemiSky: 0x2c3a56, hemiGround: 0x0c0a08, hemiIntensity: 0.75,
      ember: 0xff6a00, crack: 0xff5a1f,
    },
    p2: {
      fog: 0x220d08, sky: 0x1c0a08, horizon: 0x3a140c,
      moon: 0xffb08a, key: 0xff8a4a, keyIntensity: 2.2,
      hemiSky: 0x3a1a10, hemiGround: 0x0a0503, hemiIntensity: 0.5,
      ember: 0xff7a2e, crack: 0xff7a2e,
    },
  },

  // ── 진행/메타 ─────────────────────────────────────────────────────────────
  flow: {
    awakenDistance: 13.5,   // 보스 각성 트리거 거리
    retryDelay: 0.9,
    graceDeaths: 5,         // 연속 사망 → 잿불의 가호 제안
    graceReduction: 0.15,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 보스 패턴 데이터 테이블 — 텔레그래프 → 발동 → 후딜의 공통 상태기계로 구동
// hit: 판정-비주얼 디커플링 프리미티브 (arc: 부채꼴 / ring: 링 / circle: 원 /
//      capsule: 돌진 스윕 / none)
// ═══════════════════════════════════════════════════════════════════════════
export const PATTERNS = {
  // ── 1페이즈 ──
  sweep3: {
    name: '3연 횡베기', phase: 1, cooldown: 4.5, minR: 0, maxR: 9.5, weight: 3,
    steps: [
      { pose: 'windupSweep', dur: 0.7, tele: 'sweep', glow: 1 },
      { pose: 'sweepL', dur: 0.24, hit: { type: 'arc', r: 6.2, arc: 1.35, dmg: 16 }, sfx: 'bossSwing', trail: 1 },
      { pose: 'windupSweepB', dur: 0.42, glow: 0.7 },
      { pose: 'sweepR', dur: 0.24, hit: { type: 'arc', r: 6.2, arc: 1.35, dmg: 16 }, sfx: 'bossSwing', trail: 1 },
      { pose: 'windupOver', dur: 0.5, glow: 1 },
      { pose: 'sweepFin', dur: 0.26, hit: { type: 'arc', r: 6.8, arc: 1.6, dmg: 20 }, sfx: 'bossSwingBig', trail: 1, shake: 0.18 },
      { pose: 'recoverLow', dur: 1.6, punish: true },
    ],
  },
  slam: {
    name: '내려찍기', phase: 1, cooldown: 6, minR: 0, maxR: 8, weight: 2.4,
    steps: [
      { pose: 'windupSlam', dur: 0.9, tele: 'slam', glow: 1 },
      { pose: 'slamDown', dur: 0.2, sfx: 'bossSwingBig', trail: 1 },
      { pose: 'slamImpact', dur: 0.35, hit: { type: 'ring', r0: 0, r1: 5.4, dmg: 24 }, impact: 'slam', shake: 0.5 },
      { pose: 'recoverSlam', dur: 2.0, punish: true },
    ],
  },
  grab: {
    name: '붙잡기 돌진', phase: 1, cooldown: 8, minR: 6, maxR: 16, weight: 2,
    steps: [
      { pose: 'windupGrab', dur: 0.8, tele: 'grab', glow: 2 },       // glow 2 = 붉은 발광 (잡기 규칙)
      { pose: 'grabRush', dur: 0.55, move: { fwd: 17 }, hit: { type: 'capsule', r: 2.1, dmg: 30, grabCam: true }, sfx: 'bossRush' },
      { pose: 'grabEnd', dur: 0.4 },
      { pose: 'recoverLow', dur: 1.8, punish: true },
    ],
  },
  stomp: {
    name: '밟기', phase: 1, cooldown: 3, minR: 0, maxR: 4.2, weight: 3,
    steps: [
      { pose: 'windupStomp', dur: 0.55, tele: 'stomp', glow: 0.6 },
      { pose: 'stompDown', dur: 0.16, sfx: 'bossStomp' },
      { pose: 'stompImpact', dur: 0.25, hit: { type: 'ring', r0: 0, r1: 3.6, dmg: 14 }, impact: 'stomp', shake: 0.32 },
      { pose: 'recoverStomp', dur: 0.9, punish: true },
    ],
  },
  // ── 2페이즈 ──
  firevent: {
    name: '화염 분출', phase: 2, cooldown: 9, minR: 4, maxR: 18, weight: 2.2,
    steps: [
      { pose: 'castRaise', dur: 0.8, tele: 'fire', glow: 1, decals: { kind: 'firevent', count: 3, delay: 0.8 } },
      { pose: 'castHold', dur: 0.55 },
      { pose: 'castRelease', dur: 0.6, sfx: 'fireBurst' },
      { pose: 'recoverCast', dur: 1.4, punish: true },
    ],
  },
  leap: {
    name: '도약 강타', phase: 2, cooldown: 10, minR: 7, maxR: 18, weight: 2,
    steps: [
      { pose: 'crouchLeap', dur: 0.6, tele: 'leap', glow: 1 },
      { pose: 'airborne', dur: 1.0, leap: true, decals: { kind: 'leap', count: 1, delay: 0 } },
      { pose: 'slamImpact', dur: 0.4, hit: { type: 'ring', r0: 0, r1: 6.0, dmg: 28 }, impact: 'leap', shake: 0.6 },
      { pose: 'recoverSlam', dur: 1.9, punish: true },
    ],
  },
  feint: {
    name: '페인트 베기', phase: 2, cooldown: 7, minR: 0, maxR: 9.5, weight: 1.8,
    steps: [
      { pose: 'windupSweep', dur: 0.7, tele: 'sweep', glow: 1 },
      { pose: 'feintHold', dur: 0.42, sfx: 'feintTick' },            // 멈칫 — 조기 구르기 처벌
      { pose: 'sweepL', dur: 0.22, hit: { type: 'arc', r: 6.4, arc: 1.5, dmg: 22 }, sfx: 'bossSwingBig', trail: 1 },
      { pose: 'recoverLow', dur: 1.6, punish: true },
    ],
  },
  // ── 3페이즈 ──
  wave: {
    name: '검기 파동', phase: 3, cooldown: 6.5, minR: 6, maxR: 19, weight: 2.6,
    steps: [
      { pose: 'windupWave', dur: 0.7, tele: 'wave', glow: 1 },
      { pose: 'waveSlash', dur: 0.24, projectile: 'crescent', sfx: 'waveCast', trail: 1 },
      { pose: 'recoverLow', dur: 1.5, punish: true },
    ],
  },
  emberRain: {
    name: '잿불 폭우', phase: 3, cooldown: 12, minR: 0, maxR: 19, weight: 1.6,
    steps: [
      { pose: 'castRaise', dur: 0.7, tele: 'rain', glow: 1 },
      { pose: 'castHold', dur: 0.5, rain: { count: 8, interval: 0.28 } },
      { pose: 'castHold2', dur: 1.8 },
      { pose: 'recoverCast', dur: 1.1, punish: true },
    ],
  },
};

// 텔레그래프 음색 식별자 → audio.js 신스 매핑 노트
export const TELE_SOUND = {
  sweep: { type: 'saw-swell', freq: 92 },
  slam: { type: 'rise', freq: 160 },
  grab: { type: 'tritone', freq: 110 },
  stomp: { type: 'thud', freq: 70 },
  fire: { type: 'hiss', freq: 900 },
  leap: { type: 'whoosh-up', freq: 220 },
  wave: { type: 'shimmer', freq: 660 },
  rain: { type: 'crackle', freq: 500 },
};
