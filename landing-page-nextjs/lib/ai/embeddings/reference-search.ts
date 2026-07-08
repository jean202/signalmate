// Task 3에서 실제 검색 함수를 구현할 예정. 지금은 소비 측(deep-report 등)에서
// 참조할 수 있도록 타입만 먼저 정의한다.
export type ReferenceCaseHit = {
  id: string;
  summaryText: string;
  situationType: string;
  outcomeLabel: "progressed" | "stalled" | "ended";
  lesson: string;
  similarity: number;
};
