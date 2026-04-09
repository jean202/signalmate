import { errorResponse, successResponse } from "@/lib/api-response";
import { buildCheckoutResponse } from "@/lib/mock-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutBody = {
  purchaseType?: "single_analysis" | "subscription";
  analysisId?: string | null;
  planCode?: string | null;
  provider?: "toss" | "stripe";
};

export async function POST(request: Request) {
  let body: CheckoutBody;

  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (!body.purchaseType || !body.provider) {
    return errorResponse(400, "VALIDATION_ERROR", "purchaseType and provider are required.");
  }

  return successResponse(buildCheckoutResponse(), 201);
}
