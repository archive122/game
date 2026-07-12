// ═══════════════════════════════════════════════════════════════════════════
// FX — 전면 풀링 (런타임 할당 금지 규칙)
//   · 스테이트리스 GPU 파티클: pos = p0 + v·t + ½g·t² (드로우콜 1)
//   · 검광 리본 트레일 (링버퍼)
//   · 충격파 링 / 텔레그래프 데칼 / 포인트라이트 플래시 / 구르기 잔상
//   · 투사체·화염 기둥 메시 대여(acquire/release) — 판정은 게임플레이 측 소유
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const PARTICLE_CAP = 2048;

const PART_VERT = /* glsl */`
  attribute vec3 aVel;
  attribute float aBirth;
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aGrav;
  uniform float uTime;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float age = uTime - aBirth;
    float t = clamp(age / max(aLife, 1e-4), 0.0, 1.0);
    vec3 p = position + aVel * age + vec3(0.0, -0.5 * aGrav * age * age, 0.0);
    vFade = (1.0 - t) * step(0.0, age) * step(age, aLife);
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (1.0 - t * 0.55) * (220.0 / max(0.1, -mv.z)) * step(0.001, vFade);
    gl_Position = projectionMatrix * mv;
  }
`;
const PART_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a;
    if (vFade <= 0.001) discard;
    gl_FragColor = vec4(vColor * a * vFade, 1.0);
  }
`;

const RING_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RING_FRAG = /* glsl */`
  uniform float uT;         // 0..1 진행
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float e = 1.0 - pow(1.0 - uT, 2.2);         // easeOut
    float radius = e;
    float width = mix(0.28, 0.05, uT);
    float band = smoothstep(radius, radius - width, d) * smoothstep(radius - width * 2.2, radius - width, d);
    float a = band * (1.0 - uT);
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

const DECAL_VERT = RING_VERT;
const DECAL_FRAG = /* glsl */`
  uniform float uFill;      // 0..1 텔레그래프 충전
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float ring = smoothstep(1.0, 0.93, d) * smoothstep(0.85, 0.93, d);
    float fill = smoothstep(uFill, uFill - 0.06, d) * 0.34;
    float pulse = smoothstep(0.04, 0.0, abs(d - uFill)) * 0.8;
    float a = (ring + fill + pulse) * uAlpha;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

// 화염 기둥 — 스크롤 노이즈
const FIRE_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FIRE_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uLife;      // 0..1
  uniform vec3 uColor;
  varying vec2 vUv;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec2 p = vec2(vUv.x * 3.0, vUv.y * 2.0 - uTime * 2.4);
    float n = vnoise(p) * 0.6 + vnoise(p * 2.3) * 0.4;
    float body = smoothstep(0.25, 0.75, n + (1.0 - vUv.y) * 0.55);
    float fadeIn = smoothstep(0.0, 0.12, uLife);
    float fadeOut = smoothstep(1.0, 0.72, uLife);
    float a = body * fadeIn * fadeOut * smoothstep(1.0, 0.72, vUv.y);
    gl_FragColor = vec4(uColor * (0.6 + n) * a, 1.0);
  }
`;

