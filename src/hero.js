// ═══════════════════════════════════════════════════════════════════════════
// 히어로 — 중갑 기사. 프리미티브 리그 + 코드 키포즈 애니메이션.
// 절차 애니의 뻣뻣함은 '판금 갑옷' 컨셉으로 정당화하고,
// 빠른 동작의 어색함은 검광 트레일·잔상·히트스톱이 시선을 가져간다.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { TUNING } from './config.js';
import { SwordTrail } from './fx.js';

const H = TUNING.hero;

// ── 공용: 포즈/클립 샘플러 (boss.js에서도 사용) ──────────────────────────────
// pose = { jointName: [rx, ry, rz], root: [px, py, pz] }
export function makeEase(name) {
  switch (name) {
    case 'in': return t => t * t;
    case 'out': return t => 1 - (1 - t) * (1 - t);
    case 'inout': return t => t * t * (3 - 2 * t);
    case 'snap': return t => 1 - Math.pow(1 - t, 4);   // 급가속 임팩트
    default: return t => t;
  }
}
// clip = { dur, keys: [{t, pose, ease}] } — t는 0..dur 절대시간
export function sampleClip(clip, time, out) {
  const keys = clip.keys;
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (time >= keys[i].t && time <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
  }
  if (time < keys[0].t) { a = b = keys[0]; }
  if (time > keys[keys.length - 1].t) { a = b = keys[keys.length - 1]; }
  const span = Math.max(1e-5, b.t - a.t);
  const t = THREE.MathUtils.clamp((time - a.t) / span, 0, 1);
  const e = makeEase(b.ease)(t);
  for (const j in out) {
    const pa = a.pose[j], pb = b.pose[j];
    const target = out[j];
    for (let c = 0; c < target.length; c++) {
      const va = pa ? pa[c] ?? 0 : 0;
      const vb = pb ? pb[c] ?? 0 : 0;
      target[c] = va + (vb - va) * e;
    }
  }
}
// 조인트에 적용 (부드러운 전이용 blend)
export function applyPose(joints, pose, blend = 1) {
  for (const name in pose) {
    const j = joints[name];
    if (!j) continue;
    const p = pose[name];
    if (name === 'root') {
      j.position.x += (p[0] - j.position.x) * blend;
      j.position.y += (p[1] + j.userData.baseY - j.position.y) * blend;
      j.position.z += (p[2] - j.position.z) * blend;
    } else {
      j.rotation.x += (p[0] - j.rotation.x) * blend;
      j.rotation.y += (p[1] - j.rotation.y) * blend;
      j.rotation.z += (p[2] - j.rotation.z) * blend;
    }
  }
}
export function zeroPose(names) {
  const o = {};
  for (const n of names) o[n] = n === 'root' ? [0, 0, 0] : [0, 0, 0];
  return o;
}

// ═══════════════════════════════════════════════════════════════════════════
// 히어로 포즈 정의
// 조인트: pose(로컬 회전) — hips, torso, head, uArmR, fArmR, uArmL, fArmL,
//         thighL, shinL, thighR, shinR, root(오프셋)
// ═══════════════════════════════════════════════════════════════════════════
const J = ['hips', 'torso', 'head', 'uArmR', 'fArmR', 'uArmL', 'fArmL', 'thighL', 'shinL', 'thighR', 'shinR', 'root'];

