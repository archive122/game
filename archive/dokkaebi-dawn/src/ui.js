// HUD·화면 DOM 컨트롤러 — 전 문자열 한국어. 게임 로직과 분리된 표시 계층.
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'), timer: $('timer'), xpbar: $('xpbar'), levelLabel: $('level-label'),
  hpbar: $('hpbar'), hpLabel: $('hp-label'), coins: $('coins'),
  score: $('score'), best: $('best'), kills: $('kills'), dps: $('dps'),
  comboWrap: $('combo-wrap'), combo: $('combo'), comboMult: $('combo-mult'), comboGauge: $('combo-gauge-fill'),
  slots: $('slots'),
  ringDash: $('ring-dash').querySelector('.fg'), ringByeok: $('ring-byeok').querySelector('.fg'),
  bossWrap: $('bossbar-wrap'), bossName: $('bossbar-name'), bossFill: $('bossbar-fill'),
  toasts: $('toasts'), vignette: $('vignette'), flash: $('flash'),
  cursorRing: $('cursor-ring'), cursorFg: $('cursor-ring').querySelector('.fg'),
  stats: $('stats'),
  startScreen: $('start-screen'), nightLabel: $('night-label'), startBest: $('start-best'), startCoins: $('start-coins'),
  btnShop: $('btn-shop'), btnSkin: $('btn-skin'), btnNight: $('btn-night'),
  cardsScreen: $('cards-screen'), cardsRow: $('cards-row'), cardsTitle: $('cards-title'),
  deathScreen: $('death-screen'), deathTime: $('death-time'), deathScore: $('death-score'),
  deathBest: $('death-best'), deathKills: $('death-kills'), deathCoins: $('death-coins'), missionsList: $('missions-list'),
  victoryScreen: $('victory-screen'), vKillscore: $('v-killscore'), vSurvival: $('v-survival'),
  vBonus: $('v-bonus'), vTotal: $('v-total'), vCoins: $('v-coins'), vNightUnlock: $('v-night-unlock'), missionsListV: $('missions-list-v'),
  shopScreen: $('shop-screen'), shopItems: $('shop-items'), shopCoins: $('shop-coins'), btnShopClose: $('btn-shop-close'),
  pauseScreen: $('pause-screen'), btnResume: $('btn-resume'), btnSound: $('btn-sound'),
};

const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
const fmtTime = (sec) => {
  sec = Math.max(0, sec);
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
};

// CSS 트랜스폼 스케일 펀치 (ease-out-back 근사: CSS transition + 즉시 확대)
function punch(node, scale = 1.35) {
  node.style.transition = 'none';
  node.style.transform = `scale(${scale})`;
  requestAnimationFrame(() => {
    node.style.transition = 'transform .22s cubic-bezier(.34,1.56,.64,1)';
    node.style.transform = 'scale(1)';
  });
}

const RARITY_KO = { common: '일반', rare: '희귀', hero: '영웅' };

