// ═══════════════════════════════════════════════════════════════════════════
// 렌더 파이프라인 — 언리얼 룩의 뼈대
//   씬(선형 HDR, HalfFloat) → 브라이트패스 → 5레벨 밉 가우시안 블룸(UnrealBloomPass 방식)
//   → 합성(ACES 필믹 톤매핑 + 리프트/감마/게인 그레이딩 + 비네트 + 색수차 + 필름 그레인)
//   → FXAA → 화면
// 렌더타깃에는 three가 톤매핑을 적용하지 않으므로(r185) 전 과정을 수동 제어한다.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { TUNING } from './config.js';

// ── 풀스크린 쿼드 ───────────────────────────────────────────────────────────
class FSQuad {
  constructor(material) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
}

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    float f = smoothstep(uThreshold, uThreshold + 0.55, l);
    gl_FragColor = vec4(c.rgb * f, 1.0);
  }
`;

// 분리형 가우시안 (KERNEL_RADIUS는 define)
const BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  uniform vec2 uTexel;
  varying vec2 vUv;
  float gauss(float x, float sigma) { return exp(-(x * x) / (2.0 * sigma * sigma)); }
  void main() {
    float sigma = float(KERNEL_RADIUS);
    float wsum = gauss(0.0, sigma);
    vec3 sum = texture2D(tDiffuse, vUv).rgb * wsum;
    for (int i = 1; i <= KERNEL_RADIUS; i++) {
      float x = float(i);
      float w = gauss(x, sigma);
      vec2 off = uDirection * uTexel * x;
      sum += (texture2D(tDiffuse, vUv + off).rgb + texture2D(tDiffuse, vUv - off).rgb) * w;
      wsum += 2.0 * w;
    }
    gl_FragColor = vec4(sum / wsum, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tBloom0;
  uniform sampler2D tBloom1;
  uniform sampler2D tBloom2;
  uniform sampler2D tBloom3;
  uniform sampler2D tBloom4;
  uniform float uBloomStrength;
  uniform float uBloomRadius;
  uniform float uExposure;
  uniform float uTime;
  uniform float uGrain;
  uniform float uVignette;
  uniform float uChroma;        // px 단위
  uniform vec2 uResolution;
  uniform float uHurt;          // 피격 적색 맥동 0..1
  uniform float uFade;          // 암전 0..1
  uniform float uChromaBoost;   // 연출용 색수차 증폭
  uniform vec3 uLift;
  uniform vec3 uGamma;
  uniform vec3 uGain;
  varying vec2 vUv;

  // ACES 필믹 (Stephen Hill fit — three.js와 동일)
  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 ACESFilmic(vec3 color) {
    const mat3 IN = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602));
    color = IN * (color * (uExposure / 0.6));
    color = RRTAndODTFit(color);
    return clamp(OUT * color, 0.0, 1.0);
  }

  float lerpFactor(float f) { return mix(f, 1.2 - f, uBloomRadius); }

  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }

  void main() {
    vec2 uv = vUv;
    vec2 fromCenter = uv - 0.5;
    float r2 = dot(fromCenter, fromCenter);

    // 방사형 색수차 (가장자리에서만)
    float ca = (uChroma * (1.0 + uChromaBoost * 6.0)) / uResolution.x * r2 * 4.0;
    vec2 dir = normalize(fromCenter + 1e-6);
    vec3 scene;
    scene.r = texture2D(tScene, uv - dir * ca).r;
    scene.g = texture2D(tScene, uv).g;
    scene.b = texture2D(tScene, uv + dir * ca).b;

    // 블룸 합성 (UnrealBloomPass 가중)
    vec3 bloom =
      lerpFactor(1.0) * texture2D(tBloom0, uv).rgb +
      lerpFactor(0.8) * texture2D(tBloom1, uv).rgb +
      lerpFactor(0.6) * texture2D(tBloom2, uv).rgb +
      lerpFactor(0.4) * texture2D(tBloom3, uv).rgb +
      lerpFactor(0.2) * texture2D(tBloom4, uv).rgb;
    vec3 hdr = scene + bloom * uBloomStrength;

    // 톤매핑 → LDR
    vec3 c = ACESFilmic(hdr);

    // 리프트/감마/게인 그레이딩
    c = pow(max(c * uGain + uLift, vec3(0.0)), 1.0 / uGamma);

    // 비네트 (+ 피격 적색 맥동)
    float vig = smoothstep(0.9, 0.25, r2 * (1.0 + uVignette));
    c *= mix(1.0 - uVignette * 0.65, 1.0, vig);
    c = mix(c, vec3(0.45, 0.02, 0.02), (1.0 - vig) * uHurt * 0.85);

    // 필름 그레인 (시간 시드)
    float g = hash(uv * uResolution.xy * 0.5 + fract(uTime * 13.7) * 511.0) - 0.5;
    c += g * uGrain * (0.4 + 0.6 * (1.0 - dot(c, vec3(0.333))));

    // 암전
    c *= 1.0 - uFade;

    // sRGB 인코딩
    c = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(c, 1.0);
  }
`;

