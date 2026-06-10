import { describe, expect, it } from "vitest";
import { aggregateEval, deriveTemperature, type EvalRow } from "./eval-core";

describe("deriveTemperature", () => {
  it("maps overall score to coarse temperature bands", () => {
    expect(deriveTemperature(20)).toBe("cold");
    expect(deriveTemperature(50)).toBe("neutral");
    expect(deriveTemperature(68)).toBe("warm");
    expect(deriveTemperature(85)).toBe("hot");
  });

  it("uses boundaries: <40 cold, <60 neutral, <75 warm, else hot", () => {
    expect(deriveTemperature(39)).toBe("cold");
    expect(deriveTemperature(40)).toBe("neutral");
    expect(deriveTemperature(59)).toBe("neutral");
    expect(deriveTemperature(60)).toBe("warm");
    expect(deriveTemperature(74)).toBe("warm");
    expect(deriveTemperature(75)).toBe("hot");
  });
});

describe("aggregateEval", () => {
  it("counts agreements and collects disagreements", () => {
    const rows: EvalRow[] = [
      { captureId: "a", myTemp: "warm", systemTemp: "warm" },
      { captureId: "b", myTemp: "hot", systemTemp: "warm" },
      { captureId: "c", myTemp: "cold", systemTemp: "cold" },
    ];
    const result = aggregateEval(rows);
    expect(result.total).toBe(3);
    expect(result.agreements).toBe(2);
    expect(result.agreementRate).toBeCloseTo(2 / 3, 5);
    expect(result.disagreements).toEqual([
      { captureId: "b", myTemp: "hot", systemTemp: "warm" },
    ]);
  });

  it("returns 0 agreementRate for an empty dataset (no divide-by-zero)", () => {
    const result = aggregateEval([]);
    expect(result.total).toBe(0);
    expect(result.agreementRate).toBe(0);
  });
});
