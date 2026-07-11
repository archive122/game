// ═══════════════════════════════════════════════════════════════════════════
// 절차적 텍스처 — 전부 Canvas 2D로 생성 (외부 에셋 0)
// 3원소: 펄린류 fBm 노이즈 / 랜덤 워크 균열 / 그라디언트
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

// 시드 RNG (결정적 생성)
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 값 노이즈 + fBm ─────────────────────────────────────────────────────────
const VN_SIZE = 64;
const vnGrid = new Float32Array(VN_SIZE * VN_SIZE);
{
  const r = mulberry32(773311);
  for (let i = 0; i < vnGrid.length; i++) vnGrid[i] = r();
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const g = (ix, iy) => vnGrid[((iy % VN_SIZE + VN_SIZE) % VN_SIZE) * VN_SIZE + ((ix % VN_SIZE + VN_SIZE) % VN_SIZE)];
  const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.03; }
  return v;
}

function canvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}

// 높이맵 캔버스 → 노멀맵 (소벨)
function normalFromHeight(hc, strength = 2.0) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [nc, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const hAt = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (hAt(x - 1, y - 1) + 2 * hAt(x - 1, y) + hAt(x - 1, y + 1))
               - (hAt(x + 1, y - 1) + 2 * hAt(x + 1, y) + hAt(x + 1, y + 1));
      const dy = (hAt(x - 1, y - 1) + 2 * hAt(x, y - 1) + hAt(x + 1, y - 1))
               - (hAt(x - 1, y + 1) + 2 * hAt(x, y + 1) + hAt(x + 1, y + 1));
      let nx = dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      out.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return nc;
}

