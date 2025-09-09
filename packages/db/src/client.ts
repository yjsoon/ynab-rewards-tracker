import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

declare global {
  var __prisma: PrismaClient | undefined;
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

const prisma = (global as any).__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: resolvedDbUrl ? { db: { url: resolvedDbUrl } } : undefined,
});

if (process.env.NODE_ENV !== 'production') {
  (global as any).__prisma = prisma;
}

// Enable WAL for SQLite deployments to improve concurrent reads/writes.
const dbUrl = process.env.DATABASE_URL || '';
const isSqlite = dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:');
if (isSqlite) {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
}

export { prisma };
export * from '@prisma/client';
