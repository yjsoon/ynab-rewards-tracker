import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const BASE = process.env.DASHBOARD_VISUAL_OUT
  ?? join(ROOT, 'apps/mobile/visual-baselines');

function loadPng(path) {
  return PNG.sync.read(readFileSync(path));
}

function resizeTo(source, width, height) {
  const dest = new PNG({ width, height });
  dest.data.fill(255);
  const copyWidth = Math.min(source.width, width);
  const copyHeight = Math.min(source.height, height);
  for (let y = 0; y < copyHeight; y += 1) {
    const srcStart = y * source.width * 4;
    const destStart = y * width * 4;
    dest.data.set(
      source.data.subarray(srcStart, srcStart + copyWidth * 4),
      destStart,
    );
  }
  return dest;
}

function diffPair(leftPath, rightPath, outPath) {
  const left = loadPng(leftPath);
  const right = loadPng(rightPath);
  const width = Math.max(left.width, right.width);
  const height = Math.max(left.height, right.height);
  const a = left.width === width && left.height === height ? left : resizeTo(left, width, height);
  const b = right.width === width && right.height === height ? right : resizeTo(right, width, height);
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, PNG.sync.write(diff));
  const total = width * height;
  return {
    leftPath,
    rightPath,
    outPath,
    width,
    height,
    mismatched,
    ratio: Number((mismatched / total).toFixed(4)),
  };
}

const results = [
  diffPair(
    join(BASE, 'web-featured-full.png'),
    join(BASE, 'ios-overview-full.png'),
    join(BASE, 'diff-web-vs-ios.png'),
  ),
];

writeFileSync(join(BASE, 'diff-report.json'), `${JSON.stringify(results, null, 2)}\n`);
for (const result of results) {
  process.stdout.write(
    `${result.mismatched} / ${result.width * result.height} pixels (${result.ratio}) ${result.outPath}\n`,
  );
}
