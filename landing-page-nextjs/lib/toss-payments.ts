const TOSS_API_BASE = "https://api.tosspayments.com/v1";

export const PLANS = {
  single_analysis: {
    amount: 3900,
    orderName: "시그널메이트 심화 분석",
  },
  subscription_monthly: {
    amount: 9900,
    orderName: "시그널메이트 월 구독",
  },
} as const;

export type PurchaseType = keyof typeof PLANS;

export interface TossConfirmResponse {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: string;
  totalAmount: number;
  method: string;
  approvedAt: string;
  card?: {
    issuerCode: string;
    acquirerCode: string;
    number: string;
    installmentPlanMonths: number;
    approveNo: string;
    useCardPoint: boolean;
    cardType: string;
    ownerType: string;
    acquireStatus: string;
    isInterestFree: boolean;
    interestPayer: string | null;
  };
}

export interface TossErrorResponse {
  code: string;
  message: string;
}

function getAuthHeader(): string {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) throw new Error("TOSS_SECRET_KEY가 설정되지 않았습니다.");
  return "Basic " + Buffer.from(secretKey + ":").toString("base64");
}

export async function confirmTossPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<{ ok: true; data: TossConfirmResponse } | { ok: false; error: TossErrorResponse }> {
  const res = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json as TossErrorResponse };
  }
  return { ok: true, data: json as TossConfirmResponse };
}

export function generateOrderId(purchaseType: PurchaseType, userId: string): string {
  const ts = Date.now();
  const prefix = purchaseType === "single_analysis" ? "single" : "sub";
  return `${prefix}_${userId.slice(0, 8)}_${ts}`;
}
