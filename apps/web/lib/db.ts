import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

declare global {
  // eslint-disable-next-line no-var
  var __prisma_web: PrismaClient | undefined;
}

function resolveSqliteUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('file:')) return url;
  const raw = url.slice(5);
  const absPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const dir = path.dirname(absPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return `file:${absPath}`;
}

const resolvedDbUrl = resolveSqliteUrl(process.env.DATABASE_URL);

export const prisma: PrismaClient =
  (global as any).__prisma_web ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: resolvedDbUrl ? { db: { url: resolvedDbUrl } } : undefined,
  });

if (process.env.NODE_ENV !== 'production') {
  (global as any).__prisma_web = prisma;
}

// Enable better SQLite concurrency locally/for small prod deployments.
// Only applies when DATABASE_URL points to SQLite (file:/ or sqlite: schemes).
const dbUrl = resolvedDbUrl || process.env.DATABASE_URL || '';
const isSqlite = dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:');

async function initSqlitePragmas() {
  if (isSqlite) {
    // WAL PRAGMA returns a row; use queryRaw. busy_timeout can use executeRaw.
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  }
}

// Call the initialization function (fire and forget)
initSqlitePragmas().catch((err) => {
  console.error('Failed to set SQLite PRAGMAs:', err);
});
