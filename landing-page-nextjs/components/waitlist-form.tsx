"use client";

import { FormEvent, useState } from "react";
import styles from "./waitlist-form.module.css";

type SubmitState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function WaitlistForm() {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "pending" });

    try {
      const response = await fetch("/api/v1/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          note,
          source: "landing",
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        error: { message: string } | null;
      };

      if (!response.ok || !payload.success) {
        setState({
          kind: "error",
          message: payload.error?.message || "대기자 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      setEmail("");
      setNote("");
      setState({
        kind: "success",
        message: "대기자 등록이 완료되었습니다. 베타 오픈 전에 먼저 안내드리겠습니다.",
      });
    } catch {
      setState({
        kind: "error",
        message: "네트워크 오류로 등록하지 못했습니다. 연결 상태를 확인해 주세요.",
      });
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.inputLabel} htmlFor="email">
        이메일
      </label>
      <input
        className={styles.input}
        id="email"
        name="email"
        placeholder="you@example.com"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label className={styles.inputLabel} htmlFor="note">
        가장 필요한 상황
      </label>
      <textarea
        className={styles.textarea}
        id="note"
        name="note"
        placeholder="예: 소개팅 후 애프터 가능성 해석"
        rows={4}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {state.kind === "pending" ? (
        <div className={`${styles.statusBox} ${styles.statusPending}`}>
          등록 요청을 처리하고 있습니다.
        </div>
      ) : null}
      {state.kind === "success" ? (
        <div className={`${styles.statusBox} ${styles.statusSuccess}`}>{state.message}</div>
      ) : null}
      {state.kind === "error" ? (
        <div className={`${styles.statusBox} ${styles.statusError}`}>{state.message}</div>
      ) : null}

      <button className={styles.submitButton} type="submit" disabled={state.kind === "pending"}>
        {state.kind === "pending" ? "등록 중..." : "베타 대기자 등록"}
      </button>

      <p className={styles.finePrint}>
        현재 프로토타입은 로컬 개발용 저장 방식을 사용합니다. 운영 전환 시 PostgreSQL
        기반 저장으로 교체하는 전제를 두고 있습니다.
      </p>
    </form>
  );
}
