// ═══════════════════════════════════════════════════════════════════════════
// 외부 에셋 로더 — CC0 텍스처/HDRI/스프라이트 (출처: ATTRIBUTION.md)
//   · 서빙 모드: ./assets/* 상대 경로
//   · 스탠드얼론/아티팩트: build-standalone이 주입한 window.__EMBEDDED_ASSETS(data URI)
//   · 로드 실패 시에도 게임은 절차적 텍스처 폴백으로 그대로 동작한다
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { HDRLoader } from '../lib/HDRLoader.js';

const FILES = {
  // PBR (ambientCG, CC0)
  floorColor: { f: 'floor_color.jpg', srgb: true },
  floorNormal: { f: 'floor_normal.jpg' },
  floorRough: { f: 'floor_rough.jpg' },
  rockColor: { f: 'rock_color.jpg', srgb: true },
  rockNormal: { f: 'rock_normal.jpg' },
  rockRough: { f: 'rock_rough.jpg' },
  // 파티클 스프라이트 (Kenney Particle Pack, CC0)
  flameTall: { f: 'flame_03.png', srgb: true },
  flamePuff: { f: 'flame_05.png', srgb: true },
  smoke: { f: 'smoke_07.png', srgb: true },
  spark: { f: 'spark_06.png', srgb: true },
  star: { f: 'star_07.png', srgb: true },
  muzzle: { f: 'muzzle_02.png', srgb: true },
  scorch: { f: 'scorch_02.png', srgb: true },
  magic: { f: 'magic_05.png', srgb: true },
  twirl: { f: 'twirl_02.png', srgb: true },
  glow: { f: 'light_01.png', srgb: true },
  dirt: { f: 'dirt_02.png', srgb: true },
};
const HDR_FILE = 'night.hdr';   // Poly Haven dikhololo_night 1k (CC0)

export function assetURL(file) {
  const embedded = typeof window !== 'undefined' && window.__EMBEDDED_ASSETS;
  return (embedded && embedded[file]) || ('./assets/' + file);
}

// 로드 결과 컨테이너 — ready 이후 tex.*, hdr 사용 가능
export const ASSETS = { ready: false, failed: false, tex: {}, hdr: null };

export function loadAssets(onProgress) {
  const texLoader = new THREE.TextureLoader();
  const total = Object.keys(FILES).length + 1;
  let done = 0;
  const tick = () => { done++; onProgress?.(done / total); };

  const jobs = Object.entries(FILES).map(([key, spec]) =>
    new Promise((resolve) => {
      texLoader.load(assetURL(spec.f), (t) => {
        if (spec.srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        ASSETS.tex[key] = t;
        tick(); resolve(true);
      }, undefined, () => { tick(); resolve(false); });
    }));

  jobs.push(new Promise((resolve) => {
    new HDRLoader().load(assetURL(HDR_FILE), (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      ASSETS.hdr = t;
      tick(); resolve(true);
    }, undefined, () => { tick(); resolve(false); });
  }));

  return Promise.all(jobs).then((results) => {
    ASSETS.ready = results.every(Boolean);
    ASSETS.failed = !ASSETS.ready;
    return ASSETS;
  });
}

// 타일링 설정 헬퍼 (같은 텍스처를 다른 반복률로 쓰는 곳이 있어 복제)
export function repeatOf(tex, rx, ry) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