// 검광 리본
const TRAIL_SEGS = 26;
const TRAIL_VERT = /* glsl */`
  attribute float aBirth;
  attribute float aSide;
  uniform float uTime;
  uniform float uFadeTime;
  varying float vA;
  varying float vSide;
  void main() {
    float age = uTime - aBirth;
    vA = clamp(1.0 - age / uFadeTime, 0.0, 1.0);
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const TRAIL_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vA;
  varying float vSide;
  void main() {
    float edge = 1.0 - abs(vSide * 2.0 - 1.0);
    float a = vA * vA * (0.35 + 0.65 * edge);
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

export class SwordTrail {
  constructor(scene, color, fadeTime = 0.26) {
    this.cursor = 0;
    const verts = TRAIL_SEGS * 2;
    this.positions = new Float32Array(verts * 3);
    this.births = new Float32Array(verts).fill(-100);
    this.sides = new Float32Array(verts);
    for (let i = 0; i < TRAIL_SEGS; i++) { this.sides[i * 2] = 0; this.sides[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < TRAIL_SEGS - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geom.setAttribute('aBirth', new THREE.BufferAttribute(this.births, 1));
    this.geom.setAttribute('aSide', new THREE.BufferAttribute(this.sides, 1));
    this.geom.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
      uniforms: {
        uTime: { value: 0 }, uFadeTime: { value: fadeTime },
        uColor: { value: new THREE.Color().setRGB(color[0], color[1], color[2]) },
      },
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(this.geom, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
    this.head = 0;   // 다음 기록 세그먼트
  }
  setColor(r, g, b) { this.mat.uniforms.uColor.value.setRGB(r, g, b); }
  // 활성 스윙 중 매 프레임 호출: base/tip 월드 좌표
  push(base, tip, time) {
    const i = this.head % TRAIL_SEGS;
    const p = this.positions;
    p[i * 6] = base.x; p[i * 6 + 1] = base.y; p[i * 6 + 2] = base.z;
    p[i * 6 + 3] = tip.x; p[i * 6 + 4] = tip.y; p[i * 6 + 5] = tip.z;
    this.births[i * 2] = time;
    this.births[i * 2 + 1] = time;
    // 다음 세그먼트를 현재 위치의 퇴화 세그먼트로 — 이전 스트로크 좌표와
    // 연결되는 반투명 시트 아티팩트 방지
    const n = (i + 1) % TRAIL_SEGS;
    p[n * 6] = base.x; p[n * 6 + 1] = base.y; p[n * 6 + 2] = base.z;
    p[n * 6 + 3] = tip.x; p[n * 6 + 4] = tip.y; p[n * 6 + 5] = tip.z;
    this.births[n * 2] = -100;
    this.births[n * 2 + 1] = -100;
    this.head++;
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.aBirth.needsUpdate = true;
  }
  reset() {
    this.births.fill(-100);
    this.geom.attributes.aBirth.needsUpdate = true;
    this.head = 0;
  }
  update(time) { this.mat.uniforms.uTime.value = time; }
}

// ── 텍스처 스프라이트 풀 (회전/성장 지원, 스테이트리스 GPU) ────────────────────
const SPRITE_VERT = /* glsl */`
  attribute vec3 aVel;
  attribute float aBirth;
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aGrav;
  attribute float aRot;
  attribute float aSpin;
  uniform float uTime;
  uniform float uGrow;      // 0 = 수축(불꽃/스파크), 1 = 팽창(연기)
  varying vec3 vColor;
  varying float vFade;
  varying float vRot;
  void main() {
    float age = uTime - aBirth;
    float t = clamp(age / max(aLife, 1e-4), 0.0, 1.0);
    vec3 p = position + aVel * age + vec3(0.0, -0.5 * aGrav * age * age, 0.0);
    vFade = smoothstep(0.0, 0.09, t) * (1.0 - t) * step(0.0, age) * step(age, aLife);
    vColor = aColor;
    vRot = aRot + aSpin * age;
    float sizeCurve = mix(1.0 - t * 0.45, 1.0 + t * 1.6, uGrow);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(300.0, aSize * sizeCurve * (240.0 / max(0.1, -mv.z))) * step(0.001, vFade);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPRITE_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vFade;
  varying float vRot;
  void main() {
    if (vFade <= 0.001) discard;
    vec2 uvc = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    uvc = mat2(c, -s, s, c) * uvc;
    if (abs(uvc.x) > 0.5 || abs(uvc.y) > 0.5) discard;
    vec4 tx = texture2D(uMap, uvc + 0.5);
    #ifdef ADDITIVE
      gl_FragColor = vec4(vColor * tx.a * vFade * uOpacity, 1.0);
    #else
      gl_FragColor = vec4(vColor, tx.a * vFade * uOpacity);
    #endif
  }
`;

class SpritePool {
  constructor(scene, map, { capacity = 384, additive = true, grow = 0, opacity = 1 } = {}) {
    this.cap = capacity;
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.attrs = {};
    const mk = (name, itemSize, fill = 0) => {
      const a = new Float32Array(capacity * itemSize).fill(fill);
      this.attrs[name] = a;
      g.setAttribute(name, new THREE.BufferAttribute(a, itemSize));
    };
    mk('position', 3); mk('aVel', 3); mk('aBirth', 1, -1000); mk('aLife', 1, 1);
    mk('aSize', 1); mk('aColor', 3); mk('aGrav', 1); mk('aRot', 1); mk('aSpin', 1);
    this.geom = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
      defines: additive ? { ADDITIVE: 1 } : {},
      uniforms: { uTime: { value: 0 }, uMap: { value: map }, uGrow: { value: grow }, uOpacity: { value: opacity } },
      transparent: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(g, this.mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 9 : 8;
    scene.add(pts);
    this.time = 0;
    this.dirty = false;
  }
  spawn(pos, vel, { life = 1, size = 3, color = [1, 1, 1], grav = 0, spin = 0, rot = null } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    const A = this.attrs;
    A.position[i * 3] = pos.x; A.position[i * 3 + 1] = pos.y; A.position[i * 3 + 2] = pos.z;
    A.aVel[i * 3] = vel.x; A.aVel[i * 3 + 1] = vel.y; A.aVel[i * 3 + 2] = vel.z;
    A.aBirth[i] = this.time;
    A.aLife[i] = life;
    A.aSize[i] = size;
    A.aColor[i * 3] = color[0]; A.aColor[i * 3 + 1] = color[1]; A.aColor[i * 3 + 2] = color[2];
    A.aGrav[i] = grav;
    A.aRot[i] = rot === null ? Math.random() * Math.PI * 2 : rot;
    A.aSpin[i] = spin;
    this.dirty = true;
  }
  update(time) {
    this.time = time;
    this.mat.uniforms.uTime.value = time;
    if (this.dirty) {
      for (const key in this.attrs) this.geom.attributes[key].needsUpdate = true;
      this.dirty = false;
    }
  }
  reset() {
    this.attrs.aBirth.fill(-1000);
    this.geom.attributes.aBirth.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, softDotTex) {
    this.scene = scene;
    this.time = 0;

    // ── 파티클 풀 ──
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(PARTICLE_CAP * 3);
    this.pVel = new Float32Array(PARTICLE_CAP * 3);
    this.pBirth = new Float32Array(PARTICLE_CAP).fill(-1000);
    this.pLife = new Float32Array(PARTICLE_CAP).fill(1);
    this.pSize = new Float32Array(PARTICLE_CAP);
    this.pColor = new Float32Array(PARTICLE_CAP * 3);
    this.pGrav = new Float32Array(PARTICLE_CAP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(this.pVel, 3));
    g.setAttribute('aBirth', new THREE.BufferAttribute(this.pBirth, 1));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.pLife, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.pColor, 3));
    g.setAttribute('aGrav', new THREE.BufferAttribute(this.pGrav, 1));
    this.pGeom = g;
    this.pCursor = 0;
    this.partMat = new THREE.ShaderMaterial({
      vertexShader: PART_VERT, fragmentShader: PART_FRAG,
      uniforms: { uTime: { value: 0 }, uMap: { value: softDotTex } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(g, this.partMat);
    pts.frustumCulled = false;
    pts.renderOrder = 9;
    scene.add(pts);

    // ── 링 풀 ──
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: { uT: { value: 1 }, uColor: { value: new THREE.Color(1, 1, 1) } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 7;
      scene.add(m);
      this.rings.push({ mesh: m, t: 1, dur: 1, maxR: 1 });
    }

    // ── 데칼 풀 ──
    this.decals = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG,
        uniforms: { uFill: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(1, 0.3, 0.1) } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.decals.push({ mesh: m, active: false, t: 0, dur: 1, hold: 0 });
    }

    // ── 라이트 플래시 풀 ──
    this.flashes = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 16, 2);
      scene.add(l);
      this.flashes.push({ light: l, t: 1, dur: 1, peak: 0 });
    }

    // ── 잔상 풀 (히어로 등록 후 사용) — 세트별 개별 머티리얼로 독립 페이드 ──
    this.ghosts = [];
    this.ghostBaseMat = new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.ghostBaseMat.color.setRGB(0.25, 0.8, 1.1);

    // ── 투사체/화염 기둥 대여 풀 ──
    this.crescents = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
      });
      mat.color.setRGB(4.5, 1.4, 0.3);
      const m = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.22, 6, 24, Math.PI * 0.85), mat);
      m.visible = false;
      m.renderOrder = 8;
      scene.add(m);
      this.crescents.push(m);
    }
    this.fireballs = [];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ fog: false });
      mat.color.setRGB(5.5, 1.8, 0.4);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat);
      m.visible = false;
      scene.add(m);
      this.fireballs.push(m);
    }
    this.fireCols = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
        uniforms: { uTime: { value: 0 }, uLife: { value: 0 }, uColor: { value: new THREE.Color().setRGB(3.4, 1.1, 0.22) } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 7.5, 14, 1, true), mat);
      m.visible = false;
      m.renderOrder = 8;
      scene.add(m);
      this.fireCols.push(m);
    }

    // 상시 이미터
    this.emitters = [];        // {pos, rate, acc, opts}
    this.globalEmbers = false;
    this.emberAcc = 0;

    // 외부 에셋 풀 (applyExternalAssets 이후 활성)
    this.sparkPool = null;
    this.smokePool = null;
    this.firePool = null;
    this.smokeEmitters = [];   // {pos, rate, acc}
    this.muzzles = [];         // 방사형 플래시 빌보드 풀
    this.scorches = [];        // 그을음 데칼 풀
  }

  // ── CC0 스프라이트 에셋 연결 — 실패 시 게임은 절차적 이펙트로 그대로 동작 ──
  applyExternalAssets(assets) {
    const T = assets.tex;
    if (T.star) this.sparkPool = new SpritePool(this.scene, T.star, { capacity: 512, additive: true, grow: 0 });
    if (T.smoke) this.smokePool = new SpritePool(this.scene, T.smoke, { capacity: 320, additive: false, grow: 0.9, opacity: 0.3 });
    if (T.flamePuff) this.firePool = new SpritePool(this.scene, T.flamePuff, { capacity: 256, additive: true, grow: 0.3 });

    if (T.muzzle) {
      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: T.muzzle, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, fog: false,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        m.visible = false;
        m.renderOrder = 10;
        this.scene.add(m);
        this.muzzles.push({ mesh: m, t: 1, dur: 0.22, size: 4 });
      }
    }
    if (T.scorch) {
      for (let i = 0; i < 6; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: T.scorch, transparent: true, color: 0x090909,
          depthWrite: false, fog: false, opacity: 0,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        m.renderOrder = 3;
        this.scene.add(m);
        this.scorches.push({ mesh: m, t: 1, dur: 7 });
      }
    }
    if (T.magic) {
      // 텔레그래프 데칼에 회전 마법진 오버레이 장착
      for (const d of this.decals) {
        const mat = new THREE.MeshBasicMaterial({
          map: T.magic, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, fog: false, opacity: 0,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mat);
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 6;
        d.mesh.add(m);
        d.magic = m;
      }
    }
  }

  // ── Rich 이펙트 헬퍼 (풀 없으면 조용히 무시 — 호출부는 무조건 불러도 됨) ──
  sparks(pos, count = 10, color = [4, 2.8, 1.2], speed = 7) {
    if (!this.sparkPool) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, el = (Math.random() - 0.3) * 1.3;
      const s = speed * (0.4 + Math.random() * 0.9);
      this.sparkPool.spawn(pos,
        { x: Math.cos(a) * Math.cos(el) * s, y: Math.sin(el) * s + 2, z: Math.sin(a) * Math.cos(el) * s },
        { life: 0.3 + Math.random() * 0.35, size: 2.6 + Math.random() * 2, color, grav: 16, spin: (Math.random() - 0.5) * 14 });
    }
  }
  smokePuff(pos, count = 6, { size = 2.8, color = [0.045, 0.045, 0.055], up = 1.6, spread = 2.2, life = 2.2 } = {}) {
    if (!this.smokePool) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      this.smokePool.spawn(
        { x: pos.x + Math.cos(a) * r * 0.4, y: pos.y + Math.random() * 0.5, z: pos.z + Math.sin(a) * r * 0.4 },
        { x: Math.cos(a) * r * 0.5, y: up * (0.6 + Math.random() * 0.8), z: Math.sin(a) * r * 0.5 },
        { life: life * (0.7 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.7), color, grav: -0.15, spin: (Math.random() - 0.5) * 1.6 });
    }
  }
  firePuffs(pos, count = 8, { size = 3.2, up = 3.5, life = 0.55 } = {}) {
    if (!this.firePool) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.9;
      this.firePool.spawn(
        { x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * 0.6, z: pos.z + Math.sin(a) * r },
        { x: Math.cos(a) * 1.2, y: up * (0.6 + Math.random() * 0.8), z: Math.sin(a) * 1.2 },
        { life: life * (0.7 + Math.random() * 0.7), size: size * (0.7 + Math.random() * 0.6), color: [3.4, 1.5, 0.4], grav: -1.5, spin: (Math.random() - 0.5) * 5 });
    }
  }
  muzzleFlash(pos, color = [3, 1.6, 0.6], size = 4, dur = 0.2) {
    const f = this.muzzles.find(m => m.t >= 1) || this.muzzles[0];
    if (!f) return;
    f.t = 0; f.dur = dur; f.size = size;
    f.mesh.visible = true;
    f.mesh.position.copy(pos);
    f.mesh.material.color.setRGB(color[0], color[1], color[2]);
    f.mesh.material.rotation = 0;
    f.mesh.rotation.z = Math.random() * Math.PI * 2;
  }
  scorch(pos, r = 3) {
    const s = this.scorches.find(s => s.t >= 1) || this.scorches[0];
    if (!s) return;
    s.t = 0;
    s.mesh.visible = true;
    s.mesh.position.set(pos.x, 0.045 + Math.random() * 0.01, pos.z);
    s.mesh.rotation.z = Math.random() * Math.PI * 2;
    s.mesh.scale.setScalar(r);
  }
  // 대형 착탄 종합 연출
  richImpact(pos, { r = 4, color = [3.2, 1.5, 0.5], sparkCount = 16, smokeCount = 5 } = {}) {
    this.muzzleFlash({ x: pos.x, y: pos.y + 0.9, z: pos.z }, color, r * 1.5);
    this.sparks({ x: pos.x, y: pos.y + 0.6, z: pos.z }, sparkCount, [4, 2.6, 1]);
    this.smokePuff(pos, smokeCount, { size: r * 0.8, spread: r * 0.6 });
    this.scorch(pos, r * 1.15);
  }
  addSmokeEmitter(pos, rate) {
    this.smokeEmitters.push({ pos, rate, acc: Math.random() });
  }

  // ── 파티클 스폰 (직접 인덱스 쓰기 — 임시 배열 할당 없음) ──
  spawn(pos, vel, life, size, r, g, b, grav) {
    const i = this.pCursor;
    this.pCursor = (this.pCursor + 1) % PARTICLE_CAP;
    this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
    this.pVel[i * 3] = vel.x; this.pVel[i * 3 + 1] = vel.y; this.pVel[i * 3 + 2] = vel.z;
    this.pBirth[i] = this.time;
    this.pLife[i] = life;
    this.pSize[i] = size;
    this.pColor[i * 3] = r; this.pColor[i * 3 + 1] = g; this.pColor[i * 3 + 2] = b;
    this.pGrav[i] = grav;
    this.pDirty = true;
  }

  burst(pos, { count = 20, color = [4, 2.4, 0.8], speed = 5, up = 2, life = 0.5, size = 2.4, grav = 9, spread = 1 } = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.35) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      v.set(Math.cos(a) * Math.cos(el) * s, Math.sin(el) * s + up * Math.random(), Math.sin(a) * Math.cos(el) * s);
      this.spawn(pos, v, life * (0.6 + Math.random() * 0.8), size * (0.6 + Math.random() * 0.9),
        color[0], color[1], color[2], grav);
    }
  }

  addEmitter(pos, rate, opts) {
    this.emitters.push({ pos, rate, acc: 0, opts });
  }

  // ── 링 ──
  ring(pos, { maxR = 6, dur = 0.5, color = [3, 2, 1], y = 0.12 } = {}) {
    const r = this.rings.find(r => r.t >= 1) || this.rings[0];
    r.t = 0; r.dur = dur; r.maxR = maxR;
    r.mesh.visible = true;
    r.mesh.position.set(pos.x, y, pos.z);
    r.mesh.scale.setScalar(maxR);
    r.mesh.material.uniforms.uColor.value.setRGB(color[0], color[1], color[2]);
  }

  // ── 텔레그래프 데칼 ──
  decal(pos, { r = 3, fillTime = 0.8, hold = 0.15, color = [2.6, 0.5, 0.2] } = {}) {
    const d = this.decals.find(d => !d.active) || this.decals[0];
    d.active = true; d.t = 0; d.dur = fillTime; d.hold = hold;
    d.mesh.visible = true;
    d.mesh.position.set(pos.x, 0.06, pos.z);
    d.mesh.scale.setScalar(r);
    d.mesh.material.uniforms.uColor.value.setRGB(color[0], color[1], color[2]);
    d.mesh.material.uniforms.uAlpha.value = 1;
    d.mesh.material.uniforms.uFill.value = 0;
    return d;
  }
  clearDecals() {
    for (const d of this.decals) { d.active = false; d.mesh.visible = false; }
  }

  // ── 라이트 플래시 ──
  flash(pos, color = [1, 0.75, 0.4], intensity = 60, dur = 0.3) {
    const f = this.flashes.find(f => f.t >= 1) || this.flashes[0];
    f.t = 0; f.dur = dur; f.peak = intensity;
    f.light.position.set(pos.x, pos.y + 1.2, pos.z);
    f.light.color.setRGB(color[0], color[1], color[2]);
    f.light.intensity = intensity;
  }

  // ── 잔상 ──
  registerGhostSource(group) {
    // 히어로의 메시 목록에서 잔상 풀 3개 생성
    const src = [];
    group.traverse(o => { if (o.isMesh && !o.userData.noGhost) src.push(o); });
    for (let i = 0; i < 3; i++) {
      const mat = this.ghostBaseMat.clone();
      const entries = src.map(m => {
        const gm = new THREE.Mesh(m.geometry, mat);
        gm.matrixAutoUpdate = false;
        gm.visible = false;
        gm.renderOrder = 4;
        this.scene.add(gm);
        return { src: m, ghost: gm };
      });
      this.ghosts.push({ entries, mat, t: 1, dur: 0.28 });
    }
  }
  snapshotGhost() {
    const g = this.ghosts.find(g => g.t >= 1) || this.ghosts[0];
    if (!g) return;
    g.t = 0;
    for (const e of g.entries) {
      e.ghost.visible = true;
      e.ghost.matrix.copy(e.src.matrixWorld);
    }
  }

  // ── 대여 풀 ──
  acquire(pool) {
    const m = this[pool].find(m => !m.visible);
    if (m) m.visible = true;
    return m || null;
  }
  release(m) { if (m) m.visible = false; }

  setGlobalEmbers(on) { this.globalEmbers = on; }

  update(gameDt, rawDt, gameTime, camera) {
    this.time = gameTime;
    this.partMat.uniforms.uTime.value = gameTime;

    // 텍스처 스프라이트 풀
    this.sparkPool?.update(gameTime);
    this.smokePool?.update(gameTime);
    this.firePool?.update(gameTime);
    // 상시 연기 이미터 (화로 등)
    if (this.smokePool) {
      for (const e of this.smokeEmitters) {
        e.acc += gameDt * e.rate;
        while (e.acc >= 1) {
          e.acc -= 1;
          this.smokePool.spawn(
            { x: e.pos.x + (Math.random() - 0.5) * 0.4, y: e.pos.y, z: e.pos.z + (Math.random() - 0.5) * 0.4 },
            { x: (Math.random() - 0.5) * 0.3, y: 0.9 + Math.random() * 0.6, z: (Math.random() - 0.5) * 0.3 },
            { life: 2.4 + Math.random() * 1.4, size: 1.3 + Math.random() * 0.8, color: [0.04, 0.04, 0.05], grav: -0.2, spin: (Math.random() - 0.5) * 1.2 });
        }
      }
    }
    // 머즐 플래시 (카메라 빌보드)
    for (const f of this.muzzles) {
      if (f.t >= 1) { f.mesh.visible = false; continue; }
      f.t = Math.min(1, f.t + gameDt / f.dur);
      const e = 1 - Math.pow(1 - f.t, 2);
      f.mesh.scale.setScalar(f.size * (0.45 + e * 0.75));
      f.mesh.material.opacity = 1 - f.t;
      if (camera) f.mesh.quaternion.copy(camera.quaternion);
    }
    // 그을음 페이드
    for (const s of this.scorches) {
      if (s.t >= 1) { s.mesh.visible = false; continue; }
      s.t = Math.min(1, s.t + gameDt / s.dur);
      s.mesh.material.opacity = 0.85 * (1 - s.t) * Math.min(1, s.t * 18 + 0.2);
    }

    // 상시 이미터 (화로 잿불)
    for (const e of this.emitters) {
      e.acc += gameDt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        const o = e.opts;
        this.spawn(
          { x: e.pos.x + (Math.random() - 0.5) * 0.5, y: e.pos.y, z: e.pos.z + (Math.random() - 0.5) * 0.5 },
          { x: (Math.random() - 0.5) * 0.5, y: 0.8 + Math.random() * 1.1, z: (Math.random() - 0.5) * 0.5 },
          1.4 + Math.random() * 1.2, 1.5 + Math.random() * 1.4,
          o.color[0], o.color[1], o.color[2], -0.35);
      }
    }
    // 전역 상승 잿불 (2페이즈~)
    if (this.globalEmbers) {
      this.emberAcc += gameDt * 42;
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 19;
        this.spawn(
          { x: Math.cos(a) * r, y: 0.2 + Math.random() * 1.2, z: Math.sin(a) * r },
          { x: (Math.random() - 0.5) * 0.7, y: 0.7 + Math.random() * 1.4, z: (Math.random() - 0.5) * 0.7 },
          2.6 + Math.random() * 2, 1.2 + Math.random() * 1.6,
          3.2, 1.1, 0.24, -0.3);
      }
    }
    if (this.pDirty) {
      for (const key of ['position', 'aVel', 'aBirth', 'aLife', 'aSize', 'aColor', 'aGrav']) {
        this.pGeom.attributes[key].needsUpdate = true;
      }
      this.pDirty = false;
    }

    // 링
    for (const r of this.rings) {
      if (r.t >= 1) { r.mesh.visible = false; continue; }
      r.t = Math.min(1, r.t + gameDt / r.dur);
      r.mesh.material.uniforms.uT.value = r.t;
    }
    // 데칼 (+ 회전 마법진 오버레이)
    for (const d of this.decals) {
      if (!d.active) { if (d.magic) d.magic.material.opacity = 0; continue; }
      d.t += gameDt;
      const u = d.mesh.material.uniforms;
      if (d.t < d.dur) {
        u.uFill.value = d.t / d.dur;
      } else if (d.t < d.dur + d.hold) {
        u.uFill.value = 1;
        u.uAlpha.value = 1.6;    // 발동 순간 과열
      } else {
        d.active = false;
        d.mesh.visible = false;
      }
      if (d.magic && d.active) {
        d.magic.rotation.z += gameDt * 1.7;
        const c = u.uColor.value;
        d.magic.material.color.setRGB(c.r * 0.55, c.g * 0.55, c.b * 0.55);
        d.magic.material.opacity = 0.28 + 0.55 * (d.t / d.dur);
      }
    }
    // 플래시
    for (const f of this.flashes) {
      if (f.t >= 1) { f.light.intensity = 0; continue; }
      f.t = Math.min(1, f.t + gameDt / f.dur);
      f.light.intensity = f.peak * (1 - f.t) * (1 - f.t);
    }
    // 잔상 (세트별 독립 페이드)
    for (const g of this.ghosts) {
      if (g.t >= 1) continue;
      g.t = Math.min(1, g.t + rawDt / g.dur);
      g.mat.opacity = (1 - g.t) * 0.5;
      if (g.t >= 1) for (const e of g.entries) e.ghost.visible = false;
    }
    // 화염 기둥 셰이더 시간
    for (const m of this.fireCols) {
      if (m.visible) m.material.uniforms.uTime.value = gameTime;
    }
  }

  resetAll() {
    this.pBirth.fill(-1000);
    this.pGeom.attributes.aBirth.needsUpdate = true;
    for (const r of this.rings) { r.t = 1; r.mesh.visible = false; }
    this.clearDecals();
    for (const f of this.flashes) { f.t = 1; f.light.intensity = 0; }
    for (const g of this.ghosts) { g.t = 1; for (const e of g.entries) e.ghost.visible = false; }
    for (const m of [...this.crescents, ...this.fireballs, ...this.fireCols]) m.visible = false;
    this.globalEmbers = false;
    this.sparkPool?.reset();
    this.smokePool?.reset();
    this.firePool?.reset();
    for (const f of this.muzzles) { f.t = 1; f.mesh.visible = false; }
    for (const s of this.scorches) { s.t = 1; s.mesh.visible = false; }
  }
}
