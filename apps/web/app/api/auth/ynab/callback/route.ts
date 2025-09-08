import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return NextResponse.json({ error: 'missing_code' }, { status: 400 });
  // TODO: exchange code → tokens and persist securely (out of scope for scaffold)
  return NextResponse.json({ ok: true, code, state });
}

