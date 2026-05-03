import { errorResponse, successResponse } from "@/lib/api-response";
import { confirmPayment, failPayment } from "@/lib/db-store";
import { confirmTossPayment } from "@/lib/toss-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfirmBody = {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
};

export async function POST(request: Request) {
  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.");
  }

  const { paymentKey, orderId, amount } = body;

  if (!paymentKey || !orderId || !amount) {
    return errorResponse(400, "VALIDATION_ERROR", "paymentKey, orderId, amount는 필수입니다.");
  }

  const result = await confirmTossPayment({ paymentKey, orderId, amount });

  if (!result.ok) {
    await failPayment(orderId);
    return errorResponse(400, result.error.code, result.error.message);
  }

  await confirmPayment({ orderId, paymentKey });

  return successResponse({
    paymentKey: result.data.paymentKey,
    orderId: result.data.orderId,
    amount: result.data.totalAmount,
    approvedAt: result.data.approvedAt,
    method: result.data.method,
  });
}
