// ═══════════════════════════════════════════════════════════════════════════
// 동트기 3분 전 (Dokkaebi Dawn)
// 밤 산사의 마지막 파수꾼이 되어 동이 틀 때까지 3분간 살아남는 호드 액션.
// Three.js 프리미티브 + WebAudio 신스만 사용 — 외부 에셋 없음.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { CONFIG, WEAPONS, PASSIVES, BYEOK } from './config.js';
import { initAudio, sfx, duck, setLowHp, heartbeat, setAudioEnabled, getAudioEnabled } from './audio.js';
import { ui } from './ui.js';

// ─── 시드 RNG + 심플렉스 노이즈 (지형용 고정 시드) ───────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noiseRng = mulberry32(20260711);
const PERM = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (noiseRng() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
function noise2(x, y) {
  const F2 = 0.36602540378, G2 = 0.21132486540;
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { const g = GRAD[PERM[ii + PERM[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { const g = GRAD[PERM[ii + i1 + PERM[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { const g = GRAD[PERM[ii + 1 + PERM[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}
function terrainH(x, z) {
  return noise2(x * 0.02, z * 0.02) * 1.2 + noise2(x * 0.04 + 13.7, z * 0.04 + 7.3) * 0.6;
}
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * ((k - 1) ** 3) + c1 * ((k - 1) ** 2); };
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;

// ─── 메타 진행 (localStorage) ────────────────────────────────────────────────
const META_KEY = 'dokkaebi-dawn-v1';
function defaultMeta() {
  return { best: 0, coins: 0, shop: { bat: 0, bell: 0, charm: 0 }, missionsDone: [],
    baseMult: 0, nightUnlocked: 1, night: 1, skin: 0, sound: true };
}
let meta = defaultMeta();
try { Object.assign(meta, JSON.parse(localStorage.getItem(META_KEY) || '{}')); } catch { /* 첫 실행 */ }
function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* 저장 불가 환경 */ } }
setAudioEnabled(meta.sound !== false);

// ─── 렌더러·씬·카메라 ────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const C = CONFIG.colors;
scene.background = new THREE.Color(C.fog);
scene.fog = new THREE.Fog(C.fog, C.fogNear, C.fogFar);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.baseFov, innerWidth / innerHeight, 0.1, 300);
const camRig = new THREE.Object3D();          // 위치 추적 + 셰이크 회전
scene.add(camRig);
camRig.add(camera);
camera.position.set(CONFIG.camera.offset.x, CONFIG.camera.offset.y, CONFIG.camera.offset.z);
camera.lookAt(0, 0, 0);

const HEMI_BASE = 1.2, MOON_BASE = 2.4;
const hemi = new THREE.HemisphereLight(C.hemiSky, C.hemiGround, HEMI_BASE);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(C.moonlight, MOON_BASE);
moonLight.position.set(30, 60, -40);
scene.add(moonLight);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ─── 스크래치 객체 (프레임 내 할당 금지) ─────────────────────────────────────
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const _c = new THREE.Color(), _c2 = new THREE.Color();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);

// ─── 지형 ────────────────────────────────────────────────────────────────────
{
  const geo = new THREE.PlaneGeometry(160, 160, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const lo = new THREE.Color(C.terrainLow), hi = new THREE.Color(C.terrainHigh);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    _c.copy(lo).lerp(hi, clamp((h + 1.8) / 3.6, 0, 1));
    colors[i * 3] = _c.r; colors[i * 3 + 1] = _c.g; colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(ground);
}

// 장식: 비석 12 + 소나무 16 (충돌 없음)
{
  const decoRng = mulberry32(777);
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x2b2b45, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2f35, flatShading: true });
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x1f3540, flatShading: true });
  for (let i = 0; i < 12; i++) {
    const a = decoRng() * Math.PI * 2, r = 12 + decoRng() * 52;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6 + decoRng(), 0.4), stoneMat);
    st.position.set(x, terrainH(x, z) + 0.8, z);
    st.rotation.y = decoRng() * Math.PI;
    st.rotation.z = (decoRng() - 0.5) * 0.15;
    scene.add(st);
  }
  for (let i = 0; i < 16; i++) {
    const a = decoRng() * Math.PI * 2, r = 30 + decoRng() * 38;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.Group();
    const h = 3 + decoRng() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h * 0.4, 5), trunkMat);
    trunk.position.y = h * 0.2;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.3 + decoRng(), h * 0.85, 6), pineMat);
    crown.position.y = h * 0.4 + h * 0.42;
    g.add(trunk, crown);
    g.position.set(x, terrainH(x, z), z);
    scene.add(g);
  }
}

// 별하늘 (Points)
let starMat;
{
  const n = 300, posArr = new Float32Array(n * 3);
  const srng = mulberry32(42);
  for (let i = 0; i < n; i++) {
    const a = srng() * Math.PI * 2, alt = srng() * Math.PI * 0.45 + 0.08, r = 220;
    posArr[i * 3] = Math.cos(a) * Math.cos(alt) * r;
    posArr[i * 3 + 1] = Math.sin(alt) * r;
    posArr[i * 3 + 2] = Math.sin(a) * Math.cos(alt) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  starMat = new THREE.PointsMaterial({ color: 0xcfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false });
  const stars = new THREE.Points(g, starMat);
  scene.add(stars);
}

// 달 — 다이제틱 시계(고도) + 위협 게이지(핏빛)
const moon = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.moon.radius, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
scene.add(moon);
const moonGlow = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  sp.scale.setScalar(40);
  scene.add(sp);
  return sp;
})();

// ─── 지오메트리 병합 헬퍼 (addons 없이) ─────────────────────────────────────
function mergeGeoms(geoms) {
  let vcount = 0;
  const flat = geoms.map((g) => { const ng = g.index ? g.toNonIndexed() : g; vcount += ng.attributes.position.count; return ng; });
  const posArr = new Float32Array(vcount * 3), normArr = new Float32Array(vcount * 3);
  let off = 0;
  for (const g of flat) {
    posArr.set(g.attributes.position.array, off * 3);
    normArr.set(g.attributes.normal.array, off * 3);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  return out;
}

// 도깨비 지오메트리: 몸통 박스 + 뿔 콘 2개 (높이 ~1.2, 발밑 y=0)
function dokkaebiGeom() {
  const body = new THREE.BoxGeometry(0.9, 1.1, 0.7); body.translate(0, 0.55, 0);
  const h1 = new THREE.ConeGeometry(0.13, 0.45, 5); h1.translate(-0.24, 1.28, 0); h1.rotateZ(0.18);
  const h2 = new THREE.ConeGeometry(0.13, 0.45, 5); h2.translate(0.24, 1.28, 0); h2.rotateZ(-0.18);
  return mergeGeoms([body, h1, h2]);
}

// ─── 적 시스템 ───────────────────────────────────────────────────────────────
const ENEMY_MAX_PER_TYPE = 700;
const TYPE_KEYS = ['mob', 'honbul', 'tanker'];
const enemyMeshes = {};
{
  const geom = dokkaebiGeom();
  for (const key of TYPE_KEYS) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const im = new THREE.InstancedMesh(geom, mat, ENEMY_MAX_PER_TYPE);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.count = 0;
    scene.add(im);
    enemyMeshes[key] = im;
  }
}

const ENEMY_POOL = 1400;
const enemies = [];         // 살아있는 적 (스왑-팝 제거)
const enemyFree = [];
for (let i = 0; i < ENEMY_POOL; i++) {
  enemyFree.push({
    type: 'mob', elite: 0, x: 0, z: 0, kx: 0, kz: 0, hp: 10, maxHp: 10,
    speed: 3, contact: 8, xp: 1, scale: 1, radius: 0.6, age: 0, flashT: 0,
    hitCd: 0, orbitHitT: -9, waveId: -1, grazeDashId: -1, fireTrailT: 0, popT: 0,
    dying: false, killDirX: 0, killDirZ: 0, killByeok: false,
  });
}

// 공간 해시 (셀 2u)
const CELL = 2, HASH_DIM = 128, HASH_OFF = 64;
const hashMap = new Map();  // key → 배열 (재사용)
function hashKey(x, z) {
  const cx = clamp(((x / CELL) | 0) + HASH_OFF, 0, HASH_DIM - 1);
  const cz = clamp(((z / CELL) | 0) + HASH_OFF, 0, HASH_DIM - 1);
  return cx * HASH_DIM + cz;
}
function hashRebuild() {
  for (const arr of hashMap.values()) arr.length = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const k = hashKey(e.x, e.z);
    let arr = hashMap.get(k);
    if (!arr) { arr = []; hashMap.set(k, arr); }
    arr.push(i);
  }
}
// 반경 질의 → 스크래치 배열에 적 인덱스 채움, 개수 반환. 프레임 내 할당·클로저 없음.
// 주의: 반환 결과를 전부 소비한 뒤에만 다음 hashQuery를 호출할 것 (배열 재사용).
const _qArr = new Int32Array(2048);
function hashQuery(x, z, radius) {
  let n = 0;
  const x0 = ((x - radius) / CELL) | 0, x1 = ((x + radius) / CELL) | 0;
  const z0 = ((z - radius) / CELL) | 0, z1 = ((z + radius) / CELL) | 0;
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const k = clamp(cx + HASH_OFF, 0, HASH_DIM - 1) * HASH_DIM + clamp(cz + HASH_OFF, 0, HASH_DIM - 1);
      const arr = hashMap.get(k);
      if (arr) for (let i = 0; i < arr.length && n < _qArr.length; i++) _qArr[n++] = arr[i];
    }
  }
  return n;
}

// ─── 파티클 (InstancedMesh 큐브 1024, 링 커서) ──────────────────────────────
const PARTICLE_MAX = 1024;
const partMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.16, 0.16, 0.16),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), PARTICLE_MAX);
partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
partMesh.frustumCulled = false;
scene.add(partMesh);
const parts = { x: new Float32Array(PARTICLE_MAX), y: new Float32Array(PARTICLE_MAX), z: new Float32Array(PARTICLE_MAX),
  vx: new Float32Array(PARTICLE_MAX), vy: new Float32Array(PARTICLE_MAX), vz: new Float32Array(PARTICLE_MAX),
  life: new Float32Array(PARTICLE_MAX), maxLife: new Float32Array(PARTICLE_MAX), size: new Float32Array(PARTICLE_MAX) };
let partCursor = 0;
function spawnParticle(x, y, z, vx, vy, vz, life, size, color) {
  const i = partCursor; partCursor = (partCursor + 1) % PARTICLE_MAX;
  parts.x[i] = x; parts.y[i] = y; parts.z[i] = z;
  parts.vx[i] = vx; parts.vy[i] = vy; parts.vz[i] = vz;
  parts.life[i] = life; parts.maxLife[i] = life; parts.size[i] = size;
  partMesh.setColorAt(i, _c.set(color));
}
function burst(x, y, z, count, color, speedMin = 3, speedMax = 8, dirX = 0, dirZ = 0) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(speedMin, speedMax);
    spawnParticle(x, y + rand(0.2, 0.8), z,
      Math.cos(a) * sp * 0.7 + dirX, rand(2, sp), Math.sin(a) * sp * 0.7 + dirZ,
      rand(0.3, 0.8), rand(0.7, 1.4), color);
  }
}
function updateParticles(dt) {
  const g = CONFIG.juice.debrisGravity;
  for (let i = 0; i < PARTICLE_MAX; i++) {
    if (parts.life[i] <= 0) { _m.makeScale(0, 0, 0); partMesh.setMatrixAt(i, _m); continue; }
    parts.life[i] -= dt;
    parts.vy[i] += g * dt;
    parts.x[i] += parts.vx[i] * dt; parts.y[i] += parts.vy[i] * dt; parts.z[i] += parts.vz[i] * dt;
    const floor = terrainH(parts.x[i], parts.z[i]) + 0.08;
    if (parts.y[i] < floor) { parts.y[i] = floor; parts.vy[i] *= -0.4; parts.vx[i] *= 0.7; parts.vz[i] *= 0.7; }
    const k = clamp(parts.life[i] / parts.maxLife[i], 0, 1);
    const s = parts.size[i] * k;
    _m.makeScale(s, s, s).setPosition(parts.x[i], parts.y[i], parts.z[i]);
    partMesh.setMatrixAt(i, _m);
  }
  partMesh.instanceMatrix.needsUpdate = true;
  if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
}

