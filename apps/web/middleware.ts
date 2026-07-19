import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CACHE_RESCUE_VERSION = "skew-20260719";

export function middleware(request: NextRequest) {
  if (request.nextUrl.searchParams.has("refresh")) {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.searchParams.set("refresh", CACHE_RESCUE_VERSION);
  return NextResponse.redirect(destination, 307);
}

export const config = {
  matcher: ["/"],
};
