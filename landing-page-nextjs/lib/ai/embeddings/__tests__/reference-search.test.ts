import { beforeEach, describe, expect, it, vi } from "vitest";

const { embeddingsCreateMock, queryRawMock } = vi.hoisted(() => ({
  embeddingsCreateMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings/openai-client", () => ({
  isOpenAIAvailable: () => true,
  getOpenAIClient: () => ({ embeddings: { create: embeddingsCreateMock } }),
  EMBEDDING_MODEL: "text-embedding-3-small",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: queryRawMock },
}));

import { findSimilarReferenceCases } from "../reference-search";

describe("findSimilarReferenceCases", () => {
  beforeEach(() => {
    embeddingsCreateMock.mockReset();
    queryRawMock.mockReset();
    embeddingsCreateMock.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
  });

  it("maps rows into reference case hits", async () => {
    queryRawMock.mockResolvedValue([
      {
        id: "ref-1",
        summary_text: "소개팅 후 답장이 느려진 사례",
        situation_type: "after_first_date",
        outcome_label: "progressed",
        lesson: "온도를 보는 편이 정확했다",
        similarity: 0.8342,
      },
    ]);

    const hits = await findSimilarReferenceCases("요약 텍스트", 3);

    expect(hits).toEqual([
      {
        id: "ref-1",
        summaryText: "소개팅 후 답장이 느려진 사례",
        situationType: "after_first_date",
        outcomeLabel: "progressed",
        lesson: "온도를 보는 편이 정확했다",
        similarity: 0.834,
      },
    ]);
    expect(queryRawMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM reference_cases"),
      "[0.1,0.2]",
      3,
    );
  });

  it("returns empty array when the query fails", async () => {
    queryRawMock.mockRejectedValue(new Error("db down"));

    await expect(findSimilarReferenceCases("텍스트")).resolves.toEqual([]);
  });
});