// ─── 데미지 숫자 (풀 32 캔버스 스프라이트) ───────────────────────────────────
const DMG_MAX = 32;
const dmgPool = [];
for (let i = 0; i < DMG_MAX; i++) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.visible = false;
  scene.add(sp);
  dmgPool.push({ sp, cv, tex, life: 0, y0: 0, big: false });
}
let dmgCursor = 0;
function spawnDamageNumber(x, y, z, amount, big = false) {
  const d = dmgPool[dmgCursor]; dmgCursor = (dmgCursor + 1) % DMG_MAX;
  const g = d.cv.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  g.font = `bold ${big ? 44 : 34}px sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 6;
  g.fillStyle = big ? '#ffd166' : '#ffffff';
  const txt = String(Math.round(amount));
  g.strokeText(txt, 64, 32); g.fillText(txt, 64, 32);
  d.tex.needsUpdate = true;
  d.sp.position.set(x, y, z);
  d.sp.scale.set(big ? 3.4 : 2.3, big ? 1.7 : 1.15, 1);
  d.sp.visible = true;
  d.life = 0.6; d.y0 = y; d.big = big;
}
function updateDamageNumbers(dt) {
  for (const d of dmgPool) {
    if (!d.sp.visible) continue;
    d.life -= dt;
    if (d.life <= 0) { d.sp.visible = false; continue; }
    const k = 1 - d.life / 0.6;
    d.sp.position.y = d.y0 + k * 1.6;
    d.sp.material.opacity = 1 - k * k;
  }
}

// ─── 투사체 (풀 256, 트레이서 InstancedMesh) ────────────────────────────────
const PROJ_MAX = 256;
const projMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.12, 0.12, 0.9),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), PROJ_MAX);
projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
projMesh.frustumCulled = false;
scene.add(projMesh);
const projs = [];
const projFree = [];
for (let i = 0; i < PROJ_MAX; i++) projFree.push({
  x: 0, y: 0, z: 0, vx: 0, vz: 0, dmg: 0, pierce: 0, life: 0, speed: 0,
  homing: false, blast: 0, byeok: false, color: 0xffd166, scale: 1,
  target: null, retarget: 0, lastHit: null,
});
function fireProjectile(x, z, dirX, dirZ, opts) {
  if (!projFree.length) return;
  const p = projFree.pop();
  p.x = x; p.z = z; p.y = terrainH(x, z) + 1.0;
  p.speed = opts.speed;
  p.vx = dirX * opts.speed; p.vz = dirZ * opts.speed;
  p.dmg = opts.dmg; p.pierce = opts.pierce || 0;
  p.life = (opts.range || 30) / opts.speed;
  p.homing = !!opts.homing; p.blast = opts.blast || 0;
  p.byeok = !!opts.byeok; p.color = opts.color || 0xffd166;
  p.scale = opts.scale || 1; p.target = null; p.retarget = 0; p.lastHit = null;
  projs.push(p);
}

// ─── XP 도깨비불 (InstancedMesh 1024) ───────────────────────────────────────
const GEM_MAX = 1024;
const gemMesh = new THREE.InstancedMesh(
  new THREE.OctahedronGeometry(0.28),
  new THREE.MeshBasicMaterial({ color: C.gem }), GEM_MAX);
gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
gemMesh.frustumCulled = false;
scene.add(gemMesh);
const gems = [];
const gemFree = [];
for (let i = 0; i < GEM_MAX; i++) gemFree.push({ x: 0, z: 0, xp: 1, age: 0, pull: false });
function dropGem(x, z, xp) {
  if (!gemFree.length) {
    if (gems.length) gems[(Math.random() * gems.length) | 0].xp += xp; // 풀 초과 시 병합
    return;
  }
  const g = gemFree.pop();
  g.x = x + rand(-0.6, 0.6); g.z = z + rand(-0.6, 0.6);
  g.xp = xp; g.age = 0; g.pull = false;
  gems.push(g);
}

// ─── 석등 (등불 지대) ────────────────────────────────────────────────────────
const lanterns = [];
{
  const Lc = CONFIG.lanterns;
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c3c55, flatShading: true });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x4a4a66, flatShading: true });
  for (let i = 0; i < Lc.count; i++) {
    const a = (i / Lc.count) * Math.PI * 2 + rand(-0.25, 0.25);
    const r = rand(Lc.ringMin, Lc.ringMax);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = terrainH(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 6), poleMat);
    pole.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), headMat);
    head.position.y = 1.9;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcf7d }));
    flame.position.y = 1.95;
    const light = new THREE.PointLight(Lc.lightColor, Lc.intensity, Lc.distance);
    light.position.y = 2.0;
    // 빛 웅덩이 표시 (바닥 원)
    const pool = new THREE.Mesh(new THREE.CircleGeometry(Lc.poolRadius, 28),
      new THREE.MeshBasicMaterial({ color: Lc.lightColor, transparent: true, opacity: 0.07, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06;
    // 재점화 진행 링
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 2.6; ring.visible = false;
    g.add(pole, head, flame, light, pool, ring);
    g.position.set(x, y, z);
    scene.add(g);
    lanterns.push({ x, z, lit: true, group: g, flame, light, pool, ring, relight: 0, flicker: rand(0, 10) });
  }
}
function setLantern(l, lit) {
  l.lit = lit;
  l.flame.visible = lit;
  l.light.intensity = lit ? CONFIG.lanterns.intensity : 0;
  l.pool.material.opacity = lit ? 0.07 : 0;
}

// ─── 무기 시각 오브젝트 ─────────────────────────────────────────────────────
// 회전 부적 / 팔괘진
const talismanMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.4, 0.55, 0.07),
  new THREE.MeshBasicMaterial({ color: 0xffd166 }), 8);
talismanMesh.frustumCulled = false; talismanMesh.count = 0;
scene.add(talismanMesh);
let talismanAngle = 0;

// 정화 오라
const auraMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40),
  new THREE.MeshBasicMaterial({ color: 0x4dd8e6, transparent: true, opacity: 0.09, depthWrite: false }));
auraMesh.rotation.x = -Math.PI / 2; auraMesh.visible = false;
scene.add(auraMesh);
const auraRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48),
  new THREE.MeshBasicMaterial({ color: 0x4dd8e6, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
auraRing.rotation.x = -Math.PI / 2; auraRing.visible = false;
scene.add(auraRing);

// 지면 파동 링 (풀 4)
const waves = [];
for (let i = 0; i < 4; i++) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xaef1ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  mesh.rotation.x = -Math.PI / 2; mesh.visible = false;
  scene.add(mesh);
  waves.push({ mesh, active: false, x: 0, z: 0, t: 0, radius: 6, dmg: 15, knock: 6, id: 0 });
}
let waveIdCounter = 0;

// 수호 등불 토템 (풀 3)
const totems = [];
for (let i = 0; i < 3; i++) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a4632, flatShading: true }));
  pole.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffb04d }));
  head.position.y = 1.35;
  const zone = new THREE.Mesh(new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb04d, transparent: true, opacity: 0.08, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.05;
  g.add(pole, head, zone);
  g.visible = false;
  scene.add(g);
  totems.push({ group: g, zone, active: false, x: 0, z: 0, life: 0, radius: 4, slow: 0.4, dps: 6, vuln: 0, tickT: 0 });
}

// 화염 바닥 (불덩이 정예 궤적, 풀 64)
const firePatches = [];
{
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff5b22, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 64; i++) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), fireMat.clone());
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false;
    scene.add(mesh);
    firePatches.push({ mesh, active: false, x: 0, z: 0, life: 0 });
  }
}
let firePatchCursor = 0;
function dropFirePatch(x, z) {
  const f = firePatches[firePatchCursor]; firePatchCursor = (firePatchCursor + 1) % 64;
  f.active = true; f.x = x; f.z = z; f.life = CONFIG.elite.blazing.trailLife;
  f.mesh.visible = true;
  f.mesh.position.set(x, terrainH(x, z) + 0.07, z);
}

// 그을음 데칼 (영속 잔해, 풀 64 재활용)
const scorches = [];
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a14, transparent: true, opacity: 0.22, depthWrite: false });
  for (let i = 0; i < 64; i++) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 12), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false;
    scene.add(mesh);
    scorches.push(mesh);
  }
}
let scorchCursor = 0;
function dropScorch(x, z, scale = 1) {
  const s = scorches[scorchCursor]; scorchCursor = (scorchCursor + 1) % 64;
  s.visible = true;
  s.position.set(x, terrainH(x, z) + 0.05, z);
  s.scale.setScalar(scale * rand(0.8, 1.3));
  s.rotation.z = Math.random() * Math.PI;
}

// 보스 내려찍기 텔레그래프
const slamRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40),
  new THREE.MeshBasicMaterial({ color: 0xe84545, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
slamRing.rotation.x = -Math.PI / 2; slamRing.visible = false;
scene.add(slamRing);
const slamFill = new THREE.Mesh(new THREE.CircleGeometry(1, 40),
  new THREE.MeshBasicMaterial({ color: 0xe84545, transparent: true, opacity: 0.15, depthWrite: false }));
slamFill.rotation.x = -Math.PI / 2; slamFill.visible = false;
scene.add(slamFill);

// 보급 궤짝 + 빛기둥
const chestGroup = new THREE.Group();
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xc9a227, flatShading: true }));
  box.position.y = 0.4;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.3, 0.96),
    new THREE.MeshLambertMaterial({ color: 0xffd166, flatShading: true }));
  lid.position.y = 0.95;
  chestGroup.add(box, lid);
  chestGroup.visible = false;
  scene.add(chestGroup);
}
const pillarMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }));
pillarMesh.visible = false;
scene.add(pillarMesh);
const chest = { state: 'none', x: 0, z: 0, fallT: 0, hero: true }; // none|falling|landed|opened

// ─── 보스 어둑시니 ───────────────────────────────────────────────────────────
const bossMesh = new THREE.Mesh(dokkaebiGeom(),
  new THREE.MeshLambertMaterial({ color: 0x2a2a48, emissive: 0x4a1560, flatShading: true }));
bossMesh.visible = false;
scene.add(bossMesh);
const boss = { active: false, x: 0, z: 0, hp: 0, slamT: 0, telegraphT: 0, tx: 0, tz: 0, kx: 0, kz: 0, flashT: 0, orbitHitT: -9, waveId: -1 };

// ─── 플레이어 ────────────────────────────────────────────────────────────────
const playerGroup = new THREE.Group();
const playerBodyMat = new THREE.MeshLambertMaterial({ color: C.playerSkins[meta.skin] || C.playerSkins[0], flatShading: true });
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), playerBodyMat);
  body.position.y = 1.0;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  band.position.y = 1.15;
  const gat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 10),
    new THREE.MeshLambertMaterial({ color: 0x14141f, flatShading: true }));
  gat.position.y = 1.85;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 12),
    new THREE.MeshLambertMaterial({ color: 0x14141f, flatShading: true }));
  brim.position.y = 1.68;
  playerGroup.add(body, band, gat, brim);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04;
  playerGroup.add(shadow);
}
scene.add(playerGroup);
// 머즐 플래시 라이트 + 스파크 스프라이트
const muzzleLight = new THREE.PointLight(0xffd166, 0, 10);
scene.add(muzzleLight);

// ─── 런 상태 ────────────────────────────────────────────────────────────────
const P = CONFIG.player;
const run = {};            // 런마다 리셋되는 모든 것
let state = 'start';       // start|playing|cards|paused|dying|dead|sunrise|victory|shop
let cheats = false;
let debugMult = 1;
let showStats = false;
let godMode = false;

function nightMult() { return Math.pow(1.5, meta.night - 1); }

function resetRun() {
  run.t = 0;
  run.hp = P.hp; run.maxHp = P.hp;
  run.x = 0; run.z = 0; run.vx = 0; run.vz = 0;
  run.aimX = 1; run.aimZ = 0;
  run.invulnT = 0; run.dashT = 0; run.dashCd = 0; run.dashId = 0; run.grazeCount = 0;
  run.byeokCd = 0;
  run.slowT = 0;
  run.level = 1; run.xp = 0; run.xpNext = CONFIG.xpCurve[0]; run.pendingCards = 0;
  run.kills = 0; run.eliteKills = 0; run.byeokKills = 0; run.dashes = 0; run.gemsPicked = 0; run.relights = 0; run.maxCombo = 0; run.bossKilled = false;
  run.score = 0; run.killScore = 0;
  run.combo = 0; run.comboGauge = 0;
  run.credits = 0;
  run.fireT = 0;                          // 빛살 발사 타이머
  run.weapons = [{ key: 'beam', lv: 1, ...WEAPONS.beam }]; // 무기 슬롯
  run.passives = [];                      // 패시브 슬롯
  run.grazePerDash = 0;
  run.aimPointX = 1; run.aimPointZ = 0;
  run._frenzyToast = false;
  run.weaponTimers = {};                  // 무기별 주기 타이머
  run.evolved = false;
  run.pentaStep = 0; run.pentaT = 0;      // 오음계 사다리
  run.killTimes = [];                     // 멀티킬 판정
  run.dpsBuckets = new Float32Array(30); run.dpsCursor = 0; run.dpsT = 0;
  run.siegeDone = false; run.chestDone = false; run.bossDone = false; run.surgeDone = false;
  run.sunriseT = 0; run.dieT = 0;
  run.shakeTrauma = 0;
  run.missionProgress = {};

  // 시전 정예/보스/궤짝 정리
  for (const e of enemies) enemyFree.push(e);
  enemies.length = 0;
  boss.active = false; bossMesh.visible = false;
  slamRing.visible = false; slamFill.visible = false;
  chest.state = 'none'; chestGroup.visible = false; pillarMesh.visible = false;
  for (const g of gems) gemFree.push(g);
  gems.length = 0;
  for (const p of projs) projFree.push(p);
  projs.length = 0;
  for (const w of waves) { w.active = false; w.mesh.visible = false; }
  for (const tt of totems) { tt.active = false; tt.group.visible = false; }
  for (const f of firePatches) { f.active = false; f.mesh.visible = false; }
  for (const s of scorches) s.visible = false;
  for (const l of lanterns) { setLantern(l, true); l.relight = 0; l.ring.visible = false; }
  for (let i = 0; i < PARTICLE_MAX; i++) parts.life[i] = 0;
  for (const d of dmgPool) d.sp.visible = false;

  playerGroup.visible = true;
  playerGroup.scale.set(1, 1, 1);
  playerBodyMat.color.setHex(C.playerSkins[meta.skin] || C.playerSkins[0]);

  // 환경 복원 (일출 이후 재시작 대비)
  moonLight.color.setHex(C.moonlight);
  moonLight.intensity = MOON_BASE;
  hemi.intensity = HEMI_BASE;
  starMat.opacity = 0.7;
  moon.visible = moonGlow.visible = true;
  scene.background.setHex(C.fog);
  scene.fog.color.setHex(C.fog);

  // 상점: 오래된 부적 → 시작 카드
  run.pendingCards = meta.shop.charm || 0;

  // 0:00 사전 링 — 3초 내 첫 킬 보장
  const pre = CONFIG.spawner.preRing;
  for (let i = 0; i < pre.count; i++) {
    const a = (i / pre.count) * Math.PI * 2;
    spawnEnemy('mob', Math.cos(a) * pre.radius, Math.sin(a) * pre.radius, 0);
  }

  ui.renderSlots(run.weapons, run.passives);
  ui.setBoss(false, 0);
  ui.setBest(meta.best);
  ui.setCoins(meta.coins + coinsEarned());
  fovKick = 0; hitstopT = 0; slowmoT = 0;
}

// ─── 미션 ────────────────────────────────────────────────────────────────────
function activeMissions() {
  const notDone = CONFIG.missions.filter((m) => !meta.missionsDone.includes(m.id));
  return notDone.slice(0, 3);
}
function missionProgressOf(m) {
  const mp = run.missionProgress;
  switch (m.id) {
    case 'wisp50': return run.gemsPicked;
    case 'graze10': return run.grazeCount;
    case 'survive2': return Math.floor(run.t);
    case 'combo50': return run.maxCombo;
    case 'relight3': return run.relights;
    case 'byeok30': return run.byeokKills;
    case 'elite3': return run.eliteKills;
    case 'dash20': return run.dashes;
    case 'boss1': return run.bossKilled ? 1 : 0;
    default: return mp[m.id] || 0;
  }
}
function checkMissions() {
  if (cheats) return;
  for (const m of activeMissions()) {
    if (missionProgressOf(m) >= m.goal && !meta.missionsDone.includes(m.id)) {
      meta.missionsDone.push(m.id);
      meta.coins += CONFIG.missionReward.coins;
      if (meta.baseMult < CONFIG.missionReward.baseMultCap) meta.baseMult++;
      saveMeta();
      ui.toast(`미션 완료 — ${m.name} (+30냥, 기본 배율 +1)`, 'gold');
      sfx.mission();
      ui.setCoins(meta.coins + coinsEarned());
    }
  }
}
function missionListForScreen() {
  return activeMissions().map((m) => ({
    name: m.name, goal: m.goal, progress: missionProgressOf(m),
    done: meta.missionsDone.includes(m.id) || missionProgressOf(m) >= m.goal,
  }));
}

// ─── 주스: 히트스톱·트라우마·FOV ─────────────────────────────────────────────
let hitstopT = 0, slowmoT = 0, fovKick = 0;
function hitstop(dur) { hitstopT = Math.max(hitstopT, dur); duck(dur + 0.1); }
function slowmo(dur) { slowmoT = Math.max(slowmoT, dur); }
function addTrauma(amount) { run.shakeTrauma = Math.min(1, (run.shakeTrauma || 0) + amount); }
function kickFov(deg) { fovKick = Math.max(fovKick, deg); }
function timeScale() { return hitstopT > 0 ? 0.05 : (slowmoT > 0 ? 0.3 : 1); }

// ─── 스탯 파생 ───────────────────────────────────────────────────────────────
function passiveLv(key) { const p = run.passives.find((x) => x.key === key); return p ? p.lv : 0; }
function dmgMult() { return (1 + PASSIVES.bat.per * passiveLv('bat')) * (1 + CONFIG.economy.shop.bat.per * (meta.shop.bat || 0)); }
function moveSpeed() {
  let slow = run.slowT > 0 ? CONFIG.elite.frost.slowPct : 0;
  slow = Math.min(slow, CONFIG.elite.frost.slowCap);
  return P.speed * (1 + PASSIVES.shoes.per * passiveLv('shoes')) * (1 - slow);
}
function pickupRadius() { return P.pickupRadius + PASSIVES.magnet.per * passiveLv('magnet') + CONFIG.economy.shop.bell.per * (meta.shop.bell || 0); }
function extraProjectiles() { return passiveLv('clone'); }
function comboTier() {
  const tiers = CONFIG.combo.tiers;
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) if (run.combo >= tiers[i][0]) idx = i;
  return idx;
}
function comboMult() { return CONFIG.combo.tiers[comboTier()][1] + (meta.baseMult || 0); }
function coeff() { return (1 + run.t / CONFIG.spawner.coeffT) * nightMult(); }
function coinsEarned() {
  const E = CONFIG.economy;
  let c = Math.floor(run.kills / E.killDiv) + Math.floor(run.t / E.surviveDiv)
    + run.eliteKills * CONFIG.elite.coinBonus + (run.bossKilled ? CONFIG.boss.coin : 0);
  return Math.floor(c * nightMult());
}

// ─── 적 스폰/피해/사망 ──────────────────────────────────────────────────────
function spawnEnemy(type, x, z, elite = 0) {
  if (!enemyFree.length || enemies.length >= CONFIG.spawner.maxAlive + 60) return null;
  const base = CONFIG.enemies[type];
  const e = enemyFree.pop();
  e.type = type; e.elite = elite;
  e.x = clamp(x, -68, 68); e.z = clamp(z, -68, 68);
  e.kx = 0; e.kz = 0;
  const hpScale = CONFIG.spawner.hpScale(coeff());
  e.maxHp = base.hp * hpScale * (elite ? CONFIG.elite.hpMult : 1);
  e.hp = e.maxHp;
  e.speed = base.speed;
  e.contact = base.contact * (elite ? CONFIG.elite.contactMult : 1);
  e.xp = elite ? CONFIG.elite.xp : base.xp;
  e.scale = base.scale * (elite ? CONFIG.elite.scaleMult : 1);
  e.radius = 0.55 * e.scale;
  e.age = 0; e.flashT = 0; e.hitCd = 0; e.orbitHitT = -9; e.waveId = -1; e.grazeDashId = -1;
  e.fireTrailT = 0; e.popT = 0; e.dying = false;
  enemies.push(e);
  return e;
}
function removeEnemy(i) {
  const e = enemies[i];
  enemies[i] = enemies[enemies.length - 1];
  enemies.pop();
  enemyFree.push(e);
}

function recordDamage(amount) {
  run.dpsBuckets[run.dpsCursor] += amount;
}

// 사운드 스로틀 — 호드 밀도에서 WebAudio 노드 폭주 방지
let lastHitSfxT = 0, lastKillSfxT = 0;
function sfxHitThrottled(big) {
  const nw = performance.now();
  if (nw - lastHitSfxT > 45) { lastHitSfxT = nw; sfx.hit(big); }
}
function sfxKillThrottled(elite) {
  const nw = performance.now();
  if (elite || nw - lastKillSfxT > 60) { lastKillSfxT = nw; sfx.kill(elite); }
}

// 피해는 즉시, 사망 처리는 지연 스윕 — 해시 질의로 얻은 인덱스가
// 시뮬 틱 동안 절대 무효화되지 않도록 보장한다.
function damageEnemy(i, dmg, dirX, dirZ, opts = {}) {
  const e = enemies[i];
  if (!e || e.dying) return;
  let amp = dmgMult();
  // 수호 등불 L5 취약 — 영역 내 적은 모든 피해 +15%
  for (const tt of totems) {
    if (tt.active && tt.vuln > 0 && (e.x - tt.x) ** 2 + (e.z - tt.z) ** 2 < tt.radius * tt.radius) {
      amp *= 1 + tt.vuln;
      break;
    }
  }
  const finalDmg = dmg * amp;
  e.hp -= finalDmg;
  e.flashT = CONFIG.juice.flashDur;
  e.popT = 0.1;
  const kb = CONFIG.juice.knockback.hit * (opts.knockMult || 1);
  e.kx += dirX * kb; e.kz += dirZ * kb;
  recordDamage(finalDmg);
  if ((run.kills + i) % 2 === 0 || opts.byeok) // 숫자 스팸 절반 컷
    spawnDamageNumber(e.x, terrainH(e.x, e.z) + 1.6 + e.scale, e.z, finalDmg, !!opts.byeok);
  sfxHitThrottled(e.scale > 1.2);
  if (e.hp <= 0) {
    e.dying = true;
    e.killDirX = dirX; e.killDirZ = dirZ; e.killByeok = !!opts.byeok;
  } else if (opts.byeok) hitstop(CONFIG.juice.hitstop.byeok);
}

function damageBoss(dmg, kx = 0, kz = 0, byeok = false) {
  if (!boss.active) return;
  const finalDmg = dmg * dmgMult();
  boss.hp -= finalDmg;
  boss.flashT = 0.08;
  recordDamage(finalDmg);
  spawnDamageNumber(boss.x, terrainH(boss.x, boss.z) + 5, boss.z, finalDmg, byeok);
  boss.kx += kx; boss.kz += kz;
  sfxHitThrottled(true);
  if (byeok) hitstop(CONFIG.juice.hitstop.byeok);
  if (boss.hp <= 0) killBoss();
}

function sweepDead() {
  let killedAny = false;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.dying) continue;
    killedAny = true;
    const base = CONFIG.enemies[e.type];
    const y = terrainH(e.x, e.z);
    // 조각 파티클 — 자기 색, 킬 넉백 방향으로 발사
    const debris = e.elite ? CONFIG.juice.debrisElite : CONFIG.juice.debrisMob;
    const color = e.elite ? (e.elite === 1 ? CONFIG.elite.blazing.color : CONFIG.elite.frost.color) : base.color;
    burst(e.x, y, e.z, debris, color, 3, 8,
      e.killDirX * CONFIG.juice.knockback.killMult, e.killDirZ * CONFIG.juice.knockback.killMult);
    dropGem(e.x, e.z, e.xp);
    if (e.elite) { dropScorch(e.x, e.z, 1.4); run.eliteKills++; addTrauma(CONFIG.juice.trauma.eliteKill); }

    run.kills++;
    if (e.killByeok) run.byeokKills++;
    run.combo++;
    run.comboGauge = CONFIG.combo.gauge;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
    if (!cheats) {
      run.killScore += e.xp * CONFIG.score.perKill * comboMult();
      run.score = run.killScore;
    }
    hitstop(e.elite ? CONFIG.juice.hitstop.eliteKill : CONFIG.juice.hitstop.kill);
    sfxKillThrottled(!!e.elite);

    // 멀티킬 판정 (0.5초 내 8킬)
    const now = run.t;
    run.killTimes.push(now);
    while (run.killTimes.length && run.killTimes[0] < now - CONFIG.combo.multikill.window) run.killTimes.shift();
    if (run.killTimes.length >= CONFIG.combo.multikill.kills) {
      run.killTimes.length = 0;
      slowmo(CONFIG.combo.multikill.dur);
      kickFov(CONFIG.juice.fov.big);
      sfx.multikill();
      ui.toast('광란의 학살!', 'red');
    }
    e.dying = false;
    removeEnemy(i);
  }
  if (killedAny) checkMissions();
}

// ─── 카드/레벨업 ────────────────────────────────────────────────────────────
function rollRarity() {
  const r = Math.random();
  let acc = 0;
  for (const [key, prob] of CONFIG.cards.rarity) { acc += prob; if (r < acc) return key; }
  return 'common';
}
const RARITY_LV = { common: 1, rare: 2, hero: 3 };

function buildCardOptions(heroAll = false) {
  const opts = [];
  const wSlotsFree = run.weapons.length < CONFIG.cards.weaponSlots;
  const pSlotsFree = run.passives.length < CONFIG.cards.passiveSlots;

  // 진화: 부적 L5 + 방망이 보유 → 팔괘진 확정
  const tal = run.weapons.find((w) => w.key === 'talisman');
  const evolveReady = !run.evolved && tal && tal.lv >= 5 && passiveLv('bat') > 0;

  for (const w of run.weapons) {
    if (w.key === 'palgwae') continue;
    if (w.lv < CONFIG.cards.weaponMaxLv) opts.push({ kind: 'weapon-up', key: w.key });
  }
  if (wSlotsFree) {
    for (const key of Object.keys(WEAPONS)) {
      if (WEAPONS[key].evolved) continue;
      if (!run.weapons.find((w) => w.key === key)) opts.push({ kind: 'weapon-new', key });
    }
  }
  for (const key of Object.keys(PASSIVES)) {
    const cur = passiveLv(key);
    if (cur > 0 && cur < PASSIVES[key].max) opts.push({ kind: 'passive-up', key });
    else if (cur === 0 && pSlotsFree) opts.push({ kind: 'passive-new', key });
  }

  // 셔플 후 3개 (풀이 비면 회복/엽전 카드로 채움)
  for (let i = opts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const picked = opts.slice(0, 3);
  while (picked.length < 3) picked.push({ kind: picked.length === 1 ? 'heal' : 'coins' });
  if (evolveReady) picked[0] = { kind: 'evolve' };

  return picked.map((o) => {
    const rarity = o.kind === 'evolve' ? 'hero' : (heroAll ? 'hero' : rollRarity());
    const lvGain = RARITY_LV[rarity];
    let icon = '✚', name = '', lvText = '', desc = '';
    if (o.kind === 'weapon-up' || o.kind === 'weapon-new') {
      const W = WEAPONS[o.key];
      const cur = o.kind === 'weapon-up' ? run.weapons.find((w) => w.key === o.key).lv : 0;
      const to = Math.min(CONFIG.cards.weaponMaxLv, cur + lvGain);
      icon = W.icon; name = o.kind === 'weapon-new' ? `새 무기: ${W.name}` : `${W.name} 강화`;
      lvText = `Lv.${cur} → Lv.${to}`;
      desc = W.desc(to);
      return { ...o, rarity, to, icon, name, lvText, desc };
    }
    if (o.kind === 'passive-up' || o.kind === 'passive-new') {
      const Ps = PASSIVES[o.key];
      const cur = passiveLv(o.key);
      const to = Math.min(Ps.max, cur + lvGain);
      icon = Ps.icon; name = o.kind === 'passive-new' ? `새 가호: ${Ps.name}` : `${Ps.name} 강화`;
      lvText = `Lv.${cur} → Lv.${to}`;
      desc = Ps.desc(to);
      return { ...o, rarity, to, icon, name, lvText, desc };
    }
    if (o.kind === 'evolve') {
      return { ...o, rarity: 'hero', icon: WEAPONS.palgwae.icon, name: '진화: 팔괘진', lvText: '회전 부적 → 팔괘진', desc: WEAPONS.palgwae.desc() };
    }
    if (o.kind === 'heal') return { ...o, rarity, icon: '藥', name: '산삼주', lvText: '', desc: `체력 ${30 * lvGain} 회복` , heal: 30 * lvGain };
    return { ...o, rarity, icon: '錢', name: '엽전 꾸러미', lvText: '', desc: `엽전 +${15 * lvGain}냥`, coins: 15 * lvGain };
  });
}

let cardResolve = null;
let inputGuardUntil = 0;   // 카드 더블클릭이 벽력일섬으로 새는 것 방지
function openCards(heroAll = false) {
  state = 'cards';
  document.body.style.cursor = 'default';
  const cards = buildCardOptions(heroAll);
  if (cards.some((c) => c.rarity === 'hero')) sfx.heroCard();
  ui.showCards(cards, (i) => pickCard(cards[i]));
  cardResolve = cards;
}
function pickCard(card) {
  inputGuardUntil = performance.now() + 300;
  sfx.cardPick();
  if (card.kind === 'weapon-new') {
    run.weapons.push({ key: card.key, lv: card.to, ...WEAPONS[card.key], name: WEAPONS[card.key].name });
  } else if (card.kind === 'weapon-up') {
    run.weapons.find((w) => w.key === card.key).lv = card.to;
  } else if (card.kind === 'passive-new') {
    run.passives.push({ key: card.key, lv: card.to, ...PASSIVES[card.key] });
  } else if (card.kind === 'passive-up') {
    run.passives.find((p) => p.key === card.key).lv = card.to;
  } else if (card.kind === 'evolve') {
    const idx = run.weapons.findIndex((w) => w.key === 'talisman');
    run.weapons[idx] = { key: 'palgwae', lv: 1, ...WEAPONS.palgwae, evolved: true };
    run.evolved = true;
    kickFov(CONFIG.juice.fov.big);
    slowmo(0.4);
    sfx.evolve();
    ui.toast('팔괘진 완성!', 'gold');
  } else if (card.kind === 'heal') {
    run.hp = Math.min(run.maxHp, run.hp + card.heal);
  } else if (card.kind === 'coins') {
    if (!cheats) { meta.coins += card.coins; saveMeta(); }
  }
  ui.renderSlots(run.weapons, run.passives);
  ui.hideCards();
  cardResolve = null;
  if (run.pendingCards > 0) { run.pendingCards--; openCards(); return; }
  state = 'playing';
  document.body.style.cursor = 'none';
}
let cardTimerArmed = false;
function gainXP(n) {
  run.xp += n;
  while (run.xp >= run.xpNext) {
    run.xp -= run.xpNext;
    run.level++;
    // 레벨 L → L+1 에 xpCurve[L-1] 필요 (config 곡선표와 일치)
    const idx = Math.min(run.level - 1, CONFIG.xpCurve.length - 1);
    run.xpNext = CONFIG.xpCurve[idx];
    run.pendingCards++;
  }
  if (run.pendingCards > 0 && state === 'playing' && !cardTimerArmed) {
    cardTimerArmed = true;
    sfx.levelup();
    slowmo(0.3);
    // 슬로모 여운 후 카드 — 대기 카드는 pickCard가 순차 소비
    setTimeout(() => {
      cardTimerArmed = false;
      if (state === 'playing' && run.pendingCards > 0) { run.pendingCards--; openCards(); }
    }, 220);
  }
}

// ─── 시뮬레이션 ─────────────────────────────────────────────────────────────
const keys = {};
const mouse = { x: innerWidth / 2, y: innerHeight / 2 };

function sim(dt) {
  if (dt <= 0) return;
  run.t += dt;
  const Sp = CONFIG.spawner;

  // ── 타임라인 이벤트
  if (!run.siegeDone && run.t >= Sp.siegeRing.at) {
    run.siegeDone = true;
    for (let i = 0; i < Sp.siegeRing.count; i++) {
      const a = (i / Sp.siegeRing.count) * Math.PI * 2;
      spawnEnemy('mob', run.x + Math.cos(a) * Sp.siegeRing.radius, run.z + Math.sin(a) * Sp.siegeRing.radius, 0);
    }
    ui.toast('포위당했다!', 'red');
  }
  if (!run.chestDone && run.t >= Sp.chestAt) {
    run.chestDone = true;
    const a = Math.random() * Math.PI * 2, d = rand(CONFIG.chest.dropDist[0], CONFIG.chest.dropDist[1]);
    chest.x = clamp(run.x + Math.cos(a) * d, -60, 60);
    chest.z = clamp(run.z + Math.sin(a) * d, -60, 60);
    chest.state = 'falling'; chest.fallT = CONFIG.chest.fallTime;
    pillarMesh.visible = true;
    pillarMesh.position.set(chest.x, 30, chest.z);
    sfx.chestFall();
    ui.toast('보급이 내려온다!', 'gold');
  }
  if (!run.bossDone && run.t >= CONFIG.boss.spawnAt) {
    run.bossDone = true;
    const a = Math.random() * Math.PI * 2;
    boss.active = true;
    boss.x = clamp(run.x + Math.cos(a) * 24, -60, 60);
    boss.z = clamp(run.z + Math.sin(a) * 24, -60, 60);
    boss.hp = CONFIG.boss.hp;
    boss.slamT = CONFIG.boss.slamPeriod; boss.telegraphT = 0; boss.kx = 0; boss.kz = 0; boss.flashT = 0;
    boss.orbitHitT = -9; boss.waveId = -1;
    bossMesh.visible = true;
    addTrauma(0.4);
    sfx.bossRoar();
    ui.toast('어둑시니가 나타났다', 'red');
    ui.setBoss(true, 1);
  }
  if (run.t >= Sp.frenzy.from && run.t < Sp.frenzy.from + 0.1 && !run._frenzyToast) {
    run._frenzyToast = true;
    ui.toast('가장 어두운 새벽이다', 'red');
  }
  if (!run.surgeDone && run.t >= Sp.finalSurge.at) {
    run.surgeDone = true;
    for (let i = 0; i < Sp.finalSurge.count; i++) {
      const a = (i / Sp.finalSurge.count) * Math.PI * 2;
      spawnEnemy('honbul', run.x + Math.cos(a) * 20, run.z + Math.sin(a) * 20, 0);
    }
  }
  // 승리
  if (run.t >= CONFIG.RUN_TIME && state === 'playing') { startSunrise(); return; }

  // ── 스폰 디렉터 (크레딧 예산)
  if (state === 'playing') {
    let rate = Sp.creditRate * coeff();
    if (boss.active) rate *= 0.5;
    if (run.t >= Sp.frenzy.from && run.t < Sp.frenzy.to) rate *= Sp.frenzy.mult;
    run.credits += rate * dt;
    let guard = 0;
    while (run.credits >= 1 && enemies.length < Sp.maxAlive && guard++ < 40) {
      // 타입 선택 (가중치 + 해금)
      let type = 'mob', elite = 0;
      const roll = Math.random() * 100;
      const W = Sp.weights;
      if (run.t >= Sp.unlocks.elite && roll < W.elite) { elite = 1 + ((Math.random() * 2) | 0); type = Math.random() < 0.7 ? 'mob' : 'honbul'; }
      else if (run.t >= Sp.unlocks.tanker && roll < W.elite + W.tanker) type = 'tanker';
      else if (run.t >= Sp.unlocks.honbul && roll < W.elite + W.tanker + W.honbul) type = 'honbul';
      const cost = CONFIG.enemies[type].cost * (elite ? CONFIG.elite.costMult : 1);
      if (run.credits < cost) break;
      run.credits -= cost;
      const a = Math.random() * Math.PI * 2, r = rand(Sp.ringMin, Sp.ringMax);
      const inTotem = totems.some((tt) => tt.active &&
        (run.x + Math.cos(a) * r - tt.x) ** 2 + (run.z + Math.sin(a) * r - tt.z) ** 2 < tt.radius * tt.radius);
      if (!inTotem) spawnEnemy(type, run.x + Math.cos(a) * r, run.z + Math.sin(a) * r, elite);
    }
  }

  // ── 플레이어 이동
  let ix = 0, iz = 0;
  if (keys['w'] || keys['arrowup']) iz -= 1;
  if (keys['s'] || keys['arrowdown']) iz += 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  const iLen = Math.hypot(ix, iz);
  if (iLen > 0) { ix /= iLen; iz /= iLen; }

  if (run.dashT > 0) {
    run.dashT -= dt;
  } else {
    run.vx += ix * P.accel * dt;
    run.vz += iz * P.accel * dt;
    const sp = Math.hypot(run.vx, run.vz), maxSp = moveSpeed();
    if (sp > maxSp) { run.vx *= maxSp / sp; run.vz *= maxSp / sp; }
    if (iLen === 0) { const f = Math.exp(-P.frictionK * dt); run.vx *= f; run.vz *= f; }
  }
  const dashDecay = Math.exp(-4 * dt);
  if (run.dashT > 0) { run.vx *= dashDecay; run.vz *= dashDecay; }
  run.x = clamp(run.x + run.vx * dt, -CONFIG.ARENA_RADIUS, CONFIG.ARENA_RADIUS);
  run.z = clamp(run.z + run.vz * dt, -CONFIG.ARENA_RADIUS, CONFIG.ARENA_RADIUS);
  const pr = Math.hypot(run.x, run.z);
  if (pr > CONFIG.ARENA_RADIUS) { run.x *= CONFIG.ARENA_RADIUS / pr; run.z *= CONFIG.ARENA_RADIUS / pr; }

  run.dashCd = Math.max(0, run.dashCd - dt);
  run.byeokCd = Math.max(0, run.byeokCd - dt);
  run.invulnT = Math.max(0, run.invulnT - dt);
  run.slowT = Math.max(0, run.slowT - dt);
  run.pentaT += dt;
  if (run.pentaT > 1.5) run.pentaStep = 0;

  // ── 조준 (커서 → 지면 교차)
  _ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  const py = terrainH(run.x, run.z);
  const denom = _ray.ray.direction.y;
  if (Math.abs(denom) > 1e-5) {
    const tHit = (py + 1.0 - _ray.ray.origin.y) / denom;
    if (tHit > 0) {
      _v1.copy(_ray.ray.direction).multiplyScalar(tHit).add(_ray.ray.origin);
      const dx = _v1.x - run.x, dz = _v1.z - run.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.3) { run.aimX = dx / dl; run.aimZ = dz / dl; }
      run.aimPointX = _v1.x; run.aimPointZ = _v1.z;
    }
  }

  // ── 공간 해시 리빌드 (이후 모든 질의가 사용)
  hashRebuild();

  // ── 무기 발사
  updateWeapons(dt);

  // ── 투사체
  for (let pi = projs.length - 1; pi >= 0; pi--) {
    const p = projs[pi];
    p.life -= dt;
    if (p.homing) {
      p.retarget -= dt;
      // 대상은 객체 참조로 유지 — 스왑-팝 제거로 인덱스가 뒤틀리지 않게
      if (p.retarget <= 0 || !p.target || p.target.dying || p.target.hp <= 0) {
        p.retarget = 0.2;
        let best = null, bestD = 1e9;
        for (let i = 0; i < enemies.length; i++) {
          const cand = enemies[i];
          if (cand.dying) continue;
          const d = (cand.x - p.x) ** 2 + (cand.z - p.z) ** 2;
          if (d < bestD) { bestD = d; best = cand; }
        }
        p.target = best;
      }
      if (p.target) {
        const e = p.target;
        const wantX = e.x - p.x, wantZ = e.z - p.z;
        const wl = Math.hypot(wantX, wantZ) || 1;
        const cur = Math.atan2(p.vz, p.vx), want = Math.atan2(wantZ / wl, wantX / wl);
        let dA = want - cur;
        while (dA > Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        const maxTurn = (WEAPONS.wisp.turnDeg * Math.PI / 180) * dt;
        const newA = cur + clamp(dA, -maxTurn, maxTurn);
        p.vx = Math.cos(newA) * p.speed; p.vz = Math.sin(newA) * p.speed;
      }
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.y = terrainH(p.x, p.z) + 1.0;
    let dead = p.life <= 0;
    if (!dead) {
      // 명중 판정 (해시 질의) — 죽어가는 적/관통 직전 적은 제외
      let hitIdx = -1;
      const qn = hashQuery(p.x, p.z, 1.6);
      for (let qi = 0; qi < qn; qi++) {
        const i = _qArr[qi];
        const e = enemies[i];
        if (e.dying || e === p.lastHit) continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        if (dx * dx + dz * dz < (e.radius + 0.35) ** 2) { hitIdx = i; break; }
      }
      if (hitIdx >= 0) {
        const dl = Math.hypot(p.vx, p.vz) || 1;
        if (p.blast > 0) {
          // 폭발 (유도 혼불 L5)
          burst(p.x, p.y, p.z, 10, 0x4dd8e6, 2, 6);
          const bl = p.blast;
          const bn = hashQuery(p.x, p.z, bl + 1);
          for (let qi = 0; qi < bn; qi++) {
            const i2 = _qArr[qi];
            const e2 = enemies[i2];
            if (e2.dying) continue;
            if ((e2.x - p.x) ** 2 + (e2.z - p.z) ** 2 < bl * bl)
              damageEnemy(i2, p.dmg * (i2 === hitIdx ? 1 : 0.5), (e2.x - p.x) / bl, (e2.z - p.z) / bl, {});
          }
          dead = true;
        } else {
          damageEnemy(hitIdx, p.dmg, p.vx / dl, p.vz / dl, { byeok: p.byeok, knockMult: p.byeok ? BYEOK.knockMult : 1 });
          if (p.pierce > 0) { p.pierce--; p.lastHit = enemies[hitIdx]; }
          else dead = true;
        }
      }
    }
    if (dead) {
      projs[pi] = projs[projs.length - 1];
      projs.pop();
      projFree.push(p);
    }
  }

  // ── 적 이동 + 접촉 (사망 스윕은 틱 마지막 — 해시 인덱스는 틱 내내 유효)
  const sepR = 1.2;
  const auraForSlow = run.weapons.find((w) => w.key === 'aura');
  const auraSlowL = auraForSlow ? WEAPONS.aura.levels[auraForSlow.lv - 1] : null;
  const auraSlow = auraSlowL && auraSlowL.slow > 0 ? auraSlowL : null;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    e.age += dt;
    e.flashT = Math.max(0, e.flashT - dt);
    e.popT = Math.max(0, e.popT - dt);
    e.hitCd = Math.max(0, e.hitCd - dt);
    if (e.dying) continue;
    // seek + 분리
    let dx = run.x - e.x, dz = run.z - e.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    let sepX = 0, sepZ = 0;
    const sn = hashQuery(e.x, e.z, sepR);
    for (let qi = 0; qi < sn; qi++) {
      const j = _qArr[qi];
      if (j === i) continue;
      const o = enemies[j];
      const ox = e.x - o.x, oz = e.z - o.z;
      const od2 = ox * ox + oz * oz;
      if (od2 > 0.0001 && od2 < sepR * sepR) {
        const od = Math.sqrt(od2);
        sepX += (ox / od) * (1 - od / sepR);
        sepZ += (oz / od) * (1 - od / sepR);
      }
    }
    // 토템·오라 슬로우
    let slowMult = 1;
    for (const tt of totems) {
      if (!tt.active) continue;
      if ((e.x - tt.x) ** 2 + (e.z - tt.z) ** 2 < tt.radius * tt.radius) slowMult = Math.min(slowMult, 1 - tt.slow);
    }
    if (auraSlow && (e.x - run.x) ** 2 + (e.z - run.z) ** 2 < auraSlow.radius * auraSlow.radius)
      slowMult = Math.min(slowMult, 1 - auraSlow.slow);
    const mv = e.speed * slowMult;
    e.x += (dx * mv + sepX * 1.5) * dt + e.kx * dt;
    e.z += (dz * mv + sepZ * 1.5) * dt + e.kz * dt;
    const kf = Math.exp(-CONFIG.juice.knockback.decayK * dt);
    e.kx *= kf; e.kz *= kf;

    // 불덩이 정예 화염 궤적
    if (e.elite === 1) {
      e.fireTrailT -= mv * dt;
      if (e.fireTrailT <= 0) { e.fireTrailT = CONFIG.elite.blazing.trailGap; dropFirePatch(e.x, e.z); }
    }
    // 정예가 등불 소등
    if (e.elite) {
      for (const l of lanterns) {
        if (l.lit && (e.x - l.x) ** 2 + (e.z - l.z) ** 2 < 2.25) {
          setLantern(l, false);
          burst(l.x, terrainH(l.x, l.z) + 2, l.z, 8, 0x666677, 1, 3);
          sfx.lanternOut();
          ui.toast('등불이 꺼졌다!', 'red');
        }
      }
    }

    // 접촉 피해
    const cr = e.radius + 0.5;
    const pdx = run.x - e.x, pdz = run.z - e.z;
    const pd2 = pdx * pdx + pdz * pdz;
    if (pd2 < cr * cr && e.hitCd <= 0 && state === 'playing') {
      e.hitCd = 0.5;
      hurtPlayer(e.contact, e);
    }
    // 아슬아슬 (대시 중 스침)
    if (run.dashT > 0 && e.grazeDashId !== run.dashId) {
      const surf = Math.sqrt(pd2) - e.radius - 0.5;
      if (surf < P.dash.grazeDist && surf > -0.2 && run.grazePerDash < P.dash.grazeMax) {
        e.grazeDashId = run.dashId;
        run.grazePerDash++;
        run.grazeCount++;
        run.combo += CONFIG.combo.grazeBonus;
        run.comboGauge = Math.min(CONFIG.combo.gauge, run.comboGauge + CONFIG.combo.grazeGaugeBonus);
        if (run.combo > run.maxCombo) run.maxCombo = run.combo;
        ui.flashScreen('#ffd166', 0.18, 220);
        ui.toast('아슬아슬!', 'gold');
        sfx.nearMiss();
        checkMissions();
      }
    }
  }

  // ── 보스
  if (boss.active) {
    const B = CONFIG.boss;
    boss.flashT = Math.max(0, boss.flashT - dt);
    let dx = run.x - boss.x, dz = run.z - boss.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (boss.telegraphT <= 0) {
      boss.x += (dx / dl) * B.speed * dt + boss.kx * dt;
      boss.z += (dz / dl) * B.speed * dt + boss.kz * dt;
    }
    const kf = Math.exp(-8 * dt);
    boss.kx *= kf; boss.kz *= kf;
    // 접촉
    const cr = 0.55 * B.scale + 0.5;
    if (dl < cr && state === 'playing') hurtPlayer(B.contact, null);
    // 내려찍기
    boss.slamT -= dt;
    if (boss.slamT <= 0 && boss.telegraphT <= 0) {
      boss.telegraphT = B.slamTelegraph;
      boss.tx = run.x; boss.tz = run.z;
      slamRing.visible = true; slamFill.visible = true;
      sfx.bossWarn();
    }
    if (boss.telegraphT > 0) {
      boss.telegraphT -= dt;
      const ty = terrainH(boss.tx, boss.tz) + 0.08;
      slamRing.position.set(boss.tx, ty, boss.tz);
      slamRing.scale.setScalar(B.slamRadius);
      slamFill.position.set(boss.tx, ty, boss.tz);
      slamFill.scale.setScalar(B.slamRadius * (1 - boss.telegraphT / B.slamTelegraph));
      if (boss.telegraphT <= 0) {
        slamRing.visible = false; slamFill.visible = false;
        boss.slamT = B.slamPeriod;
        addTrauma(CONFIG.juice.trauma.slam);
        burst(boss.tx, terrainH(boss.tx, boss.tz), boss.tz, 24, 0x8855aa, 4, 10);
        dropScorch(boss.tx, boss.tz, 2);
        sfx.bossSlam();
        const sd = (run.x - boss.tx) ** 2 + (run.z - boss.tz) ** 2;
        if (sd < B.slamRadius * B.slamRadius && state === 'playing') hurtPlayer(B.slamDamage, null);
      }
    }
    ui.setBoss(true, boss.hp / B.hp);
  }

  // ── 화염 바닥 → 플레이어 피해
  for (const f of firePatches) {
    if (!f.active) continue;
    f.life -= dt;
    if (f.life <= 0) { f.active = false; f.mesh.visible = false; continue; }
    f.mesh.material.opacity = 0.4 * clamp(f.life / CONFIG.elite.blazing.trailLife, 0, 1);
    if ((run.x - f.x) ** 2 + (run.z - f.z) ** 2 < 0.9 && state === 'playing')
      hurtPlayer(CONFIG.elite.blazing.trailDps * dt, null, true);
  }

  // ── 등불 지대
  let inPool = false;
  for (const l of lanterns) {
    const d2 = (run.x - l.x) ** 2 + (run.z - l.z) ** 2;
    if (l.lit) {
      if (d2 < CONFIG.lanterns.poolRadius ** 2) {
        inPool = true;
        run.hp = Math.min(run.maxHp, run.hp + CONFIG.lanterns.regen * dt);
      }
      l.ring.visible = false; l.relight = 0;
    } else {
      // 재점화
      if (d2 < CONFIG.lanterns.relightRadius ** 2) {
        l.relight += dt;
        l.ring.visible = true;
        l.ring.scale.setScalar(0.6 + (l.relight / CONFIG.lanterns.relightTime) * 1.2);
        if (l.relight >= CONFIG.lanterns.relightTime) {
          setLantern(l, true);
          l.ring.visible = false;
          run.relights++;
          burst(l.x, terrainH(l.x, l.z) + 2, l.z, 10, 0xffb04d, 1, 4);
          sfx.lanternOn();
          ui.toast('등불을 다시 밝혔다', 'gold');
          checkMissions();
        }
      } else { l.relight = 0; l.ring.visible = false; }
    }
  }

  // ── 콤보 게이지
  if (run.combo > 0) {
    run.comboGauge -= dt * (inPool ? CONFIG.combo.lanternDecayMult : 1);
    if (run.comboGauge <= 0) { run.combo = 0; run.comboGauge = 0; }
  }

  // ── XP 도깨비불
  const pRad = pickupRadius();
  for (let gi = gems.length - 1; gi >= 0; gi--) {
    const g = gems[gi];
    g.age += dt;
    const dx = run.x - g.x, dz = run.z - g.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < pRad * pRad) g.pull = true;
    if (g.pull) {
      const d = Math.sqrt(d2) || 1;
      g.x += (dx / d) * 22 * dt;
      g.z += (dz / d) * 22 * dt;
      if (d < 0.9) {
        gainXP(g.xp);
        run.gemsPicked++;
        sfx.pickup(run.pentaStep);
        run.pentaStep = Math.min(run.pentaStep + 1, 9);
        run.pentaT = 0;
        gems[gi] = gems[gems.length - 1];
        gems.pop();
        gemFree.push(g);
        checkMissions();
        continue;
      }
    }
  }

  // ── 궤짝
  if (chest.state === 'falling') {
    chest.fallT -= dt;
    chestGroup.visible = true;
    const y0 = terrainH(chest.x, chest.z);
    chestGroup.position.set(chest.x, y0 + (chest.fallT / CONFIG.chest.fallTime) * 40, chest.z);
    if (chest.fallT <= 0) {
      chest.state = 'landed';
      chestGroup.position.y = y0;
      addTrauma(CONFIG.juice.trauma.chestLand);
      burst(chest.x, y0, chest.z, 16, 0xffd166, 2, 7);
      sfx.chestLand();
    }
  } else if (chest.state === 'landed') {
    if ((run.x - chest.x) ** 2 + (run.z - chest.z) ** 2 < CONFIG.chest.openRadius ** 2) {
      chest.state = 'opened';
      chestGroup.visible = false; pillarMesh.visible = false;
      for (let i = 0; i < CONFIG.chest.gems; i++) dropGem(chest.x + rand(-2, 2), chest.z + rand(-2, 2), 1);
      burst(chest.x, terrainH(chest.x, chest.z), chest.z, 20, 0xffd166, 3, 9);
      sfx.chestOpen();
      openCards(true); // 영웅 확정
    }
  }

  // ── 사망 스윕 (틱 마지막 — 이후 enemies 인덱스가 바뀐다)
  sweepDead();

  // ── DPS 미터 (100ms 버킷 30개 = 3초 창)
  run.dpsT += dt;
  while (run.dpsT >= 0.1) {
    run.dpsT -= 0.1;
    run.dpsCursor = (run.dpsCursor + 1) % 30;
    run.dpsBuckets[run.dpsCursor] = 0;
  }

  // ── 사망
  if (run.hp <= 0 && state === 'playing' && !godMode) startDeath();
}

// ─── 무기 갱신 ───────────────────────────────────────────────────────────────
function updateWeapons(dt) {
  const extra = extraProjectiles();
  for (const w of run.weapons) {
    const L = WEAPONS[w.key].levels[w.lv - 1];
    if (w.key === 'beam') {
      run.fireT -= dt;
      if (run.fireT <= 0 && enemies.length > 0) {
        run.fireT = 1 / L.rate;
        const n = L.count + extra;
        for (let i = 0; i < n; i++) {
          const spread = (WEAPONS.beam.spread * Math.PI / 180);
          const off = n > 1 ? (i - (n - 1) / 2) * 0.06 : 0;
          const a = Math.atan2(run.aimZ, run.aimX) + rand(-spread, spread) + off;
          fireProjectile(run.x, run.z, Math.cos(a), Math.sin(a),
            { dmg: L.dmg, speed: WEAPONS.beam.speed, range: WEAPONS.beam.range, pierce: L.pierce, color: 0xffd166 });
        }
        // 발사 반동 + 머즐 스파크
        run.vx -= run.aimX * WEAPONS.beam.recoil;
        run.vz -= run.aimZ * WEAPONS.beam.recoil;
        muzzleLight.position.set(run.x + run.aimX, terrainH(run.x, run.z) + 1.2, run.z + run.aimZ);
        muzzleLight.intensity = 3;
        sfx.shoot();
      }
    } else if (w.key === 'talisman' || w.key === 'palgwae') {
      // 시각은 렌더 단계, 판정은 여기
      const rehit = WEAPONS[w.key].rehitCd;
      for (let k = 0; k < L.count; k++) {
        const a = talismanAngle + (k / L.count) * Math.PI * 2;
        const tx = run.x + Math.cos(a) * L.radius, tz = run.z + Math.sin(a) * L.radius;
        const tn = hashQuery(tx, tz, 1.4);
        for (let qi = 0; qi < tn; qi++) {
          const i = _qArr[qi];
          const e = enemies[i];
          if (e.dying || run.t - e.orbitHitT < rehit) continue;
          if ((e.x - tx) ** 2 + (e.z - tz) ** 2 < (e.radius + 0.5) ** 2) {
            e.orbitHitT = run.t;
            const dl = Math.hypot(e.x - run.x, e.z - run.z) || 1;
            damageEnemy(i, L.dmg, (e.x - run.x) / dl, (e.z - run.z) / dl, {});
          }
        }
        // 보스 간이 판정 (재타격 쿨 공유)
        if (boss.active && run.t - boss.orbitHitT >= rehit) {
          const br = 0.55 * CONFIG.boss.scale + 0.5;
          if ((boss.x - tx) ** 2 + (boss.z - tz) ** 2 < br * br) {
            boss.orbitHitT = run.t;
            damageBoss(L.dmg, (boss.x - run.x) * 0.1, (boss.z - run.z) * 0.1, false);
          }
        }
      }
      talismanAngle += (L.degPerSec * Math.PI / 180) * dt;
    } else if (w.key === 'wave') {
      run.weaponTimers.wave = (run.weaponTimers.wave ?? 0.5) - dt;
      if (run.weaponTimers.wave <= 0) {
        run.weaponTimers.wave = L.period;
        const wv = waves.find((x) => !x.active);
        if (wv) {
          wv.active = true; wv.x = run.x; wv.z = run.z; wv.t = 0;
          wv.radius = L.radius; wv.dmg = L.dmg; wv.knock = L.knock; wv.id = ++waveIdCounter;
          wv.mesh.visible = true;
        }
      }
    } else if (w.key === 'wisp') {
      run.weaponTimers.wisp = (run.weaponTimers.wisp ?? 1) - dt;
      if (run.weaponTimers.wisp <= 0 && enemies.length > 0) {
        run.weaponTimers.wisp = L.period;
        const n = L.count + extra;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          fireProjectile(run.x, run.z, Math.cos(a), Math.sin(a),
            { dmg: L.dmg, speed: L.speed, range: L.speed * WEAPONS.wisp.life, homing: true, blast: L.blast, color: 0x4dd8e6, scale: 1.3 });
        }
      }
    } else if (w.key === 'aura') {
      run.weaponTimers.aura = (run.weaponTimers.aura ?? 0) - dt;
      if (run.weaponTimers.aura <= 0) {
        run.weaponTimers.aura = 1 / WEAPONS.aura.tickRate;
        const tick = L.dps / WEAPONS.aura.tickRate;
        const an = hashQuery(run.x, run.z, L.radius + 1);
        for (let qi = 0; qi < an; qi++) {
          const i = _qArr[qi];
          const e = enemies[i];
          if (e.dying) continue;
          const d2 = (e.x - run.x) ** 2 + (e.z - run.z) ** 2;
          if (d2 < L.radius * L.radius) {
            const d = Math.sqrt(d2) || 1;
            damageEnemy(i, tick, (e.x - run.x) / d, (e.z - run.z) / d, { knockMult: 0.15 });
          }
        }
        // 보스 간이 판정
        if (boss.active) {
          const bR = L.radius + 0.55 * CONFIG.boss.scale;
          if ((boss.x - run.x) ** 2 + (boss.z - run.z) ** 2 < bR * bR) damageBoss(tick, 0, 0, false);
        }
      }
    } else if (w.key === 'totem') {
      run.weaponTimers.totem = (run.weaponTimers.totem ?? 2) - dt;
      if (run.weaponTimers.totem <= 0) {
        run.weaponTimers.totem = L.period;
        const tt = totems.find((x) => !x.active) || totems[0];
        tt.active = true; tt.x = run.x; tt.z = run.z; tt.life = L.life;
        tt.radius = L.radius; tt.slow = L.slow; tt.dps = L.dps; tt.vuln = L.vuln; tt.tickT = 0;
        tt.group.visible = true;
        tt.group.position.set(tt.x, terrainH(tt.x, tt.z), tt.z);
        tt.zone.scale.setScalar(tt.radius);
      }
    }
  }
  // 파동 판정/시각
  for (const wv of waves) {
    if (!wv.active) continue;
    wv.t += dt;
    const k = clamp(wv.t / WEAPONS.wave.expandTime, 0, 1);
    const r = wv.radius * k;
    wv.mesh.position.set(wv.x, terrainH(wv.x, wv.z) + 0.1, wv.z);
    wv.mesh.scale.setScalar(Math.max(0.01, r));
    wv.mesh.material.opacity = 0.8 * (1 - k);
    const wn = hashQuery(wv.x, wv.z, r + 2);
    for (let qi = 0; qi < wn; qi++) {
      const i = _qArr[qi];
      const e = enemies[i];
      if (e.dying || e.waveId === wv.id) continue;
      const d = Math.hypot(e.x - wv.x, e.z - wv.z);
      if (Math.abs(d - r) < 1.0 + e.radius) {
        e.waveId = wv.id;
        damageEnemy(i, wv.dmg, (e.x - wv.x) / (d || 1), (e.z - wv.z) / (d || 1), { knockMult: wv.knock / 6 });
      }
    }
    // 보스 간이 판정
    if (boss.active && boss.waveId !== wv.id) {
      const bd = Math.hypot(boss.x - wv.x, boss.z - wv.z);
      if (Math.abs(bd - r) < 1.0 + 0.55 * CONFIG.boss.scale) {
        boss.waveId = wv.id;
        damageBoss(wv.dmg, (boss.x - wv.x) / (bd || 1) * 0.8, (boss.z - wv.z) / (bd || 1) * 0.8, false);
      }
    }
    if (k >= 1) { wv.active = false; wv.mesh.visible = false; }
  }
  // 토템 갱신
  for (const tt of totems) {
    if (!tt.active) continue;
    tt.life -= dt;
    if (tt.life <= 0) { tt.active = false; tt.group.visible = false; continue; }
    tt.tickT -= dt;
    if (tt.tickT <= 0) {
      tt.tickT = 0.25;
      const tick = tt.dps * 0.25;
      const on = hashQuery(tt.x, tt.z, tt.radius + 1);
      for (let qi = 0; qi < on; qi++) {
        const i = _qArr[qi];
        const e = enemies[i];
        if (e.dying) continue;
        const d2 = (e.x - tt.x) ** 2 + (e.z - tt.z) ** 2;
        if (d2 < tt.radius * tt.radius) {
          const d = Math.sqrt(d2) || 1;
          damageEnemy(i, tick, (e.x - tt.x) / d, (e.z - tt.z) / d, { knockMult: 0.1 });
        }
      }
      // 보스 간이 판정
      if (boss.active && (boss.x - tt.x) ** 2 + (boss.z - tt.z) ** 2 < tt.radius * tt.radius)
        damageBoss(tick, 0, 0, false);
    }
  }
  // 보스 투사체 피해 (boss는 공간 해시에 없으므로 별도 판정)
  if (boss.active) {
    for (let pi = projs.length - 1; pi >= 0; pi--) {
      if (!boss.active) break;
      const p = projs[pi];
      const br = 0.55 * CONFIG.boss.scale + 0.4;
      if ((p.x - boss.x) ** 2 + (p.z - boss.z) ** 2 < br * br) {
        const dl = Math.hypot(p.vx, p.vz) || 1;
        damageBoss(p.dmg, (p.vx / dl) * 0.8, (p.vz / dl) * 0.8, p.byeok);
        projs[pi] = projs[projs.length - 1];
        projs.pop();
        projFree.push(p);
      }
    }
  }
}
function killBoss() {
  if (!boss.active) return;
  boss.active = false;
  bossMesh.visible = false;
  slamRing.visible = false; slamFill.visible = false;
  run.bossKilled = true;
  run.kills++;
  hitstop(CONFIG.juice.hitstop.eliteKill);
  kickFov(CONFIG.juice.fov.big);
  addTrauma(0.5);
  burst(boss.x, terrainH(boss.x, boss.z) + 2, boss.z, 40, 0x8855aa, 4, 12);
  dropScorch(boss.x, boss.z, 4);
  for (let i = 0; i < CONFIG.boss.gems; i++) dropGem(boss.x + rand(-3, 3), boss.z + rand(-3, 3), 1);
  sfx.kill(true);
  ui.setBoss(false, 0);
  ui.toast('어둑시니를 쓰러뜨렸다!', 'gold');
  // 보스 궤짝: 영웅 카드 — 단, 미회수 보급 궤짝이 남아있으면 대신 도깨비불 추가 지급
  if (chest.state === 'none' || chest.state === 'opened') {
    chest.x = boss.x; chest.z = boss.z; chest.state = 'landed';
    chestGroup.visible = true;
    chestGroup.position.set(chest.x, terrainH(chest.x, chest.z), chest.z);
    pillarMesh.visible = true;
    pillarMesh.position.set(chest.x, 30, chest.z);
  } else {
    for (let i = 0; i < 10; i++) dropGem(boss.x + rand(-3, 3), boss.z + rand(-3, 3), 2);
  }
  checkMissions();
}

// ─── 플레이어 피격/사망/승리 ────────────────────────────────────────────────
function hurtPlayer(dmg, enemy, silent = false) {
  if (run.invulnT > 0 || run.dashT > 0 || godMode || state !== 'playing') return;
  run.hp -= dmg;
  if (!silent) {
    run.invulnT = P.hurtInvuln;
    addTrauma(CONFIG.juice.trauma.hurt);
    ui.flashScreen('#e84545', 0.25, 200);
    ui.hpShake();
    sfx.hurt();
    if (enemy && enemy.elite === 2) run.slowT = CONFIG.elite.frost.slowDur; // 서리 정예
  }
}
function startDeath() {
  state = 'dying';
  run.dieT = 0.5;
  ui.setBoss(false, 0);
  playerGroup.visible = false;
  const py = terrainH(run.x, run.z);
  burst(run.x, py + 0.5, run.z, 26, playerBodyMat.color.getHex(), 3, 9);
  burst(run.x, py + 1.2, run.z, 8, 0x14141f, 2, 6); // 갓 조각
  sfx.death();
  addTrauma(0.6);
  setLowHp(false);
  heartbeat(0, 60, 1);
}
function finishDeath() {
  state = 'dead';
  document.body.style.cursor = 'default';
  const gained = cheats ? 0 : coinsEarned();
  if (!cheats) {
    meta.coins += gained;
    if (run.score > meta.best) meta.best = Math.floor(run.score);
    unlockSkins();
    saveMeta();
  }
  ui.showDeath({
    remaining: CONFIG.RUN_TIME - run.t, score: run.score, best: meta.best,
    kills: run.kills, coinsGained: gained, missions: missionListForScreen(),
  });
}
function startSunrise() {
  state = 'sunrise';
  run.sunriseT = 0;
  slowmo(1.0);
  sfx.sunrise();
  // 남은 적 재로 소멸
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    burst(e.x, terrainH(e.x, e.z) + 0.5, e.z, 6, 0x777788, 1, 3);
    removeEnemy(i);
  }
  if (boss.active) { boss.active = false; bossMesh.visible = false; }
  slamRing.visible = false; slamFill.visible = false;
  ui.setBoss(false, 0);
  heartbeat(0, 60, 1);
  setLowHp(false);
}
function finishVictory() {
  state = 'victory';
  document.body.style.cursor = 'default';
  const survival = cheats ? 0 : Math.floor(CONFIG.RUN_TIME / 10) * CONFIG.score.survivalPer10s;
  const total = run.killScore + survival + (cheats ? 0 : CONFIG.score.victoryBonus);
  run.score = total;
  const gained = cheats ? 0 : coinsEarned() + CONFIG.economy.victory;
  let nightUnlocked = false;
  if (!cheats) {
    meta.coins += Math.floor(gained);
    if (total > meta.best) meta.best = Math.floor(total);
    if (meta.night === meta.nightUnlocked) { meta.nightUnlocked++; nightUnlocked = true; }
    unlockSkins();
    saveMeta();
  }
  ui.showVictory({
    killScore: run.killScore, survival, bonus: cheats ? 0 : CONFIG.score.victoryBonus,
    total, coinsGained: Math.floor(gained),
    nightUnlocked, missions: missionListForScreen(),
  });
}
function unlockSkins() {
  meta.skinsUnlocked = meta.skinsUnlocked || 1;
  CONFIG.score.skinMilestones.forEach((ms, i) => {
    if (meta.best >= ms) meta.skinsUnlocked = Math.max(meta.skinsUnlocked, i + 2);
  });
}

// ─── 대시·벽력일섬 입력 액션 ────────────────────────────────────────────────
function tryDash() {
  if (state !== 'playing' || run.dashCd > 0) return;
  run.dashCd = P.dash.cooldown;
  run.dashT = P.dash.invuln;
  run.dashId++;
  run.grazePerDash = 0;
  run.dashes++;
  let dx = 0, dz = 0;
  if (keys['w'] || keys['arrowup']) dz -= 1;
  if (keys['s'] || keys['arrowdown']) dz += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  const dl = Math.hypot(dx, dz);
  if (dl > 0) { dx /= dl; dz /= dl; } else { dx = run.aimX; dz = run.aimZ; }
  run.vx = dx * P.dash.impulse;
  run.vz = dz * P.dash.impulse;
  kickFov(CONFIG.juice.fov.dash);
  playerSquash = 0.5; // 스트레치 트리거
  sfx.dash();
  checkMissions();
}
function tryByeok() {
  if (state !== 'playing' || run.byeokCd > 0) return;
  run.byeokCd = BYEOK.cooldown;
  const beam = run.weapons.find((w) => w.key === 'beam');
  const baseDmg = beam ? WEAPONS.beam.levels[beam.lv - 1].dmg : 10;
  const half = (BYEOK.spreadDeg * Math.PI / 180);
  const a0 = Math.atan2(run.aimZ, run.aimX);
  for (let i = 0; i < BYEOK.count; i++) {
    const a = a0 + lerp(-half, half, BYEOK.count === 1 ? 0.5 : i / (BYEOK.count - 1));
    fireProjectile(run.x, run.z, Math.cos(a), Math.sin(a),
      { dmg: baseDmg * BYEOK.dmgMult, speed: BYEOK.speed, range: BYEOK.range, byeok: true, color: 0xffffff, scale: 1.6, pierce: 1 });
  }
  run.vx -= run.aimX * BYEOK.recoil;
  run.vz -= run.aimZ * BYEOK.recoil;
  muzzleLight.position.set(run.x + run.aimX * 1.4, terrainH(run.x, run.z) + 1.2, run.z + run.aimZ * 1.4);
  muzzleLight.intensity = 8;
  kickFov(CONFIG.juice.fov.byeok);
  camPitchKick = 1.2;
  sfx.byeok();
}

// ─── 렌더링 (시각 전용 갱신) ────────────────────────────────────────────────
let playerSquash = 0, squashVel = 0;  // 감쇠 스프링
let camPitchKick = 0;
const camPos = new THREE.Vector3(0, 0, 0);
const DARK_SKY = new THREE.Color(CONFIG.colors.darkestSky);
let hudT = 0;
let fps = 60, fpsAcc = 0, fpsN = 0;

function updateVisuals(fd, simActive) {
  // 플레이어
  const py = terrainH(run.x, run.z);
  playerGroup.position.set(run.x, py, run.z);
  if (run.aimX || run.aimZ) playerGroup.rotation.y = Math.atan2(run.aimX, run.aimZ);
  // 스쿼시&스트레치 (스프링 k=120 c=12, 실시간)
  const springK = 120, springC = 12;
  squashVel += (-springK * playerSquash - springC * squashVel) * fd;
  playerSquash += squashVel * fd;
  const st = clamp(playerSquash, -0.6, 0.6);
  playerGroup.scale.set(1 - st * 0.5, 1 + st, 1 - st * 0.5);
  if (run.dashT > 0) playerGroup.scale.set(0.8, 0.9, 1.35); // 진행방향 스트레치(근사)
  playerGroup.visible = state !== 'dying' && state !== 'dead' && state !== 'start';
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - fd * 60);

  // 적 인스턴스
  for (const key of TYPE_KEYS) enemyMeshes[key]._n = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const im = enemyMeshes[e.type];
    const n = im._n++;
    if (n >= ENEMY_MAX_PER_TYPE) continue;
    const ey = terrainH(e.x, e.z);
    const spawnK = easeOutBack(clamp(e.age / 0.25, 0, 1));
    const pop = 1 + (e.popT > 0 ? (e.popT / 0.1) * 0.25 : 0);
    const s = e.scale * spawnK * pop;
    const bob = e.type === 'honbul' ? Math.sin(e.age * 8 + i) * 0.15 + 0.3 : 0;
    _q.setFromAxisAngle(UP, Math.atan2(run.x - e.x, run.z - e.z));
    _s.set(s, s * (e.popT > 0 ? 0.85 : 1), s);
    _m.compose(_v1.set(e.x, ey + bob, e.z), _q, _s);
    im.setMatrixAt(n, _m);
    // 색: 플래시 > 정예 > 기본
    if (e.flashT > 0) _c.setHex(0xffffff);
    else if (e.elite === 1) _c.setHex(CONFIG.elite.blazing.color);
    else if (e.elite === 2) _c.setHex(CONFIG.elite.frost.color);
    else _c.setHex(CONFIG.enemies[e.type].color);
    im.setColorAt(n, _c);
    // 정예 트레일 파티클 (드문드문)
    if (e.elite && Math.random() < fd * 8)
      spawnParticle(e.x + rand(-0.4, 0.4), ey + rand(0.5, 1.5) * e.scale, e.z + rand(-0.4, 0.4),
        0, 1.5, 0, 0.4, 0.6, e.elite === 1 ? CONFIG.elite.blazing.color : CONFIG.elite.frost.color);
  }
  for (const key of TYPE_KEYS) {
    const im = enemyMeshes[key];
    im.count = im._n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  // 보스
  if (boss.active) {
    const by = terrainH(boss.x, boss.z);
    bossMesh.position.set(boss.x, by, boss.z);
    bossMesh.rotation.y = Math.atan2(run.x - boss.x, run.z - boss.z);
    bossMesh.scale.setScalar(CONFIG.boss.scale);
    bossMesh.material.emissive.setHex(boss.flashT > 0 ? 0xffffff : 0x4a1560);
  }

  // 투사체 인스턴스
  projMesh.count = projs.length;
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    _q.setFromAxisAngle(UP, Math.atan2(p.vx, p.vz));
    const stretch = p.byeok ? 2.2 : 1 + p.speed / 60;
    _s.set(p.scale, p.scale, stretch);
    _m.compose(_v1.set(p.x, p.y, p.z), _q, _s);
    projMesh.setMatrixAt(i, _m);
    projMesh.setColorAt(i, _c.setHex(p.color));
  }
  projMesh.instanceMatrix.needsUpdate = true;
  if (projMesh.instanceColor) projMesh.instanceColor.needsUpdate = true;

  // 도깨비불 인스턴스
  gemMesh.count = gems.length;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    const gy = terrainH(g.x, g.z) + 0.5 + Math.sin(g.age * 4 + i) * 0.15;
    _q.setFromAxisAngle(UP, g.age * 2.5);
    const gs = 0.8 + Math.min(0.5, (g.xp - 1) * 0.1);
    _s.set(gs, gs, gs);
    _m.compose(_v1.set(g.x, gy, g.z), _q, _s);
    gemMesh.setMatrixAt(i, _m);
  }
  gemMesh.instanceMatrix.needsUpdate = true;

  // 부적/팔괘진
  const orbW = run.weapons.find((w) => w.key === 'talisman' || w.key === 'palgwae');
  if (orbW && playerGroup.visible) {
    const L = WEAPONS[orbW.key].levels[orbW.lv - 1];
    talismanMesh.count = L.count;
    for (let k = 0; k < L.count; k++) {
      const a = talismanAngle + (k / L.count) * Math.PI * 2;
      const tx = run.x + Math.cos(a) * L.radius, tz = run.z + Math.sin(a) * L.radius;
      _q.setFromAxisAngle(UP, -a);
      _s.set(1, 1, 1);
      _m.compose(_v1.set(tx, terrainH(tx, tz) + 1.1 + Math.sin(a * 3) * 0.1, tz), _q, _s);
      talismanMesh.setMatrixAt(k, _m);
    }
    talismanMesh.instanceMatrix.needsUpdate = true;
    talismanMesh.material.color.setHex(orbW.key === 'palgwae' ? 0xffe08a : 0xffd166);
  } else talismanMesh.count = 0;

  // 오라
  const auraW = run.weapons.find((w) => w.key === 'aura');
  if (auraW && playerGroup.visible) {
    const L = WEAPONS.aura.levels[auraW.lv - 1];
    auraMesh.visible = auraRing.visible = true;
    auraMesh.position.set(run.x, py + 0.08, run.z);
    auraRing.position.set(run.x, py + 0.09, run.z);
    auraMesh.scale.setScalar(L.radius);
    auraRing.scale.setScalar(L.radius);
    auraRing.rotation.z += fd * 0.8;
  } else { auraMesh.visible = auraRing.visible = false; }

  // 등불 불꽃 흔들림
  for (const l of lanterns) {
    if (l.lit) {
      l.flicker += fd * 7;
      l.flame.scale.setScalar(1 + Math.sin(l.flicker) * 0.15);
      l.light.intensity = CONFIG.lanterns.intensity * (1 + Math.sin(l.flicker * 1.3) * 0.12);
    }
  }

  // 궤짝 빛기둥 펄스
  if (pillarMesh.visible) pillarMesh.material.opacity = 0.18 + Math.sin(performance.now() * 0.004) * 0.06;
  if (chest.state === 'landed') chestGroup.rotation.y += fd * 1.2;

  // ── 하늘·달·조명 (시간 기반)
  const tNorm = clamp(run.t / CONFIG.RUN_TIME, 0, 1);
  const cf = clamp(coeff() / 5, 0, 1);
  if (state === 'sunrise' || state === 'victory') {
    // 일출: 8초 lerp
    const k = clamp(run.sunriseT / 8, 0, 1);
    _c.setHex(C.fog).lerp(_c2.setHex(C.dawnHorizon), k);
    scene.background.copy(_c);
    scene.fog.color.copy(_c);
    moonLight.color.setHex(C.moonlight).lerp(_c2.setHex(0xffb070), k);
    moonLight.intensity = MOON_BASE + k * 1.2;
    hemi.intensity = HEMI_BASE + k * 0.6;
    starMat.opacity = 0.7 * (1 - k);
    moon.visible = moonGlow.visible = false;
  } else {
    // 밤: 달 하강 + 핏빛 + 안개 블렌드, 2:30 이후 침강
    const alt = CONFIG.moon.startAlt * (1 - tNorm);
    const mx = Math.cos(alt) * 150 * 0.5, myy = Math.sin(alt) * 150, mz = -Math.cos(alt) * 150;
    moon.visible = moonGlow.visible = true;
    moon.position.set(mx, Math.max(myy, 4), mz);
    moonGlow.position.copy(moon.position);
    _c.setHex(0xffffff).lerp(_c2.setHex(C.moonBlood), cf);
    moon.material.color.copy(_c);
    // 안개에 달 색 10% + 최종 30초 침강
    _c2.setHex(C.fog);
    _c2.lerp(_c, 0.1);
    if (run.t > 150) _c2.lerp(DARK_SKY, clamp((run.t - 150) / 20, 0, 1) * 0.7);
    scene.background.copy(_c2);
    scene.fog.color.copy(_c2);
  }

  // ── 카메라: 지수 추적 + 트라우마 셰이크 + FOV
  const CA = CONFIG.camera;
  _v1.set(run.x + (run.aimPointX - run.x) * CA.lookAhead, py,
    run.z + (run.aimPointZ - run.z) * CA.lookAhead);
  const ck = 1 - Math.exp(-CA.lerpK * fd);
  camPos.lerp(_v1, ck);
  camRig.position.copy(camPos);
  camRig.rotation.set(0, 0, 0);
  camera.lookAt(camPos.x, camPos.y, camPos.z);
  // 트라우마² 회전 셰이크 — lookAt 이후 로컬 회전으로 얹는다 (실시간 감쇠)
  run.shakeTrauma = Math.max(0, (run.shakeTrauma || 0) - CONFIG.juice.trauma.decay * fd);
  const sh = run.shakeTrauma * run.shakeTrauma;
  const now = performance.now() * 0.001;
  const maxR = CONFIG.juice.trauma.maxDeg * Math.PI / 180;
  camera.rotateX(Math.sin(now * 13.7 * 2 * Math.PI) * maxR * sh + camPitchKick * Math.PI / 180);
  camera.rotateY(Math.sin(now * 17.3 * 2 * Math.PI) * maxR * sh);
  camera.rotateZ(Math.sin(now * 19.1 * 2 * Math.PI) * maxR * sh * 0.6);
  camPitchKick = Math.max(0, camPitchKick - fd * 8);
  // FOV 킥 복원
  fovKick = Math.max(0, fovKick - fd * (CONFIG.juice.fov.dash / CONFIG.juice.fov.recover));
  const wantFov = CA.baseFov + fovKick;
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix(); }

  // ── HUD (매 프레임 가벼운 것만)
  if (state !== 'start') {
    ui.setTimer(CONFIG.RUN_TIME - run.t);
    ui.setXP(run.xp / run.xpNext, run.level);
    ui.setHP(run.hp, run.maxHp);
    ui.setRings(1 - run.dashCd / P.dash.cooldown, 1 - run.byeokCd / BYEOK.cooldown);
    ui.setCursor(mouse.x, mouse.y, 1 - run.byeokCd / BYEOK.cooldown, state === 'playing');
    ui.setCombo(run.combo, comboMult(), comboTier(), run.comboGauge / CONFIG.combo.gauge);
    hudT += fd;
    if (hudT > 0.12) {
      hudT = 0;
      ui.setScore(run.score);
      ui.setKills(run.kills);
      // 종료 화면에서는 이미 meta에 합산됨 — 이중 계산 방지
      const runEnding = state === 'dead' || state === 'victory' || state === 'dying';
      ui.setCoins(meta.coins + (runEnding ? 0 : coinsEarned()));
      let dps = 0;
      for (let i = 0; i < 30; i++) dps += run.dpsBuckets[i];
      ui.setDPS(dps / 3);
    }
    // 비네트: 저체력 + 최종 30초
    const lowK = run.hp < P.lowHpThreshold ? (1 - run.hp / P.lowHpThreshold) : 0;
    const finalK = run.t > 150 && state === 'playing' ? clamp((run.t - 150) / 30, 0, 1) * 0.5 : 0;
    const pulse = 0.75 + Math.sin(performance.now() * 0.006) * 0.25;
    ui.setVignette(Math.max(lowK * pulse, finalK * pulse));
    setLowHp(run.hp < P.lowHpThreshold && (state === 'playing'));
    // 심장박동: 저체력 or 최종 30초
    const hbVol = state === 'playing' ? Math.max(lowK, run.t > 150 ? 1 : 0) : 0;
    const hbBpm = run.t > 150 ? lerp(60, 100, clamp((run.t - 150) / 30, 0, 1)) : 70;
    heartbeat(hbVol, hbBpm, fd);
  }

  if (showStats) {
    ui.setStats(
      `FPS ${fps.toFixed(0)}  coeff ${coeff().toFixed(2)}\n적 ${enemies.length}  크레딧 ${run.credits.toFixed(1)}\n` +
      `투사체 ${projs.length}  젬 ${gems.length}\n드로우콜 ${renderer.info.render.calls}  트라이앵글 ${(renderer.info.render.triangles / 1000).toFixed(0)}k\n` +
      `배속 ×${debugMult}${godMode ? '  무적' : ''}${cheats ? '  (기록 비활성)' : ''}`, true);
  }
}

// ─── 메인 루프 ───────────────────────────────────────────────────────────────
let acc = 0;
let lastFrameT = performance.now();
const STEP = 1 / 60;

renderer.setAnimationLoop(() => {
  const nowT = performance.now();
  const fd = Math.min((nowT - lastFrameT) / 1000, 0.1);
  lastFrameT = nowT;
  fpsAcc += fd; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  // 실시간 감쇠 (히트스톱·슬로모는 실시간으로 소모)
  hitstopT = Math.max(0, hitstopT - fd);
  slowmoT = Math.max(0, slowmoT - fd);

  const simActive = state === 'playing' || state === 'dying' || state === 'sunrise';
  if (simActive) {
    acc += fd;
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      const ts = timeScale();
      for (let r = 0; r < debugMult; r++) {
        if (state === 'playing') sim(STEP * ts);
        else if (state === 'dying' || state === 'sunrise') simPassive(STEP * ts);
      }
      acc -= STEP; steps++;
    }
    if (steps >= 6) acc = 0;
    updateParticles(fd * (hitstopT > 0 ? 0.3 : 1)); // 실제 프레임 시간 기준, 히트스톱 영향 축소
    updateDamageNumbers(fd);
  }
  updateVisuals(fd, simActive);
  renderer.render(scene, camera);
});

// 사망 연출/일출 중에도 세계는 관성으로 움직인다
function simPassive(dt) {
  if (state === 'dying') {
    run.dieT -= dt;
    if (run.dieT <= 0) finishDeath();
  } else if (state === 'sunrise') {
    run.sunriseT += dt;
    if (run.sunriseT >= 8) finishVictory();
  }
  // 적은 계속 배회 (플레이어 추적만)
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    e.age += dt;
    e.flashT = Math.max(0, e.flashT - dt);
    e.popT = Math.max(0, e.popT - dt);
  }
}

// ─── 입력 ────────────────────────────────────────────────────────────────────
// ev.code(물리 키) 기반 — 한글 입력 모드에서도 WASD·R이 동작한다
const CODE_MAP = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
  ShiftLeft: 'shift', ShiftRight: 'shift', Space: ' ',
  KeyR: 'r', Escape: 'escape',
  Digit1: '1', Digit2: '2', Digit3: '3', Numpad1: '1', Numpad2: '2', Numpad3: '3',
  Digit0: '0', Digit8: '8', Digit9: '9',
};
addEventListener('keydown', (ev) => {
  const k = CODE_MAP[ev.code];
  if (!k) return;
  keys[k] = true;
  if (k === 'shift' || k === ' ') { ev.preventDefault(); tryDash(); }
  if (k === 'r') {
    if (state === 'dead' || state === 'victory') restart();
    else if (state === 'playing' || state === 'paused' || state === 'cards') { ui.hideCards(); ui.hidePause(); restart(); }
  }
  if (k === 'escape') {
    if (state === 'playing') { state = 'paused'; document.body.style.cursor = 'default'; ui.showPause(); ui.setSoundLabel(getAudioEnabled()); }
    else if (state === 'paused') resumeFromPause();
    else if (state === 'dead' || state === 'victory') {
      // 산사(메뉴)로 복귀 — 상점·피부색·밤 선택 접근로
      ui.hideDeath(); ui.hideVictory(); ui.showHud(false);
      state = 'start';
      document.body.style.cursor = 'default';
      ui.showStart({ night: meta.night, best: meta.best, coins: meta.coins });
    }
  }
  if (state === 'cards' && cardResolve) {
    if (k === '1') pickCard(cardResolve[0]);
    else if (k === '2') pickCard(cardResolve[1]);
    else if (k === '3') pickCard(cardResolve[2]);
  }
  // 디버그
  if (k === '0') { debugMult = debugMult === 1 ? 10 : 1; cheats = cheats || debugMult > 1; ui.toast(`배속 ×${debugMult}${cheats ? ' (기록 비활성)' : ''}`, 'teal'); }
  if (k === '9') showStats = !showStats;
  if (k === '8') { godMode = !godMode; cheats = cheats || godMode; ui.toast(godMode ? '무적 ON (기록 비활성)' : '무적 OFF', 'teal'); }
});
addEventListener('keyup', (ev) => { const k = CODE_MAP[ev.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', (ev) => { mouse.x = ev.clientX; mouse.y = ev.clientY; });
addEventListener('mousedown', (ev) => {
  initAudio();
  if (ev.button !== 0) return;
  if (state === 'start') {
    // 버튼 클릭은 startRun을 막는다
    if (ev.target.closest && ev.target.closest('.btn')) return;
    startRun();
  } else if (state === 'playing') {
    if (performance.now() < inputGuardUntil) return;
    tryByeok();
  }
});
addEventListener('contextmenu', (ev) => ev.preventDefault());

function resumeFromPause() {
  ui.hidePause();
  // 220ms 카드 타이머가 일시정지에 먹혔다면 여기서 복구
  if (run.pendingCards > 0 && !cardTimerArmed) {
    run.pendingCards--;
    openCards();
    return;
  }
  state = 'playing';
  document.body.style.cursor = 'none';
}
function restart() {
  ui.hideDeath(); ui.hideVictory(); ui.hideCards();
  cheats = false; debugMult = 1; godMode = false;
  resetRun();
  state = 'playing';
  document.body.style.cursor = 'none';
  ui.showHud(true);
  if (run.pendingCards > 0) { run.pendingCards--; openCards(); }
}
function startRun() {
  ui.hideStart();
  restart();
}

// ─── 시작 화면 버튼 ─────────────────────────────────────────────────────────
ui.el.btnShop.addEventListener('click', (ev) => {
  ev.stopPropagation();
  sfx.uiClick();
  openShop();
});
ui.el.btnShopClose.addEventListener('click', () => {
  sfx.uiClick();
  ui.hideShop();
  if (state === 'shop') { state = 'start'; ui.showStart({ night: meta.night, best: meta.best, coins: meta.coins }); }
});
function openShop() {
  state = 'shop';
  ui.hideStart();
  renderShop();
}
function renderShop() {
  ui.showShop(meta, (key) => {
    const item = CONFIG.economy.shop[key];
    const rank = meta.shop[key] || 0;
    if (rank >= item.costs.length || meta.coins < item.costs[rank]) return;
    meta.coins -= item.costs[rank];
    meta.shop[key] = rank + 1;
    saveMeta();
    sfx.buy();
    renderShop();
  });
}
ui.el.btnSkin.addEventListener('click', (ev) => {
  ev.stopPropagation();
  sfx.uiClick();
  unlockSkins();
  const unlocked = meta.skinsUnlocked || 1;
  meta.skin = (meta.skin + 1) % unlocked;
  playerBodyMat.color.setHex(C.playerSkins[meta.skin]);
  saveMeta();
  const names = ['백의', '청록', '금빛', '진홍'];
  ui.toast(`피부색: ${names[meta.skin]}${unlocked < 4 ? ` (점수로 해금: ${CONFIG.score.skinMilestones.join('/')})` : ''}`, 'teal');
});
ui.el.btnNight.addEventListener('click', (ev) => {
  ev.stopPropagation();
  sfx.uiClick();
  meta.night = (meta.night % meta.nightUnlocked) + 1;
  saveMeta();
  ui.showStart({ night: meta.night, best: meta.best, coins: meta.coins });
});
ui.el.btnResume.addEventListener('click', () => { sfx.uiClick(); resumeFromPause(); });
ui.el.btnSound.addEventListener('click', () => {
  const on = !getAudioEnabled();
  setAudioEnabled(on);
  meta.sound = on;
  saveMeta();
  ui.setSoundLabel(on);
});

// ─── 부팅 ────────────────────────────────────────────────────────────────────
resetRun();
ui.showHud(false);
ui.showStart({ night: meta.night, best: meta.best, coins: meta.coins });

// 검증/디버그 훅
window.__gameDebug = () => ({
  state, t: +run.t.toFixed(1), hp: Math.round(run.hp), level: run.level,
  kills: run.kills, enemies: enemies.length, projs: projs.length, gems: gems.length,
  score: Math.round(run.score), combo: run.combo, fps: +fps.toFixed(1),
  drawCalls: renderer.info.render.calls, coeff: +coeff().toFixed(2),
  boss: boss.active ? Math.round(boss.hp) : null, weapons: run.weapons.map((w) => `${w.key}:${w.lv}`),
});
window.__game = {
  startRun, restart,
  pickFirstCard: () => { if (cardResolve) pickCard(cardResolve[0]); },
  skipTo: (t) => { if (state === 'playing') run.t = t; },        // 테스트용 시간 점프
  setHp: (hp) => { run.hp = hp; },                               // 테스트용
};
