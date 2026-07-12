// play.html 재생성 — 소스 수정 후 실행: node tools/build-standalone.mjs
// (esbuild를 npx로 내려받아 게임 전체를 단일 IIFE로 번들하고 index.html에 인라인)
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'tools', '.bundle.tmp.js');

execSync(
  `npx -y esbuild src/main.js --bundle --format=iife --alias:three=./lib/three.module.js --minify --outfile=${JSON.stringify(tmp)}`,
  { cwd: root, stdio: 'inherit' });

const html = readFileSync(join(root, 'index.html'), 'utf8');
const bundle = readFileSync(tmp, 'utf8').replace(/<\/script>/g, '<\\/script>');
const out = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script>\n${bundle}\n</script>`);
if (out.includes('src="./src/main.js"')) throw new Error('substitution failed');
writeFileSync(join(root, 'play.html'), out);
rmSync(tmp);
console.log(`play.html: ${(out.length / 1024).toFixed(0)}KB`);
