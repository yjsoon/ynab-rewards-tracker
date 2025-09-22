import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

const YNAB_API_BASE = 'https://api.ynab.com/v1';

// Generic YNAB API proxy that handles any path
export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing authorization header' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);
  const path = params.path.join('/');
  const queryString = req.nextUrl.search;
  
  try {
    const url = `${YNAB_API_BASE}/${path}${queryString}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { 
          error: 'YNAB API error', 
          status: response.status,
          message: errorText 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}

// Support POST for creating/updating
export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing authorization header' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);
  const path = params.path.join('/');
  const body = await req.json();
  
  try {
    const url = `${YNAB_API_BASE}/${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { 
          error: 'YNAB API error', 
          status: response.status,
          message: errorText 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}