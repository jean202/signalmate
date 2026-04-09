"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import styles from "./page.module.css";

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error");

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>SignalMate</h1>
        <p className={styles.subtitle}>
          채팅 속 관계 신호를 분석하고
          <br />
          다음 메시지 전략을 추천받으세요
        </p>

        {error && (
          <div className={styles.error}>
            로그인 중 문제가 발생했습니다. 다시 시도해주세요.
          </div>
        )}

        <div className={styles.buttons}>
          <button
            className={`${styles.button} ${styles.kakao}`}
            onClick={() => signIn("kakao", { callbackUrl })}
            type="button"
          >
            <KakaoIcon />
            카카오로 시작하기
          </button>

          <button
            className={`${styles.button} ${styles.google}`}
            onClick={() => signIn("google", { callbackUrl })}
            type="button"
          >
            <GoogleIcon />
            Google로 시작하기
          </button>
        </div>

        <p className={styles.terms}>
          로그인 시 <a href="/terms">이용약관</a> 및{" "}
          <a href="/privacy">개인정보처리방침</a>에 동의합니다.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

// ─── Icons ────────────────────────────────────────────

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 3C5.58 3 2 5.79 2 9.24c0 2.17 1.41 4.08 3.55 5.18l-.91 3.38c-.08.28.24.51.49.35l4.03-2.67c.27.03.55.04.84.04 4.42 0 8-2.79 8-6.24S14.42 3 10 3z"
        fill="#3C1E1E"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.6 10.23c0-.68-.06-1.36-.17-2.02H10v3.84h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.34z" fill="#4285F4" />
      <path d="M10 20c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.58-4.1H1.07v2.58A9.99 9.99 0 0 0 10 20z" fill="#34A853" />
      <path d="M4.42 11.92A6.01 6.01 0 0 1 4.1 10c0-.67.12-1.31.32-1.92V5.5H1.07A9.99 9.99 0 0 0 0 10c0 1.61.39 3.14 1.07 4.5l3.35-2.58z" fill="#FBBC05" />
      <path d="M10 3.98c1.47 0 2.78.5 3.82 1.5l2.86-2.87C14.96.99 12.7 0 10 0A9.99 9.99 0 0 0 1.07 5.5l3.35 2.58C5.2 5.73 7.4 3.98 10 3.98z" fill="#EA4335" />
    </svg>
  );
}
