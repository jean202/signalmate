import { auth } from "@/auth";

/**
 * API 라우트에서 현재 로그인된 유저의 ID를 가져옵니다.
 *
 * @returns userId (string) 또는 null (미로그인)
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * 로그인 필수 API에서 사용. 미로그인이면 에러 객체 반환.
 *
 * @example
 * const result = await requireAuth();
 * if (result.error) return result.error;
 * const userId = result.userId;
 */
export async function requireAuth(): Promise<
  { userId: string; error?: never } | { userId?: never; error: Response }
> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return {
      error: Response.json(
        {
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
        },
        { status: 401 },
      ),
    };
  }

  return { userId };
}
