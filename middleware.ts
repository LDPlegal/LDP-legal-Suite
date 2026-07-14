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
    // Run on every page route except static assets, the better-auth API, y
    // los endpoints de download de documentos (que sirven archivos desde
    // iframes/img-tags donde los cookies con SameSite no siempre llegan;
    // esos endpoints hacen su propio auth con getCurrentUser).
    //
    // `api/cron` también queda excluido: los crons usan Bearer CRON_SECRET
    // (ver lib/cron/auth.ts), no session cookie. Si pasaran por este
    // middleware se redirigirían a /login y el work nunca correría.
    //
    // `api/uploads/local` también — usa HMAC en query string (dev only),
    // no cookies.
    //
    // `api/ai/diag` también — hace su propio auth con Bearer AI_DIAG_SECRET
    // (ver app/api/ai/diag/route.ts). Sin esto el middleware lo mandaría a
    // /login y nunca podríamos diagnosticar la IA desde afuera.
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/documentos|api/portal/documentos|api/cron|api/ai/diag|api/uploads/local|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
