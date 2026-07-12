// ═══════════════════════════════════════════════════════════════════════════
// 잿불 파수꾼 — 8m 석상 거인. 균열에서 잿불이 새어 나온다.
// 패턴 9종은 전부 PATTERNS 데이터 테이블 + 공통 스텝 실행기로 구동.
// 판정은 프리미티브 수학(부채꼴/링/캡슐/원), 메시는 연출 전용.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { TUNING, PATTERNS } from './config.js';
import { makeBossMaps } from './textures.js';
import { SwordTrail, } from './fx.js';
import { sampleClip, applyPose, zeroPose, makeEase } from './hero.js';
import { mergeGeoms, M4 } from './arena.js';

const B = TUNING.boss;
const _euler = new THREE.Euler();
const _crackColor = new THREE.Color(TUNING.palette.p1.crack);
const J = ['pelvis', 'torso', 'head', 'uArmR', 'fArmR', 'uArmL', 'fArmL', 'thighL', 'shinL', 'thighR', 'shinR', 'root'];

// ── 보스 포즈 라이브러리 ─────────────────────────────────────────────────────
const P = {
  idle: { uArmR: [0.3, 0, -0.35], fArmR: [-0.5, 0, 0], uArmL: [0.25, 0, 0.3], fArmL: [-0.35, 0, 0], torso: [0.08, 0, 0] },
  kneel: {
    torso: [0.52, 0, 0], head: [0.42, 0, 0],
    uArmR: [0.5, 0, -0.15], fArmR: [-0.8, 0, 0], uArmL: [0.9, 0, 0.2], fArmL: [-0.9, 0, 0],
    thighL: [-1.5, 0, 0.12], shinL: [1.9, 0, 0], thighR: [0.5, 0, -0.1], shinR: [1.35, 0, 0],
    root: [0, -2.1, 0],
  },
  roar: { torso: [-0.35, 0, 0], head: [-0.5, 0, 0], uArmR: [-1.1, 0, -1.1], fArmR: [-0.9, 0, 0], uArmL: [-1.0, 0, 1.1], fArmL: [-0.8, 0, 0], root: [0, 0.12, 0] },
  // 3연 횡베기
  windupSweep: { torso: [0.05, -0.85, 0], head: [0, 0.6, 0], uArmR: [-1.6, 0, -1.3], fArmR: [-0.5, 0, 0], uArmL: [0.4, 0, 0.5], root: [0, -0.12, 0] },
  sweepL: { torso: [0.12, 0.95, 0], head: [0, -0.4, 0], uArmR: [0.5, 0, 1.3], fArmR: [-0.1, 0, 0], root: [0, -0.06, 0] },
  windupSweepB: { torso: [0.1, 1.0, 0], uArmR: [0.35, 0, 1.5], fArmR: [-0.2, 0, 0], root: [0, -0.1, 0] },
  sweepR: { torso: [0.12, -0.95, 0], uArmR: [-0.6, 0, -1.4], fArmR: [-0.15, 0, 0], root: [0, -0.06, 0] },
  windupOver: { torso: [-0.4, 0, 0], uArmR: [-2.7, 0, -0.35], fArmR: [-0.7, 0, 0], uArmL: [-0.5, 0, 0.6], root: [0, 0.1, 0] },
  sweepFin: { torso: [0.66, 0, 0], uArmR: [0.95, 0, -0.1], fArmR: [-0.1, 0, 0], hips: [0.1, 0, 0], root: [0, -0.3, 0] },
  recoverLow: { torso: [0.5, 0.25, 0], head: [0.3, 0, 0], uArmR: [0.65, 0, -0.2], fArmR: [-0.3, 0, 0], uArmL: [0.5, 0, 0.3], root: [0, -0.34, 0] },
  // 내려찍기
  windupSlam: { torso: [-0.5, 0, 0], head: [-0.3, 0, 0], uArmR: [-2.9, 0, -0.3], fArmR: [-0.55, 0, 0], uArmL: [-0.9, 0, 0.7], root: [0, 0.16, 0] },
  slamDown: { torso: [0.7, 0, 0], uArmR: [0.8, 0, -0.12], fArmR: [-0.05, 0, 0], root: [0, -0.2, 0] },
  slamImpact: { torso: [0.78, 0, 0], head: [0.3, 0, 0], uArmR: [0.85, 0, -0.12], fArmR: [0, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.7, 0, 0], root: [0, -0.5, 0] },
  recoverSlam: { torso: [0.55, -0.2, 0], head: [0.35, 0, 0], uArmR: [0.7, 0, -0.15], fArmR: [-0.2, 0, 0], root: [0, -0.42, 0] },
  // 붙잡기 돌진
  windupGrab: { torso: [0.62, 0, 0], head: [-0.15, 0, 0], uArmR: [0.3, 0, -0.6], uArmL: [-0.5, 0, 0.9], fArmL: [-0.6, 0, 0], thighR: [-0.7, 0, 0], shinR: [1.1, 0, 0], root: [0, -0.6, 0] },
  grabRush: { torso: [0.72, 0, 0], head: [-0.3, 0, 0], uArmL: [-1.2, 0, 0.4], fArmL: [-0.4, 0, 0], uArmR: [0.6, 0, -0.7], root: [0, -0.45, 0] },
  grabEnd: { torso: [0.3, 0.3, 0], uArmL: [-0.4, 0, 0.6], root: [0, -0.2, 0] },
  // 밟기
  windupStomp: { torso: [-0.18, 0, 0], thighR: [-1.7, 0, -0.1], shinR: [1.5, 0, 0], uArmR: [0.4, 0, -0.5], uArmL: [-0.3, 0, 0.6], root: [0, 0.15, 0] },
  stompDown: { torso: [0.3, 0, 0], thighR: [-0.15, 0, 0], shinR: [0.15, 0, 0], root: [0, -0.15, 0] },
  stompImpact: { torso: [0.36, 0, 0], head: [0.2, 0, 0], thighR: [0, 0, 0], shinR: [0, 0, 0], root: [0, -0.3, 0] },
  recoverStomp: { torso: [0.25, 0, 0], root: [0, -0.15, 0] },
  // 캐스팅 (화염 분출 / 잿불 폭우)
  castRaise: { torso: [-0.3, 0, 0], head: [-0.35, 0, 0], uArmR: [-2.5, 0, -0.7], fArmR: [-0.5, 0, 0], uArmL: [-2.4, 0, 0.7], fArmL: [-0.5, 0, 0], root: [0, 0.1, 0] },
  castHold: { torso: [-0.36, 0, 0], head: [-0.4, 0, 0], uArmR: [-2.7, 0, -0.85], fArmR: [-0.4, 0, 0], uArmL: [-2.6, 0, 0.85], fArmL: [-0.4, 0, 0], root: [0, 0.13, 0] },
  castHold2: { torso: [-0.3, 0, 0], head: [-0.3, 0, 0], uArmR: [-2.4, 0, -0.9], uArmL: [-2.3, 0, 0.9], root: [0, 0.08, 0] },
  castRelease: { torso: [0.28, 0, 0], uArmR: [-0.6, 0, -0.9], fArmR: [-0.3, 0, 0], uArmL: [-0.5, 0, 0.9], fArmL: [-0.3, 0, 0], root: [0, -0.12, 0] },
  recoverCast: { torso: [0.35, 0, 0], head: [0.25, 0, 0], uArmR: [0.4, 0, -0.3], uArmL: [0.35, 0, 0.3], root: [0, -0.2, 0] },
  // 도약
  crouchLeap: { torso: [0.55, 0, 0], thighL: [-1.3, 0, 0.1], shinL: [1.8, 0, 0], thighR: [-1.3, 0, -0.1], shinR: [1.8, 0, 0], uArmR: [-0.7, 0, -0.5], uArmL: [-0.7, 0, 0.5], root: [0, -1.3, 0] },
  airborne: { torso: [-0.25, 0, 0], uArmR: [-2.6, 0, -0.4], fArmR: [-0.6, 0, 0], uArmL: [-1.2, 0, 0.8], thighL: [-0.9, 0, 0], shinL: [1.2, 0, 0], thighR: [-0.9, 0, 0], shinR: [1.2, 0, 0] },
  feintHold: { torso: [0.02, -0.7, 0], uArmR: [-1.45, 0, -1.15], fArmR: [-0.55, 0, 0], root: [0, -0.1, 0] },
  // 검기 파동
  windupWave: { torso: [0.04, -0.95, 0], uArmR: [-1.2, 0, -1.55], fArmR: [-0.3, 0, 0], root: [0, -0.08, 0] },
  waveSlash: { torso: [0.1, 1.0, 0], uArmR: [0.25, 0, 1.35], fArmR: [0, 0, 0], root: [0, -0.05, 0] },
  // 그로기 / 사망
  groggy: {
    torso: [0.75, 0, 0.08], head: [0.55, 0, 0],
    uArmR: [0.6, 0, -0.35], fArmR: [-0.5, 0, 0], uArmL: [0.8, 0, 0.3], fArmL: [-0.7, 0, 0],
    thighL: [-1.45, 0, 0.12], shinL: [1.9, 0, 0], thighR: [0.45, 0, -0.1], shinR: [1.3, 0, 0],
    root: [0, -2.0, 0],
  },
  dieFall: {
    torso: [1.25, 0, 0.05], head: [0.7, 0, 0], hips: [0.35, 0, 0],
    uArmR: [1.0, 0, -0.5], fArmR: [-0.2, 0, 0], uArmL: [1.0, 0, 0.5], fArmL: [-0.2, 0, 0],
    thighL: [-1.1, 0, 0.1], shinL: [1.6, 0, 0], thighR: [-0.9, 0, -0.1], shinR: [1.4, 0, 0],
    root: [0, -2.5, 0],
  },
};

