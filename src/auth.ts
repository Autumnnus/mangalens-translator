import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "./db";
import { users } from "./db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const user = await db.query.users.findFirst({
            where: eq(users.email, email),
          });
          if (!user || !user.password) return null;

          let passwordsMatch = false;
          try {
            // Try to compare as bcrypt hash
            passwordsMatch = await bcrypt.compare(password, user.password);
          } catch {
            // If user.password is not a valid hash, it might throw or just be false
          }

          if (passwordsMatch) return user;

          // Fallback: Check plain text (legacy)
          if (password === user.password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db
              .update(users)
              .set({ password: hashedPassword })
              .where(eq(users.id, user.id));
            return user;
          }
        }

        console.error("Invalid credentials");
        return null;
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
});
