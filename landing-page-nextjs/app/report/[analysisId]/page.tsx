"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DeepReportContent, DraftCheckResult } from "@/lib/deep-report";
import { DRAFT_CHECK_LIMIT } from "@/lib/deep-report";
import styles from "./report.module.css";

type PageProps = {
  params: Promise<{ analysisId: string }>;
};

type LoadState =
  | { phase: "loading" | "generating" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      content: DeepReportContent;
      fallback: boolean;
      draftCheckCount: number;
    };

type ReportPayload = {
  status: string;
  content: DeepReportContent | null;
  draftCheckCount: number;
};

const OUTCOME_LABELS: Record<string, string> = {
  progressed: "진전됨",
  stalled: "정체됨",
  ended: "종료됨",
};

export default function DeepReportPage({ params }: PageProps) {
  const { analysisId } = use(params);
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const startedRef = useRef(false);

  const generate = useCallback(async () => {
    setState({ phase: "generating" });

    const response = await fetch(`/api/v1/analyses/${analysisId}/deep-report`, {
      method: "POST",
    });

    if (response.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(`/report/${analysisId}`)}`;
      return;
    }
    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => null);
      setState({
        phase: "error",
        message: json?.error?.message ?? "리포트를 불러오지 못했어요.",
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const chunk of events) {
        const line = chunk.trim();
        if (!line.startsWith("data: ")) continue;

        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (event.type === "complete") {
          setState({
            phase: "ready",
            content: event.content as DeepReportContent,
            fallback: Boolean(event.fallback),
            draftCheckCount: 0,
          });
        } else if (event.type === "error") {
          setState({
            phase: "error",
            message: String(event.message ?? "리포트 생성에 실패했어요."),
          });
        }
      }
    }
  }, [analysisId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const res = await fetch(`/api/v1/analyses/${analysisId}/deep-report`);
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/report/${analysisId}`)}`;
        return;
      }
      if (res.ok) {
        const json = await res.json();
        const report = json.data.report as ReportPayload;
        if (report.status === "completed" && report.content) {
          setState({
            phase: "ready",
            content: report.content,
            fallback: false,
            draftCheckCount: report.draftCheckCount,
          });
          return;
        }
      }
      await generate();
    })().catch(() => {
      setState({ phase: "error", message: "리포트를 불러오지 못했어요." });
    });
  }, [analysisId, generate]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>심화 분석 리포트</h1>
        <Link href="/analyze" className={styles.backLink}>
          새 분석 하러 가기
        </Link>
      </header>

      {state.phase === "loading" || state.phase === "generating" ? (
        <section className={styles.card}>
          <p>{state.phase === "generating" ? "리포트를 만드는 중이에요..." : "불러오는 중..."}</p>
        </section>
      ) : null}

      {state.phase === "error" ? (
        <section className={styles.card}>
          <p>{state.message}</p>
          <button type="button" className={styles.primaryButton} onClick={generate}>
            다시 시도
          </button>
        </section>
      ) : null}

      {state.phase === "ready" ? (
        <ReportBody
          analysisId={analysisId}
          content={state.content}
          fallback={state.fallback}
          initialUsed={state.draftCheckCount}
        />
      ) : null}
    </main>
  );
}

function ReportBody({
  analysisId,
  content,
  fallback,
  initialUsed,
}: {
  analysisId: string;
  content: DeepReportContent;
  fallback: boolean;
  initialUsed: number;
}) {
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState(Math.max(0, DRAFT_CHECK_LIMIT - initialUsed));
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<DraftCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);

    try {
      const response = await fetch(`/api/v1/analyses/${analysisId}/deep-report/draft-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftText: draft }),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        setCheckError(json?.error?.message ?? "검증에 실패했어요.");
      } else {
        setCheckResult(json.data.result);
        setRemaining(json.data.remaining);
      }
    } catch {
      setCheckError("검증에 실패했어요.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      {fallback ? (
        <p className={styles.fallbackNote}>
          일부 심화 결과를 만들지 못해 기본 분석 기반으로 보여드려요. 다시 생성하면 전체 리포트를 받을 수 있어요.
        </p>
      ) : null}

      {content.similarCases ? (
        <section className={styles.card}>
          <h2>비슷한 상황들은 이렇게 흘러갔어요</h2>
          <p className={styles.patternSummary}>{content.similarCases.patternSummary}</p>
          <div className={styles.caseGrid}>
            {content.similarCases.cases.map((item, index) => (
              <article key={index} className={styles.caseCard}>
                <span className={styles.outcomeBadge} data-outcome={item.outcome}>
                  {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                </span>
                <p>{item.flowSummary}</p>
                <p className={styles.lesson}>{item.lesson}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <h2>행동 시나리오 시뮬레이션</h2>
        <div className={styles.scenarioGrid}>
          {content.scenarios.map((scenario, index) => (
            <article key={index} className={styles.scenarioCard}>
              <header>
                <h3>{scenario.actionLabel}</h3>
                <span className={styles.confidence}>{scenario.confidence}</span>
              </header>
              <p>{scenario.expectedFlow}</p>
              <p className={styles.risk}>리스크: {scenario.risk}</p>
              {scenario.bestMessage ? (
                <p className={styles.bestMessage}>추천 메시지: {scenario.bestMessage}</p>
              ) : null}
              <p className={styles.timing}>타이밍: {scenario.timing}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2>보내기 전에 초안 검증하기</h2>
        <p className={styles.remaining}>남은 횟수: {remaining}회</p>
        <textarea
          className={styles.draftInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="보내려는 메시지를 붙여넣어 보세요"
          maxLength={500}
          rows={3}
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleCheck}
          disabled={checking || remaining <= 0 || draft.trim().length === 0}
        >
          {checking ? "검증 중..." : remaining <= 0 ? "횟수를 모두 사용했어요" : "검증하기"}
        </button>
        {checkError ? <p className={styles.error}>{checkError}</p> : null}
        {checkResult ? (
          <div className={styles.checkResult}>
            <p>
              <strong>예상 반응</strong> - {checkResult.predictedReaction}
            </p>
            <p>
              <strong>리스크</strong> - {checkResult.riskLevel}
              {checkResult.risks.length > 0 ? ` (${checkResult.risks.join(" / ")})` : ""}
            </p>
            <p>
              <strong>개선안</strong> - {checkResult.improvedDraft}
            </p>
            <p className={styles.rationale}>{checkResult.rationale}</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
