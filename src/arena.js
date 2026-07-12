// ═══════════════════════════════════════════════════════════════════════════
// 아레나 — 무너진 대성당 성소 (직경 40m)
// 시선 삼단 구도: 보스 + 달빛 갓레이 + 실루엣 열주. 원경은 안개 소실.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { TUNING } from './config.js';
import { enableHeightFog } from './renderer.js';
import { makeFloorMaps, makePillarMaps, makeRuneRing, makeBannerMap, makeInscription, mulberry32 } from './textures.js';

// ── 지오메트리 병합 (동일 머티리얼 정적 소품 → 드로우콜 1) ─────────────────────
export function mergeGeoms(items) {
  let vCount = 0, iCount = 0;
  for (const { geom } of items) {
    vCount += geom.attributes.position.count;
    iCount += geom.index ? geom.index.count : geom.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vOff = 0, iOff = 0;
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const { geom, matrix } of items) {
    const p = geom.attributes.position, n = geom.attributes.normal, u = geom.attributes.uv;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      pos.set([v.x, v.y, v.z], (vOff + i) * 3);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor.set([v.x, v.y, v.z], (vOff + i) * 3);
      if (u) uv.set([u.getX(i), u.getY(i)], (vOff + i) * 2);
    }
    if (geom.index) {
      for (let i = 0; i < geom.index.count; i++) idx[iOff + i] = geom.index.getX(i) + vOff;
      iOff += geom.index.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[iOff + i] = vOff + i;
      iOff += p.count;
    }
    vOff += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
const _lerpA = new THREE.Color();
const _lerpB = new THREE.Color();
export const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sy = null, sz = null) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(s, sy ?? s, sz ?? s));

// ── 하늘 돔 셰이더 ──────────────────────────────────────────────────────────
const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w;   // 항상 최원경
  }
`;
const SKY_FRAG = /* glsl */`
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.62));

    // 별 (지평선 근처는 감쇠)
    vec2 sp = d.xz / (d.y + 0.35);
    vec2 cell = floor(sp * 34.0);
    float star = step(0.9955, hash(cell));
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + hash(cell + 7.0) * 2.2) + hash(cell + 3.0) * 40.0);
    col += star * tw * smoothstep(0.06, 0.35, d.y) * vec3(0.75, 0.85, 1.1) * 1.35;

    // 달 — HDR 디스크 + 광륜 (블룸 트리거)
    float md = dot(d, normalize(uMoonDir));
    float disc = smoothstep(0.9987, 0.9994, md);
    float halo = pow(clamp(md, 0.0, 1.0), 220.0);
    col += uMoonColor * (disc * 5.0 + halo * 0.85);

    // 저속 구름 (달 부근 실루엣)
    float cl = fbm(sp * 2.2 + vec2(uTime * 0.008, uTime * 0.003));
    float cloud = smoothstep(0.52, 0.78, cl) * smoothstep(0.0, 0.25, d.y);
    col = mix(col, uHorizon * 1.35, cloud * 0.55);
    col += uMoonColor * cloud * halo * 0.4;   // 구름 가장자리 월광

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── 갓레이 원뿔 셰이더 ───────────────────────────────────────────────────────
const GODRAY_VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vY;
  void main() {
    vY = uv.y;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const GODRAY_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vY;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    // 시선이 원기둥 중심을 관통할 때 광로가 가장 길다 — 중심 밝고 가장자리 소멸
    float body = pow(abs(dot(viewDir, normalize(vNormal))), 1.7);
    float heightFade = smoothstep(0.0, 0.3, vY) * smoothstep(1.0, 0.55, vY);
    float flicker = 0.9 + 0.1 * sin(uTime * 0.7 + vWorldPos.x);
    gl_FragColor = vec4(uColor * uIntensity * body * heightFade * flicker, 1.0);
  }
`;

// ── 부유 먼지 ───────────────────────────────────────────────────────────────
const DUST_VERT = /* glsl */`
  attribute float aSeed;
  uniform float uTime;
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.13 + aSeed * 17.0) * 0.7;
    p.y += sin(uTime * 0.09 + aSeed * 31.0) * 0.45;
    p.z += cos(uTime * 0.11 + aSeed * 23.0) * 0.7;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(9.0, (0.55 + aSeed * 1.1) * (120.0 / -mv.z));
    vA = 0.5 + 0.5 * sin(uTime * 0.5 + aSeed * 40.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const DUST_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vA;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a;
    gl_FragColor = vec4(uColor * a * vA * 0.09, 1.0);
  }