// FXAA 3.11 간이판 — sRGB LDR 입력
const FXAA_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  varying vec2 vUv;
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  void main() {
    vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    vec3 rgbNE = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    vec3 rgbSE = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    vec3 rgbM = texture2D(tDiffuse, vUv).rgb;
    float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
    float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, -8.0, 8.0) * uTexel;
    vec3 rgbA = 0.5 * (
      texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture2D(tDiffuse, vUv + dir * -0.5).rgb +
      texture2D(tDiffuse, vUv + dir * 0.5).rgb);
    float lB = luma(rgbB);
    gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
  }
`;

const MIPS = 5;
const KERNELS = [3, 5, 7, 9, 11];

export class Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    const R = TUNING.render;

    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      samples: 0,
    });
    this.ldrRT = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.brightRT = this.#hdrRT();
    this.blurA = []; this.blurB = [];
    for (let i = 0; i < MIPS; i++) { this.blurA.push(this.#hdrRT()); this.blurB.push(this.#hdrRT()); }

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: R.bloom.threshold } },
    });
    this.blurMats = KERNELS.map(k => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
      defines: { KERNEL_RADIUS: k },
      uniforms: { tDiffuse: { value: null }, uDirection: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2() } },
    }));
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tBloom0: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
        tBloom3: { value: null }, tBloom4: { value: null },
        uBloomStrength: { value: R.bloom.strength },
        uBloomRadius: { value: R.bloom.radius },
        uExposure: { value: R.exposure },
        uTime: { value: 0 },
        uGrain: { value: R.grain },
        uVignette: { value: R.vignette },
        uChroma: { value: R.chroma },
        uChromaBoost: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uHurt: { value: 0 },
        uFade: { value: 1 },
        uLift: { value: new THREE.Vector3(0.012, 0.016, 0.032) },   // 그림자에 남색
        uGamma: { value: new THREE.Vector3(1.0, 1.0, 1.02) },
        uGain: { value: new THREE.Vector3(1.02, 1.0, 0.98) },       // 하이라이트 온색
      },
    });
    this.fxaaMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FXAA_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
    });

    this.quad = new FSQuad(this.brightMat);
    this.fxaaOn = true;
    this.bloomOn = true;
  }

  #hdrRT() {
    return new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  setSize(w, h, pixelRatio) {
    const pw = Math.floor(w * pixelRatio), ph = Math.floor(h * pixelRatio);
    this.sceneRT.setSize(pw, ph);
    this.ldrRT.setSize(pw, ph);
    let bw = Math.max(4, pw >> 1), bh = Math.max(4, ph >> 1);
    this.brightRT.setSize(bw, bh);
    for (let i = 0; i < MIPS; i++) {
      this.blurA[i].setSize(Math.max(4, bw), Math.max(4, bh));
      this.blurB[i].setSize(Math.max(4, bw), Math.max(4, bh));
      bw = Math.max(4, bw >> 1); bh = Math.max(4, bh >> 1);
    }
    this.compMat.uniforms.uResolution.value.set(pw, ph);
    this.fxaaMat.uniforms.uTexel.value.set(1 / pw, 1 / ph);
  }

  render(scene, camera, rawTime) {
    const r = this.renderer;
    const prevTone = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;

    // 1) 씬 → 선형 HDR
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    // 디버그 통계는 씬 패스 기준으로 (이후 풀스크린 패스들이 info를 덮어씀)
    this.sceneCalls = r.info.render.calls;
    this.sceneTris = r.info.render.triangles;

    // 2) 블룸 체인
    if (this.bloomOn) {
      this.quad.mesh.material = this.brightMat;
      this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.quad.render(r, this.brightRT);

      let input = this.brightRT;
      for (let i = 0; i < MIPS; i++) {
        const mat = this.blurMats[i];
        this.quad.mesh.material = mat;
        mat.uniforms.uTexel.value.set(1 / this.blurA[i].width, 1 / this.blurA[i].height);
        mat.uniforms.tDiffuse.value = input.texture;
        mat.uniforms.uDirection.value.set(1, 0);
        this.quad.render(r, this.blurA[i]);
        mat.uniforms.tDiffuse.value = this.blurA[i].texture;
        mat.uniforms.uDirection.value.set(0, 1);
        this.quad.render(r, this.blurB[i]);
        input = this.blurB[i];
      }
    }

    // 3) 합성 (톤매핑 + 그레이딩 + 비네트 + 색수차 + 그레인)
    const cu = this.compMat.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    for (let i = 0; i < MIPS; i++) {
      cu['tBloom' + i].value = this.bloomOn ? this.blurB[i].texture : null;
    }
    cu.uBloomStrength.value = this.bloomOn ? TUNING.render.bloom.strength : 0;
    cu.uTime.value = rawTime;
    this.quad.mesh.material = this.compMat;

    if (this.fxaaOn) {
      this.quad.render(r, this.ldrRT);
      this.quad.mesh.material = this.fxaaMat;
      this.fxaaMat.uniforms.tDiffuse.value = this.ldrRT.texture;
      this.quad.render(r, null);
    } else {
      this.quad.render(r, null);
    }

    r.setRenderTarget(null);
    r.toneMapping = prevTone;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 높이 안개 — 모든 표준 머티리얼의 fog 청크에 주입 (탈락 컨셉 이식 아이디어)
// 바닥에 깔리는 저고도 안개로 FogExp2 단독보다 볼류메트릭한 인상
// ═══════════════════════════════════════════════════════════════════════════
export const heightFogUniforms = {
  uHFStrength: { value: TUNING.render.heightFogStrength },
  uHFFalloff: { value: TUNING.render.heightFogFalloff },
};

export function enableHeightFog(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, rendererArg) => {
    if (prev) prev(shader, rendererArg);
    shader.uniforms.uHFStrength = heightFogUniforms.uHFStrength;
    shader.uniforms.uHFFalloff = heightFogUniforms.uHFFalloff;
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying float vHFogY;\n#endif')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
#ifdef USE_FOG
  #ifdef USE_INSTANCING
    vec4 hfWorld = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
  #else
    vec4 hfWorld = modelMatrix * vec4( transformed, 1.0 );
  #endif
  vHFogY = hfWorld.y;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n#ifdef USE_FOG\nvarying float vHFogY;\nuniform float uHFStrength;\nuniform float uHFFalloff;\n#endif')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float hfDensity = fogDensity * ( 1.0 + uHFStrength * exp( - max( vHFogY, 0.0 ) * uHFFalloff ) );
    float hfFactor = 1.0 - exp( - hfDensity * hfDensity * vFogDepth * vFogDepth );
  #else
    float hfFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, clamp( hfFactor, 0.0, 1.0 ) );
#endif`);
  };
  // onBeforeCompile 변경은 프로그램 캐시 키에 반영되어야 함
  material.customProgramCacheKey = () => 'heightFog1';
  return material;
}

