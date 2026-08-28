import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const YNAB_API_BASE = "https://api.ynab.com/v1";
const HOWMUCH_API_BASE = "https://howmuch.soon.sg/v1";

type RouteContext = { params: { path: string[] } };

async function proxy(req: NextRequest, { params }: RouteContext) {
  const authHeader = req.headers.get("authorization");
  const credential = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!credential) {
    return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
  }

  const provider = credential.startsWith("howmuch-token:") ? "howmuch" : "ynab";
  const clientToken = provider === "howmuch"
    ? credential.slice("howmuch-token:".length)
    : credential;
  if (!clientToken) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const baseUrl = provider === "howmuch" ? HOWMUCH_API_BASE : YNAB_API_BASE;
  const url = `${baseUrl}/${params.path.join("/")}${req.nextUrl.search}`;

  try {
    const method = req.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await req.text();
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${clientToken}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": req.headers.get("content-type") || "application/json" } : {}),
      },
      body,
    });
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        ...(response.headers.get("retry-after")
          ? { "Retry-After": response.headers.get("retry-after")! }
          : {}),
      },
    });
  } catch (error) {
    console.error(`${provider} proxy error:`, error);
    return NextResponse.json({ error: "Failed to proxy request" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
