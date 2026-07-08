import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    deepReport: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    payment: { findFirst: vi.fn() },
    subscription: { findFirst: vi.fn() },
    analysis: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    conversation: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { claimAnalysisForUser } from "../db-store";
import {
  getDeepReportByAnalysisId,
  hasDeepAccess,
  incrementDraftCheckCount,
} from "../deep-report-store";

describe("deep-report-store", () => {
  beforeEach(() => {
    [
      ...Object.values(prismaMock.deepReport),
      prismaMock.payment.findFirst,
      prismaMock.subscription.findFirst,
      prismaMock.analysis.findUnique,
      prismaMock.analysis.update,
      prismaMock.conversation.update,
      prismaMock.$transaction,
    ].forEach((fn) => fn.mockReset());

    prismaMock.analysis.update.mockReturnValue("analysis-update");
    prismaMock.conversation.update.mockReturnValue("conversation-update");
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("maps prisma rows to stored deep reports", async () => {
    prismaMock.deepReport.findUnique.mockResolvedValue({
      id: "dr-1",
      analysisId: "an-1",
      userId: "user-1",
      status: "completed",
      contentJson: { similarCases: null, scenarios: [] },
      draftCheckCount: 2,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      completedAt: new Date("2026-07-08T00:01:00Z"),
    });

    const report = await getDeepReportByAnalysisId("an-1");

    expect(report).toMatchObject({
      analysisId: "an-1",
      status: "completed",
      draftCheckCount: 2,
      content: { similarCases: null, scenarios: [] },
    });
  });

  it("grants access with a paid single payment for the analysis", async () => {
    prismaMock.payment.findFirst.mockResolvedValue({ id: "pay-1" });

    await expect(hasDeepAccess("user-1", "an-1")).resolves.toBe(true);
    expect(prismaMock.payment.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", analysisId: "an-1", paymentStatus: "paid" },
    });
  });

  it("grants access with an active subscription", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findFirst.mockResolvedValue({ id: "sub-1" });

    await expect(hasDeepAccess("user-1", "an-1")).resolves.toBe(true);
  });

  it("denies access without payment or subscription", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findFirst.mockResolvedValue(null);

    await expect(hasDeepAccess("user-1", "an-1")).resolves.toBe(false);
  });

  it("increments draft check count atomically and returns the new value", async () => {
    prismaMock.deepReport.update.mockResolvedValue({ draftCheckCount: 3 });

    await expect(incrementDraftCheckCount("an-1")).resolves.toBe(3);
    expect(prismaMock.deepReport.update).toHaveBeenCalledWith({
      where: { analysisId: "an-1" },
      data: { draftCheckCount: { increment: 1 } },
      select: { draftCheckCount: true },
    });
  });

  it("claims an anonymous analysis for the paying user", async () => {
    prismaMock.analysis.findUnique.mockResolvedValue({
      id: "an-1",
      userId: null,
      conversationId: "conv-1",
    });

    await expect(claimAnalysisForUser("user-1", "an-1")).resolves.toBe("claimed");
    expect(prismaMock.analysis.update).toHaveBeenCalledWith({
      where: { id: "an-1" },
      data: { userId: "user-1" },
    });
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { userId: "user-1", saveMode: "saved" },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(["analysis-update", "conversation-update"]);
  });
});
