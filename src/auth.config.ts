import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    authorized() {
      // UI access is intentionally open for now; API routes still enforce auth
      // where needed via explicit `auth()` checks.
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