// 랜덤 워크 균열 드로잉
function drawCracks(ctx, rng, w, h, count, color, maxWidth = 2.2) {
  for (let i = 0; i < count; i++) {
    let x = rng() * w, y = rng() * h;
    let ang = rng() * Math.PI * 2;
    const steps = 24 + rng() * 60;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6 + rng() * maxWidth;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      ang += (rng() - 0.5) * 0.9;
      const step = 2 + rng() * 6;
      x += Math.cos(ang) * step; y += Math.sin(ang) * step;
      ctx.lineTo(x, y);
      if (rng() < 0.08) { // 분기
        const bx = x, by = y, bang = ang + (rng() - 0.5) * 2;
        let px = bx, py = by;
        ctx.moveTo(bx, by);
        for (let b = 0; b < 10; b++) {
          px += Math.cos(bang) * 3; py += Math.sin(bang) * 3;
          ctx.lineTo(px, py);
        }
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 석판 바닥 — albedo / roughness / normal
// ═══════════════════════════════════════════════════════════════════════════
export function makeFloorMaps() {
  const S = 1024;
  const rng = mulberry32(41207);
  const [ac, a] = canvas(S);
  const [hc, hctx] = canvas(S);
  const [rc, r] = canvas(S);

  // 기저 석재
  a.fillStyle = '#434a56'; a.fillRect(0, 0, S, S);
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, S, S);
  r.fillStyle = '#cfcfcf'; r.fillRect(0, 0, S, S);       // 기본 거칠기 0.81

  // 노이즈 얼룩 (albedo 명암 + roughness 젖은 부분)
  const img = a.getImageData(0, 0, S, S);
  const rimg = r.getImageData(0, 0, S, S);
  const himg = hctx.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(x / 90, y / 90, 5);
      const n2 = fbm(x / 260 + 31, y / 260 + 17, 4);
      const i = (y * S + x) * 4;
      const shade = 0.72 + n * 0.55;
      img.data[i] *= shade; img.data[i + 1] *= shade; img.data[i + 2] *= shade * 1.04;
      // 젖은 웅덩이: n2 낮은 곳 → roughness 급감 (달빛 반사)
      const wet = Math.max(0, 0.46 - n2) * 3.0;
      const rough = Math.max(88, 207 - wet * 200 - n * 30);
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = 108 + n * 90;
    }
  }
  a.putImageData(img, 0, 0);
  r.putImageData(rimg, 0, 0);
  hctx.putImageData(himg, 0, 0);

  // 석판 줄눈 (격자 + 지터)
  const tile = 128;
  a.strokeStyle = 'rgba(10,12,16,0.85)'; a.lineWidth = 5;
  hctx.strokeStyle = 'rgba(30,30,30,1)'; hctx.lineWidth = 6;
  for (let gy = 0; gy <= S; gy += tile) {
    const off = (((gy / tile) | 0) % 2) * tile * 0.5;
    a.beginPath(); hctx.beginPath();
    a.moveTo(0, gy + rng() * 4); hctx.moveTo(0, gy);
    a.lineTo(S, gy + rng() * 4); hctx.lineTo(S, gy);
    a.stroke(); hctx.stroke();
    for (let gx = off; gx <= S; gx += tile) {
      a.beginPath(); hctx.beginPath();
      a.moveTo(gx + rng() * 4, gy); hctx.moveTo(gx, gy);
      a.lineTo(gx + rng() * 4, gy + tile); hctx.lineTo(gx, gy + tile);
      a.stroke(); hctx.stroke();
    }
  }

  // 균열
  drawCracks(a, mulberry32(99173), S, S, 13, 'rgba(14,16,21,0.42)', 1.3);
  drawCracks(hctx, mulberry32(99173), S, S, 13, 'rgba(40,40,40,0.7)', 1.3);

  // 그을음 (전투의 흔적)
  for (let i = 0; i < 14; i++) {
    const x = rng() * S, y = rng() * S, rad = 30 + rng() * 90;
    const g = a.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(12,8,6,0.5)'); g.addColorStop(1, 'rgba(12,8,6,0)');
    a.fillStyle = g; a.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  return {
    map: tex(ac, { repeat: [5, 5] }),
    roughnessMap: tex(rc, { srgb: false, repeat: [5, 5] }),
    normalMap: tex(normalFromHeight(hc, 1.6), { srgb: false, repeat: [5, 5] }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 기둥 — 세로 홈(플루트) 석재
// ═══════════════════════════════════════════════════════════════════════════
export function makePillarMaps() {
  const W = 512, H = 512;
  const rng = mulberry32(55021);
  const [ac, a] = canvas(W, H);
  const [hc, hctx] = canvas(W, H);

  a.fillStyle = '#4d5461'; a.fillRect(0, 0, W, H);
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, W, H);

  const img = a.getImageData(0, 0, W, H);
  const himg = hctx.getImageData(0, 0, W, H);
  const flutes = 12;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = fbm(x / 60 + 7, y / 60, 4);
      // 세로 홈: 코사인 파형
      const f = Math.cos((x / W) * Math.PI * 2 * flutes);
      const height = 128 + f * 46 + (n - 0.5) * 40;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = Math.max(0, Math.min(255, height));
      const shade = 0.78 + n * 0.42 + f * 0.05;
      img.data[i] *= shade; img.data[i + 1] *= shade; img.data[i + 2] *= shade * 1.03;
    }
  }
  a.putImageData(img, 0, 0);
  hctx.putImageData(himg, 0, 0);
  drawCracks(a, mulberry32(2210), W, H, 10, 'rgba(14,15,20,0.65)');
  drawCracks(hctx, mulberry32(2210), W, H, 10, 'rgba(40,40,40,0.9)');

  return {
    map: tex(ac, { repeat: [1, 2] }),
    normalMap: tex(normalFromHeight(hc, 2.2), { srgb: false, repeat: [1, 2] }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 보스 균열 피부 — albedo + emissive(균열이 빛남)
// ═══════════════════════════════════════════════════════════════════════════
export function makeBossMaps() {
  const S = 512;
  const rng = mulberry32(80217);
  const [ac, a] = canvas(S);
  const [ec, e] = canvas(S);

  a.fillStyle = '#3a3f4a'; a.fillRect(0, 0, S, S);
  e.fillStyle = '#000000'; e.fillRect(0, 0, S, S);

  const img = a.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(x / 70 + 3, y / 70 + 9, 5);
      const i = (y * S + x) * 4;
      const shade = 0.7 + n * 0.5;
      img.data[i] *= shade; img.data[i + 1] *= shade; img.data[i + 2] *= shade;
    }
  }
  a.putImageData(img, 0, 0);

  // 균열: albedo에는 어둡게, emissive에는 뜨겁게 (같은 시드 → 정렬)
  drawCracks(a, mulberry32(31337), S, S, 8, 'rgba(10,6,4,0.85)', 2.4);
  e.lineCap = 'round';
  // 발광 균열 — 심지(백황) + 광륜(주황)
  const glowPass = (color, wmul, blur) => {
    e.save();
    e.filter = blur ? `blur(${blur}px)` : 'none';
    drawCracks(e, mulberry32(31337), S, S, 8, color, 2.4 * wmul);
    e.restore();
  };
  glowPass('rgba(255,80,20,0.5)', 2.4, 4);
  glowPass('rgba(255,120,40,0.9)', 1.1, 1);
  glowPass('rgba(255,220,170,1)', 0.45, 0);

  return {
    map: tex(ac, { repeat: [1, 1] }),
    emissiveMap: tex(ec, { repeat: [1, 1] }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 룬 마법진 (제단) — emissive 링
// ═══════════════════════════════════════════════════════════════════════════
export function makeRuneRing() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(60305);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = 'rgba(255,150,60,0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, S * 0.44, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, S * 0.335, 0, Math.PI * 2); ctx.stroke();
  // 룬 문자: 랜덤 획 글리프 24개
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const r0 = S * 0.36, gs = S * 0.028;
    const cx = Math.cos(ang) * (r0 + gs * 1.3), cy = Math.sin(ang) * (r0 + gs * 1.3);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath();
    let px = (rng() - 0.5) * gs, py = -gs;
    ctx.moveTo(px, py);
    for (let s = 0; s < 5; s++) {
      px = (rng() - 0.5) * gs * 1.6; py = -gs + (s + 1) * (gs * 2 / 5);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  // 내부 육망성풍 기하
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + (i * Math.PI) / 6;
      const x = Math.cos(ang) * S * 0.30, y = Math.sin(ang) * S * 0.30;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return tex(c);
}

// ═══════════════════════════════════════════════════════════════════════════
// 찢어진 배너 — 알파 포함
// ═══════════════════════════════════════════════════════════════════════════
export function makeBannerMap() {
  const W = 256, H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(17603);
  ctx.clearRect(0, 0, W, H);
  // 몸체
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = fbm(x / 50, y / 50 + 40, 4);
      // 아래로 갈수록 찢김: 노이즈 문턱
      const tear = y / H > 0.55 + fbm(x / 24, 77, 3) * 0.45;
      const hole = fbm(x / 18 + 9, y / 18, 3) > 0.72 && y / H > 0.35;
      img.data[i] = 46 + n * 26;       // 어두운 진홍 천
      img.data[i + 1] = 14 + n * 10;
      img.data[i + 2] = 16 + n * 12;
      img.data[i + 3] = tear || hole ? 0 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 문장(紋章): 검 실루엣
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(190,170,140,0.85)';
  ctx.save();
  ctx.translate(W / 2, H * 0.3);
  ctx.beginPath();
  ctx.moveTo(0, -70); ctx.lineTo(9, -40); ctx.lineTo(9, 40); ctx.lineTo(0, 62);
  ctx.lineTo(-9, 40); ctx.lineTo(-9, -40); ctx.closePath(); ctx.fill();
  ctx.fillRect(-30, -46, 60, 10);
  ctx.restore();
  const t = tex(c);
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════
// 바닥 각인 — 디에제틱 한국어 튜토리얼 텍스트
// ═══════════════════════════════════════════════════════════════════════════
export function makeInscription(lines, w = 512, h = 160) {
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = h / (lines.length + 0.4);
  lines.forEach((line, i) => {
    const y = lh * (i + 0.7);
    ctx.font = `600 ${Math.floor(lh * 0.62)}px 'Noto Sans KR', sans-serif`;
    ctx.shadowColor = 'rgba(160,210,255,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(200,230,255,0.95)';
    ctx.fillText(line, w / 2, y);
    ctx.shadowBlur = 0;
  });
  const t = tex(c);
  return t;
}

// 데칼용 링/원 텍스처 (텔레그래프)
export function makeDecalTex() {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2;
  // 외곽 링
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, cx, S * 0.46, 0, Math.PI * 2); ctx.stroke();
  // 내부 방사 그라디언트
  const g = ctx.createRadialGradient(cx, cx, S * 0.05, cx, cx, S * 0.46);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0.5)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cx, S * 0.46, 0, Math.PI * 2); ctx.fill();
  return tex(c);
}

// 부드러운 원형 스프라이트 (파티클)
export function makeSoftDot() {
  const S = 64;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return tex(c);
}
