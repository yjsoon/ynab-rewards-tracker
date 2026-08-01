#!/usr/bin/env node
/**
 * Regenerate every raster app icon from the master vector.
 *
 * Source of truth: design/brand/icon.svg
 * Outputs:
 *   apps/web/public/favicon-16.png        16x16
 *   apps/web/public/favicon.png           32x32
 *   apps/web/public/apple-touch-icon.png  180x180
 *   apps/web/public/icon-192.png          192x192
 *   apps/web/public/icon-512.png          512x512
 *   apps/mobile/assets/icon.png           1024x1024
 *
 * Uses headless Chromium (its SVG rasteriser) via a canvas page and
 * --dump-dom, so no native image dependencies are needed. Chromium is
 * located via $CHROMIUM_BIN or common install paths.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER_SVG = join(repoRoot, 'design/brand/icon.svg');

const OUTPUTS = [
  { size: 16, path: 'apps/web/public/favicon-16.png' },
  { size: 32, path: 'apps/web/public/favicon.png' },
  { size: 180, path: 'apps/web/public/apple-touch-icon.png' },
  { size: 192, path: 'apps/web/public/icon-192.png' },
  { size: 512, path: 'apps/web/public/icon-512.png' },
  { size: 1024, path: 'apps/mobile/assets/icon.png' },
];

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_BIN,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chromium = CHROMIUM_CANDIDATES.find((p) => existsSync(p));
if (!chromium) {
  console.error(
    'No Chromium binary found. Set CHROMIUM_BIN to a Chrome/Chromium executable.'
  );
  process.exit(1);
}

const svgB64 = Buffer.from(readFileSync(MASTER_SVG, 'utf8')).toString('base64');
const sizes = OUTPUTS.map((o) => o.size);

const page = `<!doctype html><html><body><script>
const img = new Image();
img.onerror = () => { document.body.textContent = 'IMG_ERROR'; };
img.onload = () => {
  try {
    const out = {};
    for (const s of ${JSON.stringify(sizes)}) {
      const c = document.createElement('canvas');
      c.width = s; c.height = s;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, s, s);
      out[s] = c.toDataURL('image/png');
    }
    document.body.textContent = JSON.stringify(out);
  } catch (e) { document.body.textContent = 'ERR:' + e.message; }
};
img.src = 'data:image/svg+xml;base64,${svgB64}';
</script></body></html>`;

const workDir = mkdtempSync(join(tmpdir(), 'gen-icons-'));
try {
  const pagePath = join(workDir, 'render.html');
  writeFileSync(pagePath, page);

  const dom = execFileSync(
    chromium,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--dump-dom',
      '--virtual-time-budget=10000',
      `file://${pagePath}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );

  const bodyMatch = dom.match(/<body>(.*)<\/body>/s);
  const text = (bodyMatch?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  if (!text.startsWith('{')) {
    throw new Error(`Chromium render failed: ${text.slice(0, 200) || 'empty output'}`);
  }
  const rendered = JSON.parse(text);

  for (const { size, path } of OUTPUTS) {
    const dataUrl = rendered[size];
    if (!dataUrl) throw new Error(`No render produced for ${size}px`);
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const outPath = join(repoRoot, path);
    writeFileSync(outPath, png);
    console.log(`${path}  ${size}x${size}  ${png.length} bytes`);
  }
  console.log('All icons regenerated from design/brand/icon.svg');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
