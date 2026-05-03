import { requireAuth } from "@/lib/auth-helpers";
import { errorResponse, successResponse } from "@/lib/api-response";
import { createPendingPayment } from "@/lib/db-store";
import { generateOrderId, PLANS, type PurchaseType } from "@/lib/toss-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutBody = {
  purchaseType?: PurchaseType;
  analysisId?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.");
  }

  const { purchaseType, analysisId } = body;

  if (!purchaseType || !(purchaseType in PLANS)) {
    return errorResponse(400, "VALIDATION_ERROR", "purchaseType은 single_analysis 또는 subscription_monthly여야 합니다.");
  }

  const plan = PLANS[purchaseType];
  const orderId = generateOrderId(purchaseType, auth.userId);

  await createPendingPayment({
    userId: auth.userId,
    orderId,
    purchaseType,
    amount: plan.amount,
    analysisId: analysisId ?? null,
  });

  return successResponse({
    orderId,
    orderName: plan.orderName,
    amount: plan.amount,
    clientKey: process.env.TOSS_CLIENT_KEY ?? "",
  });
}
