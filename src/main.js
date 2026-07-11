// ═══════════════════════════════════════════════════════════════════════════
// 잿불의 결투: 몰락한 파수꾼 — 부트스트랩 + 게임 상태기계 + 단일 클록
//
// 클록 규율: gameDelta = rawDelta × timeScale.
//   히트스톱/슬로모는 timeScale만 조작한다.
//   카메라 셰이크 · UI · 포스트FX · BGM 스케줄러는 rawDelta로 구동한다.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { TUNING } from './config.js';
import { createRenderer, Pipeline, QualityGovernor } from './renderer.js';
import { Arena } from './arena.js';
import { GameCamera } from './camera.js';
import { FX } from './fx.js';
import { Hero } from './hero.js';
import { Boss } from './boss.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { makeSoftDot } from './textures.js';

// ── 기반 ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(TUNING.feel.fovBase, 1, 0.1, 400);
const pipeline = new Pipeline(renderer);
const softDot = makeSoftDot();

const ui = new UI();
const audio = new GameAudio();
const gcam = new GameCamera(camera);
const fx = new FX(scene, softDot);
const arena = new Arena(scene, softDot);
arena.bakeEnvironment(renderer);

// ── 단일 클록 ──────────────────────────────────────────────────────────────
const clock = {
  timeScale: 1,
  hitstopT: 0,
  slowmo: 1,
  slowmoRecover: 0,     // 초당 회복률 (0 = 유지)
  pulseT: 0,
  pulseScale: 1,
  hitstop(d) { this.hitstopT = Math.max(this.hitstopT, d); },
  pulseSlowmo(scale, dur) { this.pulseScale = scale; this.pulseT = dur; },
  setSlowmo(scale, recover = 0) { this.slowmo = scale; this.slowmoRecover = recover; },
  compute(rawDt) {
    if (this.slowmoRecover > 0) {
      this.slowmo = Math.min(1, this.slowmo + this.slowmoRecover * rawDt);
      if (this.slowmo >= 1) this.slowmoRecover = 0;
    }
    let scale = this.slowmo;
    if (this.pulseT > 0) { this.pulseT -= rawDt; scale = Math.min(scale, this.pulseScale); }
    if (this.hitstopT > 0) { this.hitstopT -= rawDt; scale = TUNING.feel.hitstopScale; }
    this.timeScale = scale;
    return scale;
  },
};

// ── 공유 컨텍스트 ──────────────────────────────────────────────────────────
const ctx = {
  scene, camera, gcam, fx, audio, ui, clock,
  hero: null, boss: null,
  debugGod: false,
};
const hero = new Hero(scene, ctx);
const boss = new Boss(scene, ctx);
ctx.hero = hero;
ctx.boss = boss;
fx.registerGhostSource(hero.root);

// 화로 잿불 이미터
for (const b of arena.braziers) {
  fx.addEmitter(b.pos, 7, { color: [4.2, 1.5, 0.35] });
}

// ── 게임 흐름 상태 ─────────────────────────────────────────────────────────
// title → approach → awaken → fight → (dead | killcam → victory)
let flow = 'title';
let flowT = 0;
let fightTime = 0;
let deaths = 0;
let paused = false;
let fadeTarget = 0;         // 0 = 밝음
let dbgSpeed = 1;
let statsOn = false;
let gameTime = 0;
let rawTime = 0;

const GATE_SPAWN = new THREE.Vector3(
  Math.cos(TUNING.arena.gateAngle) * 17.0, 0, Math.sin(TUNING.arena.gateAngle) * 17.0);
const RETRY_SPAWN = new THREE.Vector3(
  Math.cos(TUNING.arena.gateAngle) * 12.5, 0, Math.sin(TUNING.arena.gateAngle) * 12.5);

hero.reset(GATE_SPAWN);
ui.showScreen('title');
ui.setHud(false);

