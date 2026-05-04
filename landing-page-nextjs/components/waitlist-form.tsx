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
          message: payload.error?.message || "신청이 안 됐어요. 잠시 후 다시 시도해주세요.",
        });
        return;
      }

      setEmail("");
      setNote("");
      setState({
        kind: "success",
        message: "신청 완료! 베타 오픈하면 가장 먼저 알려드릴게요 :)",
      });
    } catch {
      setState({
        kind: "error",
        message: "연결이 잠시 끊긴 것 같아요. 다시 시도해주세요.",
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
        어떤 순간에 가장 필요하세요? (선택)
      </label>
      <textarea
        className={styles.textarea}
        id="note"
        name="note"
        placeholder="예: 소개팅 후에 애프터 보낼지 말지 고민될 때"
        rows={4}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {state.kind === "pending" ? (
        <div className={`${styles.statusBox} ${styles.statusPending}`}>
          등록 중이에요...
        </div>
      ) : null}
      {state.kind === "success" ? (
        <div className={`${styles.statusBox} ${styles.statusSuccess}`}>{state.message}</div>
      ) : null}
      {state.kind === "error" ? (
        <div className={`${styles.statusBox} ${styles.statusError}`}>{state.message}</div>
      ) : null}

      <button className={styles.submitButton} type="submit" disabled={state.kind === "pending"}>
        {state.kind === "pending" ? "등록 중..." : "먼저 써보기 신청"}
      </button>

      <p className={styles.finePrint}>
        이메일은 베타 오픈 안내에만 사용해요. 스팸은 절대 보내지 않을게요.
      </p>
    </form>
  );
}
