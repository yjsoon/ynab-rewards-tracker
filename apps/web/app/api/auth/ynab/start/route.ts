import { NextResponse } from 'next/server';

function required(name: string, val: string | undefined) {
  if (!val) throw new Error(`Missing env ${name}`);
  return val;
}

export async function GET() {
  const clientId = required('YNAB_CLIENT_ID', process.env.YNAB_CLIENT_ID);
  const redirectUri = required('YNAB_REDIRECT_URI', process.env.YNAB_REDIRECT_URI);

  const state = Math.random().toString(36).slice(2);
  const url = new URL('https://app.ynab.com/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'read-only');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}

