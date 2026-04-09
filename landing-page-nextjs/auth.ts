import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { prisma } from "@/lib/prisma";

/**
 * Auth.js v5 설정.
 *
 * JWT 전략 사용 (Prisma adapter 없이 직접 DB upsert).
 * 카카오/구글 로그인 → 우리 User 테이블에 upsert → JWT에 userId 포함.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Kakao({
      clientId: process.env.AUTH_KAKAO_ID,
      clientSecret: process.env.AUTH_KAKAO_SECRET,
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30일
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    /**
     * 로그인 시 DB에 유저 upsert.
     * 최초 로그인 → create, 재로그인 → lastLoginAt 업데이트.
     */
    async signIn({ user, account }) {
      if (!account?.provider || !user.email) return true;

      const authProvider = account.provider as "google" | "kakao";
      const providerUserId = account.providerAccountId;

      try {
        await prisma.user.upsert({
          where: {
            authProvider_providerUserId: {
              authProvider,
              providerUserId,
            },
          },
          update: {
            lastLoginAt: new Date(),
            email: user.email,
            nickname: user.name ?? undefined,
          },
          create: {
            email: user.email,
            authProvider,
            providerUserId,
            nickname: user.name ?? null,
            status: "active",
          },
        });
      } catch (error) {
        console.error("[auth] Failed to upsert user:", error);
        // DB 실패해도 로그인은 허용 (graceful)
      }

      return true;
    },

    /**
     * JWT 토큰에 userId 추가.
     */
    async jwt({ token, account }) {
      // 최초 로그인 시 (account가 있을 때) DB에서 userId 조회
      if (account?.providerAccountId) {
        const authProvider = account.provider as "google" | "kakao";
        const dbUser = await prisma.user.findUnique({
          where: {
            authProvider_providerUserId: {
              authProvider,
              providerUserId: account.providerAccountId,
            },
          },
          select: { id: true },
        });

        if (dbUser) {
          token.userId = dbUser.id;
        }
      }

      return token;
    },

    /**
     * 세션에 userId 노출.
     */
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