// ═══════════════════════════════════════════════════════════════════════════
// WebGL 렌더러 + 품질 자동 조정
// ═══════════════════════════════════════════════════════════════════════════
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,               // AA는 FXAA 패스
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;   // 합성 셰이더에서 ACES 수동 적용
  renderer.autoClear = true;
  return renderer;
}

export class QualityGovernor {
  constructor(pipeline, renderer, onTierChange) {
    this.pipeline = pipeline;
    this.renderer = renderer;
    this.onTierChange = onTierChange;
    this.tier = 0;             // 0 최고 → 2 최저
    this.ema = 1 / 60;
    this.cooldown = 4;         // 시작 유예
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, TUNING.render.pixelRatioCap);
  }
  update(rawDelta) {
    if (rawDelta <= 0 || rawDelta > 0.5) return;   // 일시정지/탭 전환 스파이크 무시
    this.ema += (rawDelta - this.ema) * 0.05;
    this.cooldown -= rawDelta;
    if (this.cooldown > 0) return;
    if (this.ema > 1 / 42 && this.tier < 2) {
      this.tier++;
      this.cooldown = 5;
      this.#apply();
    } else if (this.ema < 1 / 58 && this.tier > 0) {
      this.tier--;
      this.cooldown = 8;
      this.#apply();
    }
  }
  #apply() {
    const t = this.tier;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1,
      t === 0 ? TUNING.render.pixelRatioCap : t === 1 ? 1.15 : 0.85);
    this.pipeline.fxaaOn = t < 2;
    if (this.onTierChange) this.onTierChange(t);
  }
}
