import { successResponse } from "@/lib/api-response";
import { listAnalysisSummaries } from "@/lib/store";
import { requireAuth } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireAuth();
  if (result.error) return result.error;

  const items = await listAnalysisSummaries(result.userId);

  return successResponse({
    items,
    nextCursor: null,
  });
}
