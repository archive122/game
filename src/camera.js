// ═══════════════════════════════════════════════════════════════════════════
// 시네마틱 3인칭 카메라 — 스프링암 + 록온 프레이밍(Furi식) + trauma² 셰이크
// 모드: title(오빗) / game(추종) / awaken(각성 연출) / killcam / death
// 셰이크·FOV는 rawDelta 구동 (히트스톱 중에도 카메라는 살아있다)
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { TUNING } from './config.js';

const C = TUNING.camera;
const F = TUNING.feel;

export class GameCamera {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'title';
    this.yaw = Math.PI * 0.5;
    this.pitch = 0.16;
    this.trauma = 0;
    this.fov = F.fovBase;
    this.targetFov = F.fovBase;
    this.pos = new THREE.Vector3(0, 6, 24);
    this.lookTarget = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3(0, 6, 24);
    this.smoothLook = new THREE.Vector3(0, 3, 0);
    this.shakeSeed = [Math.random() * 100, Math.random() * 100, Math.random() * 100];
    this.time = 0;
    this.killcamAngle = 0;
    this.awakenT = 0;
    this.fovOverride = null;
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
  }

  addTrauma(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  applyMouse(dx, dy) {
    if (this.mode !== 'game') return;
    this.yaw -= dx * C.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * C.sensitivity, C.pitchMin, C.pitchMax);
  }

  setMode(mode) {
    if (mode === 'awaken') this.awakenT = 0;
    if (mode === 'killcam') this.killcamAngle = this.yaw;
    this.mode = mode;
  }

  // 전투 시작/재시작 시 히어로 등 뒤로 즉시 스냅 — 타이틀 오빗 위치에서
  // 아레나를 가로질러 날아오는 전이(저사양에서 길어짐)를 제거한다
  snapBehindHero(hero) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = this._v1.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    const side = this._v2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.pos.copy(hero.root.position)
      .add(this._v3.set(0, C.height, 0))
      .addScaledVector(dir, C.distance)
      .addScaledVector(side, C.shoulder);
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 20.4) { this.pos.x *= 20.4 / r; this.pos.z *= 20.4 / r; }
    this.smoothPos.copy(this.pos);
    this.smoothLook.copy(hero.root.position).add(this._v3.set(0, 1.45, 0));
    this.cam.position.copy(this.smoothPos);
    this.cam.lookAt(this.smoothLook);
  }

  // 셰이크용 의사 펄린 (사인 합성)
  #noise(seed, t) {
    return (Math.sin(t * 31.7 + seed) * 0.55 + Math.sin(t * 17.3 + seed * 2.7) * 0.3 + Math.sin(t * 51.1 + seed * 1.3) * 0.15);
  }

  update(rawDt, ctx) {
    this.time += rawDt;
    const { hero, boss } = ctx;

    // ── 모드별 목표 산출 ──
    if (this.mode === 'manual') {
      // 룩데브/디버그: manualPos/manualLook 배열로 직접 지정
      if (this.manualPos) this.smoothPos.set(this.manualPos[0], this.manualPos[1], this.manualPos[2]);
      if (this.manualLook) this.smoothLook.set(this.manualLook[0], this.manualLook[1], this.manualLook[2]);
      this.targetFov = this.manualFov || 50;
    } else if (this.mode === 'title') {
      const t = this.time * 0.055;
      this.pos.set(Math.cos(t) * 14.5, 5.2 + Math.sin(this.time * 0.11) * 1.6, Math.sin(t) * 14.5);
      this.lookTarget.set(0, 3.4, 0);
      this.targetFov = 54;
      this.smoothPos.lerp(this.pos, 1 - Math.exp(-1.6 * rawDt));
      this.smoothLook.lerp(this.lookTarget, 1 - Math.exp(-2.2 * rawDt));
    } else if (this.mode === 'game') {
      if (this.fovOverride !== null) {
        this.targetFov = this.fovOverride;
        this.fovOverride = null;
      } else {
        this.targetFov = F.fovBase;
      }
      const heroPos = hero.root.position;
      if (hero.lockon && boss && boss.alive) {
        // 록온: 카메라 요를 보스 방향으로 서서히 견인
        const toBoss = this._v1.copy(boss.root.position).sub(heroPos);
        const wantYaw = Math.atan2(-toBoss.x, -toBoss.z);
        let dy = wantYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * Math.min(1, 4.2 * rawDt);
        this.pitch = THREE.MathUtils.lerp(this.pitch, 0.14 + toBoss.length() * 0.004, 1 - Math.exp(-3 * rawDt));
      }
      // 스프링암
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const dir = this._v1.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
      const side = this._v2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.pos.copy(heroPos)
        .add(this._v3.set(0, C.height, 0))
        .addScaledVector(dir, C.distance)
        .addScaledVector(side, C.shoulder);
      // 외벽(r=21.5) 안쪽으로 제한 — 카메라가 벽 뒤로 나가 캐릭터가 가려지는 것 방지
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > 20.4) { this.pos.x *= 20.4 / r; this.pos.z *= 20.4 / r; }
      if (this.pos.y < 0.35) this.pos.y = 0.35;

      this.lookTarget.copy(heroPos).add(this._v3.set(0, 1.45, 0));
      if (hero.lockon && boss && boss.alive) {
        // 보스 쪽으로 시선 편향 — 거체를 화면에 담는다
        this._v1.copy(boss.root.position).setY(boss.root.position.y + 3.4);
        this.lookTarget.lerp(this._v1, C.lockonBossBias);
      }
      const k = 1 - Math.exp(-C.lag * rawDt);
      this.smoothPos.lerp(this.pos, k);
      this.smoothLook.lerp(this.lookTarget, 1 - Math.exp(-C.lag * 1.5 * rawDt));
    } else if (this.mode === 'awaken') {
      this.awakenT += rawDt;
      const t = Math.min(1, this.awakenT / 3.2);
      const e = t * t * (3 - 2 * t);
      const bossPos = boss.root.position;
      // 보스 발치 로우앵글 → 안면 상승 돌리
      const ang = Math.PI * 0.35 + e * 0.9;
      const r = 13 - e * 4.5;
      this.pos.set(bossPos.x + Math.cos(ang) * r, 1.2 + e * 6.4, bossPos.z + Math.sin(ang) * r);
      this.lookTarget.set(bossPos.x, 2.2 + e * 4.6, bossPos.z);
      this.targetFov = 46;
      this.smoothPos.lerp(this.pos, 1 - Math.exp(-5 * rawDt));
      this.smoothLook.lerp(this.lookTarget, 1 - Math.exp(-5 * rawDt));
    } else if (this.mode === 'killcam') {
      this.killcamAngle += rawDt * 0.5;
      const bossPos = boss.root.position;
      const r = 11.5;
      this.pos.set(bossPos.x + Math.cos(this.killcamAngle) * r, 4.6, bossPos.z + Math.sin(this.killcamAngle) * r);
      this.lookTarget.set(bossPos.x, 3.6, bossPos.z);
      this.targetFov = 44;
      this.smoothPos.lerp(this.pos, 1 - Math.exp(-3.5 * rawDt));
      this.smoothLook.lerp(this.lookTarget, 1 - Math.exp(-4 * rawDt));
    } else if (this.mode === 'death') {
      const heroPos = hero.root.position;
      this.pos.copy(heroPos).add(this._v3.set(2.4, 3.6, 2.8));
      this.lookTarget.copy(heroPos).setY(0.6);
      this.targetFov = 50;
      this.smoothPos.lerp(this.pos, 1 - Math.exp(-1.4 * rawDt));
      this.smoothLook.lerp(this.lookTarget, 1 - Math.exp(-2 * rawDt));
    }

    // ── FOV (부드럽게) ──
    this.fov += (this.targetFov - this.fov) * Math.min(1, 9 * rawDt);
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();

    // ── 적용 + trauma² 회전 셰이크 ──
    this.cam.position.copy(this.smoothPos);
    this.cam.lookAt(this.smoothLook);
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - F.traumaDecay * rawDt);
      const s = this.trauma * this.trauma;
      const t = this.time * 8;
      this.cam.rotation.x += this.#noise(this.shakeSeed[0], t) * 0.028 * s;
      this.cam.rotation.y += this.#noise(this.shakeSeed[1], t) * 0.028 * s;
      this.cam.rotation.z += this.#noise(this.shakeSeed[2], t) * 0.022 * s;
    }
  }
}
