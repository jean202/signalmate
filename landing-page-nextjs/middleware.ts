export { auth as middleware } from "@/auth";

/**
 * 인증이 필요한 경로만 미들웨어 적용.
 * /api/v1/me/* 등 보호 라우트를 여기에 추가.
 *
 * 현재는 미들웨어가 세션을 주입만 하고 차단하지 않음.
 * 차단이 필요한 라우트는 각 route.ts에서 auth()로 직접 체크.
 */
export const config = {
  matcher: [
    "/api/v1/me/:path*",
    "/mypage/:path*",
    "/analyze/:path*",
  ],
};
