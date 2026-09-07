import { authConfig } from "@/auth.config";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = Boolean(req.auth?.user);

  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
  const isWorkerApiRoute = nextUrl.pathname.startsWith(
    "/api/local-ocr/worker/",
  );
  // Development-only harness pages and routes (they 404 in production).
  const isDevHarness =
    process.env.NODE_ENV !== "production" &&
    (nextUrl.pathname.startsWith("/dev/") ||
      nextUrl.pathname.startsWith("/api/dev/"));
  const isPublicApiRoute =
    nextUrl.pathname === "/api/version" || isWorkerApiRoute || isDevHarness;
  const isLoginRoute = nextUrl.pathname.startsWith("/auth/login");
  const isPublicFile = /\.[^/]+$/.test(nextUrl.pathname);

  if (isApiAuthRoute || isPublicApiRoute || isPublicFile) {
    return NextResponse.next();
  }

  if (isLoginRoute) {
    if (!isAuthenticated) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/", nextUrl));
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/auth/login", nextUrl);
    const callbackUrl = `${nextUrl.pathname}${nextUrl.search}`;
    const isLoginCallback = callbackUrl.startsWith("/auth/login");

    if (!isLoginCallback) {
      loginUrl.searchParams.set("callbackUrl", callbackUrl);
    }

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