// ── 콜백 (전투 연출 훅) ────────────────────────────────────────────────────
ctx.onHeroHurt = () => {
  pipeline.compMat.uniforms.uHurt.value = 1;
  pipeline.compMat.uniforms.uChromaBoost.value = 1;
  ui.hpDamaged();
};
ctx.onHeroDeath = (patternName) => {
  flow = 'dead';
  flowT = 0;
  clock.setSlowmo(0.25, 0.5);
  gcam.setMode('death');
  audio.sfx('deathSting');
  audio.setPhase(0);
  deaths++;
  ui.setBossBar(false);
};
ctx.onBossGroggy = () => {
  ui.toast('파수꾼이 무너졌다 — E 처형');
};
ctx.onBossDeath = () => {
  flow = 'killcam';
  flowT = 0;
  clock.setSlowmo(TUNING.feel.killSlowmo, 1 / TUNING.feel.killSlowmoRecover);
  gcam.setMode('killcam');
  ui.setBossBar(false);
  ui.setLetterbox(true);
  audio.sfx('execute');
  audio.setPhase(0);
  fx.burst(new THREE.Vector3().copy(boss.root.position).setY(4.5),
    { count: 120, color: [4, 1.6, 0.4], speed: 6, up: 4, life: 1.6, size: 2.6, grav: 1 });
  gcam.addTrauma(0.5);
};
ctx.onPhaseTransition = (phase) => {
  audio.sfx('phaseShift');
  audio.sfx('roar');
  audio.setPhase(phase);
  gcam.addTrauma(TUNING.feel.shakeRoar);
  ui.setLetterbox(true);
  setTimeout(() => { if (flow === 'fight') ui.setLetterbox(false); }, 2300);
  if (phase === 2) {
    arena.collapse();
    arena.setPhase(1);
    fx.setGlobalEmbers(true);
    ui.phaseTitle('제 2 막', '각성');
  } else if (phase === 3) {
    boss.igniteSword();
    ui.phaseTitle('제 3 막', '잿불');
    fx.burst(new THREE.Vector3().copy(boss.root.position).setY(5),
      { count: 60, color: [4.5, 1.4, 0.3], speed: 5, life: 1.2, size: 2.6, grav: -2 });
  }
};
ctx.onExecuteStart = () => {
  ui.setLetterbox(true);
  clock.setSlowmo(0.45, 0);
};
ctx.onExecuteStrike = () => {
  boss.takeExecute();
  clock.hitstop(TUNING.feel.executeHitstop);
  gcam.addTrauma(0.55);
  audio.sfx('execute');
  ui.bossDamaged();
  const p = new THREE.Vector3().copy(boss.root.position).setY(3.4);
  fx.burst(p, { count: 90, color: [0.7, 2.8, 3.2], speed: 8, up: 3, life: 0.9, size: 2.6, grav: 4 });
  fx.ring(boss.root.position, { maxR: 7, dur: 0.6, color: [0.8, 2.6, 3] });
  fx.flash(p, [0.5, 0.9, 1], 90, 0.5);
  hero.heal(0.12);   // 처형 회복 — 전진 보상
};
ctx.onExecuteEnd = () => {
  // 처형 중 보스가 죽었다면 킬캠이 레터박스/슬로모를 소유한다
  if (flow !== 'fight') return;
  ui.setLetterbox(false);
  clock.setSlowmo(1, 0);
};
ctx.onPerfectDodge = () => {
  clock.pulseSlowmo(0.3, 0.14);
  audio.sfx('chargeFull');
  ui.toast('완벽 회피', 0.9);
};

