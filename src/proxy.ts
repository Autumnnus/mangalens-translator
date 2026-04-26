import { authConfig } from "@/auth.config";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = Boolean(req.auth?.user);

  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
  const isPublicApiRoute = nextUrl.pathname === "/api/version";
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
