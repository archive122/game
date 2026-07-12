// WebAudio 신스 SFX 엔진 — 외부 에셋 없이 전부 합성.
// 단일 AudioContext, 첫 클릭에 resume. 마스터 GainNode 경유(히트스톱 덕킹·저체력 로우패스).

let ctx = null;
let master = null;
let lowpass = null;
let noiseBuf = null;
let enabled = true;
let heartbeatTimer = 0;   // 다음 박동 시각 (ctx.currentTime 기준)
let heartbeatVol = 0;     // 0~1 페이드
let heartbeatBpm = 60;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  master = ctx.createGain();
  master.gain.value = 0.5;
  lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 20000;
  master.connect(lowpass).connect(ctx.destination);
  // 공용 노이즈 버퍼 1초
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function audioReady() { return !!ctx; }
export function setAudioEnabled(on) { enabled = on; }
export function getAudioEnabled() { return enabled; }

function rate() { return 1 + (Math.random() * 0.2 - 0.1); } // ±10% 피치 랜덤

// 톤 발진: {type, f0, f1, dur, vol, curve} — 주파수 f0→f1 지수 슬라이드
function tone(type, f0, f1, dur, vol, when = 0, curve = 'exp') {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  const r = rate();
  o.frequency.setValueAtTime(Math.max(20, f0 * r), t);
  if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * r), t + dur);
  else o.frequency.linearRampToValueAtTime(Math.max(20, f1 * r), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

// 노이즈 버스트: 필터 주파수 f0→f1
function noise(f0, f1, dur, vol, when = 0, q = 1) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  s.playbackRate.value = rate();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(40, f0), t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}

// 오음계 (황종·태주·중려·임종·남려 ≈ C D F G A), 2옥타브 사다리
const PENTA = [261.6, 293.7, 349.2, 392.0, 440.0];
export function pentaFreq(step) {
  const octave = Math.floor(step / 5) % 2;
  return PENTA[step % 5] * (octave + 1);
}

export const sfx = {
  shoot() { tone('square', 880, 440, 0.10, 0.05); },
  byeok() {
    noise(4000, 800, 0.08, 0.30);                 // crack
    tone('sawtooth', 220, 110, 0.18, 0.22);       // body
    tone('sine', 70, 40, 0.30, 0.20);             // rumble tail
  },
  hit(big = false) {
    noise(big ? 900 : 1800, big ? 300 : 700, 0.06, 0.12);
    tone('sine', big ? 160 : 240, big ? 60 : 110, 0.08, 0.10);
  },
  kill(elite = false) {
    noise(2500, 500, 0.09, 0.16);
    tone('sine', 180, 60, 0.12, 0.16);
    tone('square', 1400, 2200, 0.05, 0.05, 0.02); // 조각 짤그랑
    if (elite) tone('sine', 90, 30, 0.35, 0.28, 0.02);
  },
  pickup(step) { tone('sine', pentaFreq(step), pentaFreq(step), 0.12, 0.10); tone('triangle', pentaFreq(step) * 2, pentaFreq(step) * 2, 0.08, 0.04); },
  nearMiss() { noise(3000, 6000, 0.12, 0.12); tone('sine', 2093, 2093, 0.15, 0.08, 0.03); },
  dash() { noise(2400, 500, 0.15, 0.10); },
  hurt() { noise(600, 150, 0.15, 0.22); tone('sawtooth', 220, 80, 0.20, 0.15); },
  levelup() { [523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.25, 0.12, i * 0.07)); tone('sine', 1568, 2093, 0.4, 0.04, 0.2); },
  cardPick() { tone('square', 660, 550, 0.07, 0.10); tone('sine', 1320, 1320, 0.05, 0.05); },
  heroCard() { [784, 988, 1319].forEach((f, i) => tone('triangle', f, f, 0.3, 0.10, i * 0.09)); noise(6000, 9000, 0.4, 0.04, 0.1); },
  evolve() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.3, 0.12, i * 0.09));
    tone('sine', 98, 65, 1.0, 0.20, 0.45); // 공(gong) 여운
  },
  chestFall() { tone('sawtooth', 80, 55, 0.5, 0.08); },
  chestLand() { tone('sine', 90, 35, 0.3, 0.30); noise(500, 120, 0.2, 0.18); },
  chestOpen() { [659, 784, 988, 1319].forEach((f, i) => tone('triangle', f, f, 0.22, 0.10, i * 0.06)); },
  bossRoar() { tone('sine', 45, 38, 1.2, 0.35); noise(300, 80, 1.0, 0.20); },
  bossWarn() { tone('square', 1100, 1100, 0.09, 0.09); },
  bossSlam() { tone('sine', 70, 25, 0.5, 0.35); noise(400, 60, 0.4, 0.28); },
  lanternOut() { tone('sine', 300, 90, 0.4, 0.14); noise(800, 200, 0.3, 0.10); },
  lanternOn() { [523, 784].forEach((f, i) => tone('sine', f, f, 0.25, 0.10, i * 0.08)); },
  mission() { [880, 1109].forEach((f, i) => tone('triangle', f, f, 0.18, 0.10, i * 0.08)); },
  death() { tone('square', 400, 60, 0.8, 0.20); tone('square', 1200, 900, 0.1, 0.06, 0.1); tone('square', 900, 700, 0.1, 0.05, 0.25); },
  sunrise() {
    [392, 494, 587, 784].forEach((f, i) => tone('triangle', f, f, 0.7, 0.12, i * 0.22));
    tone('sine', 196, 196, 3.0, 0.07, 0.3);
  },
  multikill() { tone('sawtooth', 300, 900, 0.25, 0.14); noise(2000, 5000, 0.2, 0.08); },
  uiClick() { tone('square', 2000, 2000, 0.02, 0.05); },
  buy() { [659, 880].forEach((f, i) => tone('triangle', f, f, 0.15, 0.10, i * 0.06)); },
};

// 히트스톱 중 마스터 20% 덕킹
export function duck(dur = 0.1) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(0.1, t);
  master.gain.linearRampToValueAtTime(0.5, t + dur);
}

// 저체력 로우패스 (HP<30)
export function setLowHp(on) {
  if (!ctx) return;
  const target = on ? 800 : 20000;
  lowpass.frequency.setTargetAtTime(target, ctx.currentTime, 0.15);
}

// 심장박동 — update 루프에서 호출. vol 0~1, bpm.
export function heartbeat(vol, bpm, dt) {
  heartbeatVol += (vol - heartbeatVol) * Math.min(1, dt * 3);
  heartbeatBpm = bpm;
  if (!ctx || !enabled || heartbeatVol < 0.02) return;
  if (ctx.currentTime >= heartbeatTimer) {
    const v = heartbeatVol * 0.30;
    tone('sine', 55, 40, 0.10, v);
    tone('sine', 50, 38, 0.09, v * 0.8, 0.16); // 2연타 (쿵-쿵)
    heartbeatTimer = ctx.currentTime + 60 / heartbeatBpm;
  }
}
