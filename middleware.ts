import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const secret = process.env.DASHBOARD_SECRET;

  // If no secret is configured, allow all requests (dev fallback)
  if (!secret) return NextResponse.next();

  const key = request.nextUrl.searchParams.get("key");
  if (key === secret) return NextResponse.next();

  return new NextResponse("Unauthorized", { status: 401 });
}

export const config = {
  matcher: ["/balance-of-power"],
};
