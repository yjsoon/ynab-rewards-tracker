import { NextResponse } from 'next/server';
import { prisma } from '@ynab-counter/db';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  
  if (error) {
    return NextResponse.json({ error: error }, { status: 400 });
  }
  
  if (!code) {
    return NextResponse.json({ error: 'missing_code' }, { status: 400 });
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://app.ynab.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.YNAB_CLIENT_ID!,
        client_secret: process.env.YNAB_CLIENT_SECRET!,
        redirect_uri: process.env.YNAB_REDIRECT_URI!,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      return NextResponse.json({ error: 'token_exchange_failed' }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Encrypt tokens
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Create or get user (placeholder for now - in production, tie to auth session)
    let user = await prisma.user.findFirst({
      where: { email: 'placeholder@example.com' }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'placeholder@example.com',
        },
      });
    }

    // Find existing connection
    let connection = await prisma.connection.findFirst({
      where: {
        userId: user.id,
        provider: 'YNAB',
      },
    });

    if (connection) {
      // Update existing connection
      connection = await prisma.connection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          scope: scope || 'read-only',
          expiresAt: expiresAt,
          serverKnowledge: {}, // Reset on new auth
        },
      });
    } else {
      // Create new connection
      connection = await prisma.connection.create({
        data: {
          userId: user.id,
          provider: 'YNAB',
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          scope: scope || 'read-only',
          expiresAt: expiresAt,
          serverKnowledge: {},
        },
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Authentication successful',
      userId: user.id,
      connectionId: connection.id,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

