import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

declare global {
  let __prisma: PrismaClient | undefined;
}

function resolveSqliteUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('file:')) return url;
  const raw = url.slice(5);
  const absPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const dir = path.dirname(absPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {
    // Ignore errors if directory already exists
  }
  return `file:${absPath}`;
}

const resolvedDbUrl = resolveSqliteUrl(process.env.DATABASE_URL);

const prisma = (global as { __prisma?: PrismaClient }).__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: resolvedDbUrl ? { db: { url: resolvedDbUrl } } : undefined,
});

if (process.env.NODE_ENV !== 'production') {
  (global as { __prisma?: PrismaClient }).__prisma = prisma;
}

// Enable WAL for SQLite deployments to improve concurrent reads/writes.
const dbUrl = process.env.DATABASE_URL || '';
const isSqlite = dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:');

/**
 * Initialize SQLite PRAGMAs for better performance and concurrency.
 * This should be called during application startup for production use.
 * 
 * @example
 * // In your application startup:
 * import { initPrisma } from '@ynab-counter/db';
 * await initPrisma();
 */
export async function initPrisma() {
  if (isSqlite) {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  }
}

// Auto-initialize for development convenience
// Note: In production, consider awaiting initPrisma() during startup for reliability
if (isSqlite) {
  initPrisma().catch((err) => {
    console.error('Failed to set SQLite PRAGMAs:', err);
  });
}

export { prisma };
export * from '@prisma/client';
