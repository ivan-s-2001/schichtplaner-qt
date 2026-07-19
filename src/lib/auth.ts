import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import {
  loadOutlineSessionUser,
  loadOutlineUserById,
  verifyOutlineIdentity,
  verifyOutlineToken,
} from "@/lib/outline-integration";
import { consumeOutlineSsoToken } from "@/lib/outline-sso-token";

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/" },
  providers: [
    Credentials({
      name: "Outline SSO",
      credentials: {
        userId: { label: "Outline user id", type: "text" },
        teamId: { label: "Outline workspace id", type: "text" },
        signature: { label: "Outline signature", type: "text" },
        token: { label: "Outline token", type: "text" },
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const userId =
          typeof credentials?.userId === "string"
            ? credentials.userId.trim()
            : "";
        const teamId =
          typeof credentials?.teamId === "string"
            ? credentials.teamId.trim()
            : "";
        const signature =
          typeof credentials?.signature === "string"
            ? credentials.signature.trim()
            : "";

        if (userId || teamId || signature) {
          if (!userId || !teamId || !signature) return null;

          try {
            verifyOutlineIdentity(userId, teamId, signature);
            const user = await loadOutlineUserById(userId, teamId);

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.avatarUrl,
            };
          } catch (error) {
            console.error("Outline GET identity failed", error);
            return null;
          }
        }

        const token =
          typeof credentials?.token === "string"
            ? credentials.token.trim()
            : "";

        if (token) {
          try {
            const payload = verifyOutlineToken(token);
            await consumeOutlineSsoToken(payload);
            const user = await loadOutlineSessionUser(payload);

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.avatarUrl,
            };
          } catch (error) {
            console.error("Outline SSO failed", error);
            return null;
          }
        }

        if (process.env.ALLOW_EMAIL_LOGIN !== "true") return null;

        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        if (!email) return null;

        const rows = await db.$queryRaw<
          Array<{
            id: string;
            email: string | null;
            name: string;
            avatarUrl: string | null;
          }>
        >`
          SELECT
            u."id"::text AS "id",
            u."email" AS "email",
            u."name" AS "name",
            u."avatarUrl" AS "avatarUrl"
          FROM public."users" u
          WHERE LOWER(u."email") = ${email}
            AND u."deletedAt" IS NULL
            AND u."suspendedAt" IS NULL
          ORDER BY u."createdAt" ASC
          LIMIT 1
        `;
        const user = rows[0];
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
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
