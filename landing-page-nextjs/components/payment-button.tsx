"use client";

import { useEffect, useRef, useState } from "react";
import type { PurchaseType } from "@/lib/toss-payments";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TossPayments: any;
  }
}

interface PaymentButtonProps {
  purchaseType: PurchaseType;
  analysisId?: string | null;
  label?: string;
  className?: string;
}

export function PaymentButton({ purchaseType, analysisId, label, className }: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v1/payment";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseType, analysisId }),
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? "결제 초기화에 실패했습니다.");
        setLoading(false);
        return;
      }

      const { orderId, orderName, amount, clientKey } = json.data;
      const toss = window.TossPayments(clientKey);
      const origin = window.location.origin;

      await toss.requestPayment("카드", {
        amount,
        orderId,
        orderName,
        customerName: "SignalMate 사용자",
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "결제 중 오류가 발생했습니다.";
      if (!msg.includes("사용자가 결제를 취소")) {
        setError(msg);
      }
      setLoading(false);
    }
  }

  const buttonLabel = label ?? (purchaseType === "single_analysis" ? "심화 분석 보기 ₩3,900" : "월 구독 시작 ₩9,900/월");

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className}
        style={{
          background: loading ? "#a5b4fc" : "#6366f1",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "12px 24px",
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {loading ? "처리 중..." : buttonLabel}
      </button>
      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8, textAlign: "center" }}>{error}</p>
      )}
    </div>
  );
}