const P = {
  idle: { uArmR: [0.35, 0, -0.18], fArmR: [-0.55, 0, 0], uArmL: [0.25, 0, 0.15], fArmL: [-0.4, 0, 0], torso: [0.06, 0, 0], root: [0, 0, 0] },
  guard: { uArmR: [0.5, 0, -0.3], fArmR: [-0.9, 0, 0], uArmL: [0.4, 0.3, 0.35], fArmL: [-0.7, 0, 0], torso: [0.12, 0.15, 0] },
  // 약공 1: 우→좌 횡베기
  sl1a: { uArmR: [-1.9, 0, -1.1], fArmR: [-0.4, 0, 0], torso: [0.05, -0.75, 0], hips: [0, -0.3, 0], head: [0, 0.5, 0] },
  sl1b: { uArmR: [0.6, 0, 1.25], fArmR: [-0.1, 0, 0], torso: [0.16, 0.85, 0], hips: [0, 0.4, 0], head: [0, -0.3, 0] },
  // 약공 2: 좌→우 리턴
  sl2a: { uArmR: [0.4, 0, 1.5], fArmR: [-0.2, 0, 0], torso: [0.1, 0.9, 0], hips: [0, 0.4, 0] },
  sl2b: { uArmR: [-0.7, 0, -1.5], fArmR: [-0.3, 0, 0], torso: [0.14, -0.9, 0], hips: [0, -0.45, 0] },
  // 약공 3: 종베기 피니시
  sl3a: { uArmR: [-2.6, 0, -0.2], fArmR: [-0.6, 0, 0], torso: [-0.22, -0.1, 0], root: [0, 0.04, 0] },
  sl3b: { uArmR: [0.9, 0, -0.05], fArmR: [-0.12, 0, 0], torso: [0.5, 0.1, 0], hips: [0.1, 0, 0], root: [0, -0.1, 0] },
  // 강공: 차지 → 대회전 종베기
  hvCharge: { uArmR: [-2.75, 0, -0.5], fArmR: [-0.9, 0, 0], uArmL: [0.5, 0.4, 0.5], torso: [-0.3, -0.35, 0], root: [0, -0.03, 0] },
  hvSmash: { uArmR: [1.05, 0, -0.1], fArmR: [-0.15, 0, 0], torso: [0.62, 0.2, 0], hips: [0.15, 0, 0], root: [0, -0.16, 0] },
  // 구르기
  rollTuck: { torso: [0.9, 0, 0], head: [0.5, 0, 0], uArmR: [0.9, 0, -0.3], fArmR: [-1.4, 0, 0], uArmL: [0.9, 0, 0.3], fArmL: [-1.4, 0, 0], thighL: [-1.9, 0, 0], shinL: [2.1, 0, 0], thighR: [-1.9, 0, 0], shinR: [2.1, 0, 0], root: [0, -0.42, 0] },
  // 플라스크
  drink: { uArmL: [-2.3, 0, 0.5], fArmL: [-1.5, 0, 0], head: [-0.3, 0, 0.12], torso: [0.05, 0.12, 0] },
  // 피격
  flinch: { torso: [-0.28, 0, 0.12], head: [-0.25, 0, 0], uArmR: [0.7, 0, -0.5], uArmL: [0.7, 0, 0.5], root: [0, -0.05, 0] },
  // 사망
  dead: { torso: [1.35, 0, 0.1], head: [0.6, 0, 0], hips: [0.2, 0, 0], uArmR: [1.2, 0, -0.9], fArmR: [-0.4, 0, 0], uArmL: [1.1, 0, 0.8], thighL: [-0.6, 0, 0.2], shinL: [1.2, 0, 0], thighR: [-0.3, 0, -0.25], shinR: [0.8, 0, 0], root: [0, -0.86, 0] },
  // 처형 찌르기
  exeWind: { uArmR: [-1.35, 0, -0.9], fArmR: [-1.1, 0, 0], torso: [0.907, -0.55, 0], root: [0, 0, 0] },
  exeStab: { uArmR: [-1.5708, 0, 0], fArmR: [0, 0, 0], torso: [0.28, 0.35, 0], hips: [0, 0.2, 0], root: [0, -0.05, 0] },
};

