"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"confirming" | "success" | "error">("confirming");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = params.get("amount");

    if (!paymentKey || !orderId || !amount) {
      setStatus("error");
      setErrorMessage("결제 정보가 올바르지 않습니다.");
      return;
    }

    fetch("/api/v1/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage(json.error?.message ?? "결제 확인에 실패했습니다.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMessage("네트워크 오류가 발생했습니다.");
      });
  }, [params]);

  if (status === "confirming") {
    return (
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.message}>결제를 확인하는 중입니다...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={styles.card}>
        <div style={styles.iconError}>✗</div>
        <h2 style={styles.title}>결제에 실패했습니다</h2>
        <p style={styles.sub}>{errorMessage}</p>
        <button style={styles.button} onClick={() => router.push("/analyze")}>
          다시 시도하기
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.iconSuccess}>✓</div>
      <h2 style={styles.title}>결제가 완료되었습니다</h2>
      <p style={styles.sub}>심화 분석 결과를 확인하세요.</p>
      <button style={styles.button} onClick={() => router.push("/analyze")}>
        분석 결과 보기
      </button>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div style={styles.container}>
      <Suspense fallback={<div style={styles.card}><p>로딩 중...</p></div>}>
        <SuccessContent />
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
  iconSuccess: { fontSize: 48, color: "#22c55e", marginBottom: 16 },
  iconError: { fontSize: 48, color: "#ef4444", marginBottom: 16 },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid #e5e7eb",
    borderTop: "3px solid #6366f1",
    borderRadius: "50%",
    margin: "0 auto 16px",
  },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#111" },
  message: { color: "#6b7280", fontSize: 15 },
  sub: { color: "#6b7280", fontSize: 14, marginBottom: 24 },
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