// ── 입력 ──────────────────────────────────────────────────────────────────
const keys = {};
const input = { x: 0, z: 0 };
const canAct = () => (flow === 'approach' || flow === 'fight') && !paused;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (canAct()) {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') hero.onRoll();
    if (e.code === 'KeyE') hero.onFlask();
    if (e.code === 'KeyQ') hero.onLockon();
  }
  if (e.code === 'KeyR' && (flow === 'deadScreen' || flow === 'victory')) retry();
  if (e.code === 'KeyM') { audio.setEnabled(!audio.enabled); }
  // 디버그
  if (e.code === 'Digit8') { ctx.debugGod = !ctx.debugGod; ui.toast(ctx.debugGod ? '무적 ON' : '무적 OFF', 1); }
  if (e.code === 'Digit9') { statsOn = !statsOn; if (!statsOn) ui.setStats(''); }
  if (e.code === 'Digit0') { dbgSpeed = dbgSpeed === 1 ? 3 : 1; ui.toast('배속 ×' + dbgSpeed, 1); }
  if (e.code === 'Digit7' && flow === 'fight') boss.takeHit(0, 1000, hero.root.position);
  if (e.code === 'Digit6' && flow === 'fight') boss.takeHit(TUNING.boss.hp * 0.36, 0, hero.root.position);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

canvas.addEventListener('mousedown', (e) => {
  if (!canAct()) return;
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) hero.onAttack();
  if (e.button === 2) hero.onHeavyStart();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2 && canAct()) hero.onHeavyRelease();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) gcam.applyMouse(e.movementX, e.movementY);
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && (flow === 'approach' || flow === 'fight')) {
    paused = true;
    ui.showScreen('pause');
  }
});

function lockPointer() {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
}

document.getElementById('pause-screen').addEventListener('click', () => {
  paused = false;
  ui.showScreen(null);
  lockPointer();
});
document.getElementById('start-btn').addEventListener('click', () => {
  audio.init();
  audio.resume();
  audio.sfx('uiClick');
  startApproach();
});
for (const id of ['death-screen', 'victory-screen']) {
  document.getElementById(id).addEventListener('click', (e) => {
    if (e.target.id === 'grace-btn') return;
    retry();
  });
}
document.getElementById('grace-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  hero.grace = true;
  audio.sfx('healDone');
  document.getElementById('grace-offer').classList.remove('on');
  ui.toast('잿불의 가호가 함께한다', 2);
});

// ── 흐름 전환 ──────────────────────────────────────────────────────────────
function startApproach() {
  flow = 'approach';
  flowT = 0;
  ui.showScreen(null);
  ui.setHud(true);
  hero.reset(GATE_SPAWN);
  gcam.setMode('game');
  gcam.yaw = hero.facing + Math.PI;   // 등 뒤에서 시작
  gcam.pitch = 0.18;
  lockPointer();
}

function startFight() {
  flow = 'fight';
  flowT = 0;
  fightTime = 0;
  ui.setLetterbox(false);
  ui.setBossBar(true);
  gcam.setMode('game');
  audio.setPhase(Math.max(1, boss.phase));
}

function retry() {
  audio.sfx('uiClick');
  flow = 'reset';
  flowT = 0;
  fadeTarget = 1;
  ui.showScreen(null);
  lockPointer();   // 사용자 제스처 컨텍스트 안에서 요청해야 성공한다
}

function doReset() {
  hero.reset(RETRY_SPAWN);
  boss.reset();
  fx.resetAll();
  arena.setPhase(0);
  fx.setGlobalEmbers(false);
  pipeline.compMat.uniforms.uHurt.value = 0;
  ui.setHud(true);
  ui.setBossBar(true);
  gcam.setMode('game');
  gcam.yaw = hero.facing + Math.PI;
  gcam.trauma = 0;
  clock.setSlowmo(1, 0);
  audio.setPhase(1);
  lockPointer();
}

