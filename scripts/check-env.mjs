#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const files = [
  { label: 'root', file: path.join(root, '.env') },
  { label: 'db', file: path.join(root, 'packages/db/.env') },
  { label: 'web', file: path.join(root, 'apps/web/.env.local') },
];

function parseEnv(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function b64Len(bytesB64) {
  try {
    const buf = Buffer.from(bytesB64 || '', 'base64');
    return buf.length;
  } catch {
    return -1;
  }
}

function assessEnv(map, label) {
  const res = { label, issues: [], info: [] };
  const ek = map.ENCRYPTION_KEY;
  if (!ek) res.issues.push('ENCRYPTION_KEY missing');
  else {
    const len = b64Len(ek);
    if (len !== 32) res.issues.push(`ENCRYPTION_KEY decodes to ${len} bytes (expected 32)`);
    else res.info.push('ENCRYPTION_KEY ok (32 bytes)');
  }

  const du = map.DATABASE_URL;
  if (!du) res.issues.push('DATABASE_URL missing');
  else if (du.startsWith('file:')) res.info.push('DATABASE_URL sqlite');
  else if (du.startsWith('postgres')) res.info.push('DATABASE_URL postgres');
  else res.issues.push('DATABASE_URL has unknown scheme');

  if (map.YNAB_ACCESS_TOKEN) {
    res.info.push(`YNAB_ACCESS_TOKEN present (length ${map.YNAB_ACCESS_TOKEN.length})`);
  } else {
    res.info.push('YNAB_ACCESS_TOKEN not set (ok if using OAuth)');
  }

  if (map.YNAB_REDIRECT_URI) {
    if (!map.YNAB_REDIRECT_URI.endsWith('/api/auth/ynab/callback')) {
      res.issues.push('YNAB_REDIRECT_URI should end with /api/auth/ynab/callback');
    }
  }

  if (map.NEXTAUTH_SECRET) {
    res.issues.push('NEXTAUTH_SECRET present (deprecated/transitional; not used by current codebase)');
  }

  return res;
}

const results = [];
for (const f of files) {
  if (!fs.existsSync(f.file)) {
    results.push({ label: f.label, missing: true });
    continue;
  }
  const content = fs.readFileSync(f.file, 'utf8');
  const map = parseEnv(content);
  results.push(assessEnv(map, f.label));
}

for (const r of results) {
  if (r.missing) {
    console.log(`[${r.label}] MISSING`);
    continue;
  }
  console.log(`[${r.label}]`);
  for (const i of r.info) console.log(`  info: ${i}`);
  for (const e of r.issues) console.log(`  issue: ${e}`);
}

// cross-file checks for sqlite defaults
const dbEnv = fs.existsSync(files[1].file) ? parseEnv(fs.readFileSync(files[1].file, 'utf8')) : {};
const webEnv = fs.existsSync(files[2].file) ? parseEnv(fs.readFileSync(files[2].file, 'utf8')) : {};
if (dbEnv.DATABASE_URL && dbEnv.DATABASE_URL.startsWith('file:') && dbEnv.DATABASE_URL !== 'file:./dev.db') {
  console.log('note: packages/db/.env DATABASE_URL is sqlite but not file:./dev.db (ok, just ensure migrations write there)');
}
if (webEnv.DATABASE_URL && webEnv.DATABASE_URL.startsWith('file:') && webEnv.DATABASE_URL !== 'file:../packages/db/dev.db') {
  console.log('note: apps/web/.env.local DATABASE_URL is sqlite but not file:../packages/db/dev.db (ensure it points to the migrated db)');
}

