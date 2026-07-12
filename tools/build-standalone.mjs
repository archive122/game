// play.html 재생성 — 소스 수정 후 실행: node tools/build-standalone.mjs
// (esbuild로 게임 전체를 단일 IIFE로 번들하고, assets/를 data URI로 내장해 index.html에 인라인)
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'tools', '.bundle.tmp.js');

execSync(
  `npx -y esbuild src/main.js --bundle --format=iife --alias:three=./lib/three.module.js --minify --outfile=${JSON.stringify(tmp)}`,
  { cwd: root, stdio: 'inherit' });

// assets/ → data URI 매니페스트 (file://·아티팩트에서 네트워크 없이 동작)
const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream' };
const manifest = {};
for (const f of readdirSync(join(root, 'assets'))) {
  const mime = MIME[extname(f)];
  if (!mime) continue;
  manifest[f] = `data:${mime};base64,${readFileSync(join(root, 'assets', f)).toString('base64')}`;
}
const assetScript = `<script>window.__EMBEDDED_ASSETS=${JSON.stringify(manifest)};</script>`;

const html = readFileSync(join(root, 'index.html'), 'utf8');
const bundle = readFileSync(tmp, 'utf8').replace(/<\/script>/g, '<\\/script>');
const out = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace('<script type="module" src="./src/main.js"></script>',
    () => `${assetScript}\n<script>\n${bundle}\n</script>`);
if (out.includes('src="./src/main.js"')) throw new Error('substitution failed');
writeFileSync(join(root, 'play.html'), out);
rmSync(tmp);
console.log(`play.html: ${(out.length / 1024 / 1024).toFixed(1)}MB (에셋 ${Object.keys(manifest).length}개 내장)`);
