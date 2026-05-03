import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight pass-through middleware.
 *
 * auth() 미들웨어는 pg/crypto 모듈을 포함해 Edge Function 한도(1 MB)를 초과합니다.
 * 데모 배포에서는 세션 보호가 필요 없으므로 pass-through로 운영합니다.
 * 차단이 필요한 라우트는 각 route.ts에서 auth()로 직접 체크합니다.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [], // 현재 활성화된 경로 없음
};
