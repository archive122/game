// ═══════════════════════════════════════════════════════════════════════════
// 오디오 — WebAudio 신스 전용 (외부 사운드 파일 0)
//   · 절차 생성 임펄스 응답 + ConvolverNode = 대성당 잔향
//   · 패턴별 고유 텔레그래프 음색 (오디오 큐만으로 회피 가능하게)
//   · 페이즈 연동 적응형 BGM: 드론 → +퍼커션 → +리드
// ═══════════════════════════════════════════════════════════════════════════

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.phase = 0;          // 0 타이틀 / 1~3 전투 페이즈
    this.beat = 0;
    this.beatAcc = 0;
    this.bpm = 96;
    this.arpIndex = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(c.destination);

    // 리버브 (대성당): 2.8초 지수 감쇠 노이즈 IR
    this.verb = c.createConvolver();
    const dur = 2.8, rate = c.sampleRate;
    const ir = c.createBuffer(2, dur * rate, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.2) * (1 - Math.exp(-t * 60));
      }
    }
    this.verb.buffer = ir;
    this.verbGain = c.createGain();
    this.verbGain.gain.value = 0.4;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.verb);

    this.bgmBus = c.createGain();
    this.bgmBus.gain.value = 0.5;
    this.bgmBus.connect(this.master);
    this.bgmBus.connect(this.verb);

    this.#startAmbient();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  resume() { this.ctx?.resume?.(); }

  // ── 프리미티브 ──
  #osc(type, freq, t0, t1, gain = 0.2, dest = null) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    o.connect(g);
    g.connect(dest || this.sfxBus);
    o.start(t0); o.stop(t1 + 0.05);
    return o;
  }
  #noise(t0, dur, { type = 'bandpass', f0 = 800, f1 = null, q = 1, gain = 0.2, dest = null } = {}) {
    const c = this.ctx;
    const len = Math.max(1, Math.floor(dur * c.sampleRate));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(dest || this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }
  #sub(t0, f0, f1, dur, gain = 0.5) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // ── SFX 사전 ──
  sfx(name) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime;
    switch (name) {
      case 'swingLight':
        this.#noise(t, 0.16, { f0: 400, f1: 2600, q: 2.2, gain: 0.22 });
        break;
      case 'swingHeavy':
        this.#noise(t, 0.3, { f0: 220, f1: 1400, q: 1.6, gain: 0.3 });
        this.#sub(t, 130, 60, 0.3, 0.25);
        break;
      case 'hit':
        this.#osc('triangle', 190, t, t + 0.12, 0.34);
        this.#noise(t, 0.09, { f0: 2800, q: 0.8, gain: 0.24, type: 'highpass' });
        this.#sub(t, 120, 55, 0.14, 0.3);
        break;
      case 'hitHeavy':
        this.#sub(t, 90, 32, 0.4, 0.6);
        this.#noise(t, 0.22, { f0: 1800, q: 0.7, gain: 0.32, type: 'highpass' });
        this.#osc('square', 70, t, t + 0.18, 0.16);
        break;
      case 'roll':
        this.#noise(t, 0.24, { f0: 900, f1: 250, q: 0.8, gain: 0.16, type: 'lowpass' });
        break;
      case 'step':
        this.#noise(t, 0.07, { f0: 300, q: 1, gain: 0.05, type: 'lowpass' });
        break;
      case 'bossStep':
        this.#sub(t, 68, 34, 0.34, 0.4);
        this.#noise(t, 0.2, { f0: 160, q: 0.7, gain: 0.14, type: 'lowpass' });
        break;
      case 'bossSwing':
        this.#noise(t, 0.32, { f0: 160, f1: 900, q: 1.4, gain: 0.3 });
        break;
      case 'bossSwingBig':
        this.#noise(t, 0.42, { f0: 110, f1: 700, q: 1.2, gain: 0.38 });
        this.#sub(t, 100, 45, 0.4, 0.3);
        break;
      case 'bossRush': {
        this.#noise(t, 0.6, { f0: 200, f1: 1600, q: 1, gain: 0.3 });
        const o = this.#osc('sawtooth', 42, t, t + 0.55, 0.22);
        o.frequency.linearRampToValueAtTime(70, t + 0.5);
        break;
      }
      case 'bossStomp':
        this.#sub(t, 80, 36, 0.3, 0.45);
        break;
      case 'slamImpact':
        this.#sub(t, 110, 26, 0.65, 0.75);
        this.#noise(t, 0.4, { f0: 3000, f1: 500, q: 0.6, gain: 0.36 });
        this.#noise(t + 0.04, 0.5, { f0: 140, q: 0.8, gain: 0.3, type: 'lowpass' });
        break;
      case 'fireBurst':
        this.#noise(t, 0.55, { f0: 900, f1: 3400, q: 0.7, gain: 0.32, type: 'highpass' });
        this.#sub(t, 90, 40, 0.4, 0.35);
        for (let i = 0; i < 7; i++) {
          this.#noise(t + 0.05 + Math.random() * 0.4, 0.03, { f0: 2000 + Math.random() * 3000, q: 6, gain: 0.1 });
        }
        break;
      case 'feintTick':
        this.#osc('square', 1400, t, t + 0.04, 0.1);
        break;
      case 'waveCast':
        for (let i = 0; i < 3; i++) {
          const o = this.#osc('triangle', 500 + i * 160, t, t + 0.4, 0.09);
          o.frequency.exponentialRampToValueAtTime(1400 + i * 300, t + 0.35);
        }
        this.#noise(t, 0.3, { f0: 1000, f1: 3000, q: 2, gain: 0.14 });
        break;
      case 'rainImpact':
        this.#sub(t, 130, 45, 0.25, 0.3);
        this.#noise(t, 0.18, { f0: 1400, q: 1, gain: 0.2 });
        break;
      case 'groggyBreak': {
        // 유리가 깨지는 듯한 비화성 벨 + 하강 글리산도
        const freqs = [720, 1131, 1791, 2308];
        freqs.forEach((f, i) => {
          const o = this.#osc('sine', f, t, t + 1.1 - i * 0.15, 0.14);
          o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 1.0);
        });
        this.#noise(t, 0.3, { f0: 4200, q: 0.5, gain: 0.26, type: 'highpass' });
        this.#sub(t, 150, 40, 0.7, 0.5);
        break;
      }
      case 'execute':
        this.#sub(t, 120, 22, 1.0, 0.85);
        this.#noise(t, 0.5, { f0: 2600, f1: 300, q: 0.7, gain: 0.4 });
        for (let i = 0; i < 4; i++) {
          const o = this.#osc('sawtooth', 220 - i * 30, t + 0.06 * i, t + 0.7, 0.1);
          o.frequency.exponentialRampToValueAtTime(50, t + 0.7);
        }
        break;
      case 'healStart':
        this.#osc('sine', 523, t, t + 0.3, 0.1);
        break;
      case 'healDone':
        [523, 659, 784].forEach((f, i) => this.#osc('sine', f, t + i * 0.09, t + i * 0.09 + 0.5, 0.12));
        break;
      case 'hurt':
        this.#sub(t, 100, 50, 0.2, 0.4);
        this.#osc('sawtooth', 160, t, t + 0.14, 0.2);
        this.#noise(t, 0.1, { f0: 700, q: 1, gain: 0.2 });
        break;
      case 'exhaust':
        this.#noise(t, 0.5, { f0: 600, f1: 300, q: 0.6, gain: 0.12, type: 'bandpass' });
        break;
      case 'lockon':
        this.#osc('square', 880, t, t + 0.06, 0.08);
        this.#osc('square', 1320, t + 0.05, t + 0.11, 0.07);
        break;
      case 'chargeStart':
        this.#noise(t, 0.4, { f0: 200, f1: 900, q: 3, gain: 0.08 });
        break;
      case 'chargeFull':
        this.#osc('sine', 1046, t, t + 0.25, 0.14);
        this.#osc('sine', 1568, t + 0.03, t + 0.3, 0.1);
        break;
      case 'roar': {
        for (let i = 0; i < 4; i++) {
          const o = this.#osc('sawtooth', 48 + i * 13, t, t + 1.3, 0.16);
          o.frequency.linearRampToValueAtTime(38 + i * 10, t + 1.2);
        }
        this.#noise(t, 1.2, { f0: 300, f1: 900, q: 0.8, gain: 0.26 });
        this.#sub(t, 60, 30, 1.3, 0.5);
        break;
      }
      case 'igniteEyes':
        this.#noise(t, 0.2, { f0: 3000, q: 3, gain: 0.2, type: 'highpass' });
        this.#osc('sine', 300, t, t + 0.5, 0.15).frequency.exponentialRampToValueAtTime(900, t + 0.45);
        break;
      case 'deny':
        this.#osc('square', 140, t, t + 0.12, 0.12);
        break;
      case 'uiClick':
        this.#osc('sine', 700, t, t + 0.07, 0.1);
        break;
      case 'deathSting': {
        [110, 131, 165].forEach(f => this.#osc('sawtooth', f, t, t + 2.2, 0.09));
        this.#sub(t, 80, 30, 2, 0.4);
        break;
      }
      case 'victory': {
        const notes = [523, 659, 784, 1046, 1318];
        notes.forEach((f, i) => {
          this.#osc('sine', f, t + i * 0.16, t + i * 0.16 + 1.4, 0.13);
          this.#osc('sine', f * 2, t + i * 0.16, t + i * 0.16 + 0.7, 0.04);
        });
        break;
      }
      case 'phaseShift': {
        this.#sub(t, 200, 28, 1.4, 0.6);
        this.#noise(t, 1.2, { f0: 400, f1: 2400, q: 0.7, gain: 0.3 });
        [98, 123, 147].forEach(f => this.#osc('sawtooth', f, t + 0.2, t + 1.6, 0.1));
        break;
      }
    }
  }

  // ── 패턴 텔레그래프 음색 (패턴마다 고유) ──
  tele(kind) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime;
    switch (kind) {
      case 'sweep': {   // 낮은 브라스풍 스웰
        const o = this.#osc('sawtooth', 92, t, t + 0.65, 0.22);
        o.frequency.linearRampToValueAtTime(120, t + 0.6);
        break;
      }
      case 'slam': {    // 상승 사인
        const o = this.#osc('sine', 170, t, t + 0.85, 0.2);
        o.frequency.exponentialRampToValueAtTime(600, t + 0.8);
        break;
      }
      case 'grab': {    // 불협 트라이톤 — 잡기 = 위험
        this.#osc('sawtooth', 110, t, t + 0.75, 0.18);
        this.#osc('sawtooth', 156, t, t + 0.75, 0.18);
        break;
      }
      case 'stomp':
        this.#sub(t, 90, 55, 0.4, 0.3);
        break;
      case 'fire':
        this.#noise(t, 0.75, { f0: 700, f1: 2600, q: 1.2, gain: 0.2, type: 'bandpass' });
        break;
      case 'leap': {
        const o = this.#osc('sine', 220, t, t + 0.55, 0.18);
        o.frequency.exponentialRampToValueAtTime(880, t + 0.5);
        this.#noise(t + 0.3, 0.5, { f0: 500, f1: 2000, q: 1, gain: 0.15 });
        break;
      }
      case 'wave': {
        [660, 990].forEach(f => {
          const o = this.#osc('triangle', f, t, t + 0.6, 0.1);
          o.frequency.linearRampToValueAtTime(f * 1.3, t + 0.55);
        });
        break;
      }
      case 'rain':
        this.#noise(t, 0.3, { f0: 2400, q: 4, gain: 0.1, type: 'bandpass' });
        break;
    }
  }

  // ── 앰비언트 (타이틀부터 상시): 바람 + 저역 드론 ──
  #startAmbient() {
    const c = this.ctx;
    // 바람: 루프 노이즈 + LFO 필터
    const len = 4 * c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const wind = c.createBufferSource();
    wind.buffer = buf; wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 320; wf.Q.value = 0.4;
    const wg = c.createGain(); wg.gain.value = 0.05;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoG = c.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG); lfoG.connect(wf.frequency);
    wind.connect(wf); wf.connect(wg); wg.connect(this.bgmBus);
    wind.start(); lfo.start();

    // 드론: 디튠 톱니 2개 → 로우패스
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0.0;
    const df = c.createBiquadFilter();
    df.type = 'lowpass'; df.frequency.value = 240; df.Q.value = 0.8;
    for (const detune of [-6, 5]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      o.detune.value = detune;
      o.connect(df);
      o.start();
    }
    const o5 = c.createOscillator();
    o5.type = 'sawtooth'; o5.frequency.value = 82.4; o5.detune.value = 3;
    o5.connect(df); o5.start();
    df.connect(this.droneGain);
    this.droneGain.connect(this.bgmBus);

    // 페이즈 레이어 게인
    this.percGain = c.createGain(); this.percGain.gain.value = 0; this.percGain.connect(this.bgmBus);
    this.leadGain = c.createGain(); this.leadGain.gain.value = 0; this.leadGain.connect(this.bgmBus);
  }

  // ── 페이즈 → 레이어 ──
  setPhase(n) {
    this.phase = n;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ramp = (g, v) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + 2); };
    ramp(this.droneGain, n >= 1 ? 0.42 : 0.0);
    ramp(this.percGain, n >= 2 ? 0.5 : 0);
    ramp(this.leadGain, n >= 3 ? 0.4 : 0);
    this.bpm = n >= 3 ? 122 : n >= 2 ? 108 : 96;
  }

  // ── 비트 스케줄러 (update에서 구동, rawDt) ──
  update(rawDt) {
    if (!this.ctx || this.phase < 2) return;
    this.beatAcc += rawDt;
    const spb = 60 / this.bpm / 2;   // 8분음표
    while (this.beatAcc >= spb) {
      this.beatAcc -= spb;
      this.beat++;
      const c = this.ctx;
      const t = c.currentTime + 0.02;
      const step = this.beat % 8;
      // 퍼커션 (2페이즈~)
      if (step === 0 || step === 4) {
        // 킥
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
        const g = c.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g); g.connect(this.percGain);
        o.start(t); o.stop(t + 0.25);
      }
      if (step === 2 || step === 6 || (step === 7 && this.phase >= 3)) {
        // 노이즈 햇
        const len = Math.floor(0.05 * c.sampleRate);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource(); src.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g = c.createGain();
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(f); f.connect(g); g.connect(this.percGain);
        src.start(t); src.stop(t + 0.06);
      }
      // 리드 아르페지오 (3페이즈)
      if (this.phase >= 3 && (step % 2 === 0)) {
        const scale = [220, 261.6, 293.7, 329.6, 392, 440];
        const seq = [0, 3, 2, 5, 1, 4, 2, 3];
        const f = scale[seq[this.arpIndex % seq.length]];
        this.arpIndex++;
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.13, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g); g.connect(this.leadGain);
        o.start(t); o.stop(t + 0.26);
      }
    }
  }
}
