import { errorResponse, successResponse } from "@/lib/api-response";
import { getAnalysis } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    analysisId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { analysisId } = await context.params;

  if (!analysisId) {
    return errorResponse(400, "VALIDATION_ERROR", "analysisId is required.");
  }

  const analysis = await getAnalysis(analysisId);

  if (!analysis) {
    return errorResponse(404, "NOT_FOUND", "analysis not found.");
  }

  return successResponse({
    recommendations: analysis.recommendations,
  });
}