`;

export class Arena {
  constructor(scene, softDotTex) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.phaseMix = 0;           // 0 = 남색의 밤, 1 = 잿불의 진홍
    this.phaseTarget = 0;
    this.time = 0;
    this.braziers = [];          // {pos, light, core}
    this.windMats = [];
    this.collapsePillars = [];   // 2페이즈 붕괴용
    this.debris = [];

    const P = TUNING.palette.p1;

    // ── 안개 ──
    scene.fog = new THREE.FogExp2(P.fog, TUNING.render.fogDensity);

    // ── 조명 리그 (키 1 + 필 1 + 화로 4 — 섀도 캐스터는 키 하나) ──
    this.keyLight = new THREE.DirectionalLight(P.key, P.keyIntensity);
    this.keyLight.position.set(16, 30, 12);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = true;
    const sh = this.keyLight.shadow;
    sh.mapSize.set(TUNING.render.shadowSize, TUNING.render.shadowSize);
    sh.camera.left = -24; sh.camera.right = 24;
    sh.camera.top = 24; sh.camera.bottom = -24;
    sh.camera.near = 5; sh.camera.far = 70;
    sh.bias = -0.0004;
    sh.normalBias = 0.02;
    this.group.add(this.keyLight, this.keyLight.target);
    this.moonDir = this.keyLight.position.clone().normalize();

    this.hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, P.hemiIntensity);
    this.group.add(this.hemi);

    this.#buildSky(P);
    this.#buildFloor();
    this.#buildPillars();
    this.#buildWallAndDome();
    this.#buildAltar();
    this.#buildBraziers(P);
    this.#buildBanners();
    this.#buildStatues();
    this.#buildGodrays(P);
    this.#buildDust(softDotTex, P);
    this.#buildInscriptions();
    this.#buildFloatingStones();
  }

  // ── 하늘 ──
  #buildSky(P) {
    this.skyUniforms = {
      uZenith: { value: new THREE.Color(P.sky) },
      uHorizon: { value: new THREE.Color(P.horizon) },
      uMoonColor: { value: new THREE.Color(P.moon) },
      uMoonDir: { value: this.keyLight.position.clone().normalize() },
      uTime: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(240, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      }));
    sky.renderOrder = -10;
    this.group.add(sky);
  }

  // ── 바닥 ──
  #buildFloor() {
    const maps = makeFloorMaps();
    const mat = new THREE.MeshStandardMaterial({
      map: maps.map, roughnessMap: maps.roughnessMap, normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 1.0, metalness: 0.06, envMapIntensity: 0.5,
    });
    enableHeightFog(mat);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(23, 48), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 외곽 침식 지반 (안개 속으로)
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x171b24, roughness: 1 });
    enableHeightFog(outerMat);
    const outer = new THREE.Mesh(new THREE.RingGeometry(23, 90, 48), outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.22;
    this.group.add(outer);
  }

  // ── 열주 ──
  #buildPillars() {
    const maps = makePillarMaps();
    this.pillarMat = new THREE.MeshStandardMaterial({
      map: maps.map, normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.88, metalness: 0.04, envMapIntensity: 0.5,
    });
    enableHeightFog(this.pillarMat);
    const rng = mulberry32(120711);
    const R = 17.4, N = 12;
    const gate = TUNING.arena.gateAngle;

    // 온전한 기둥: 주추 + 몸통 + 주두
    const shaft = new THREE.CylinderGeometry(0.85, 1.0, 9.5, 18, 1);
    const plinth = new THREE.BoxGeometry(2.5, 0.8, 2.5);
    const capital = new THREE.BoxGeometry(2.3, 0.7, 2.3);
    const intactGeom = mergeGeoms([
      { geom: plinth, matrix: M4(0, 0.4, 0) },
      { geom: shaft, matrix: M4(0, 5.55, 0) },
      { geom: capital, matrix: M4(0, 10.65, 0) },
    ]);
    // 부러진 기둥: 상단 정점 랜덤 함몰
    const brokenShaft = new THREE.CylinderGeometry(0.9, 1.0, 5.2, 18, 3);
    {
      const p = brokenShaft.attributes.position;
      const jr = mulberry32(48213);
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 2.4) p.setY(i, 2.6 - jr() * 1.7);
      }
      brokenShaft.computeVertexNormals();
    }
    const brokenGeom = mergeGeoms([
      { geom: plinth, matrix: M4(0, 0.4, 0) },
      { geom: brokenShaft, matrix: M4(0, 3.4, 0) },
    ]);

    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      // 입구 방향은 비움
      let d = Math.abs(((ang - gate + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < 0.34) continue;
      const broken = rng() < 0.4;
      const mesh = new THREE.Mesh(broken ? brokenGeom : intactGeom, this.pillarMat);
      mesh.position.set(Math.cos(ang) * R, 0, Math.sin(ang) * R);
      mesh.rotation.y = rng() * Math.PI * 2;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      if (!broken && this.collapsePillars.length < 3 && i % 3 === 1) {
        this.collapsePillars.push(mesh);
      }
    }

    // 아치 2기 (온전한 기둥 사이)
    const archGeom = new THREE.TorusGeometry(3.4, 0.55, 10, 20, Math.PI);
    for (const ang of [Math.PI * 0.25, Math.PI * 1.4]) {
      const arch = new THREE.Mesh(archGeom, this.pillarMat);
      arch.position.set(Math.cos(ang) * R, 10.4, Math.sin(ang) * R);
      arch.rotation.y = -ang + Math.PI / 2;
      arch.castShadow = true;
      this.group.add(arch);
    }

    // 붕괴 파편 프리팹 (2페이즈): 기둥당 박스 7개
    this.debrisGroup = new THREE.Group();
    this.group.add(this.debrisGroup);
  }

  // ── 외벽 + 반파 돔 ──
  #buildWallAndDome() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c313d, roughness: 0.95, metalness: 0.03, envMapIntensity: 0.35 });
    enableHeightFog(mat);
    const rng = mulberry32(90751);
    const items = [];
    // 부서진 외벽 세그먼트
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      let d = Math.abs(((a0 - TUNING.arena.gateAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < 0.42) continue;                    // 입구
      if (rng() < 0.22) continue;                // 무너진 구간
      const h = 4.5 + rng() * 5.5;
      const w = 8.4;
      const box = new THREE.BoxGeometry(w, h, 1.2);
      items.push({ geom: box, matrix: M4(Math.cos(a0) * 21.5, h / 2 - rng() * 0.7, Math.sin(a0) * 21.5, 0, -a0 + Math.PI / 2, (rng() - 0.5) * 0.06) });
      // 잔해 더미
      for (let k = 0; k < 2; k++) {
        const rk = new THREE.DodecahedronGeometry(0.5 + rng() * 0.8, 0);
        items.push({ geom: rk, matrix: M4(Math.cos(a0 + (rng() - 0.5) * 0.3) * (19.5 + rng() * 2), 0.3, Math.sin(a0 + (rng() - 0.5) * 0.3) * (19.5 + rng() * 2), rng() * 3, rng() * 3, 0, 1) });
      }
    }
    // 게이트 아치 (입구)
    const ga = TUNING.arena.gateAngle;
    const gx = Math.cos(ga) * 21.5, gz = Math.sin(ga) * 21.5;
    items.push({ geom: new THREE.BoxGeometry(1.6, 9, 1.6), matrix: M4(gx + Math.sin(ga) * 3.2, 4.5, gz - Math.cos(ga) * 3.2) });
    items.push({ geom: new THREE.BoxGeometry(1.6, 9, 1.6), matrix: M4(gx - Math.sin(ga) * 3.2, 4.5, gz + Math.cos(ga) * 3.2) });
    items.push({ geom: new THREE.BoxGeometry(8.2, 1.4, 1.8), matrix: M4(gx, 9.4, gz, 0, -ga + Math.PI / 2, 0) });

    const wall = new THREE.Mesh(mergeGeoms(items), mat);
    wall.castShadow = true; wall.receiveShadow = true;
    this.group.add(wall);

    // 반파 돔 셸 (달 반대편 하늘 반쪽을 덮음)
    const domeGeom = new THREE.SphereGeometry(23.5, 28, 12, Math.PI * 0.62, Math.PI * 1.05, 0, Math.PI * 0.46);
    const dome = new THREE.Mesh(domeGeom, new THREE.MeshStandardMaterial({
      color: 0x232833, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.25,
    }));
    enableHeightFog(dome.material);
    dome.position.y = 1.5;
    this.group.add(dome);
  }

  // ── 성소 중앙 — 바닥에 새겨진 대형 룬 마법진 (전투 공간은 평탄하게 유지) ──
  #buildAltar() {
    // 낮은 석재 인레이 링 (걸리적거리지 않는 5cm 단차)
    const inlay = new THREE.Mesh(
      new THREE.CylinderGeometry(6.2, 6.4, 0.1, 40),
      this.pillarMat);
    inlay.position.y = 0.02;
    inlay.receiveShadow = true;
    this.group.add(inlay);

    // 룬 마법진 — HDR emissive
    this.runeMat = new THREE.MeshBasicMaterial({
      map: makeRuneRing(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    });
    this.runeMat.color.setRGB(2.4, 1.1, 0.35);   // HDR
    this.rune = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 11.5), this.runeMat);
    this.rune.rotation.x = -Math.PI / 2;
    this.rune.position.y = 0.09;
    this.rune.renderOrder = 2;
    this.group.add(this.rune);

    // 연마 방패 — envMap 쇼케이스 (metalness 1 / roughness 0.05), 기둥 곁에 기대 둠
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.09, 26),
      new THREE.MeshStandardMaterial({ color: 0xcfd6e2, metalness: 1.0, roughness: 0.05, envMapIntensity: 1.4 }));
    const sa = Math.PI * 0.25;
    shield.position.set(Math.cos(sa) * 15.6, 0.86, Math.sin(sa) * 15.6);
    shield.rotation.set(Math.PI / 2 - 0.42, -sa, 0.25);
    shield.castShadow = true;
    this.group.add(shield);
  }

  // ── 화로 4기 ──
  #buildBraziers(P) {
    const stoneMat = this.pillarMat;
    const R = 11.5;
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(ang) * R, z = Math.sin(ang) * R;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const stem = new THREE.Mesh(mergeGeoms([
        { geom: new THREE.CylinderGeometry(0.5, 0.66, 0.3, 10), matrix: M4(0, 0.15, 0) },
        { geom: new THREE.CylinderGeometry(0.16, 0.22, 1.5, 8), matrix: M4(0, 1.0, 0) },
        { geom: new THREE.CylinderGeometry(0.62, 0.3, 0.5, 12), matrix: M4(0, 1.95, 0) },
      ]), stoneMat);
      stem.castShadow = true;
      g.add(stem);
      // 발광 코어 (HDR emissive → 블룸)
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 12, 10),
        new THREE.MeshBasicMaterial({ fog: false }));
      core.material.color.setRGB(6.0, 2.2, 0.5);
      core.position.y = 2.1;
      g.add(core);
      const light = new THREE.PointLight(P.ember, 14, 17, 1.8);
      light.position.y = 2.5;
      g.add(light);
      this.group.add(g);
      this.braziers.push({ pos: new THREE.Vector3(x, 2.25, z), light, core, seed: i * 1.618 });
    }
  }

  // ── 배너 (버텍스 셰이더 바람) ──
  #buildBanners() {
    const map = makeBannerMap();
    const rng = mulberry32(3141);
    const windUniform = { value: 0 };
    this.windUniform = windUniform;
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({
        map, transparent: true, alphaTest: 0.45, side: THREE.DoubleSide,
        roughness: 0.9, metalness: 0, envMapIntensity: 0.3,
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uWind = windUniform;
        shader.vertexShader = ('uniform float uWind;\n' + shader.vertexShader).replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float sway = (1.0 - uv.y);
           transformed.x += sin(uWind * 1.7 + float(gl_VertexID) * 0.03 + uv.y * 4.0) * sway * 0.28;
           transformed.z += cos(uWind * 1.3 + uv.y * 5.0) * sway * 0.22;`);
      };
      mat.customProgramCacheKey = () => 'banner' + i;
      enableHeightFog(mat);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.6, 4, 12), mat);
      const ang = rng() * Math.PI * 2;
      const R = 17.2;
      banner.position.set(Math.cos(ang) * R, 7.4, Math.sin(ang) * R);
      banner.rotation.y = -ang - Math.PI / 2;
      this.group.add(banner);
    }
  }

  // ── 배경 거신상 (안개 실루엣) ──
  #buildStatues() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c212c, roughness: 1, metalness: 0, envMapIntensity: 0.2 });
    enableHeightFog(mat);
    const rng = mulberry32(5150);
    for (let i = 0; i < 3; i++) {
      const ang = Math.PI * 0.32 + i * Math.PI * 0.55;
      const R = 30 + rng() * 7;
      // 무릎 꿇은 기사 실루엣: 몸통 + 머리 + 어깨 + 검을 짚은 팔
      const s = 6 + rng() * 3;
      const statue = new THREE.Mesh(mergeGeoms([
        { geom: new THREE.BoxGeometry(1.6, 2.4, 1.1), matrix: M4(0, 2.1, 0, 0.18, 0, 0) },              // 몸통
        { geom: new THREE.SphereGeometry(0.52, 10, 8), matrix: M4(0, 3.6, 0.18) },                       // 머리(숙임)
        { geom: new THREE.BoxGeometry(2.6, 0.65, 1.2), matrix: M4(0, 3.0, 0) },                          // 어깨
        { geom: new THREE.BoxGeometry(0.5, 2.2, 0.5), matrix: M4(1.25, 1.9, 0.5, 0.5, 0, -0.15) },       // 팔
        { geom: new THREE.BoxGeometry(0.28, 3.4, 0.28), matrix: M4(1.7, 1.7, 0.9) },                     // 대검
        { geom: new THREE.BoxGeometry(1.0, 1.2, 1.6), matrix: M4(-0.5, 0.6, 0.3) },                      // 무릎
      ]), mat);
      statue.scale.setScalar(s / 4);
      statue.position.set(Math.cos(ang) * R, 0, Math.sin(ang) * R);
      statue.rotation.y = -ang - Math.PI / 2;
      this.group.add(statue);
    }
  }

  // ── 갓레이 ──
  #buildGodrays(P) {
    this.godrayMats = [];
    const dir = this.moonDir.clone().negate();       // 위 → 아래
    const rng = mulberry32(2077);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: GODRAY_VERT, fragmentShader: GODRAY_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(P.moon) },
          uIntensity: { value: 0.13 - i * 0.02 },
          uTime: { value: 0 },
        },
        transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.FrontSide, fog: false,
      });
      const len = 30;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + i * 0.3, 1.9 + i * 0.9, len, 14, 1, true), mat);
      // 원뿔을 달빛 방향으로 정렬
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      cone.quaternion.copy(q);
      const off = new THREE.Vector3((rng() - 0.5) * 7, 0, (rng() - 0.5) * 7);
      // 바닥 도달점이 아레나 중앙 부근이 되도록 배치
      const hit = new THREE.Vector3(2 + off.x, 0, 1 + off.z);
      cone.position.copy(hit).addScaledVector(dir, -len / 2);
      cone.renderOrder = 5;
      this.group.add(cone);
      this.godrayMats.push(mat);
    }
  }

  // ── 부유 먼지 ──
  #buildDust(softDotTex, P) {
    const N = 500;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const rng = mulberry32(60007);
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(rng()) * 20;
      const a = rng() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.3 + rng() * 11;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
      uniforms: { uTime: { value: 0 }, uMap: { value: softDotTex }, uColor: { value: new THREE.Color(P.moon) } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(g, this.dustMat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  // ── 바닥 각인 (디에제틱 튜토리얼) ──
  #buildInscriptions() {
    const ga = TUNING.arena.gateAngle;
    const inDir = new THREE.Vector3(-Math.cos(ga), 0, -Math.sin(ga));  // 입구 → 중앙
    const mk = (lines, dist, w = 6) => {
      const t = makeInscription(lines, 512, 64 * lines.length + 40);
      const mat = new THREE.MeshBasicMaterial({
        map: t, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, opacity: 0.85,
      });
      mat.color.setRGB(0.9, 1.3, 1.9);
      const h = w * ((64 * lines.length + 40) / 512);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.PI;   // 글자 위쪽이 진행 방향(중앙)을 향하도록
      // 게이트 위치에서 중앙 방향으로 dist 만큼 들어온 지점
      m.position.copy(inDir).multiplyScalar(dist - 21.5).setY(0.03);
      m.renderOrder = 2;
      this.group.add(m);
      return m;
    };
    mk(['W A S D — 걷기 · 마우스 — 시선'], 2.2, 7);
    mk(['SPACE — 구르기 (무적) · Q — 주시'], 4.6, 7);
    mk(['좌클릭 — 베기 · 우클릭 꾹 — 강타 · E — 성수'], 7.0, 7.5);
    this.inscriptionFade = 1;
  }

  // ── 부유석 ──
  #buildFloatingStones() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x39404e, roughness: 0.9, envMapIntensity: 0.5 });
    const geom = new THREE.DodecahedronGeometry(0.4, 0);
    this.stones = [];
    const rng = mulberry32(888);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(geom, mat);
      const a = rng() * Math.PI * 2, r = 4.5 + rng() * 3;
      m.position.set(Math.cos(a) * r, 1.6 + rng() * 2.4, Math.sin(a) * r);
      m.scale.setScalar(0.5 + rng() * 0.9);
      m.castShadow = true;
      m.userData = { baseY: m.position.y, ph: rng() * Math.PI * 2, spin: 0.2 + rng() * 0.4 };
      this.group.add(m);
      this.stones.push(m);
    }
  }

  // ── 환경맵 베이크 (PMREM) ──
  bakeEnvironment(renderer) {
    const envScene = new THREE.Scene();
    const grad = new THREE.Mesh(
      new THREE.SphereGeometry(50, 16, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: SKY_VERT,
        fragmentShader: /* glsl */`
          varying vec3 vDir;
          void main() {
            float h = clamp(normalize(vDir).y * 0.5 + 0.5, 0.0, 1.0);
            vec3 c = mix(vec3(0.012, 0.016, 0.03), vec3(0.05, 0.075, 0.13), pow(h, 1.4));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }));
    envScene.add(grad);
    // 달 (강한 청백 발광 쿼드)
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    moon.material.color.setRGB(9, 11, 15);
    moon.position.copy(this.moonDir).multiplyScalar(40);
    moon.lookAt(0, 0, 0);
    envScene.add(moon);
    // 잿불 온기 (바닥 근처 주황 쿼드 2)
    for (const [x, z] of [[10, 8], [-9, -7]]) {
      const warm = new THREE.Mesh(new THREE.PlaneGeometry(8, 3),
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      warm.material.color.setRGB(2.2, 0.8, 0.2);
      warm.position.set(x, -6, z);
      warm.lookAt(0, 0, 0);
      envScene.add(warm);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(envScene, 0.035);
    this.scene.environment = envRT.texture;
    pmrem.dispose();
  }

  // ── 2페이즈: 기둥 붕괴 ──
  collapse() {
    const rng = mulberry32(4242);
    for (const pillar of this.collapsePillars) {
      pillar.visible = false;
      const base = pillar.position;
      for (let k = 0; k < 7; k++) {
        const size = 0.8 + rng() * 1.1;
        const frag = new THREE.Mesh(
          new THREE.BoxGeometry(size, size * (0.6 + rng() * 0.8), size),
          this.pillarMat);
        frag.castShadow = true; frag.receiveShadow = true;
        frag.position.set(base.x + (rng() - 0.5) * 1.2, 2 + k * 1.35, base.z + (rng() - 0.5) * 1.2);
        frag.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        const dir = new THREE.Vector3(base.x, 0, base.z).normalize().negate();
        frag.userData = {
          vel: new THREE.Vector3(dir.x * (1 + rng() * 2.4) + (rng() - 0.5) * 2, 1.5 + rng() * 3, dir.z * (1 + rng() * 2.4) + (rng() - 0.5) * 2),
          angVel: new THREE.Vector3((rng() - 0.5) * 6, (rng() - 0.5) * 6, (rng() - 0.5) * 6),
          rest: 0.45 + rng() * 0.4,
          settled: false,
        };
        this.debrisGroup.add(frag);
        this.debris.push(frag);
      }
    }
    this.collapsePillars.length = 0;
  }

  // ── 페이즈 전환 (0→1 러프) ──
  setPhase(target) { this.phaseTarget = target; }

  #applyPhaseMix() {
    const t = this.phaseMix;
    const A = TUNING.palette.p1, B = TUNING.palette.p2;
    const lerpC = (out, a, b) => out.copy(_lerpA.set(a)).lerp(_lerpB.set(b), t);
    lerpC(this.scene.fog.color, A.fog, B.fog);
    lerpC(this.keyLight.color, A.key, B.key);
    this.keyLight.intensity = A.keyIntensity + (B.keyIntensity - A.keyIntensity) * t;
    lerpC(this.hemi.color, A.hemiSky, B.hemiSky);
    lerpC(this.hemi.groundColor, A.hemiGround, B.hemiGround);
    this.hemi.intensity = A.hemiIntensity + (B.hemiIntensity - A.hemiIntensity) * t;
    lerpC(this.skyUniforms.uZenith.value, A.sky, B.sky);
    lerpC(this.skyUniforms.uHorizon.value, A.horizon, B.horizon);
    lerpC(this.skyUniforms.uMoonColor.value, A.moon, B.moon);
    for (const m of this.godrayMats) lerpC(m.uniforms.uColor.value, A.moon, B.moon);
    lerpC(this.dustMat.uniforms.uColor.value, A.moon, B.moon);
    // 룬은 페이즈 2에서 더 뜨겁게
    const rs = 2.4 + t * 2.2;
    this.runeMat.color.setRGB(rs, 1.1 - t * 0.35, 0.35 - t * 0.1);
  }

  update(rawDt, gameDt, time) {
    this.time = time;
    this.skyUniforms.uTime.value = time;
    this.windUniform.value = time;
    this.dustMat.uniforms.uTime.value = time;
    for (const m of this.godrayMats) m.uniforms.uTime.value = time;

    // 화로 플리커 — 사인파 3개 합성
    for (const b of this.braziers) {
      const f = 0.82
        + 0.1 * Math.sin(time * 9.1 + b.seed * 11)
        + 0.06 * Math.sin(time * 23.7 + b.seed * 5)
        + 0.04 * Math.sin(time * 3.3 + b.seed * 17);
      b.light.intensity = 14 * f * (1 + this.phaseMix * 0.5);
      b.core.scale.setScalar(0.9 + 0.14 * f);
    }

    // 룬 맥동
    this.rune.material.opacity = 0.75 + 0.25 * Math.sin(time * 1.7);

    // 부유석
    for (const s of this.stones) {
      s.position.y = s.userData.baseY + Math.sin(time * 0.5 + s.userData.ph) * 0.3;
      s.rotation.y += s.userData.spin * rawDt;
      s.rotation.x += s.userData.spin * 0.6 * rawDt;
    }

    // 페이즈 러프
    if (this.phaseMix !== this.phaseTarget) {
      const dir = Math.sign(this.phaseTarget - this.phaseMix);
      this.phaseMix = THREE.MathUtils.clamp(this.phaseMix + dir * rawDt * 0.5, 0, 1);
      this.#applyPhaseMix();
    }

    // 붕괴 파편 의사 물리
    for (const f of this.debris) {
      const u = f.userData;
      if (u.settled) continue;
      u.vel.y -= 22 * gameDt;
      f.position.addScaledVector(u.vel, gameDt);
      f.rotation.x += u.angVel.x * gameDt;
      f.rotation.y += u.angVel.y * gameDt;
      f.rotation.z += u.angVel.z * gameDt;
      const groundY = f.geometry.parameters.height / 2 * 0.7;
      if (f.position.y < groundY) {
        f.position.y = groundY;
        if (u.vel.y < -2 && u.rest > 0.1) {
          u.vel.y = -u.vel.y * u.rest;
          u.vel.x *= 0.6; u.vel.z *= 0.6;
          u.rest *= 0.4;
          u.angVel.multiplyScalar(0.5);
        } else {
          u.settled = true;
        }
      }
    }
  }
}
