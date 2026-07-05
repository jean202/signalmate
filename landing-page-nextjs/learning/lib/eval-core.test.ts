import { describe, expect, it } from "vitest";
import {
  aggregateEval,
  createEvalRow,
  deriveTemperature,
  temperatureDistance,
  type EvalRow,
} from "./eval-core";

describe("deriveTemperature", () => {
  it("maps overall score to coarse temperature bands", () => {
    expect(deriveTemperature(20)).toBe("cold");
    expect(deriveTemperature(50)).toBe("neutral");
    expect(deriveTemperature(72)).toBe("warm");
    expect(deriveTemperature(85)).toBe("hot");
  });

  it("uses calibrated boundaries: <45 cold, <70 neutral, <85 warm, else hot", () => {
    expect(deriveTemperature(44)).toBe("cold");
    expect(deriveTemperature(45)).toBe("neutral");
    expect(deriveTemperature(69)).toBe("neutral");
    expect(deriveTemperature(70)).toBe("warm");
    expect(deriveTemperature(84)).toBe("warm");
    expect(deriveTemperature(85)).toBe("hot");
  });
});

describe("temperatureDistance", () => {
  it("returns 0 for exact matches", () => {
    expect(temperatureDistance("cold", "cold")).toBe(0);
    expect(temperatureDistance("hot", "hot")).toBe(0);
  });

  it("returns absolute band distance for disagreements", () => {
    expect(temperatureDistance("warm", "hot")).toBe(1);
    expect(temperatureDistance("cold", "warm")).toBe(2);
    expect(temperatureDistance("hot", "cold")).toBe(3);
  });
});

describe("createEvalRow", () => {
  it("stores the derived temperature distance on each row", () => {
    expect(
      createEvalRow({ captureId: "case-1", myTemp: "hot", systemTemp: "neutral" }),
    ).toEqual({
      captureId: "case-1",
      myTemp: "hot",
      systemTemp: "neutral",
      tempDistance: 2,
    });
  });
});

describe("aggregateEval", () => {
  it("counts agreements and groups disagreement distances", () => {
    const rows: EvalRow[] = [
      createEvalRow({ captureId: "a", myTemp: "warm", systemTemp: "warm" }),
      createEvalRow({ captureId: "b", myTemp: "hot", systemTemp: "warm" }),
      createEvalRow({ captureId: "c", myTemp: "cold", systemTemp: "hot" }),
    ];

    const result = aggregateEval(rows);

    expect(result.total).toBe(3);
    expect(result.agreements).toBe(1);
    expect(result.agreementRate).toBeCloseTo(1 / 3, 5);
    expect(result.oneStepDisagreements).toBe(1);
    expect(result.majorDisagreements).toBe(1);
    expect(result.disagreements).toEqual([
      { captureId: "b", myTemp: "hot", systemTemp: "warm", tempDistance: 1 },
      { captureId: "c", myTemp: "cold", systemTemp: "hot", tempDistance: 3 },
    ]);
  });

  it("returns 0 agreementRate and 0 distance counts for an empty dataset", () => {
    const result = aggregateEval([]);

    expect(result.total).toBe(0);
    expect(result.agreementRate).toBe(0);
    expect(result.oneStepDisagreements).toBe(0);
    expect(result.majorDisagreements).toBe(0);
  });
});
