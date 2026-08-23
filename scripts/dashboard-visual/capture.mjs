import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED = join(HERE, 'generated');
const OUT_DIR = process.env.DASHBOARD_VISUAL_OUT
  ?? join(ROOT, 'apps/mobile/visual-baselines');
const CHROME = process.env.CHROME_PATH
  ?? '/usr/local/bin/google-chrome';
const WEB_PORT = Number(process.env.DASHBOARD_VISUAL_WEB_PORT ?? 3101);
const MOBILE_PORT = Number(process.env.DASHBOARD_VISUAL_MOBILE_PORT ?? 8082);
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 1 };
const REFERENCE_MS = Date.UTC(2026, 6, 31, 12, 0, 0);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs, { html = false } = {}) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: html
          ? { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' }
          : undefined,
      });
      const type = response.headers.get('content-type') ?? '';
      if (response.status < 500 && (!html || type.includes('text/html'))) {
        return;
      }
      lastError = `HTTP ${response.status} ${type}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function isServerReady(url, { html = false } = {}) {
  try {
    await waitForUrl(url, 1500, { html });
    return true;
  } catch {
    return false;
  }
}

function startProcess(command, args, env, name) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      process.stderr.write(`[${name}] exited ${code} ${signal ?? ''}\n`);
    }
  });
  return child;
}

async function freezeClock(page) {
  await page.emulateTimezone('UTC');
  await page.evaluateOnNewDocument((frozenMs) => {
    const RealDate = Date;
    const FrozenDate = function Date(...args) {
      if (args.length === 0) {
        return new RealDate(frozenMs);
      }
      return new RealDate(...args);
    };
    FrozenDate.now = () => frozenMs;
    FrozenDate.parse = RealDate.parse.bind(RealDate);
    FrozenDate.UTC = RealDate.UTC.bind(RealDate);
    FrozenDate.prototype = RealDate.prototype;
    globalThis.Date = FrozenDate;
  }, REFERENCE_MS);
}

async function seedWebStorage(page, storageMap) {
  await page.evaluateOnNewDocument((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      );
    }
  }, storageMap);
}

async function stubYnabProxy(page, stub) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/api/ynab/')) {
      void request.continue();
      return;
    }
    if (url.includes('/accounts')) {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accounts: stub.accounts ?? [] } }),
      });
      return;
    }
    if (url.includes('/transactions')) {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { transactions: stub.transactions ?? [] } }),
      });
      return;
    }
    if (url.includes('/budgets') || url.includes('/plans')) {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { budgets: stub.budgets ?? [], plans: stub.budgets ?? [] } }),
      });
      return;
    }
    void request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}

async function waitForText(page, text, timeoutMs = 20000) {
  try {
    await page.waitForFunction(
      (needle) => document.body?.innerText?.includes(needle),
      { timeout: timeoutMs },
      text,
    );
  } catch (error) {
    const body = await page.evaluate(() => document.body?.innerText ?? '');
    const html = await page.evaluate(() => document.documentElement?.outerHTML?.slice(0, 4000) ?? '');
    throw new Error(
      `${error instanceof Error ? error.message : error}\nURL ${page.url()}\nTEXT\n${body}\nHTML\n${html}`,
    );
  }
}

async function captureWeb(browser, storageMap, stub) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await freezeClock(page);
  await seedWebStorage(page, storageMap);
  await stubYnabProxy(page, stub);
  await page.goto(`http://127.0.0.1:${WEB_PORT}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await waitForText(page, 'DEMO · Ember Everyday');
  await page.waitForFunction(
    () => /Spent \$[1-9]/.test(document.body?.innerText ?? ''),
    { timeout: 20000 },
  );
  await page.evaluate(() => document.fonts?.ready);
  await sleep(500);
  mkdirSync(OUT_DIR, { recursive: true });
  const fullPath = join(OUT_DIR, 'web-featured-full.png');
  const mainPath = join(OUT_DIR, 'web-featured-main.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  const main = await page.$('main');
  if (main) {
    await main.screenshot({ path: mainPath });
  }
  await page.close();
  return { fullPath, mainPath };
}

async function captureMobile(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await freezeClock(page);
  await page.goto(`http://127.0.0.1:${MOBILE_PORT}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await waitForText(page, 'DEMO · Ember Everyday', 90000);
  await sleep(800);
  mkdirSync(OUT_DIR, { recursive: true });
  const fullPath = join(OUT_DIR, 'ios-overview-full.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  await page.close();
  return { fullPath };
}

async function exportFixture() {
  const viteNode = join(ROOT, 'node_modules/.pnpm/node_modules/.bin/vite-node');
  const exporter = spawn(
    viteNode,
    ['--config', 'vitest.config.ts', 'scripts/export-visual-fixture.ts'],
    { cwd: join(ROOT, 'apps/mobile'), stdio: 'inherit', env: { ...process.env, TZ: 'UTC' } },
  );
  const code = await new Promise((resolve) => exporter.on('close', resolve));
  if (code !== 0) {
    throw new Error(`export-visual-fixture exited ${code}`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await exportFixture();
  const storageMap = JSON.parse(readFileSync(join(GENERATED, 'web-storage.json'), 'utf8'));
  const stub = JSON.parse(readFileSync(join(GENERATED, 'ynab-stub.json'), 'utf8'));

  const children = [];
  const webUrl = `http://127.0.0.1:${WEB_PORT}/`;
  const mobileUrl = `http://127.0.0.1:${MOBILE_PORT}/`;
  try {
    if (!await isServerReady(webUrl)) {
      children.push(startProcess(
        'pnpm',
        ['--filter', './apps/web', 'exec', 'next', 'dev', '-H', '127.0.0.1', '-p', String(WEB_PORT)],
        { TZ: 'UTC', BROWSER: 'none' },
        'web',
      ));
    }
    if (!await isServerReady(mobileUrl, { html: true })) {
      children.push(startProcess(
        'pnpm',
        [
          '--filter', './apps/mobile', 'exec', 'expo', 'start',
          '--web', '--port', String(MOBILE_PORT),
        ],
        {
          TZ: 'UTC',
          BROWSER: 'none',
          DASHBOARD_VISUAL: '1',
          EXPO_PUBLIC_MOBILE_DEMO: '1',
          EXPO_NO_TELEMETRY: '1',
        },
        'mobile',
      ));
    }

    await waitForUrl(webUrl, 120000);
    let mobileReady = true;
    try {
      await waitForUrl(mobileUrl, 180000, { html: true });
    } catch (error) {
      mobileReady = false;
      writeFileSync(
        join(OUT_DIR, 'ios-overview-error.txt'),
        error instanceof Error ? error.message : String(error),
      );
    }

    const browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      ],
    });

    try {
      const web = await captureWeb(browser, storageMap, stub);
      process.stdout.write(`wrote ${web.fullPath}\n`);
      process.stdout.write(`wrote ${web.mainPath}\n`);
      if (mobileReady) {
        const mobile = await captureMobile(browser);
        process.stdout.write(`wrote ${mobile.fullPath}\n`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    for (const child of children) {
      child.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