export const ui = {
  el,

  showHud(on) { el.hud.classList.toggle('hidden', !on); },

  setTimer(remaining) {
    el.timer.textContent = `동트기까지 ${fmtTime(remaining)}`;
    el.timer.classList.toggle('danger', remaining <= 30 && remaining > 0);
  },
  setXP(frac, level) {
    el.xpbar.style.width = `${Math.min(100, frac * 100)}%`;
    el.levelLabel.textContent = `Lv.${level}`;
  },
  setHP(hp, max) {
    const f = Math.max(0, hp / max);
    el.hpbar.style.width = `${f * 100}%`;
    el.hpbar.classList.toggle('low', hp < CONFIG.player.lowHpThreshold);
    el.hpLabel.textContent = `${Math.max(0, Math.ceil(hp))} / ${max}`;
  },
  hpShake() { punch(el.hpbar.parentNode, 1.08); },
  setCoins(n) { el.coins.textContent = `냥 ${fmt(n)}`; },
  setScore(n) { el.score.textContent = `점수 ${fmt(n)}`; },
  setBest(n) { el.best.textContent = `최고 ${fmt(n)}`; },
  setKills(n) { el.kills.textContent = `처치 ${fmt(n)}`; },

  _lastDps: -1,
  setDPS(n) {
    const v = Math.round(n);
    if (v !== this._lastDps) {
      el.dps.textContent = fmt(v);
      if (v > this._lastDps && v > 0) punch(el.dps, 1.25);
      this._lastDps = v;
    }
  },

  _lastCombo: 0,
  setCombo(count, mult, tierIdx, gaugeFrac) {
    el.comboWrap.classList.toggle('hidden', count <= 0);
    if (count <= 0) { this._lastCombo = 0; return; }
    el.combo.textContent = count;
    el.comboMult.textContent = `×${mult}`;
    const color = CONFIG.combo.tierColors[tierIdx];
    el.combo.style.color = color;
    el.comboMult.style.color = color;
    el.comboGauge.style.width = `${gaugeFrac * 100}%`;
    el.comboGauge.style.background = color;
    if (count > this._lastCombo) punch(el.combo, 1.3);
    this._lastCombo = count;
  },

  // 무기/패시브 슬롯 렌더 (레벨업·획득 시에만 호출)
  renderSlots(weapons, passives) {
    el.slots.innerHTML = '';
    const make = (item, cls, maxLv) => {
      const d = document.createElement('div');
      d.className = `slot ${cls}` + (item ? (item.evolved ? ' evolved' : '') : ' empty');
      if (item) {
        d.innerHTML = `<div>${item.icon}</div><div class="pips">${
          Array.from({ length: maxLv }, (_, i) => `<span class="pip${i < item.lv ? ' on' : ''}"></span>`).join('')}</div>`;
        d.title = item.name;
      }
      el.slots.appendChild(d);
    };
    for (let i = 0; i < CONFIG.cards.weaponSlots; i++) make(weapons[i], '', CONFIG.cards.weaponMaxLv);
    for (let i = 0; i < CONFIG.cards.passiveSlots; i++) make(passives[i], 'passive', CONFIG.cards.passiveMaxLv);
  },

  setRings(dashFrac, byeokFrac) {
    const C = 2 * Math.PI * 22;
    el.ringDash.style.strokeDasharray = C;
    el.ringDash.style.strokeDashoffset = C * (1 - dashFrac);
    el.ringByeok.style.strokeDasharray = C;
    el.ringByeok.style.strokeDashoffset = C * (1 - byeokFrac);
  },
  setCursor(x, y, byeokFrac, visible) {
    el.cursorRing.classList.toggle('hidden', !visible);
    if (!visible) return;
    el.cursorRing.style.left = `${x}px`;
    el.cursorRing.style.top = `${y}px`;
    const C = 2 * Math.PI * 13;
    el.cursorFg.style.strokeDasharray = C;
    el.cursorFg.style.strokeDashoffset = C * (1 - byeokFrac);
    el.cursorFg.style.stroke = byeokFrac >= 1 ? '#ffd166' : 'rgba(255,209,102,.45)';
  },

  setBoss(show, frac) {
    el.bossWrap.classList.toggle('hidden', !show);
    if (show) el.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
  },

  toast(msg, cls = 'teal') {
    const d = document.createElement('div');
    d.className = `toast ${cls}`;
    d.textContent = msg;
    el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 1900);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
  },

  setVignette(strength) { el.vignette.style.opacity = strength; },
  flashScreen(color = '#fff', peak = 0.35, dur = 160) {
    el.flash.style.background = color;
    el.flash.style.transition = 'none';
    el.flash.style.opacity = peak;
    requestAnimationFrame(() => {
      el.flash.style.transition = `opacity ${dur}ms ease-out`;
      el.flash.style.opacity = 0;
    });
  },

  setStats(text, show) {
    el.stats.classList.toggle('hidden', !show);
    if (show) el.stats.textContent = text;
  },

  // ─── 화면 전환 ───
  showStart({ night, best, coins }) {
    const nightNames = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
    el.nightLabel.textContent = `${nightNames[Math.min(night - 1, 9)]} 번째 밤`;
    el.startBest.textContent = `최고 기록 ${fmt(best)}`;
    el.startCoins.textContent = `냥 ${fmt(coins)}`;
    el.startScreen.classList.remove('hidden');
  },
  hideStart() { el.startScreen.classList.add('hidden'); },

  // cards: [{rarity, icon, name, lvText, desc}] → onPick(index)
  showCards(cards, onPick) {
    el.cardsRow.innerHTML = '';
    cards.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = `card ${c.rarity}`;
      d.innerHTML = `<div class="rarity">[${RARITY_KO[c.rarity]}]</div><div class="icon">${c.icon}</div>` +
        `<div class="name">${c.name}</div><div class="lv">${c.lvText}</div>` +
        `<div class="desc">${c.desc}</div><div class="key-hint">${i + 1} 키</div>`;
      d.addEventListener('click', () => onPick(i));
      el.cardsRow.appendChild(d);
    });
    el.cardsScreen.classList.remove('hidden');
  },
  hideCards() { el.cardsScreen.classList.add('hidden'); },

  renderMissions(container, missions) {
    container.innerHTML = missions.map((m) =>
      `<div class="mission-row${m.done ? ' done' : ''}"><span class="check">${m.done ? '✓' : '○'}</span>` +
      `${m.name} <span style="opacity:.6">${Math.min(m.progress, m.goal)}/${m.goal}</span></div>`).join('');
  },

  showDeath({ remaining, score, best, kills, coinsGained, missions }) {
    el.deathTime.textContent = `새벽까지 ${fmtTime(remaining)}`;
    el.deathScore.textContent = fmt(score);
    el.deathBest.textContent = fmt(best);
    el.deathKills.textContent = fmt(kills);
    el.deathCoins.textContent = `+${fmt(coinsGained)}냥`;
    this.renderMissions(el.missionsList, missions);
    el.deathScreen.classList.remove('hidden');
  },
  hideDeath() { el.deathScreen.classList.add('hidden'); },

  showVictory({ killScore, survival, bonus, total, coinsGained, nightUnlocked, missions }) {
    el.vKillscore.textContent = fmt(killScore);
    el.vSurvival.textContent = `+${fmt(survival)}`;
    el.vBonus.textContent = `+${fmt(bonus)}`;
    el.vTotal.textContent = fmt(total);
    el.vCoins.textContent = `+${fmt(coinsGained)}냥`;
    el.vNightUnlock.textContent = nightUnlocked ? '다음 밤이 열렸다 — 더 붉은 달이 뜬다' : '';
    this.renderMissions(el.missionsListV, missions);
    el.victoryScreen.classList.remove('hidden');
  },
  hideVictory() { el.victoryScreen.classList.add('hidden'); },

  // shop: meta 상태 + onBuy(key) 콜백
  showShop(meta, onBuy) {
    el.shopCoins.textContent = `냥 ${fmt(meta.coins)}`;
    el.shopItems.innerHTML = '';
    for (const [key, item] of Object.entries(CONFIG.economy.shop)) {
      const rank = meta.shop[key] || 0;
      const maxed = rank >= item.costs.length;
      const cost = maxed ? null : item.costs[rank];
      const d = document.createElement('div');
      d.className = 'shop-item';
      d.innerHTML = `<div class="si-name">${item.name}</div><div class="si-desc">${item.desc}</div>` +
        `<div class="si-rank">랭크 ${rank}/${item.costs.length}</div>`;
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = maxed ? '최대 랭크' : `${cost}냥`;
      b.disabled = maxed || meta.coins < cost;
      b.addEventListener('click', () => onBuy(key));
      d.appendChild(b);
      el.shopItems.appendChild(d);
    }
    el.shopScreen.classList.remove('hidden');
  },
  hideShop() { el.shopScreen.classList.add('hidden'); },

  showPause() { el.pauseScreen.classList.remove('hidden'); },
  hidePause() { el.pauseScreen.classList.add('hidden'); },
  setSoundLabel(on) { el.btnSound.textContent = on ? '소리 끄기' : '소리 켜기'; },
};
