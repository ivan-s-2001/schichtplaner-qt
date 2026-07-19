import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { z } from "zod";
import {
  syncOutlineUser,
  verifyOutlineToken,
} from "@/lib/outline-integration";

const ADMIN_EMAIL = "admin@qksr.ru";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/",
  },
  providers: [
    Credentials({
      name: "Outline SSO",
      credentials: {
        token: { label: "Outline token", type: "text" },
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const token =
          typeof credentials?.token === "string"
            ? credentials.token.trim()
            : "";

        if (token) {
          try {
            const payload = verifyOutlineToken(token);
            const membership = await syncOutlineUser(payload);

            return {
              id: membership.user.id,
              email: membership.user.email,
              name:
                `${membership.user.firstName} ${membership.user.lastName}`.trim() ||
                membership.user.email,
            };
          } catch (error) {
            console.error("Outline SSO failed", error);
            return null;
          }
        }

        // Local email access is retained only as an explicit development fallback.
        if (process.env.ALLOW_EMAIL_LOGIN !== "true") return null;

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email;
        let membership = await db.organizationMember.findFirst({
          where: {
            isActive: true,
            isActivated: true,
            user: { email },
          },
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        });

        // Preserve access after older seeds that created admin@demo.de.
        if (!membership && email === ADMIN_EMAIL) {
          const owner = await db.organizationMember.findFirst({
            where: {
              role: "OWNER",
              isActive: true,
              isActivated: true,
            },
            include: { user: true },
            orderBy: { joinedAt: "asc" },
          });

          if (owner) {
            const adminUser = await db.user.update({
              where: { id: owner.userId },
              data: { email: ADMIN_EMAIL },
            });
            membership = { ...owner, user: adminUser };
          }
        }

        if (!membership) return null;

        return {
          id: membership.user.id,
          email: membership.user.email,
          name:
            `${membership.user.firstName} ${membership.user.lastName}`.trim() ||
            membership.user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
