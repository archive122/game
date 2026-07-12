// ═══════════════════════════════════════════════════════════════════════════
// UI — DOM HUD 컨트롤러 (화면 흐름 / 바 / 레티클 / 토스트 / 페이즈 카드)
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { TUNING } from './config.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      title: $('title-screen'), hud: $('hud'), death: $('death-screen'),
      victory: $('victory-screen'), pause: $('pause-screen'),
      hpFill: $('hp-fill'), hpGhost: $('hp-ghost'),
      stBar: $('st-bar'), stFill: $('st-fill'), flasks: $('flasks'),
      bossUi: $('boss-ui'), bossFill: $('boss-fill'), bossGhost: $('boss-ghost'),
      groggyBar: $('groggy-bar'), groggyFill: $('groggy-fill'),
      reticle: $('reticle'), toast: $('toast'),
      phaseCard: $('phase-card'), pcKicker: $('pc-kicker'), pcMain: $('pc-main'),
      deathCause: $('death-cause'), graceOffer: $('grace-offer'), graceBtn: $('grace-btn'),
      vsTime: $('vs-time'), vsHits: $('vs-hits'), vsDodge: $('vs-dodge'), vsDeaths: $('vs-deaths'),
      nohit: $('nohit-badge'),
      stats: $('stats'),
      startBtn: $('start-btn'),
    };
    this._proj = new THREE.Vector3();
    this._toastTimer = 0;
    this._phaseTimer = 0;
    this._hpGhostDelay = 0;
    this._bossGhostDelay = 0;
  }

  showScreen(name) {
    for (const key of ['title', 'death', 'victory', 'pause']) {
      this.el[key].classList.toggle('on', key === name);
    }
  }
  setHud(on) { this.el.hud.classList.toggle('on', on); }
  setBossBar(on) { this.el.bossUi.classList.toggle('on', on); }
  setLetterbox(on) { document.body.classList.toggle('letterbox', on); }

  toast(text, dur = 2.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this._toastTimer = dur;
  }

  phaseTitle(kicker, main, dur = 3.2) {
    this.el.pcKicker.textContent = kicker;
    this.el.pcMain.textContent = main;
    this.el.phaseCard.classList.add('on');
    this._phaseTimer = dur;
  }

  showDeath(patternName, deaths, offerGrace) {
    this.el.deathCause.innerHTML = patternName
      ? `<b>${patternName}</b> 에 쓰러졌다 &nbsp;·&nbsp; ${deaths}번째 재`
      : `${deaths}번째 재`;
    this.el.graceOffer.classList.toggle('on', offerGrace);
    this.showScreen('death');
  }

  showVictory(stats, fightTime, deaths) {
    const m = Math.floor(fightTime / 60), s = Math.floor(fightTime % 60);
    this.el.vsTime.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.el.vsHits.textContent = stats.hitsTaken;
    this.el.vsDodge.textContent = stats.dodges;
    this.el.vsDeaths.textContent = deaths;
    this.el.nohit.classList.toggle('on', stats.hitsTaken === 0);
    this.showScreen('victory');
  }

  update(rawDt, ctx, camera) {
    const { hero, boss } = ctx;
    // 플레이어 바
    const hpR = Math.max(0, hero.hp / TUNING.hero.hp);
    this.el.hpFill.style.transform = `scaleX(${hpR})`;
    this._hpGhostDelay -= rawDt;
    if (this._hpGhostDelay <= 0) this.el.hpGhost.style.transform = `scaleX(${hpR})`;
    const stR = Math.max(0, hero.stamina / TUNING.hero.stamina);
    this.el.stFill.style.transform = `scaleX(${stR})`;
    this.el.stBar.classList.toggle('exhausted', hero.exhausted > 0);
    // 플라스크
    const pips = this.el.flasks.children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('full', i < hero.flasks);
    // 보스 바
    const bR = Math.max(0, boss.hpRatio);
    this.el.bossFill.style.transform = `scaleX(${bR})`;
    this._bossGhostDelay -= rawDt;
    if (this._bossGhostDelay <= 0) this.el.bossGhost.style.transform = `scaleX(${bR})`;
    const gR = boss.groggy ? 1 : boss.groggyGauge / TUNING.boss.groggy.max;
    this.el.groggyFill.style.transform = `scaleX(${gR})`;
    this.el.groggyBar.classList.toggle('ready', boss.groggy);

    // 록온 레티클 (보스 가슴 투영)
    if (hero.lockon && boss.alive) {
      this._proj.copy(boss.root.position);
      this._proj.y += 4.6;
      this._proj.project(camera);
      if (this._proj.z < 1) {
        const x = (this._proj.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-this._proj.y * 0.5 + 0.5) * window.innerHeight;
        this.el.reticle.style.display = 'block';
        this.el.reticle.style.left = x + 'px';
        this.el.reticle.style.top = y + 'px';
      } else {
        this.el.reticle.style.display = 'none';
      }
    } else {
      this.el.reticle.style.display = 'none';
    }

    // 토스트/페이즈 카드 수명
    if (this._toastTimer > 0) {
      this._toastTimer -= rawDt;
      if (this._toastTimer <= 0) this.el.toast.classList.remove('on');
    }
    if (this._phaseTimer > 0) {
      this._phaseTimer -= rawDt;
      if (this._phaseTimer <= 0) this.el.phaseCard.classList.remove('on');
    }
  }

  hpDamaged() { this._hpGhostDelay = 0.6; }
  bossDamaged() { this._bossGhostDelay = 0.5; }

  setStats(text) {
    this.el.stats.style.display = text ? 'block' : 'none';
    if (text) this.el.stats.textContent = text;
  }
}
