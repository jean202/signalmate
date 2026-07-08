import { requireAuth } from "@/lib/auth-helpers";
import { errorResponse, successResponse } from "@/lib/api-response";
import { claimAnalysisForUser, createPendingPayment } from "@/lib/db-store";
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

  if (purchaseType === "single_analysis") {
    if (!analysisId) {
      return errorResponse(400, "VALIDATION_ERROR", "단건 결제에는 analysisId가 필요합니다.");
    }

    const claimResult = await claimAnalysisForUser(auth.userId, analysisId);
    if (claimResult === "not_found") {
      return errorResponse(404, "NOT_FOUND", "분석을 찾을 수 없어요.");
    }
    if (claimResult === "forbidden") {
      return errorResponse(403, "FORBIDDEN", "다른 사용자의 분석에는 결제할 수 없어요.");
    }
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
