import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DeepReportContent } from "@/lib/deep-report";

export type StoredDeepReport = {
  id: string;
  analysisId: string;
  userId: string;
  status: "generating" | "completed" | "failed";
  content: DeepReportContent | null;
  draftCheckCount: number;
  createdAt: string;
  completedAt: string | null;
};

type DeepReportRow = {
  id: string;
  analysisId: string;
  userId: string;
  status: string;
  contentJson: unknown;
  draftCheckCount: number;
  createdAt: Date;
  completedAt: Date | null;
};

function toStored(row: DeepReportRow): StoredDeepReport {
  return {
    id: row.id,
    analysisId: row.analysisId,
    userId: row.userId,
    status: row.status === "completed" || row.status === "failed" ? row.status : "generating",
    content: (row.contentJson as DeepReportContent | null) ?? null,
    draftCheckCount: row.draftCheckCount,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function getDeepReportByAnalysisId(
  analysisId: string,
): Promise<StoredDeepReport | null> {
  const row = await prisma.deepReport.findUnique({ where: { analysisId } });
  return row ? toStored(row as DeepReportRow) : null;
}

/** 생성 시작 상태로 만들거나, 실패했던 리포트를 다시 generating으로 되돌린다. */
export async function upsertGeneratingDeepReport(
  analysisId: string,
  userId: string,
): Promise<StoredDeepReport> {
  const row = await prisma.deepReport.upsert({
    where: { analysisId },
    create: { analysisId, userId, status: "generating" },
    update: { status: "generating", completedAt: null },
  });
  return toStored(row as DeepReportRow);
}

export async function completeDeepReport(
  analysisId: string,
  content: DeepReportContent,
): Promise<void> {
  await prisma.deepReport.update({
    where: { analysisId },
    data: {
      status: "completed",
      contentJson: content as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

export async function failDeepReport(analysisId: string): Promise<void> {
  await prisma.deepReport.update({
    where: { analysisId },
    data: { status: "failed" },
  });
}

/** 증가 후 새 카운트를 반환. 호출 전에 한도 검사는 호출자가 한다. */
export async function incrementDraftCheckCount(analysisId: string): Promise<number> {
  const row = await prisma.deepReport.update({
    where: { analysisId },
    data: { draftCheckCount: { increment: 1 } },
    select: { draftCheckCount: true },
  });
  return row.draftCheckCount;
}

/** 단건 결제(해당 분석) 또는 활성 구독이 있으면 심화 접근 허용. */
export async function hasDeepAccess(userId: string, analysisId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({
    where: { userId, analysisId, paymentStatus: "paid" },
  });
  if (payment) return true;

  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "active", currentPeriodEnd: { gt: new Date() } },
  });
  return subscription !== null;
}