// 클립 정의 — 각 공격의 판정 창(active)과 캔슬 창은 데이터로
const CLIPS = {
  light0: {
    dur: 0.62, active: [0.16, 0.3], step: 1.9, cancel: 0.38, chain: [0.3, 0.72],
    keys: [
      { t: 0, pose: P.sl1a, ease: 'out' },
      { t: 0.16, pose: P.sl1a, ease: 'linear' },
      { t: 0.3, pose: P.sl1b, ease: 'snap' },
      { t: 0.62, pose: P.idle, ease: 'inout' },
    ],
  },
  light1: {
    dur: 0.6, active: [0.14, 0.28], step: 1.9, cancel: 0.36, chain: [0.28, 0.7],
    keys: [
      { t: 0, pose: P.sl2a, ease: 'out' },
      { t: 0.14, pose: P.sl2a, ease: 'linear' },
      { t: 0.28, pose: P.sl2b, ease: 'snap' },
      { t: 0.6, pose: P.idle, ease: 'inout' },
    ],
  },
  light2: {
    dur: 0.86, active: [0.2, 0.34], step: 2.4, cancel: 0.5, chain: null,
    keys: [
      { t: 0, pose: P.sl3a, ease: 'out' },
      { t: 0.2, pose: P.sl3a, ease: 'linear' },
      { t: 0.34, pose: P.sl3b, ease: 'snap' },
      { t: 0.86, pose: P.idle, ease: 'inout' },
    ],
  },
  heavy: {
    dur: 0.95, active: [0.12, 0.3], step: 2.8, cancel: 0.55, chain: null,
    keys: [
      { t: 0, pose: P.hvCharge, ease: 'linear' },
      { t: 0.12, pose: P.hvCharge, ease: 'linear' },
      { t: 0.3, pose: P.hvSmash, ease: 'snap' },
      { t: 0.95, pose: P.idle, ease: 'inout' },
    ],
  },
  execute: {
    dur: 1.5, active: [0.5, 0.62], step: 0, cancel: 1.4, chain: null,
    keys: [
      { t: 0, pose: P.exeWind, ease: 'out' },
      { t: 0.5, pose: P.exeWind, ease: 'linear' },
      { t: 0.62, pose: P.exeStab, ease: 'snap' },
      { t: 1.2, pose: P.exeStab, ease: 'linear' },
      { t: 1.5, pose: P.idle, ease: 'inout' },
    ],
  },
};

export class Hero {
  constructor(scene, ctx) {
    this.ctx = ctx;
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.hp = H.hp;
    this.stamina = H.stamina;
    this.staminaBlock = 0;      // 회복 지연 타이머
    this.exhausted = 0;
    this.flasks = H.flasks;
    this.lockon = false;
    this.invuln = 0;
    this.alive = true;
    this.grace = false;         // 잿불의 가호

    this.state = 'idle';        // idle|run|roll|attack|heavy-charge|flask|hurt|execute|dead
    this.stateT = 0;
    this.clip = null;
    this.combo = 0;
    this.hasHit = false;
    this.charge = 0;
    this.bufferAttack = -1;     // 선입력 타임스탬프
    this.bufferRoll = -1;
    this.rollDir = new THREE.Vector3(0, 0, 1);
    this.facing = 0;            // 라디안
    this.vel = new THREE.Vector3();
    this.moveInput = new THREE.Vector2();
    this.time = 0;
    this.walkPhase = 0;
    this.stepAcc = 0;
    this.ghostTimes = [];
    this.rollCooldown = 0;

    // 통계
    this.stats = { rolls: 0, dodges: 0, hitsTaken: 0, hitsDealt: 0 };

    this.#buildRig();
    this.trail = new SwordTrail(scene, [0.5, 2.6, 3.4]);
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._mv = new THREE.Vector3();   // 이동 방향 전용 — 임시 벡터와 별칭 금지
    this.pose = zeroPose(J);
  }

