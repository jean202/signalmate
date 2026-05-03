"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function FailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const message = params.get("message") ?? "결제가 취소되었습니다.";

  return (
    <div style={styles.card}>
      <div style={styles.icon}>✗</div>
      <h2 style={styles.title}>결제에 실패했습니다</h2>
      <p style={styles.message}>{message}</p>
      {code && <p style={styles.code}>오류 코드: {code}</p>}
      <button style={styles.button} onClick={() => router.push("/analyze")}>
        돌아가기
      </button>
    </div>
  );
}

export default function PaymentFailPage() {
  return (
    <div style={styles.container}>
      <Suspense fallback={<div style={styles.card}><p>로딩 중...</p></div>}>
        <FailContent />
      </Suspense>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f9f9fb",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "48px 40px",
    textAlign: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    maxWidth: 400,
    width: "100%",
  },
  icon: { fontSize: 48, color: "#ef4444", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#111" },
  message: { color: "#6b7280", fontSize: 14, marginBottom: 8 },
  code: { color: "#9ca3af", fontSize: 12, marginBottom: 24 },
  button: {
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
};