export class Boss {
  constructor(scene, ctx) {
    this.ctx = ctx;
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.hp = B.hp;
    this.alive = true;
    this.phase = 1;
    this.pendingPhase = 0;
    this.state = 'dormant';
    this.stateT = 0;
    this.groggy = false;
    this.groggyGauge = 0;
    this.inPunishWindow = false;
    this.bodyRadius = 2.0;
    this.facing = 0;
    this.time = 0;
    this.cooldowns = {};
    this.pattern = null;
    this.stepIndex = -1;
    this.stepT = 0;
    this.stepHit = false;
    this.idleWait = 0;
    this.walkPhase = 0;
    this.hitFlash = 0;
    this.lastPatternName = '';
    this.recoverInvuln = 0;
    this.glowLevel = 0;
    this.glowColor = null;
    this.igniteBase = 0;
    this.eyesLit = false;

    // 투사체/장판 게임플레이 엔티티
    this.crescents = [];   // {mesh, pos, dir, t}
    this.vents = [];       // {decal 위치, t, colMesh, damaged}
    this.rains = [];       // {target, t, fall, mesh, damaged}
    this.rainQueue = 0;
    this.rainTimer = 0;

    this.#buildRig();
    this.trail = new SwordTrail(scene, [4.2, 1.3, 0.3], 0.32);
    this.pose = zeroPose(J);
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this.setDormant();
  }