  #buildRig() {
    const armor = new THREE.MeshStandardMaterial({ color: 0x4d5769, metalness: 0.72, roughness: 0.42, envMapIntensity: 2.0 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1d222e, metalness: 0.05, roughness: 0.92, envMapIntensity: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd6deeb, metalness: 0.92, roughness: 0.2, envMapIntensity: 2.2 });
    const trim = new THREE.MeshBasicMaterial({ fog: false });
    trim.color.setRGB(0.45, 2.2, 2.9);       // HDR 시안 — 블룸
    this.mats = { armor, cloth, steel, trim };

    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };

    const joints = {};
    // 포즈 오프셋 전용 노드 — this.root(월드 이동)와 분리
    const poseRoot = new THREE.Group();
    poseRoot.userData.baseY = 0;
    this.root.add(poseRoot);
    joints.root = poseRoot;

    const hips = new THREE.Group(); hips.position.y = 0.97; poseRoot.add(hips); joints.hips = hips;
    hips.add(box(0.36, 0.24, 0.26, armor, 0, 0.02, 0));
    hips.add(box(0.4, 0.3, 0.3, cloth, 0, -0.16, 0));      // 치마 갑

    const torso = new THREE.Group(); torso.position.y = 0.18; hips.add(torso); joints.torso = torso;
    torso.add(box(0.42, 0.5, 0.3, armor, 0, 0.3, 0));
    torso.add(box(0.46, 0.2, 0.34, armor, 0, 0.5, 0));     // 흉갑 상단
    torso.add(box(0.2, 0.26, 0.2, armor, -0.31, 0.52, 0)); // 견갑 L
    torso.add(box(0.2, 0.26, 0.2, armor, 0.31, 0.52, 0));  // 견갑 R

    const head = new THREE.Group(); head.position.y = 0.72; torso.add(head); joints.head = head;
    {
      const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.145, 0.2, 12), armor);
      helm.position.y = 0.1; helm.castShadow = true;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), armor);
      dome.position.y = 0.2; dome.castShadow = true;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.024, 0.02), trim);
      visor.position.set(0, 0.1, 0.135);
      head.add(helm, dome, visor);
    }

    const mkArm = (side) => {   // side: 1 = R, -1 = L
      const uArm = new THREE.Group();
      uArm.position.set(0.31 * side, 0.5, 0);
      torso.add(uArm);
      uArm.add(box(0.11, 0.34, 0.11, armor, 0, -0.17, 0));
      const fArm = new THREE.Group();
      fArm.position.y = -0.34;
      uArm.add(fArm);
      fArm.add(box(0.1, 0.32, 0.1, armor, 0, -0.16, 0));
      return [uArm, fArm];
    };
    [joints.uArmR, joints.fArmR] = mkArm(1);
    [joints.uArmL, joints.fArmL] = mkArm(-1);

    // 장검 (오른손)
    const sword = new THREE.Group();
    sword.position.set(0, -0.34, 0.02);
    joints.fArmR.add(sword);
    {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.22, 8), cloth);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.06), steel);
      guard.position.y = 0.12;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.06, 0.014), steel);
      blade.position.y = 0.66;
      blade.castShadow = true;
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.98, 0.016), trim);
      rune.position.y = 0.66;
      sword.add(grip, guard, blade, rune);
      sword.rotation.x = Math.PI / 2;   // 기본 파지: 전방
      this.trailBase = new THREE.Object3D(); this.trailBase.position.y = 0.16; sword.add(this.trailBase);
      this.trailTip = new THREE.Object3D(); this.trailTip.position.y = 1.2; sword.add(this.trailTip);
    }
    this.sword = sword;

    const mkLeg = (side) => {
      const thigh = new THREE.Group();
      thigh.position.set(0.13 * side, -0.02, 0);
      hips.add(thigh);
      thigh.add(box(0.14, 0.42, 0.15, cloth, 0, -0.21, 0));
      const shin = new THREE.Group();
      shin.position.y = -0.44;
      thigh.add(shin);
      shin.add(box(0.13, 0.42, 0.14, armor, 0, -0.21, 0));
      shin.add(box(0.14, 0.09, 0.24, armor, 0, -0.44, 0.04));  // 발
      return [thigh, shin];
    };
    [joints.thighL, joints.shinL] = mkLeg(-1);
    [joints.thighR, joints.shinR] = mkLeg(1);

    // 캐릭터 필 라이트 — 어디서든 실루엣이 읽히도록 (그림자 없음, 저강도)
    const fill = new THREE.PointLight(0x6f87ad, 3.2, 6.5, 1.6);
    fill.position.set(0, 2.3, 0);
    this.root.add(fill);

    this.joints = joints;
  }

  // ── 입력 이벤트 (main에서 호출) ──
  onAttack() { this.bufferAttack = this.time; }
  onHeavyStart() {
    if (!this.#canAct() || this.stamina < H.heavy.stamina) return;
    this.state = 'heavy-charge';
    this.stateT = 0;
    this.charge = 0;
    this.ctx.audio?.sfx('chargeStart');
  }
  onHeavyRelease() {
    if (this.state !== 'heavy-charge') return;
    this.#startClip('heavy');
    this.state = 'attack';
    this.combo = -1;             // 강공 표식
    this.chargeFullNotified = false;
    this.#useStamina(H.heavy.stamina);
    this.ctx.audio?.sfx('swingHeavy');
  }
  onRoll() { this.bufferRoll = this.time; }
  cancelHeavyCharge() {
    // 일시정지/포커스 이탈 시 차지를 조용히 취소 (스태미나는 릴리스 시점에 소모되므로 환불 불필요)
    if (this.state !== 'heavy-charge') return;
    this.state = 'idle';
    this.charge = 0;
    this.chargeFullNotified = false;
  }
  onFlask() {
    if (!this.#canAct() || this.flasks <= 0 || this.hp >= H.hp) {
      // 그로기 보스 근접 시 E = 처형
      if (this.#tryExecute()) return;
      if (this.flasks <= 0) this.ctx.audio?.sfx('deny');
      return;
    }
    if (this.#tryExecute()) return;
    this.state = 'flask';
    this.stateT = 0;
    this.ctx.audio?.sfx('healStart');
  }
  onLockon() {
    this.lockon = !this.lockon;
    this.ctx.audio?.sfx('lockon');
  }

  #tryExecute() {
    const boss = this.ctx.boss;
    if (!this.alive || this.state === 'execute') return false;
    if (!boss || !boss.groggy || !boss.alive) return false;
    const d = this._v1.copy(boss.root.position).sub(this.root.position).length();
    if (d > 5.2) return false;
    this.state = 'execute';
    this.stateT = 0;
    this.#startClip('execute');
    this.hasHit = false;
    // 보스 정면으로 스냅
    const dir = this._v1.copy(boss.root.position).sub(this.root.position).normalize();
    this.facing = Math.atan2(dir.x, dir.z);
    this.ctx.onExecuteStart?.();
    return true;
  }

  #canAct() {
    return this.alive && this.exhausted <= 0 &&
      (this.state === 'idle' || this.state === 'run');
  }

  #useStamina(n) {
    this.stamina -= n;
    this.staminaBlock = H.staminaDelay;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.exhausted = H.exhaustDuration;
      this.ctx.audio?.sfx('exhaust');
    }
  }

  #startClip(name) {
    this.clip = CLIPS[name];
    this.clipName = name;
    this.stateT = 0;
    this.hasHit = false;
    this.shockDone = false;
    this.trail.reset();
  }

  takeDamage(amount, patternName, fromPos) {
    if (!this.alive || this.invuln > 0 || this.ctx.debugGod) return false;
    if (this.ctx.boss && !this.ctx.boss.alive) return false;   // 결투는 이미 끝났다
    if (this.state === 'execute') return false;                // 처형 연출 중 무적 (GDD)
    // 구르기 무적
    if (this.state === 'roll' && this.stateT >= H.roll.iframeStart && this.stateT <= H.roll.iframeEnd) {
      this.stats.dodges++;
      this.ctx.onPerfectDodge?.();
      return false;
    }
    const dmg = this.grace ? amount * (1 - TUNING.flow.graceReduction) : amount;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = H.hurtInvuln;
    this.stats.hitsTaken++;
    this.lastHitBy = patternName;
    this.ctx.audio?.sfx('hurt');
    this.ctx.gcam?.addTrauma(TUNING.feel.shakeHurt);
    this.ctx.fx?.burst(this._v1.copy(this.root.position).setY(1.2), {
      count: 14, color: [3.2, 0.5, 0.3], speed: 4, life: 0.4, size: 2 });
    this.ctx.onHeroHurt?.();
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.stateT = 0;
      this.ctx.onHeroDeath?.(patternName);
    } else {
      // 넉백 + 경직 (공격 중이었다면 끊김)
      if (this.state !== 'roll') {
        this.state = 'hurt';
        this.stateT = 0;
        this.chargeFullNotified = false;
        if (fromPos) {
          this._v1.copy(this.root.position).sub(fromPos).setY(0).normalize();
          this.vel.addScaledVector(this._v1, 7);
        }
      }
    }
    return true;
  }

  heal(ratio) {
    this.hp = Math.min(H.hp, this.hp + H.hp * ratio);
  }

  reset(spawnPos) {
    this.hp = H.hp;
    this.stamina = H.stamina;
    this.flasks = H.flasks;
    this.exhausted = 0;
    this.invuln = 0;
    this.alive = true;
    this.state = 'idle';
    this.stateT = 0;
    this.combo = 0;
    this.vel.set(0, 0, 0);
    this.root.position.copy(spawnPos);
    this.facing = Math.atan2(-spawnPos.x, -spawnPos.z);
    this.root.rotation.y = this.facing;
    this.stats = { rolls: 0, dodges: 0, hitsTaken: 0, hitsDealt: 0 };
    this.trail.reset();
    this.lockon = false;
  }

  // ── 공격 판정: 부채꼴 vs 보스 실린더 ──
  #meleeCheck(range, arc, damage, groggy, heavyMult = 1) {
    const boss = this.ctx.boss;
    if (!boss || !boss.alive) return;
    const to = this._v1.copy(boss.root.position).sub(this.root.position);
    to.y = 0;
    const dist = to.length() - boss.bodyRadius;
    if (dist > range) return;
    const ang = Math.atan2(to.x, to.z);
    let dy = ang - this.facing;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (Math.abs(dy) > arc) return;
    this.hasHit = true;
    const punish = boss.inPunishWindow ? H.punishMult : 1;
    // 무적(처형 직후 등) 중에는 유효타 피드백을 내지 않는다
    if (!boss.takeHit(damage * heavyMult, groggy * heavyMult * punish, this.root.position)) return;
    this.stats.hitsDealt++;
    const hitPos = this._v2.copy(this.root.position).addScaledVector(
      this._v1.set(Math.sin(this.facing), 0, Math.cos(this.facing)), Math.min(dist + boss.bodyRadius, 2.6)).setY(1.6);
    this.ctx.fx?.burst(hitPos, { count: 16, color: [4, 2.6, 1.0], speed: 6, life: 0.35, size: 2.2 });
    this.ctx.fx?.flash(hitPos, [1, 0.8, 0.5], 26, 0.18);
    const isHeavy = this.combo === -1;
    this.ctx.clock?.hitstop(isHeavy ? H.heavy.hitstop : H.light.hitstop);
    this.ctx.gcam?.addTrauma(isHeavy ? TUNING.feel.shakeHit * 1.6 : TUNING.feel.shakeHit);
    this.ctx.audio?.sfx(isHeavy ? 'hitHeavy' : 'hit');
  }

  update(dt, rawDt, input) {
    if (!dt && !rawDt) return;
    this.time += dt;
    const boss = this.ctx.boss;

    if (this.invuln > 0) this.invuln -= dt;
    if (this.rollCooldown > 0) this.rollCooldown -= dt;

    // 스태미나
    if (this.exhausted > 0) {
      this.exhausted -= dt;
      if (this.exhausted <= 0) this.stamina = H.stamina * 0.35;
    } else if (this.staminaBlock > 0) {
      this.staminaBlock -= dt;
    } else if (this.state !== 'heavy-charge') {
      this.stamina = Math.min(H.stamina, this.stamina + H.staminaRegen * dt);
    }

    // 이동 입력 → 월드 방향 (카메라 기준)
    const camYaw = this.ctx.gcam ? this.ctx.gcam.yaw : 0;
    const ix = input.x, iz = input.z;
    const moving = (ix !== 0 || iz !== 0);
    const psi = camYaw + Math.PI;              // 카메라 전방각
    const wx = Math.sin(psi) * iz + Math.cos(psi) * ix;
    const wz = Math.cos(psi) * iz - Math.sin(psi) * ix;
    const moveDir = this._mv.set(wx, 0, wz);
    if (moveDir.lengthSq() > 1) moveDir.normalize();

    // ── 상태 머신 ──
    this.stateT += dt;
    const st = this.state;

    // 선입력 소비
    const wantAttack = this.bufferAttack >= 0 && this.time - this.bufferAttack <= H.inputBuffer;
    const wantRoll = this.bufferRoll >= 0 && this.time - this.bufferRoll <= H.inputBuffer;

    if (st === 'idle' || st === 'run') {
      // 이동
      const speed = this.exhausted > 0 ? H.moveSpeed * 0.55 : (this.lockon ? H.strafeSpeed : H.moveSpeed);
      this.vel.lerp(this._v2.copy(moveDir).multiplyScalar(speed), Math.min(1, 14 * dt));
      this.state = moving ? 'run' : 'idle';
      // 조준 방향
      if (this.lockon && boss && boss.alive) {
        const to = this._v2.copy(boss.root.position).sub(this.root.position);
        const want = Math.atan2(to.x, to.z);
        this.#turnToward(want, dt);
      } else if (moving) {
        this.#turnToward(Math.atan2(moveDir.x, moveDir.z), dt);
      }
      // 액션
      if (wantRoll && this.stamina > 0 && this.rollCooldown <= 0 && this.exhausted <= 0) {
        this.bufferRoll = -1;
        this.#doRoll(moveDir, moving);
      } else if (wantAttack && this.stamina > 0 && this.exhausted <= 0) {
        this.bufferAttack = -1;
        this.combo = 0;
        this.#startClip('light0');
        this.state = 'attack';
        this.#useStamina(H.light.stamina);
        this.ctx.audio?.sfx('swingLight');
      }
    } else if (st === 'attack' || st === 'execute') {
      const clip = this.clip;
      const t = this.stateT;
      // 전진 스텝 (관성)
      if (t < clip.active[1]) {
        this.vel.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(clip.step);
      } else {
        this.vel.multiplyScalar(Math.max(0, 1 - 10 * dt));
      }
      // 판정 창
      if (!this.hasHit && t >= clip.active[0] && t <= clip.active[1]) {
        if (st === 'execute') {
          if (t >= clip.active[0]) {
            this.hasHit = true;
            this.ctx.onExecuteStrike?.();
          }
        } else if (this.combo === -1) {
          const mult = 1 + this.charge * (H.heavy.chargeBonus - 1);
          this.#meleeCheck(H.heavy.range, H.heavy.arc, H.heavy.damage, H.heavy.groggy, mult);
          if (this.charge >= 1 && !this.shockDone) {
            this.shockDone = true;
            this.ctx.fx?.ring(this.root.position, { maxR: 4.6, dur: 0.45, color: [1.4, 3, 3.6], y: 0.14 });
          }
        } else {
          this.#meleeCheck(H.light.range, H.light.arc, H.light.damage[this.combo], H.light.groggy[this.combo]);
        }
      }
      // 트레일
      if (t >= clip.active[0] - 0.05 && t <= clip.active[1] + 0.1) {
        this.root.updateMatrixWorld(true);
        this.trail.push(
          this.trailBase.getWorldPosition(this._v1),
          this.trailTip.getWorldPosition(this._v2), this.time);
      }
      // 콤보 체인
      if (st === 'attack' && this.combo >= 0 && clip.chain && wantAttack &&
          t >= clip.chain[0] && this.stamina > 0) {
        this.bufferAttack = -1;
        this.combo++;
        this.#startClip('light' + this.combo);
        this.#useStamina(H.light.stamina);
        this.ctx.audio?.sfx('swingLight');
        return this.#finishUpdate(dt, rawDt, moving);
      }
      // 구르기 캔슬 (후반부)
      if (st === 'attack' && wantRoll && t >= clip.cancel && this.stamina > 0 && this.rollCooldown <= 0) {
        this.bufferRoll = -1;
        this.#doRoll(moveDir, moving);
        return this.#finishUpdate(dt, rawDt, moving);
      }
      if (t >= clip.dur) {
        if (st === 'execute') this.ctx.onExecuteEnd?.();
        this.state = 'idle';
        this.shockDone = false;
        this.charge = 0;
      }
    } else if (st === 'heavy-charge') {
      this.charge = Math.min(1, this.stateT / H.heavy.chargeMax);
      this.vel.multiplyScalar(Math.max(0, 1 - 8 * dt));
      if (this.lockon && boss && boss.alive) {
        const to = this._v2.copy(boss.root.position).sub(this.root.position);
        this.#turnToward(Math.atan2(to.x, to.z), dt);
      }
      if (this.ctx.gcam) this.ctx.gcam.fovOverride = TUNING.feel.fovBase - (TUNING.feel.fovBase - TUNING.feel.fovChargePinch) * this.charge;
      if (this.charge >= 1 && !this.chargeFullNotified) {
        this.chargeFullNotified = true;
        this.ctx.audio?.sfx('chargeFull');
        this.ctx.fx?.burst(this._v1.copy(this.root.position).setY(1.5), { count: 10, color: [1, 2.6, 3], speed: 2, life: 0.4, size: 1.8, grav: -1 });
      }
    } else if (st === 'roll') {
      const r = H.roll;
      const p = this.stateT / r.duration;
      const speed = r.speed * (1 - p * 0.55);
      this.vel.copy(this.rollDir).multiplyScalar(speed);
      // 잔상
      if (this.ghostTimes.length && this.stateT >= this.ghostTimes[0]) {
        this.ghostTimes.shift();
        this.ctx.fx?.snapshotGhost();
      }
      if (this.stateT >= r.duration) {
        this.state = 'idle';
        this.rollCooldown = r.cooldown;
      }
    } else if (st === 'flask') {
      this.vel.multiplyScalar(Math.max(0, 1 - 8 * dt));
      if (this.stateT >= H.flaskTime) {
        this.flasks--;
        this.heal(H.flaskHeal);
        this.ctx.audio?.sfx('healDone');
        this.ctx.fx?.burst(this._v1.copy(this.root.position).setY(1.2), { count: 22, color: [0.7, 2.8, 1.6], speed: 2.4, life: 0.7, size: 2.2, grav: -2 });
        this.state = 'idle';
      }
    } else if (st === 'hurt') {
      this.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
      if (this.stateT >= 0.38) this.state = 'idle';
    } else if (st === 'dead') {
      this.vel.multiplyScalar(Math.max(0, 1 - 5 * dt));
    }

    this.#finishUpdate(dt, rawDt, moving);
  }

  #doRoll(moveDir, moving) {
    if (moving) this.rollDir.copy(moveDir).setY(0).normalize();
    else this.rollDir.set(Math.sin(this.facing + Math.PI), 0, Math.cos(this.facing + Math.PI)); // 후방 스텝
    if (!this.lockon) this.facing = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.state = 'roll';
    this.stateT = 0;
    this.#useStamina(H.roll.stamina);
    this.stats.rolls++;
    this.ghostTimes = [0.05, 0.13, 0.22];
    this.chargeFullNotified = false;
    this.ctx.audio?.sfx('roll');
  }

  #turnToward(want, dt) {
    let d = want - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const max = H.turnRate * dt;
    this.facing += THREE.MathUtils.clamp(d, -max, max);
  }

  #finishUpdate(dt, rawDt, moving) {
    // 위치 적분 + 아레나 경계
    this.root.position.addScaledVector(this.vel, dt);
    const r = Math.hypot(this.root.position.x, this.root.position.z);
    if (r > TUNING.arena.radius) {
      this.root.position.x *= TUNING.arena.radius / r;
      this.root.position.z *= TUNING.arena.radius / r;
    }
    this.root.rotation.y = this.facing;

    // ── 포즈 결정 ──
    const st = this.state;
    let blend = Math.min(1, 16 * dt);
    if (st === 'attack' || st === 'execute') {
      sampleClip(this.clip, this.stateT, this.pose);
      blend = Math.min(1, 30 * dt);
    } else if (st === 'heavy-charge') {
      this.#poseTo(P.hvCharge);
      blend = Math.min(1, 10 * dt);
    } else if (st === 'roll') {
      this.#poseTo(P.rollTuck);
      blend = Math.min(1, 26 * dt);
    } else if (st === 'flask') {
      this.#poseTo(P.drink);
    } else if (st === 'hurt') {
      this.#poseTo(P.flinch);
      blend = Math.min(1, 24 * dt);
    } else if (st === 'dead') {
      this.#poseTo(P.dead);
      blend = Math.min(1, 6 * dt);
    } else {
      // 대기/보행 절차 애니
      this.#poseTo(this.lockon ? P.guard : P.idle);
      const speed = this.vel.length();
      if (speed > 0.4) {
        this.walkPhase += dt * (5.4 + speed * 1.35);
        const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
        const amp = Math.min(0.62, speed * 0.115);
        this.pose.thighL[0] += s * amp;
        this.pose.thighR[0] += -s * amp;
        this.pose.shinL[0] += Math.max(0, -c) * amp * 1.5;
        this.pose.shinR[0] += Math.max(0, c) * amp * 1.5;
        this.pose.uArmL[0] += -s * amp * 0.55;
        this.pose.uArmR[0] += s * amp * 0.4;
        this.pose.root[1] += Math.abs(c) * 0.045;
        this.pose.torso[2] += s * 0.045;
        // 발소리
        this.stepAcc += dt * speed;
        if (this.stepAcc > 2.1) {
          this.stepAcc = 0;
          this.ctx.audio?.sfx('step');
        }
      } else {
        const b = Math.sin(this.time * 1.9) * 0.02;
        this.pose.torso[0] += b;
        this.pose.root[1] += b * 0.4;
      }
      // 구르기 후 잔여 회전 정리
    }
    applyPose(this.joints, this.pose, blend);
    this.trail.update(this.time);
  }

  #poseTo(target) {
    for (const j in this.pose) {
      const t = target[j];
      const arr = this.pose[j];
      arr[0] = t ? (t[0] ?? 0) : 0;
      arr[1] = t ? (t[1] ?? 0) : 0;
      arr[2] = t ? (t[2] ?? 0) : 0;
    }
  }
}
