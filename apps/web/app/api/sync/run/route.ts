import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // For now, use the placeholder user created during OAuth
    const user = await prisma.user.findFirst({ where: { email: 'placeholder@example.com' } });
    if (!user) return NextResponse.json({ error: 'no_user' }, { status: 404 });

    const connection = await prisma.connection.findFirst({ where: { userId: user.id, provider: 'YNAB' } });
    if (!connection) return NextResponse.json({ error: 'no_connection' }, { status: 404 });

    const accessToken = decrypt(connection.accessTokenEnc);
    const resp = await fetch('https://api.ynab.com/v1/budgets', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    if (!resp.ok) {
      return NextResponse.json({ error: 'ynab_api_error', status: resp.status }, { status: 502 });
    }
    const budgets = await resp.json();
    return NextResponse.json({ ok: true, budgets: budgets.data?.budgets ?? budgets });
  } catch (err) {
    console.error('sync/run error', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
