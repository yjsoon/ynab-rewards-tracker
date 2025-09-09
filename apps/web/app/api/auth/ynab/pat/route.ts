import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

// Placeholder user until real auth is wired
async function getOrCreateUser() {
  let user = await prisma.user.findFirst({ where: { email: 'placeholder@example.com' } });
  if (!user) {
    user = await prisma.user.create({ data: { email: 'placeholder@example.com' } });
  }
  return user;
}

export async function GET() {
  // If a PAT is set via env, consider connected for testing without DB
  if (process.env.YNAB_ACCESS_TOKEN) {
    return json(200, { connected: true, provider: 'YNAB', scope: 'pat-env', mode: 'env' });
  }
  try {
    const user = await prisma.user.findFirst({ where: { email: 'placeholder@example.com' } });
    if (!user) return json(200, { connected: false });

    const connection = await prisma.connection.findFirst({ where: { userId: user.id, provider: 'YNAB' } });
    if (!connection) return json(200, { connected: false });

    return json(200, {
      connected: true,
      provider: connection.provider,
      scope: connection.scope,
      expiresAt: connection.expiresAt,
      updatedAt: connection.updatedAt,
      hasServerKnowledge: !!connection.serverKnowledge,
      mode: 'db',
    });
  } catch (err: any) {
    // If tables are missing (P2021), report as not initialized instead of 500
    if (err?.code === 'P2021') {
      return json(200, { connected: false, needsInit: true });
    }
    console.error('GET /api/auth/ynab/pat error', err);
    return json(500, { error: 'internal_error' });
  }
}

export async function POST(req: Request) {
  try {
    const { token, verify = true } = await req.json().catch(() => ({ token: undefined }));
    if (!token || typeof token !== 'string' || token.trim().length < 40) {
      return json(400, { error: 'invalid_token', message: 'Token missing or too short.' });
    }

    const trimmed = token.trim();

    if (verify) {
      const resp = await fetch('https://api.ynab.com/v1/budgets', {
        headers: { Authorization: `Bearer ${trimmed}`, Accept: 'application/json' },
      });
      if (!resp.ok) {
        const status = resp.status;
        return json(400, { error: 'token_verification_failed', status });
      }
    }

    const user = await getOrCreateUser();
    const encryptedAccessToken = encrypt(trimmed);
    const encryptedRefreshToken = encrypt(''); // not used for PAT
    const expiresAt = new Date('2999-01-01T00:00:00.000Z');

    let connection = await prisma.connection.findFirst({
      where: { userId: user.id, provider: 'YNAB' },
    });

    if (connection) {
      connection = await prisma.connection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          scope: 'pat',
          expiresAt,
          serverKnowledge: {},
        },
      });
    } else {
      connection = await prisma.connection.create({
        data: {
          userId: user.id,
          provider: 'YNAB',
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          scope: 'pat',
          expiresAt,
          serverKnowledge: {},
        },
      });
    }

    return json(200, { ok: true, connectionId: connection.id });
  } catch (err: any) {
    if (err?.code === 'P2021') {
      return json(400, { error: 'db_not_initialized', message: 'Run: pnpm db:push' });
    }
    console.error('POST /api/auth/ynab/pat error', err);
    return json(500, { error: 'internal_error' });
  }
}