  #buildRig() {
    const maps = makeBossMaps();
    this.bodyMat = new THREE.MeshStandardMaterial({
      map: maps.map, emissiveMap: maps.emissiveMap,
      emissive: new THREE.Color(TUNING.palette.p1.crack),
      emissiveIntensity: 0.5,
      metalness: 0.12, roughness: 0.82, envMapIntensity: 0.6,
    });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x23272f, metalness: 0.3, roughness: 0.7, envMapIntensity: 0.5 });
    this.eyeMat = new THREE.MeshBasicMaterial({ fog: false });
    this.eyeMat.color.setRGB(0, 0, 0);           // 각성 전 꺼짐
    this.bladeMat = new THREE.MeshStandardMaterial({ color: 0x6d7684, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.1 });
    this.bladeEdgeMat = new THREE.MeshBasicMaterial({ fog: false });
    this.bladeEdgeMat.color.setRGB(0.0, 0.0, 0.0);   // 3페이즈 점화

    // 용암 코어 / 관절 마그마 — 석판 틈으로 새어 나오는 내부 발광 (Elemental 골렘 문법)
    this.coreMat = new THREE.MeshBasicMaterial({ fog: false });
    this.coreMat.color.setRGB(2.6, 0.75, 0.14);
    this.jointMat = new THREE.MeshBasicMaterial({ fog: false });   // 사지 관절은 은은하게
    this.jointMat.color.setRGB(1.3, 0.36, 0.07);
    const jointGlow = (parent, r, x = 0, y = 0, z = 0, mat = this.jointMat) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const cluster = (parent, mat, items) => {
      const m = new THREE.Mesh(mergeGeoms(items), mat);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const single = (parent, geom, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const rock = (r, detail = 0) => new THREE.DodecahedronGeometry(r, detail);

    const joints = {};
    // 포즈 오프셋 전용 노드 — this.root(월드 이동)와 분리
    const poseRoot = new THREE.Group();
    poseRoot.userData.baseY = 0;
    this.root.add(poseRoot);
    joints.root = poseRoot;

    // ── 골반: 중앙 블록 + 좌우 암석 힙 + 허리 코어 ──
    const pelvis = new THREE.Group(); pelvis.position.y = 3.75; poseRoot.add(pelvis); joints.pelvis = pelvis;
    joints.hips = pelvis;   // 포즈 호환 별칭
    cluster(pelvis, this.bodyMat, [
      { geom: new THREE.BoxGeometry(1.45, 0.9, 1.0), matrix: M4(0, -0.05, 0) },
      { geom: rock(0.52), matrix: M4(-0.82, -0.15, 0, 0.4, 0.7, 0) },
      { geom: rock(0.52), matrix: M4(0.82, -0.15, 0, 1.1, 0.2, 0.5) },
    ]);
    jointGlow(pelvis, 0.42, 0, 0.42, 0, this.coreMat);   // 허리 코어 (골반-몸통 틈)

    // ── 몸통: 틈을 벌린 석판 클러스터 + 내부 용암 기둥 + 암석 어깨 ──
    const torso = new THREE.Group(); torso.position.y = 0.55; pelvis.add(torso); joints.torso = torso;
    single(torso, new THREE.CylinderGeometry(0.52, 0.6, 2.5, 10), this.coreMat, 0, 0.95, 0)
      .castShadow = false;                         // 내부 코어 기둥
    cluster(torso, this.bodyMat, [
      { geom: new THREE.BoxGeometry(1.9, 1.35, 0.62), matrix: M4(0, 1.28, 0.42, 0.1, 0, 0) },     // 가슴 슬랩
      { geom: new THREE.BoxGeometry(1.55, 0.85, 0.55), matrix: M4(0, 0.32, 0.4, -0.06, 0, 0) },   // 복부 슬랩
      { geom: new THREE.BoxGeometry(1.75, 1.7, 0.55), matrix: M4(0, 0.95, -0.48, -0.05, 0, 0) },  // 등 슬랩
      { geom: new THREE.BoxGeometry(0.55, 1.5, 0.95), matrix: M4(-0.98, 0.9, 0, 0, 0, 0.08) },    // 옆판 L
      { geom: new THREE.BoxGeometry(0.55, 1.5, 0.95), matrix: M4(0.98, 0.9, 0, 0, 0, -0.08) },    // 옆판 R
      { geom: rock(0.8), matrix: M4(-1.5, 1.7, 0, 0.3, 0.5, 0.2) },                                // 암석 어깨 L
      { geom: rock(0.8), matrix: M4(1.5, 1.7, 0, 0.9, 0.1, 0.7) },                                 // 암석 어깨 R
      { geom: rock(0.34), matrix: M4(-1.15, 2.15, 0.25, 0.2, 0.4, 0.9) },                          // 어깨 파편
      { geom: rock(0.3), matrix: M4(1.2, 2.2, -0.2, 0.8, 0.1, 0.3) },
    ]);
    jointGlow(torso, 0.2, 0, 2.15, 0.1, this.coreMat);   // 목 틈

    // ── 머리: 투구형 두상 + 브로우 슬랩 + 왕관 파편 + 눈 ──
    const head = new THREE.Group(); head.position.y = 2.35; torso.add(head); joints.head = head;
    cluster(head, this.bodyMat, [
      { geom: new THREE.BoxGeometry(0.66, 0.72, 0.7), matrix: M4(0, 0.3, 0) },
      { geom: new THREE.BoxGeometry(0.78, 0.22, 0.34), matrix: M4(0, 0.48, 0.24, -0.15, 0, 0) },  // 브로우
      { geom: new THREE.BoxGeometry(0.3, 0.22, 0.2), matrix: M4(0, 0.06, 0.3, 0.2, 0, 0) },       // 턱
      { geom: new THREE.ConeGeometry(0.11, 0.42, 4), matrix: M4(0, 0.74, -0.1, -0.25, 0.6, 0) },  // 왕관 파편
      { geom: new THREE.ConeGeometry(0.09, 0.34, 4), matrix: M4(-0.22, 0.68, 0, -0.1, 0.2, -0.35) },
      { geom: new THREE.ConeGeometry(0.09, 0.3, 4), matrix: M4(0.22, 0.66, 0, -0.1, 0.9, 0.3) },
    ]);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), this.eyeMat);
    eyeL.position.set(-0.17, 0.34, 0.37);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.17;
    head.add(eyeL, eyeR);

    // ── 팔: 석재 상완 + 팔꿈치 마그마 + 하완 + 암석 주먹 ──
    const mkArm = (side) => {
      const uArm = new THREE.Group();
      uArm.position.set(1.5 * side, 1.65, 0);
      torso.add(uArm);
      cluster(uArm, this.bodyMat, [
        { geom: new THREE.BoxGeometry(0.68, 1.35, 0.68), matrix: M4(0, -0.72, 0, 0, side * 0.3, 0) },
        { geom: rock(0.3), matrix: M4(side * 0.12, -1.32, 0.1, 0.5, 0.2, 0.8) },
      ]);
      const fArm = new THREE.Group();
      fArm.position.y = -1.6;
      uArm.add(fArm);
      jointGlow(fArm, 0.15, 0, 0.02, 0);           // 팔꿈치 마그마
      cluster(fArm, this.bodyMat, [
        { geom: new THREE.BoxGeometry(0.56, 1.3, 0.56), matrix: M4(0, -0.72, 0, 0, side * -0.25, 0) },
      ]);
      single(fArm, rock(0.44), this.darkMat, 0, -1.5, 0, 0.3, side * 0.5, 0.2);   // 주먹
      return [uArm, fArm];
    };
    [joints.uArmR, joints.fArmR] = mkArm(1);
    [joints.uArmL, joints.fArmL] = mkArm(-1);

    // ── 대검 (4.2m): 테이퍼 블레이드 + 포인트 + 가드 + 포멜 ──
    const sword = new THREE.Group();
    sword.position.set(0, -1.5, 0.1);
    joints.fArmR.add(sword);
    {
      cluster(sword, this.darkMat, [
        { geom: new THREE.CylinderGeometry(0.09, 0.11, 0.9, 8), matrix: M4(0, -0.1, 0) },
        { geom: rock(0.17), matrix: M4(0, -0.6, 0) },                                              // 포멜
        { geom: new THREE.BoxGeometry(1.15, 0.18, 0.3), matrix: M4(0, 0.4, 0) },
        { geom: rock(0.15), matrix: M4(-0.56, 0.4, 0) },
        { geom: rock(0.15), matrix: M4(0.56, 0.4, 0) },
      ]);
      const blade = new THREE.Mesh(mergeGeoms([
        { geom: new THREE.BoxGeometry(0.48, 3.5, 0.09), matrix: M4(0, 2.25, 0) },
        { geom: new THREE.ConeGeometry(0.3, 0.6, 4), matrix: M4(0, 4.28, 0, 0, Math.PI / 4, 0, 1, 1, 0.24) }, // 포인트
      ]), this.bladeMat);
      blade.castShadow = true;
      sword.add(blade);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.4, 0.1), this.bladeEdgeMat);
      edge.position.set(0.21, 2.2, 0);
      sword.add(edge);
      sword.rotation.x = Math.PI / 2;
      this.trailBase = new THREE.Object3D(); this.trailBase.position.y = 0.5; sword.add(this.trailBase);
      this.trailTip = new THREE.Object3D(); this.trailTip.position.y = 4.4; sword.add(this.trailTip);
    }
    this.sword = sword;

    // ── 다리: 석재 대퇴 + 무릎 마그마 + 정강이 + 발 ──
    const mkLeg = (side) => {
      const thigh = new THREE.Group();
      thigh.position.set(0.62 * side, -0.4, 0);
      pelvis.add(thigh);
      cluster(thigh, this.bodyMat, [
        { geom: new THREE.BoxGeometry(0.82, 1.55, 0.88), matrix: M4(0, -0.82, 0, 0, side * 0.2, 0) },
        { geom: rock(0.3), matrix: M4(side * 0.2, -0.3, 0.3, 0.7, 0.1, 0.4) },
      ]);
      const shin = new THREE.Group();
      shin.position.y = -1.72;
      thigh.add(shin);
      jointGlow(shin, 0.14, 0, 0.02, 0.06);        // 무릎 마그마
      cluster(shin, this.bodyMat, [
        { geom: new THREE.BoxGeometry(0.68, 1.45, 0.76), matrix: M4(0, -0.78, 0, 0, side * -0.15, 0) },
      ]);
      cluster(shin, this.darkMat, [
        { geom: new THREE.BoxGeometry(0.85, 0.4, 1.2), matrix: M4(0, -1.62, 0.16) },
        { geom: rock(0.26), matrix: M4(-0.25, -1.66, 0.68, 0.3, 0.2, 0.6) },
        { geom: rock(0.26), matrix: M4(0.25, -1.66, 0.68, 0.7, 0.9, 0.1) },
      ]);
      return [thigh, shin];
    };
    [joints.thighL, joints.shinL] = mkLeg(-1);
    [joints.thighR, joints.shinR] = mkLeg(1);

    this.joints = joints;
  }

  setDormant() {
    this.state = 'dormant';
    this.root.position.set(0, 0, 6.5);
    this.facing = Math.PI;   // 게이트 쪽을 바라봄
    this.root.rotation.y = this.facing;
  }

  playAwaken() {
    this.state = 'awaken';
    this.stateT = 0;
  }
  skipAwaken() {
    this.eyeMat.color.setRGB(8, 2.2, 0.6);
    this.bodyMat.emissiveIntensity = 1.1;
    this.state = 'decide';
    this.idleWait = 1.2;
  }

  reset() {
    this.hp = B.hp;
    this.alive = true;
    this.phase = 1;
    this.pendingPhase = 0;
    this.groggy = false;
    this.groggyGauge = 0;
    this.inPunishWindow = false;
    this.cooldowns = {};
    this.pattern = null;
    this.recoverInvuln = 0;
    this.hitFlash = 0;
    this.igniteBase = 0;
    this.glowLevel = 0;
    this.trail.reset();
    this.bladeEdgeMat.color.setRGB(0, 0, 0);
    this.bodyMat.emissive.set(TUNING.palette.p1.crack);
    for (const c of this.crescents) this.ctx.fx.release(c.mesh);
    for (const v of this.vents) { if (v.col) this.ctx.fx.release(v.col); }
    for (const r of this.rains) { if (r.mesh) this.ctx.fx.release(r.mesh); }
    this.crescents.length = 0;
    this.vents.length = 0;
    this.rains.length = 0;
    this.rainQueue = 0;
    this.root.position.set(0, 0, 6.5);
    this.facing = Math.PI;
    this.root.rotation.y = this.facing;
    this.skipAwaken();
    this.state = 'decide';
    this.idleWait = 1.6;
  }

  get hpRatio() { return this.hp / B.hp; }

  takeHit(damage, groggyAmount, fromPos) {
    if (!this.alive || this.state === 'dormant' || this.state === 'awaken' || this.recoverInvuln > 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.hitFlash = 1;
    if (!this.groggy) {
      this.groggyGauge = Math.min(B.groggy.max, this.groggyGauge + groggyAmount);
      if (this.groggyGauge >= B.groggy.max) this.#enterGroggy();
    }
    this.#checkPhase();
    if (this.hp <= 0) this.#die();
    return true;
  }

  takeExecute() {
    this.hp = Math.max(0, this.hp - TUNING.hero.executeDamage);
    this.hitFlash = 1;
    this.groggy = false;
    this.groggyGauge = 0;
    this.recoverInvuln = B.groggy.recoverInvuln + 1.2;
    this.state = 'recover';
    this.stateT = 0;
    this.#checkPhase();
    if (this.hp <= 0) this.#die();
  }

  #enterGroggy() {
    this.groggy = true;
    this.state = 'groggy';
    this.stateT = 0;
    this.inPunishWindow = true;
    this.pattern = null;
    this.root.position.y = 0;   // 도약 중 그로기 — 공중 부양 방지
    this.trail.reset();
    this.#clearTelegraphs();
    this.ctx.audio?.sfx('groggyBreak');
    this.ctx.gcam?.addTrauma(0.4);
    this.ctx.fx?.burst(this._v1.copy(this.root.position).setY(4), { count: 40, color: [4, 1.6, 0.4], speed: 7, life: 0.8, size: 2.6 });
    this.ctx.onBossGroggy?.();
  }

  #checkPhase() {
    const r = this.hpRatio;
    if (this.phase === 1 && r <= B.phase2At) this.pendingPhase = 2;
    else if (this.phase === 2 && r <= B.phase3At) this.pendingPhase = 3;
  }

  #die() {
    if (this.state === 'dying') return;
    this.alive = false;
    this.state = 'dying';
    this.stateT = 0;
    this.inPunishWindow = false;
    this.root.position.y = 0;   // 도약 중 사망 — 공중 부양 방지
    this.trail.reset();
    this.#clearTelegraphs();
    this.ctx.onBossDeath?.();
  }

  #clearTelegraphs() {
    for (const v of this.vents) { if (v.col) this.ctx.fx.release(v.col); }
    this.vents.length = 0;
    for (const r of this.rains) { if (r.mesh) this.ctx.fx.release(r.mesh); }
    this.rains.length = 0;
    for (const c of this.crescents) this.ctx.fx.release(c.mesh);
    this.crescents.length = 0;
    this.rainQueue = 0;
    this.ctx.fx?.clearDecals();
  }

  // ── 패턴 선택 ──
  #choosePattern() {
    const hero = this.ctx.hero;
    const dist = this._v1.copy(hero.root.position).sub(this.root.position).setY(0).length();
    const pool = [];
    for (const key in PATTERNS) {
      const p = PATTERNS[key];
      if (p.phase > this.phase) continue;
      if ((this.cooldowns[key] || 0) > this.time) continue;
      if (dist < p.minR || dist > p.maxR) continue;
      pool.push({ key, p, w: p.weight * (key === this.lastPatternName ? 0.35 : 1) });
    }
    if (!pool.length) return null;
    let total = 0;
    for (const e of pool) total += e.w;
    let roll = Math.random() * total;
    for (const e of pool) {
      roll -= e.w;
      if (roll <= 0) return e;
    }
    return pool[pool.length - 1];
  }

  #startPattern(entry) {
    this.pattern = entry.p;
    this.patternKey = entry.key;
    this.lastPatternName = entry.key;
    this.stepIndex = -1;
    this.state = 'pattern';
    this.#nextStep();
  }

  #stepDur(step) {
    return step.dur * (this.phase >= 2 ? B.phaseSpeedup : 1);
  }

  #nextStep() {
    this.stepIndex++;
    this.stepT = 0;
    this.stepHit = false;
    this.inPunishWindow = false;
    if (this.stepIndex >= this.pattern.steps.length) {
      this.cooldowns[this.patternKey] = this.time + this.pattern.cooldown * (0.8 + Math.random() * 0.4);
      this.pattern = null;
      this.state = 'decide';
      this.idleWait = 0.5 + Math.random() * 0.8;
      return;
    }
    const step = this.pattern.steps[this.stepIndex];
    // 스텝 진입 이벤트
    if (step.tele) this.ctx.audio?.tele(step.tele);
    if (step.sfx) this.ctx.audio?.sfx(step.sfx);
    if (step.punish) this.inPunishWindow = true;
    if (step.glow) {
      this.glowLevel = 1;
      this.glowColor = step.glow === 2 ? [6, 0.4, 0.3] : [4, 1.6, 0.4];
    }
    if (step.trail) this.trailActive = true; else this.trailActive = false;
    if (step.decals) this.#spawnDecals(step.decals);
    if (step.projectile === 'crescent') this.#fireCrescent();
    if (step.rain) { this.rainQueue = step.rain.count; this.rainTimer = 0; this.rainInterval = step.rain.interval; }
    if (step.leap) {
      // 도약: 목표 = 현재 히어로 위치
      const hero = this.ctx.hero;
      this.leapFrom = this.root.position.clone();
      this.leapTo = hero.root.position.clone();
      const r = Math.hypot(this.leapTo.x, this.leapTo.z);
      if (r > TUNING.arena.bossRadius) this.leapTo.multiplyScalar(TUNING.arena.bossRadius / r);
      this.ctx.fx?.decal(this.leapTo, { r: 6.2, fillTime: this.#stepDur(step), hold: 0.3, color: [3, 0.6, 0.15] });
    }
    if (step.impact) this.#doImpact(step);
  }

  #doImpact(step) {
    // 착탄 연출: 검/발 위치 기준
    const pos = this._v1.copy(this.root.position)
      .addScaledVector(this._v2.set(Math.sin(this.facing), 0, Math.cos(this.facing)), step.impact === 'stomp' ? 2.2 : 3.6);
    pos.y = 0.1;
    const color = step.impact === 'stomp' ? [2.2, 1.6, 1.1] : [3.6, 1.4, 0.4];
    this.ctx.fx?.ring(pos, { maxR: step.hit ? step.hit.r1 : 5, dur: 0.5, color });
    this.ctx.fx?.burst(pos, { count: 34, color: [3.5, 1.8, 0.7], speed: 8, up: 5, life: 0.7, size: 2.8, grav: 12 });
    this.ctx.fx?.flash(pos, [1, 0.7, 0.4], 70, 0.35);
    this.ctx.gcam?.addTrauma(step.shake || 0.4);
    this.ctx.audio?.sfx('slamImpact');
  }

  #spawnDecals(spec) {
    const hero = this.ctx.hero;
    if (spec.kind === 'firevent') {
      // 히어로를 쫓는 순차 장판 3개 — 첫 분출이 castRelease와 동기화되도록 지연
      for (let i = 0; i < spec.count; i++) {
        this.vents.push({
          delay: 0.55 + i * 0.34,
          fillTime: 0.8,
          t: -1,           // decal 미생성
          pos: null,
          col: null,
          damaged: false,
        });
      }
    }
  }

  #fireCrescent() {
    const hero = this.ctx.hero;
    const mesh = this.ctx.fx.acquire('crescents');
    if (!mesh) return;
    const start = this._v1.copy(this.root.position).setY(2.6)
      .addScaledVector(this._v2.set(Math.sin(this.facing), 0, Math.cos(this.facing)), 3.2);
    const dir = this._v2.copy(hero.root.position).setY(hero.root.position.y + 1.0).sub(start).setY(0).normalize();
    this.crescents.push({ mesh, pos: start.clone(), dir: dir.clone(), t: 0, spin: 0 });
  }

  // ── 히어로 피격 헬퍼 ──
  #hitHero(hit) {
    const hero = this.ctx.hero;
    const to = this._v1.copy(hero.root.position).sub(this.root.position);
    to.y = 0;
    const dist = to.length();
    let inside = false;
    if (hit.type === 'arc') {
      if (dist <= hit.r) {
        const ang = Math.atan2(to.x, to.z);
        let d = ang - this.facing;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        inside = Math.abs(d) <= hit.arc;
      }
    } else if (hit.type === 'ring') {
      inside = dist >= hit.r0 && dist <= hit.r1;
    } else if (hit.type === 'capsule') {
      // 전방 축까지의 수직 거리
      const fwd = this._v2.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      const along = to.dot(fwd);
      if (along > -1 && along < 6) {
        const perp = Math.sqrt(Math.max(0, dist * dist - along * along));
        inside = perp <= hit.r;
      }
    }
    if (!inside) return false;
    const hitFrom = this.root.position;
    const landed = hero.takeDamage(hit.dmg, this.pattern ? this.pattern.name : '', hitFrom);
    if (landed && hit.grabCam) {
      this.ctx.gcam?.addTrauma(0.6);
      this.ctx.clock?.hitstop(0.09);
    }
    return landed;
  }

  update(dt, rawDt) {
    this.time += dt;
    this.stateT += dt;
    const hero = this.ctx.hero;
    const fx = this.ctx.fx;

    if (this.recoverInvuln > 0) this.recoverInvuln -= dt;

    // 그로기 게이지 자연 감소
    if (!this.groggy && this.alive && this.state !== 'dormant') {
      this.groggyGauge = Math.max(0, this.groggyGauge - B.groggy.decay * dt);
    }

    // 페이즈 전환 (패턴 사이 + 히어로 생존 시에만)
    if (this.pendingPhase && hero.alive && (this.state === 'decide' || this.state === 'walk')) {
      this.phase = this.pendingPhase;
      this.pendingPhase = 0;
      this.state = 'transition';
      this.stateT = 0;
      this.ctx.onPhaseTransition?.(this.phase);
    }

    const st = this.state;
    let poseTarget = null;
    let blend = Math.min(1, 10 * dt);

    if (st === 'dormant') {
      poseTarget = P.kneel;
      blend = 1;
    } else if (st === 'awaken') {
      // 2.8초에 걸쳐 기립
      const t = Math.min(1, this.stateT / 2.8);
      const e = t * t * (3 - 2 * t);
      this.#mixPose(P.kneel, P.roar, e);
      poseTarget = null;
      if (!this.eyesLit && t > 0.45) {
        this.eyesLit = true;
        this.eyeMat.color.setRGB(8, 2.2, 0.6);
        this.bodyMat.emissiveIntensity = 1.1;
        this.ctx.audio?.sfx('igniteEyes');
        fx?.burst(this._v1.copy(this.root.position).setY(6.2), { count: 30, color: [5, 1.8, 0.5], speed: 3, life: 0.9, size: 2.4, grav: -1 });
      }
      if (this.stateT >= 3.4) {
        this.ctx.audio?.sfx('roar');
        this.ctx.gcam?.addTrauma(TUNING.feel.shakeRoar);
        this.state = 'decide';
        this.idleWait = 1.1;
      }
    } else if (st === 'transition') {
      poseTarget = P.roar;
      blend = Math.min(1, 6 * dt);
      if (this.stateT >= 2.4) {
        this.state = 'decide';
        this.idleWait = 0.8;
      }
    } else if (st === 'decide') {
      poseTarget = P.idle;
      this.#turnToward(hero, dt);
      this.idleWait -= dt;
      if (this.idleWait <= 0 && hero.alive) {
        const entry = this.#choosePattern();
        if (entry) this.#startPattern(entry);
        else this.state = 'walk';
      }
    } else if (st === 'walk') {
      if (!hero.alive) {
        this.state = 'decide';
        this.idleWait = 2;
        poseTarget = P.idle;
      } else {
        this.#turnToward(hero, dt);
        // 전진
        const fwd = this._v1.set(Math.sin(this.facing), 0, Math.cos(this.facing));
        this.root.position.addScaledVector(fwd, B.walkSpeed * dt);
        this.#clampArena();
        // 보행 사이클
        this.walkPhase += dt * 2.4;
        poseTarget = P.idle;
        const s = Math.sin(this.walkPhase);
        // 발구름 이벤트
        if (Math.abs(s) > 0.96 && this.time - (this.lastStepTime || 0) > 0.5) {
          this.lastStepTime = this.time;
          this.ctx.audio?.sfx('bossStep');
          this.ctx.gcam?.addTrauma(0.08);
          const foot = this._v2.copy(this.root.position).addScaledVector(fwd, 1.2);
          foot.x += Math.sign(s) * Math.cos(this.facing) * 0.8;
          foot.z -= Math.sign(s) * Math.sin(this.facing) * 0.8;
          foot.y = 0.15;
          fx?.burst(foot, { count: 6, color: [0.9, 0.85, 0.8], speed: 1.6, life: 0.6, size: 2.4, grav: 2 });
        }
        // 재선택 (확률 게이트를 먼저 — 매 프레임 후보 배열 할당 방지)
        if (Math.random() < 2.2 * dt) {
          const entry = this.#choosePattern();
          if (entry) this.#startPattern(entry);
        }
      }
    } else if (st === 'pattern') {
      const step = this.pattern.steps[this.stepIndex];
      const dur = this.#stepDur(step);
      this.stepT += dt;
      // 윈드업 중에는 조준 (텔레그래프 신뢰성: 발동 스텝에서는 고정)
      if (step.tele || step.pose.startsWith('windup') || step.pose.startsWith('cast') || step.pose.startsWith('crouch')) {
        this.#turnToward(hero, dt, 0.55);
      }
      // 이동 스텝
      if (step.move) {
        const fwd = this._v1.set(Math.sin(this.facing), 0, Math.cos(this.facing));
        this.root.position.addScaledVector(fwd, step.move.fwd * dt);
        this.#clampArena();
      }
      if (step.leap && this.leapFrom) {
        const t = Math.min(1, this.stepT / dur);
        this.root.position.lerpVectors(this.leapFrom, this.leapTo, t);
        this.root.position.y = Math.sin(t * Math.PI) * 7;
        if (t >= 1) this.root.position.y = 0;
      }
      // 판정
      if (step.hit && !this.stepHit && this.stepT <= dur * 0.85) {
        if (this.#hitHero(step.hit)) this.stepHit = true;
      }
      // 트레일
      if (step.trail) {
        this.root.updateMatrixWorld(true);
        this.trail.push(
          this.trailBase.getWorldPosition(this._v1),
          this.trailTip.getWorldPosition(this._v2), this.time);
      }
      poseTarget = P[step.pose] || P.idle;
      blend = Math.min(1, (step.pose.includes('windup') || step.pose.includes('cast') ? 9 : 22) * dt);
      if (this.stepT >= dur) this.#nextStep();
    } else if (st === 'groggy') {
      poseTarget = P.groggy;
      blend = Math.min(1, 7 * dt);
      if (this.stateT >= B.groggy.duration) {
        this.groggy = false;
        this.groggyGauge = 0;
        this.inPunishWindow = false;
        this.recoverInvuln = B.groggy.recoverInvuln;
        this.state = 'recover';
        this.stateT = 0;
        this.ctx.audio?.sfx('roar');
      }
    } else if (st === 'recover') {
      poseTarget = P.roar;
      blend = Math.min(1, 5 * dt);
      if (this.stateT >= 1.1) {
        this.state = 'decide';
        this.idleWait = 0.6;
      }
    } else if (st === 'dying') {
      poseTarget = P.dieFall;
      blend = Math.min(1, 2.2 * dt);
      // 균열 빛이 역순으로 꺼진다
      const f = Math.max(0, 1 - this.stateT / 4);
      this.bodyMat.emissiveIntensity = 1.1 * f + this.hitFlash;
      this.eyeMat.color.setRGB(8 * f, 2.2 * f, 0.6 * f);
      if (this.stateT < 2.5 && Math.random() < 8 * dt) {
        const p = this._v1.copy(this.root.position);
        p.x += (Math.random() - 0.5) * 3;
        p.y = 1 + Math.random() * 5;
        p.z += (Math.random() - 0.5) * 3;
        fx?.burst(p, { count: 8, color: [4, 1.5, 0.4], speed: 2.5, life: 1.4, size: 2, grav: -1.5 });
      }
    }

    if (poseTarget) {
      this.#poseTo(poseTarget);
      if (st === 'walk') {
        // 육중한 보행 사이클 (절차)
        const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
        this.pose.thighL[0] += s * 0.48;
        this.pose.thighR[0] += -s * 0.48;
        this.pose.shinL[0] += Math.max(0, -c) * 0.62;
        this.pose.shinR[0] += Math.max(0, c) * 0.62;
        this.pose.torso[2] += s * 0.07;
        this.pose.torso[1] += s * 0.06;
        this.pose.uArmL[0] += s * 0.16;
        this.pose.uArmR[0] += -s * 0.1;
        this.pose.root[1] += Math.abs(c) * 0.22 - 0.12;
      } else if (st === 'decide') {
        const b = Math.sin(this.time * 1.1) * 0.03;
        this.pose.torso[0] += b;
        this.pose.root[1] += b * 0.8;
      }
      applyPose(this.joints, this.pose, blend);
    } else if (st === 'awaken') {
      applyPose(this.joints, this.pose, 1);
    }

    // 피격 플래시 (백색 점등 → 감쇠)
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - rawDt * 9);
      const base = this.state === 'dying' ? 0 : (this.eyesLit ? 1.1 : 0.25);
      this.bodyMat.emissiveIntensity = base + this.hitFlash * 3;
      const f = this.hitFlash;
      this.bodyMat.emissive.setRGB(
        THREE.MathUtils.lerp(_crackColor.r, 1, f),
        THREE.MathUtils.lerp(_crackColor.g, 1, f),
        THREE.MathUtils.lerp(_crackColor.b, 1, f));
    }

    // 텔레그래프 발광 감쇠
    if (this.glowLevel > 0) {
      this.glowLevel = Math.max(0, this.glowLevel - dt * 1.2);
      const g = this.glowLevel, c = this.glowColor || [4, 1.6, 0.4];
      this.bladeEdgeMat.color.setRGB(c[0] * g + this.igniteBase, c[1] * g * (this.igniteBase ? 0.4 : 1), c[2] * g * 0.5);
    } else if (this.igniteBase) {
      this.bladeEdgeMat.color.setRGB(this.igniteBase, this.igniteBase * 0.32, this.igniteBase * 0.06);
    }

    this.#updateProjectiles(dt);
    this.trail.update(this.time);
  }

  igniteSword() {
    this.igniteBase = 4.2;
  }

  #updateProjectiles(dt) {
    const hero = this.ctx.hero;
    const fx = this.ctx.fx;

    // 초승달 검기
    for (let i = this.crescents.length - 1; i >= 0; i--) {
      const c = this.crescents[i];
      c.t += dt;
      c.spin += dt * 9;
      c.pos.addScaledVector(c.dir, 15 * dt);
      c.mesh.position.copy(c.pos);
      _euler.set(0, Math.atan2(c.dir.x, c.dir.z), 0);
      c.mesh.quaternion.setFromEuler(_euler);
      c.mesh.rotateX(Math.PI / 2);
      c.mesh.rotateZ(c.spin);
      // 판정 (수평 거리 + 높이)
      const to = this._v1.copy(hero.root.position).sub(c.pos);
      const dy = Math.abs(to.y + 1.0);
      to.y = 0;
      if (!c.hit && to.length() < 1.8 && dy < 2.2) {
        c.hit = true;
        hero.takeDamage(18, '검기 파동', c.pos);
      }
      // 잔광
      if (Math.random() < 20 * dt) {
        fx.spawn(c.pos, this._v2.set((Math.random() - 0.5), 0.4, (Math.random() - 0.5)), 0.5, 1.8, 4, 1.2, 0.3, 0);
      }
      if (c.t > 1.8) {
        fx.release(c.mesh);
        this.crescents.splice(i, 1);
      }
    }

    // 화염 분출 장판
    for (let i = this.vents.length - 1; i >= 0; i--) {
      const v = this.vents[i];
      if (v.delay > 0) { v.delay -= dt; continue; }
      if (v.t < 0) {
        // 히어로 현재 위치에 장판 생성
        v.pos = hero.root.position.clone();
        v.t = 0;
        fx.decal(v.pos, { r: 2.5, fillTime: v.fillTime, hold: 0.2, color: [3, 0.7, 0.15] });
        continue;
      }
      v.t += dt;
      if (v.t >= v.fillTime && !v.col) {
        v.col = fx.acquire('fireCols');
        if (v.col) {
          v.col.position.copy(v.pos).setY(3.7);
          v.col.material.uniforms.uLife.value = 0;
        }
        this.ctx.audio?.sfx('fireBurst');
        fx.burst(this._v1.copy(v.pos).setY(0.4), { count: 26, color: [4, 1.5, 0.3], speed: 4, up: 8, life: 0.9, size: 3, grav: 6 });
        fx.flash(v.pos, [1, 0.55, 0.2], 55, 0.5);
      }
      if (v.col) {
        const colT = (v.t - v.fillTime) / 0.9;
        v.col.material.uniforms.uLife.value = Math.min(1, colT);
        // 분출 초반 판정
        if (!v.damaged && colT < 0.4) {
          const d = this._v1.copy(hero.root.position).sub(v.pos).setY(0).length();
          if (d < 2.4) {
            v.damaged = true;
            hero.takeDamage(20, '화염 분출', v.pos);
          }
        }
        if (colT >= 1) {
          fx.release(v.col);
          this.vents.splice(i, 1);
        }
      }
    }

    // 잿불 폭우
    if (this.rainQueue > 0) {
      this.rainTimer -= dt;
      if (this.rainTimer <= 0) {
        this.rainTimer = this.rainInterval;
        this.rainQueue--;
        const target = hero.root.position.clone();
        if (this.rainQueue < 6) {  // 뒤의 6발은 주변 랜덤
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
          target.x += Math.cos(a) * r;
          target.z += Math.sin(a) * r;
        }
        target.y = 0;
        const rr = Math.hypot(target.x, target.z);
        if (rr > TUNING.arena.radius) target.multiplyScalar(TUNING.arena.radius / rr);
        fx.decal(target, { r: 2.4, fillTime: 0.7, hold: 0.12, color: [3, 0.6, 0.12] });
        const mesh = fx.acquire('fireballs');
        this.rains.push({ target, t: 0, dur: 0.7, mesh, damaged: false });
        this.ctx.audio?.tele('rain');
      }
    }
    for (let i = this.rains.length - 1; i >= 0; i--) {
      const r = this.rains[i];
      r.t += dt;
      const t = Math.min(1, r.t / r.dur);
      if (r.mesh) {
        r.mesh.position.set(r.target.x, 20 * (1 - t * t), r.target.z);
      }
      if (t >= 1) {
        if (!r.damaged) {
          const d = this._v1.copy(hero.root.position).sub(r.target).setY(0).length();
          if (d < 2.4) hero.takeDamage(15, '잿불 폭우', r.target);
        }
        fx.ring(r.target, { maxR: 2.6, dur: 0.4, color: [3.4, 1.2, 0.3] });
        fx.burst(this._v1.copy(r.target).setY(0.3), { count: 18, color: [4, 1.6, 0.4], speed: 5, up: 4, life: 0.6, size: 2.4, grav: 8 });
        this.ctx.audio?.sfx('rainImpact');
        if (r.mesh) fx.release(r.mesh);
        this.rains.splice(i, 1);
      }
    }
  }

  #turnToward(hero, dt, mult = 1) {
    const to = this._v1.copy(hero.root.position).sub(this.root.position);
    const want = Math.atan2(to.x, to.z);
    let d = want - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const max = B.turnRate * mult * dt;
    this.facing += THREE.MathUtils.clamp(d, -max, max);
    this.root.rotation.y = this.facing;
  }

  #clampArena() {
    const r = Math.hypot(this.root.position.x, this.root.position.z);
    if (r > TUNING.arena.bossRadius) {
      this.root.position.x *= TUNING.arena.bossRadius / r;
      this.root.position.z *= TUNING.arena.bossRadius / r;
    }
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
  #mixPose(a, b, t) {
    for (const j in this.pose) {
      const pa = a[j], pb = b[j];
      const arr = this.pose[j];
      for (let c = 0; c < 3; c++) {
        const va = pa ? (pa[c] ?? 0) : 0;
        const vb = pb ? (pb[c] ?? 0) : 0;
        arr[c] = va + (vb - va) * t;
      }
    }
  }
}