// ── 품질 조정 ──────────────────────────────────────────────────────────────
const governor = new QualityGovernor(pipeline, renderer, (tier) => {
  const size = tier >= 1 ? 1024 : TUNING.render.shadowSize;
  const sh = arena.keyLight.shadow;
  if (sh.mapSize.x !== size) {
    sh.mapSize.set(size, size);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
  resize();
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(1);
  renderer.setSize(w * governor.pixelRatio, h * governor.pixelRatio, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h, governor.pixelRatio);
}
window.addEventListener('resize', resize);
resize();

// ── 메인 루프 ──────────────────────────────────────────────────────────────
let last = performance.now();
let fpsEma = 60;

function frame(now) {
  requestAnimationFrame(frame);
  // 음수 방지: 첫 rAF 타임스탬프가 performance.now()보다 과거일 수 있다
  let rawDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  rawTime += rawDt;
  if (paused) rawDt = 0;

  governor.update(rawDt);
  const scale = clock.compute(rawDt);
  const dt = rawDt * scale * dbgSpeed;
  gameTime += dt;
  flowT += rawDt;

  // 입력 벡터
  input.x = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  input.z = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const heroInput = (flow === 'approach' || flow === 'fight') ? input : { x: 0, z: 0 };

  // ── 흐름 ──
  if (flow === 'title') {
    fadeTarget = 0;
  } else if (flow === 'approach') {
    // 각인 안내 + 보스 접근 감지
    const d = hero.root.position.distanceTo(boss.root.position);
    if (d < TUNING.flow.awakenDistance) {
      flow = 'awaken';
      flowT = 0;
      ui.setLetterbox(true);
      gcam.setMode('awaken');
      boss.playAwaken();
      audio.setPhase(1);
    }
  } else if (flow === 'awaken') {
    if (flowT >= 3.8) startFight();
  } else if (flow === 'fight') {
    fightTime += dt;
  } else if (flow === 'dead') {
    if (flowT >= 1.7) {
      flow = 'deadScreen';
      document.exitPointerLock?.();
      ui.showDeath(hero.lastHitBy, deaths, deaths >= TUNING.flow.graceDeaths && !hero.grace);
      clock.setSlowmo(1, 0);
    }
  } else if (flow === 'killcam') {
    if (flowT >= 4.8) {
      flow = 'victory';
      document.exitPointerLock?.();
      ui.setLetterbox(false);
      ui.showVictory(hero.stats, fightTime, deaths);
      audio.sfx('victory');
    }
  } else if (flow === 'reset') {
    if (flowT >= 0.45) {
      doReset();
      startFight();
      fadeTarget = 0;
    }
  }

  // ── 업데이트 ──
  if (flow !== 'title') {
    hero.update(dt, rawDt, heroInput);
  }
  if (flow === 'fight' || flow === 'awaken' || flow === 'killcam' || flow === 'dead') {
    boss.update(dt, rawDt);
  }
  arena.update(rawDt, dt, gameTime);
  fx.update(dt, rawDt, gameTime);
  audio.update(rawDt);
  gcam.update(rawDt, ctx);
  ui.update(rawDt, ctx, camera);

  // 포스트FX 유니폼 (rawDt 구동)
  const cu = pipeline.compMat.uniforms;
  cu.uHurt.value = Math.max(0, cu.uHurt.value - rawDt * 1.8);
  cu.uChromaBoost.value = Math.max(0, cu.uChromaBoost.value - rawDt * 3);
  cu.uFade.value += (fadeTarget - cu.uFade.value) * Math.min(1, 2.4 * rawDt);
  // 저체력 맥동
  if (hero.alive && hero.hp < 30 && flow === 'fight') {
    cu.uHurt.value = Math.max(cu.uHurt.value, 0.18 + Math.sin(rawTime * 4) * 0.08);
  }

  pipeline.render(scene, camera, rawTime);

  // 통계
  if (statsOn) {
    fpsEma += ((1 / Math.max(1e-3, rawDt || 1 / 60)) - fpsEma) * 0.04;
    ui.setStats(
      `${fpsEma.toFixed(0)} fps · tier ${governor.tier}\n` +
      `calls ${renderer.info.render.calls} · tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\n` +
      `boss ${boss.state} ${boss.hp.toFixed(0)}hp · hero ${hero.state} ${hero.hp.toFixed(0)}hp`);
  }
}
requestAnimationFrame(frame);

// E2E/디버그 핸들 (게임플레이에는 영향 없음)
window.__DUEL = {
  ctx, clock, hero, boss, arena, pipeline, gcam, ui,
  get flow() { return flow; },
  set flow(v) { flow = v; },
  get paused() { return paused; },
  set paused(v) { paused = v; },
  startApproach, startFight, retry, doReset,
};
