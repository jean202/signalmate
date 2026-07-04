import type { CaptureLabel } from "./capture";

/**
 * 온도 밴드: "cold" | "neutral" | "warm" | "hot"
 */
export type Temperature = CaptureLabel["temperature"];
export type TemperatureDistance = 0 | 1 | 2 | 3;

const TEMPERATURE_ORDER: Record<Temperature, number> = {
  cold: 0,
  neutral: 1,
  warm: 2,
  hot: 3,
};

/**
 * 평가 행: 캡처 ID와 학습자 레이블(myTemp) vs 규칙 엔진(systemTemp) 온도 비교 데이터.
 */
export type EvalRow = {
  captureId: string;
  myTemp: Temperature;
  systemTemp: Temperature;
  tempDistance: TemperatureDistance;
};

/**
 * 평가 요약: 전체, 합의 건수, 합의율(0~1), 거리별 불일치 카운트, 불일치 목록.
 */
export type EvalSummary = {
  total: number;
  agreements: number;
  agreementRate: number;
  oneStepDisagreements: number;
  majorDisagreements: number;
  disagreements: EvalRow[];
};

/**
 * 룰 엔진 overall(0~100)을 거친 temperature 밴드로 매핑.
 *
 * 의도적으로 거친 매핑이며, 불일치가 학습 재료가 된다.
 * 경계: <40 cold, <60 neutral, <75 warm, 이상 hot.
 *
 * @param overall - 규칙 엔진의 overall 스코어 (0~100)
 * @returns 온도 밴드
 */
export function deriveTemperature(overall: number): Temperature {
  if (overall < 40) return "cold";
  if (overall < 60) return "neutral";
  if (overall < 75) return "warm";
  return "hot";
}

/**
 * 두 temperature 밴드가 몇 단계 떨어져 있는지 계산.
 */
export function temperatureDistance(
  myTemp: Temperature,
  systemTemp: Temperature,
): TemperatureDistance {
  return Math.abs(TEMPERATURE_ORDER[myTemp] - TEMPERATURE_ORDER[systemTemp]) as TemperatureDistance;
}

/**
 * 평가 행 생성 시 distance를 함께 고정해 CLI와 집계가 같은 값을 사용하게 한다.
 */
export function createEvalRow(params: {
  captureId: string;
  myTemp: Temperature;
  systemTemp: Temperature;
}): EvalRow {
  return {
    ...params,
    tempDistance: temperatureDistance(params.myTemp, params.systemTemp),
  };
}

/**
 * 평가 행 배열을 집계하여 학습자 vs 시스템 합의도 계산.
 *
 * myTemp와 systemTemp가 일치하는 행을 합의로 계산,
 * 불일치하는 행을 disagreements 배열에 수집.
 * 빈 배열은 agreementRate 0으로 처리(divide-by-zero 방지).
 *
 * @param rows - 평가 행 배열
 * @returns 집계 요약
 */
export function aggregateEval(rows: EvalRow[]): EvalSummary {
  const disagreements = rows.filter((row) => row.tempDistance > 0);
  const agreements = rows.length - disagreements.length;
  return {
    total: rows.length,
    agreements,
    agreementRate: rows.length === 0 ? 0 : agreements / rows.length,
    oneStepDisagreements: disagreements.filter((row) => row.tempDistance === 1).length,
    majorDisagreements: disagreements.filter((row) => row.tempDistance >= 2).length,
    disagreements,
  };
}
