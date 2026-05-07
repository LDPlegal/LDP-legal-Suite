import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionCookie = getSessionCookie(req, { cookiePrefix: "ldp" });

  // Auth routes when already signed in -> dashboard
  if (PUBLIC_PATHS.has(pathname) && sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Protected routes when signed out -> login
  if (!PUBLIC_PATHS.has(pathname) && !sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every page route except static assets and the better-auth API.
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
