# Situation-First Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow SignalMate analysis to start from a relationship situation note, not only from parsed chat messages, and show meeting/follow-up context in the resulting guidance.

**Architecture:** Keep the existing conversation and analysis pipeline. Add a small typed situation-input layer, merge guided situation answers into `situationContext`, allow non-chat inputs through the conversation API, add situation-aware rule signals for sparse-message inputs, and update the analysis UI copy and result grouping. No Prisma schema change is required for this first slice.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, existing JSON/Prisma store adapter, existing hybrid analysis runner, existing Claude prompt chain.

## Global Constraints

- 기본 응답과 사용자-facing copy는 한국어로 작성한다.
- 1차 구현은 DB 스키마 변경 없이 진행한다.
- 캡처 원본 이미지는 repo, DB, 로그, learning 폴더에 저장하지 않는다.
- 채팅은 중요한 근거지만 필수 입력이 아니다.
- 채팅이 없는 경우에도 `rawText` 또는 `situationContext`가 충분하면 분석을 시작할 수 있어야 한다.
- 기존 채팅 캡처 분석 흐름은 계속 동작해야 한다.
- 결과는 채팅 신호, 실제 만남 신호, 만남 뒤 연락 신호, 가장 큰 불확실성을 구분해 보여준다.
- LLM 호출은 기존 fallback과 견고한 JSON 파싱 흐름을 유지한다.

---

## File Structure

All paths below are under `landing-page-nextjs/` unless they start with `docs/`.

- Create: `lib/situation-input.ts`  
  Responsibility: typed situation-first answer values, labels, validation helpers, and "can analyze without chat messages" predicate.

- Modify: `lib/situation-context-builder.ts`  
  Responsibility: convert the expanded situation answers into natural Korean context text for prompts and rule analysis.

- Create: `lib/__tests__/situation-context-builder.test.ts`  
  Responsibility: unit tests for the expanded situation answer text and validation helper behavior.

- Modify: `app/api/v1/conversations/route.ts`  
  Responsibility: accept `inputFocus`/guided situation answers, allow situation-only analysis when the text is meaningful, and still reject empty/too-short inputs.

- Create: `app/api/v1/conversations/__tests__/route.test.ts`  
  Responsibility: route tests for chat input, situation-only input, and invalid empty input.

- Modify: `app/api/v1/conversations/[conversationId]/analyses/stream/route.ts`  
  Responsibility: include situation fields in the inline conversation type and keep stateless analysis working for situation-only conversations.

- Modify: `lib/rule-based-analysis.ts`  
  Responsibility: add situation-aware rule signals and summary/action fallback when chat messages are sparse.

- Modify: `lib/__tests__/rule-based-analysis.test.ts`  
  Responsibility: tests for meeting-note-only signals, post-meeting follow-up caution, and signal conflict.

- Modify: `lib/ai/prompts/system-prompt.ts`  
  Responsibility: reframe prompts from "대화 분석" to "관계 상황 분석" while preserving evidence-first behavior.

- Modify: `lib/ai/__tests__/prompts.test.ts`  
  Responsibility: verify situation context and no-chat instructions are present in LLM prompts.

- Create: `lib/signal-groups.ts`  
  Responsibility: pure helper that groups signal keys into `chat`, `meeting`, `followUp`, and `uncertainty` buckets for UI rendering.

- Create: `lib/__tests__/signal-groups.test.ts`  
  Responsibility: unit tests for signal grouping and fallback grouping.

- Modify: `components/analysis-experience.tsx`  
  Responsibility: update the input UI copy, add situation answer controls, allow non-chat text to proceed, send guided answers to API, and render grouped signals.

- Modify: `components/analysis-experience.module.css`  
  Responsibility: small layout styles for situation note preview, extra context choices, and grouped result sections.

Shared interfaces produced by Task 1 and consumed by later tasks:

```ts
export type SituationInputFocus = "chat" | "meeting_note" | "mixed" | "follow_up";
export type MeetingVibe = "none" | "awkward" | "normal" | "good" | "great";
export type OtherInitiative = "low" | "medium" | "high" | "unknown";
export type AfterMeetingContact =
  | "none"
  | "self_first"
  | "other_first"
  | "slower"
  | "ongoing"
  | "not_applicable";
export type DesiredHelp = "next_message" | "ask_for_date" | "wait_or_send" | "decide_to_stop";

export type GuidedAnswers = {
  inputFocus?: SituationInputFocus;
  meetingCount?: "none" | "once" | "2_3_times" | "4_plus";
  meetingVibe?: MeetingVibe;
  otherInitiative?: OtherInitiative;
  afterMeetingContact?: AfterMeetingContact;
  desiredHelp?: DesiredHelp;
  otherStyle?: (
    | "fast_reply"
    | "slow_reply"
    | "short_messages"
    | "long_messages"
    | "uses_emoji"
    | "unknown"
  )[];
  freeText?: string;
};

export function isSituationFirstFocus(focus: SituationInputFocus | undefined): boolean;

export function hasEnoughSituationInput(params: {
  rawText?: string | null;
  situationContext?: string | null;
  guidedAnswers?: GuidedAnswers | null;
}): boolean;
```

---

### Task 1: Situation Input Types And Context Builder

**Files:**
- Create: `landing-page-nextjs/lib/situation-input.ts`
- Modify: `landing-page-nextjs/lib/situation-context-builder.ts`
- Create: `landing-page-nextjs/lib/__tests__/situation-context-builder.test.ts`

**Interfaces:**
- Consumes: no earlier task output.
- Produces: `GuidedAnswers`, `SituationInputFocus`, `hasEnoughSituationInput()`, expanded `buildGuidedSituationContext()`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/situation-context-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildGuidedSituationContext,
  mergeSituationContext,
} from "../situation-context-builder";
import { hasEnoughSituationInput, isSituationFirstFocus } from "../situation-input";

describe("buildGuidedSituationContext", () => {
  it("builds Korean context for meeting-note focused input", () => {
    expect(
      buildGuidedSituationContext({
        inputFocus: "meeting_note",
        meetingCount: "once",
        meetingVibe: "good",
        otherInitiative: "low",
        afterMeetingContact: "self_first",
        desiredHelp: "wait_or_send",
        freeText: "상대가 웃으면서 듣긴 했지만 다음 약속 이야기는 없었습니다.",
      }),
    ).toBe(
      "입력은 실제 만남 후기 중심입니다. 직접 1번 만났습니다. 만났을 때 분위기는 좋았습니다. 상대 적극성은 낮아 보였습니다. 만남 뒤에는 내가 먼저 연락했습니다. 사용자는 연락을 더 할지 기다릴지 판단하고 싶어합니다. 상대가 웃으면서 듣긴 했지만 다음 약속 이야기는 없었습니다.",
    );
  });

  it("merges guided answers and free situation context without exceeding 2000 chars", () => {
    const result = mergeSituationContext("추가로 상대 답장이 짧아졌습니다.", {
      inputFocus: "follow_up",
      afterMeetingContact: "slower",
      desiredHelp: "next_message",
    });

    expect(result).toBe(
      "입력은 만남 뒤 연락 흐름 중심입니다. 만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다. 사용자는 다음 메시지를 어떻게 보낼지 알고 싶어합니다. 추가로 상대 답장이 짧아졌습니다.",
    );
    expect(result?.length).toBeLessThanOrEqual(2000);
  });
});

describe("situation input helpers", () => {
  it("treats non-chat focus as situation-first", () => {
    expect(isSituationFirstFocus("chat")).toBe(false);
    expect(isSituationFirstFocus("meeting_note")).toBe(true);
    expect(isSituationFirstFocus("mixed")).toBe(true);
    expect(isSituationFirstFocus("follow_up")).toBe(true);
    expect(isSituationFirstFocus(undefined)).toBe(false);
  });

  it("allows analysis when situation text is meaningful even without parsed messages", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아졌습니다.",
        guidedAnswers: { inputFocus: "meeting_note" },
      }),
    ).toBe(true);
  });

  it("rejects very short non-chat input", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "만났어",
        guidedAnswers: { inputFocus: "meeting_note" },
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `landing-page-nextjs/`:

```bash
npx vitest run lib/__tests__/situation-context-builder.test.ts
```

Expected: FAIL because `../situation-input` does not exist and `GuidedAnswers` does not include the new fields.

- [ ] **Step 3: Create `lib/situation-input.ts`**

```ts
export type SituationInputFocus = "chat" | "meeting_note" | "mixed" | "follow_up";
export type MeetingVibe = "none" | "awkward" | "normal" | "good" | "great";
export type OtherInitiative = "low" | "medium" | "high" | "unknown";
export type AfterMeetingContact =
  | "none"
  | "self_first"
  | "other_first"
  | "slower"
  | "ongoing"
  | "not_applicable";
export type DesiredHelp = "next_message" | "ask_for_date" | "wait_or_send" | "decide_to_stop";

export type GuidedAnswers = {
  inputFocus?: SituationInputFocus;
  meetingCount?: "none" | "once" | "2_3_times" | "4_plus";
  meetingVibe?: MeetingVibe;
  otherInitiative?: OtherInitiative;
  afterMeetingContact?: AfterMeetingContact;
  desiredHelp?: DesiredHelp;
  otherStyle?: (
    | "fast_reply"
    | "slow_reply"
    | "short_messages"
    | "long_messages"
    | "uses_emoji"
    | "unknown"
  )[];
  freeText?: string;
};

const SITUATION_FIRST_FOCUS: SituationInputFocus[] = ["meeting_note", "mixed", "follow_up"];
const MIN_SITUATION_TEXT_LENGTH = 20;

export function isSituationFirstFocus(focus: SituationInputFocus | undefined): boolean {
  return focus !== undefined && SITUATION_FIRST_FOCUS.includes(focus);
}

export function hasEnoughSituationInput(params: {
  rawText?: string | null;
  situationContext?: string | null;
  guidedAnswers?: GuidedAnswers | null;
}): boolean {
  const focus = params.guidedAnswers?.inputFocus;
  if (!isSituationFirstFocus(focus)) {
    return false;
  }

  const text = [params.rawText, params.situationContext, params.guidedAnswers?.freeText]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  if (text.length >= MIN_SITUATION_TEXT_LENGTH) {
    return true;
  }

  return Boolean(
    params.guidedAnswers?.meetingVibe &&
      params.guidedAnswers.meetingVibe !== "none" &&
      params.guidedAnswers?.afterMeetingContact &&
      params.guidedAnswers.afterMeetingContact !== "not_applicable",
  );
}
```

- [ ] **Step 4: Extend `lib/situation-context-builder.ts`**

Remove the local `GuidedAnswers` type and import it:

```ts
import type { GuidedAnswers } from "@/lib/situation-input";
```

Add these label maps after the existing maps:

```ts
const INPUT_FOCUS_LABELS: Record<string, string> = {
  chat: "입력은 채팅 대화 중심입니다",
  meeting_note: "입력은 실제 만남 후기 중심입니다",
  mixed: "입력은 채팅과 실제 만남 후기가 섞여 있습니다",
  follow_up: "입력은 만남 뒤 연락 흐름 중심입니다",
};

const OTHER_INITIATIVE_LABELS: Record<string, string> = {
  low: "상대 적극성은 낮아 보였습니다",
  medium: "상대 적극성은 보통으로 보였습니다",
  high: "상대 적극성은 높아 보였습니다",
  unknown: "상대 적극성은 아직 판단하기 어렵습니다",
};

const AFTER_MEETING_CONTACT_LABELS: Record<string, string> = {
  none: "만남 뒤 아직 연락이 없습니다",
  self_first: "만남 뒤에는 내가 먼저 연락했습니다",
  other_first: "만남 뒤에는 상대가 먼저 연락했습니다",
  slower: "만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다",
  ongoing: "만남 뒤 연락이 이어지고 있습니다",
  not_applicable: "만남 뒤 연락 흐름은 아직 해당 없습니다",
};

const DESIRED_HELP_LABELS: Record<string, string> = {
  next_message: "사용자는 다음 메시지를 어떻게 보낼지 알고 싶어합니다",
  ask_for_date: "사용자는 애프터나 다음 만남을 제안해도 되는지 알고 싶어합니다",
  wait_or_send: "사용자는 연락을 더 할지 기다릴지 판단하고 싶어합니다",
  decide_to_stop: "사용자는 관계를 정리할지 판단하고 싶어합니다",
};
```

Inside `buildGuidedSituationContext()`, push new labels before `otherStyle`:

```ts
if (answers.inputFocus && INPUT_FOCUS_LABELS[answers.inputFocus]) {
  sentences.push(INPUT_FOCUS_LABELS[answers.inputFocus]);
}

if (answers.otherInitiative && OTHER_INITIATIVE_LABELS[answers.otherInitiative]) {
  sentences.push(OTHER_INITIATIVE_LABELS[answers.otherInitiative]);
}

if (
  answers.afterMeetingContact &&
  AFTER_MEETING_CONTACT_LABELS[answers.afterMeetingContact]
) {
  sentences.push(AFTER_MEETING_CONTACT_LABELS[answers.afterMeetingContact]);
}

if (answers.desiredHelp && DESIRED_HELP_LABELS[answers.desiredHelp]) {
  sentences.push(DESIRED_HELP_LABELS[answers.desiredHelp]);
}
```

Keep the final return:

```ts
return sentences.join(". ").replace(/\.\./g, ".") + ".";
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run lib/__tests__/situation-context-builder.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add landing-page-nextjs/lib/situation-input.ts landing-page-nextjs/lib/situation-context-builder.ts landing-page-nextjs/lib/__tests__/situation-context-builder.test.ts
git commit -m "feat: add situation input context helpers"
```

---

### Task 2: Conversation API Accepts Situation-Only Input

**Files:**
- Modify: `landing-page-nextjs/app/api/v1/conversations/route.ts`
- Create: `landing-page-nextjs/app/api/v1/conversations/__tests__/route.test.ts`
- Modify: `landing-page-nextjs/app/api/v1/conversations/[conversationId]/analyses/stream/route.ts`

**Interfaces:**
- Consumes: `GuidedAnswers`, `hasEnoughSituationInput()` from Task 1.
- Produces: API behavior where `messages: []` is valid only for meaningful situation-first input.

- [ ] **Step 1: Write route tests**

Create `app/api/v1/conversations/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const createConversationMock = vi.fn();

vi.mock("@/lib/store", () => ({
  createConversation: createConversationMock,
}));

vi.mock("@/lib/auth-helpers", () => ({
  getCurrentUserId: vi.fn(async () => null),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/v1/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/conversations", () => {
  beforeEach(() => {
    createConversationMock.mockReset();
    createConversationMock.mockImplementation(async (input) => ({
      id: "conv_1",
      saveMode: input.saveMode ?? "temporary",
      relationshipStage: input.relationshipStage,
      meetingChannel: input.meetingChannel,
      userGoal: input.userGoal,
      rawText: input.rawText,
      situationContext: input.situationContext,
      messages: input.messages,
    }));
  });

  it("creates a conversation from situation-only meeting text", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        saveMode: "temporary",
        rawText:
          "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아져서 더 연락해도 될지 고민입니다.",
        guidedAnswers: {
          inputFocus: "meeting_note",
          meetingCount: "once",
          meetingVibe: "normal",
          afterMeetingContact: "slower",
          desiredHelp: "wait_or_send",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText:
          "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아져서 더 연락해도 될지 고민입니다.",
        messages: [],
        situationContext: expect.stringContaining("입력은 실제 만남 후기 중심입니다"),
      }),
    );
    const payload = await response.json();
    expect(payload.data.conversation.messageCount).toBe(0);
  });

  it("keeps rejecting short non-chat input", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        rawText: "만났어",
        guidedAnswers: { inputFocus: "meeting_note" },
      }),
    );

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("still creates a conversation from parsed chat messages", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "evaluate_interest",
        rawText: "[오후 8:10] 나: 잘 들어갔어요?\n[오후 8:13] 상대: 네 덕분에요",
        guidedAnswers: { inputFocus: "chat" },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ senderRole: "self" }),
          expect.objectContaining({ senderRole: "other" }),
        ]),
      }),
    );
  });
});
```

- [ ] **Step 2: Run route test to verify it fails**

```bash
npx vitest run app/api/v1/conversations/__tests__/route.test.ts
```

Expected: FAIL because `route.ts` still rejects zero parsed messages.

- [ ] **Step 3: Modify `app/api/v1/conversations/route.ts` imports and body type**

Change imports:

```ts
import { errorResponse, successResponse } from "@/lib/api-response";
import { createConversation, type SaveMode, type SenderRole } from "@/lib/store";
import { mergeSituationContext } from "@/lib/situation-context-builder";
import { getCurrentUserId } from "@/lib/auth-helpers";
import { parseChatText } from "@/lib/chat-parser";
import {
  hasEnoughSituationInput,
  type GuidedAnswers,
} from "@/lib/situation-input";
```

Keep `guidedAnswers?: GuidedAnswers;` in `ConversationCreateBody`.

- [ ] **Step 4: Compute `situationContext` before message validation**

Move the existing `situationContext` creation above the `normalizedMessages.length` check:

```ts
const situationContext = mergeSituationContext(body.situationContext, body.guidedAnswers);
if (situationContext && situationContext.length > 2000) {
  return errorResponse(400, "VALIDATION_ERROR", "situationContext must be 2000 characters or less.");
}

const allowsSituationOnly = hasEnoughSituationInput({
  rawText: body.rawText,
  situationContext,
  guidedAnswers: body.guidedAnswers,
});

if (normalizedMessages.length === 0 && !allowsSituationOnly) {
  return errorResponse(
    400,
    "VALIDATION_ERROR",
    "채팅 메시지를 찾지 못했어요. 만남 후기만 입력할 때는 상황을 20자 이상 적고 입력 중심을 만남 후기나 만남 뒤 연락으로 선택해 주세요.",
  );
}
```

Remove the old block:

```ts
if (normalizedMessages.length === 0) {
  return errorResponse(400, "VALIDATION_ERROR", "Could not parse any messages from the input.");
}
```

Use `situationContext` in `createConversation()` as before.

- [ ] **Step 5: Update stream inline type**

In `app/api/v1/conversations/[conversationId]/analyses/stream/route.ts`, keep the runtime behavior but allow an empty messages array by preserving the current type:

```ts
messages: Array<{
  senderRole: string;
  messageText: string;
  sentAt: string | null;
  sequenceNo: number;
}>;
```

No additional validation is added in this route. The conversation creation route owns validation, and inline mode receives the already-normalized payload from the client.

- [ ] **Step 6: Run tests**

```bash
npx vitest run app/api/v1/conversations/__tests__/route.test.ts
npm test -- app/api/v1/conversations/[conversationId]/analyses/__tests__/analysis-stream-route.test.ts
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add landing-page-nextjs/app/api/v1/conversations/route.ts landing-page-nextjs/app/api/v1/conversations/__tests__/route.test.ts landing-page-nextjs/app/api/v1/conversations/[conversationId]/analyses/stream/route.ts
git commit -m "feat: allow situation-only conversation input"
```

---

### Task 3: Situation-Aware Rule Signals

**Files:**
- Modify: `landing-page-nextjs/lib/rule-based-analysis.ts`
- Modify: `landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts`

**Interfaces:**
- Consumes: existing `StoredConversation.situationContext` and `rawText`.
- Produces: new signal keys `meeting_positive_vibe`, `meeting_low_reciprocity`, `post_meeting_followup_positive`, `post_meeting_followup_caution`, `signal_conflict`.

- [ ] **Step 1: Add failing tests**

Append to `lib/__tests__/rule-based-analysis.test.ts`:

```ts
describe("situation-first analysis", () => {
  it("creates meeting and follow-up signals when there are no parsed chat messages", () => {
    const conversation = makeConversation([], {
      relationshipStage: "after_first_date",
      rawText:
        "어제 처음 만났고 대화는 두 시간 정도 이어졌습니다. 상대가 웃으면서 듣긴 했지만 질문은 많지 않았고 다음 약속 이야기는 없었습니다. 집에 와서 내가 먼저 연락했고 답장은 왔지만 짧았습니다.",
      situationContext:
        "입력은 실제 만남 후기 중심입니다. 직접 1번 만났습니다. 만났을 때 분위기는 좋았습니다. 상대 적극성은 낮아 보였습니다. 만남 뒤에는 내가 먼저 연락했습니다. 사용자는 연락을 더 할지 기다릴지 판단하고 싶어합니다.",
      messages: [],
    });

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).toEqual(
      expect.arrayContaining([
        "meeting_positive_vibe",
        "meeting_low_reciprocity",
        "post_meeting_followup_caution",
        "signal_conflict",
      ]),
    );
    expect(result.overallSummary).toContain("만남");
    expect(result.recommendedAction).toBe("slow_down");
  });

  it("treats other-first follow-up as a positive post-meeting signal", () => {
    const conversation = makeConversation([], {
      relationshipStage: "after_first_date",
      rawText:
        "어제 만남 분위기가 좋았고 집에 온 뒤 상대가 먼저 잘 들어갔냐고 연락했습니다. 이후에도 연락이 이어지고 있습니다.",
      situationContext:
        "입력은 만남 뒤 연락 흐름 중심입니다. 만났을 때 분위기는 좋았습니다. 만남 뒤에는 상대가 먼저 연락했습니다. 만남 뒤 연락이 이어지고 있습니다.",
      messages: [],
    });

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).toContain("post_meeting_followup_positive");
    expect(result.recommendedAction).toBe("keep_light");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/rule-based-analysis.test.ts -t "situation-first analysis"
```

Expected: FAIL because the new signal keys are not produced and the no-message summary is still chat-centric.

- [ ] **Step 3: Add situation text helpers to `rule-based-analysis.ts`**

Add near the existing regex constants:

```ts
function getSituationText(conversation: StoredConversation): string {
  return [conversation.rawText, conversation.situationContext]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}

function hasSituationEvidence(conversation: StoredConversation): boolean {
  return getSituationText(conversation).length >= 20;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
```

Add these pattern groups:

```ts
const meetingPositivePatterns = [
  /분위기(?:는|가)?\s*(?:좋|괜찮|편|즐거|아주 좋)/i,
  /대화(?:는|가)?\s*(?:끊기지|이어졌|잘 통|편했)/i,
  /웃으면서|잘 들어줬|시간(?:이)?\s*(?:빨리|금방)/i,
];

const meetingLowReciprocityPatterns = [
  /질문(?:은|이)?\s*(?:많지|적|없)/i,
  /다음\s*(?:약속|만남|일정).*(?:없|안)/i,
  /또\s*보자는\s*말(?:은|이)?\s*없/i,
  /상대 적극성은 낮/i,
];

const followUpPositivePatterns = [
  /상대가 먼저 연락/i,
  /연락(?:이)?\s*이어지고/i,
  /먼저\s*잘\s*들어갔/i,
];

const followUpCautionPatterns = [
  /답장(?:은|이)?\s*(?:짧|느려|늦)/i,
  /연락.*(?:줄|식|뜸)/i,
  /내가 먼저 연락/i,
  /만남 뒤 연락에서 답장이 느려지거나 짧아졌/i,
];
```

- [ ] **Step 4: Add situation signal builder**

Add before `buildRuleBasedAnalysis()`:

```ts
function addSituationSignals(
  conversation: StoredConversation,
  signalFactory: ReturnType<typeof buildSignalFactory>,
): {
  hasMeetingPositive: boolean;
  hasMeetingCaution: boolean;
  hasFollowUpPositive: boolean;
  hasFollowUpCaution: boolean;
} {
  const text = getSituationText(conversation);
  const hasMeetingPositive = hasAny(text, meetingPositivePatterns);
  const hasMeetingCaution = hasAny(text, meetingLowReciprocityPatterns);
  const hasFollowUpPositive = hasAny(text, followUpPositivePatterns);
  const hasFollowUpCaution = hasAny(text, followUpCautionPatterns);

  if (hasMeetingPositive) {
    signalFactory.add(
      "positive",
      "meeting_positive_vibe",
      "실제 만남 분위기는 나쁘지 않았어요",
      "사용자가 기록한 만남 후기에 대화가 이어지거나 분위기가 괜찮았다는 근거가 있습니다.",
      "만남 후기에서 좋은 분위기나 편한 대화 흐름이 확인됐습니다.",
      "medium",
    );
  }

  if (hasMeetingCaution) {
    signalFactory.add(
      "ambiguous",
      "meeting_low_reciprocity",
      "만남 중 상호 호응은 더 확인이 필요해요",
      "분위기는 괜찮았더라도 질문, 다음 만남 언급, 상대 주도성이 약했다는 기록이 있습니다.",
      "만남 후기에서 질문 부족이나 다음 약속 언급 부재가 확인됐습니다.",
      "medium",
    );
  }

  if (hasFollowUpPositive) {
    signalFactory.add(
      "positive",
      "post_meeting_followup_positive",
      "만남 뒤 연락이 이어지고 있어요",
      "상대가 먼저 연락했거나 만남 뒤 대화가 이어지는 흐름은 긍정 신호입니다.",
      "만남 이후 상대 선연락 또는 이어지는 연락 흐름이 확인됐습니다.",
      "medium",
    );
  }

  if (hasFollowUpCaution) {
    signalFactory.add(
      "caution",
      "post_meeting_followup_caution",
      "만남 뒤 연락 온도는 조심스럽게 봐야 해요",
      "만남 이후 답장이 짧아지거나 느려진 흐름은 최신 신호로 보수적으로 해석해야 합니다.",
      "만남 이후 짧거나 느려진 답장 흐름이 확인됐습니다.",
      "medium",
    );
  }

  if ((hasMeetingPositive || hasFollowUpPositive) && (hasMeetingCaution || hasFollowUpCaution)) {
    signalFactory.add(
      "ambiguous",
      "signal_conflict",
      "좋은 신호와 조심할 신호가 섞여 있어요",
      "만남 분위기와 이후 연락 흐름이 같은 방향으로만 움직이지 않아 단정하기 어렵습니다.",
      "실제 만남 신호와 만남 뒤 연락 신호가 서로 다른 방향을 보입니다.",
      "high",
    );
  }

  return {
    hasMeetingPositive,
    hasMeetingCaution,
    hasFollowUpPositive,
    hasFollowUpCaution,
  };
}
```

- [ ] **Step 5: Invoke situation signals in `buildRuleBasedAnalysis()`**

After `const signalFactory = buildSignalFactory();`, add:

```ts
const situationFlags = hasSituationEvidence(conversation)
  ? addSituationSignals(conversation, signalFactory)
  : {
      hasMeetingPositive: false,
      hasMeetingCaution: false,
      hasFollowUpPositive: false,
      hasFollowUpCaution: false,
    };
```

Update fallback `limited_signal` block to avoid adding it when situation signals exist:

```ts
if (signalFactory.list().length === 0) {
  signalFactory.add(
    "ambiguous",
    "limited_signal",
    "아직 뚜렷한 신호가 부족합니다",
    "대화나 상황 기록이 너무 짧아 강한 해석을 내리기 어렵습니다.",
    `총 ${metrics.totalMessages}개 메시지와 상황 기록을 기준으로는 추가 관찰이 더 중요합니다.`,
    "low",
  );
}
```

Add situation-aware action before `buildRecommendedAction()` is called:

```ts
const situationOnly = metrics.totalMessages <= 1 && hasSituationEvidence(conversation);
const situationAction =
  situationOnly && situationFlags.hasFollowUpCaution
    ? {
        action: "slow_down" as RecommendedAction,
        reason:
          "실제 만남 분위기는 나쁘지 않아도 만남 뒤 연락 온도가 약해 보여서, 지금은 한 템포 낮춰 반응을 보는 편이 안전합니다.",
      }
    : situationOnly && situationFlags.hasFollowUpPositive
      ? {
          action: "keep_light" as RecommendedAction,
          reason:
            "만남 뒤 연락이 이어지고 있어 부담 없는 톤으로 자연스럽게 연결을 유지하는 편이 좋습니다.",
        }
      : situationOnly && situationFlags.hasMeetingPositive
        ? {
            action: "keep_light" as RecommendedAction,
            reason:
              "채팅 근거는 적지만 실제 만남 분위기가 나쁘지 않아, 부담 없는 톤으로 연결을 유지해볼 만합니다.",
          }
      : null;

const { action, reason } =
  situationAction ??
  buildRecommendedAction(metrics, positiveSignalCount, cautionSignalCount);
```

Replace the existing `const { action, reason } = buildRecommendedAction(metrics, positiveSignalCount, cautionSignalCount);` block with the code above.

Add a situation-aware summary branch inside `buildSummary()` before `if (metrics.otherMessages === 0)`:

```ts
if (metrics.totalMessages <= 1 && positiveCount >= 1 && cautionCount >= 1) {
  return "실제 만남에서 좋은 신호는 있었지만, 이후 연락 흐름에는 조심할 부분이 함께 보입니다. 지금은 감정 결론보다 다음 반응을 확인하는 쪽이 안전합니다.";
}

if (metrics.totalMessages <= 1 && positiveCount >= 1) {
  return "채팅 로그는 적지만 실제 만남이나 이후 연락에서 긍정 신호가 보입니다. 부담 없는 톤으로 연결을 유지해볼 만합니다.";
}
```

- [ ] **Step 6: Run rule tests**

```bash
npx vitest run lib/__tests__/rule-based-analysis.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add landing-page-nextjs/lib/rule-based-analysis.ts landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts
git commit -m "feat: add situation-aware rule signals"
```

---

### Task 4: Situation-Aware Prompt Copy

**Files:**
- Modify: `landing-page-nextjs/lib/ai/prompts/system-prompt.ts`
- Modify: `landing-page-nextjs/lib/ai/__tests__/prompts.test.ts`

**Interfaces:**
- Consumes: existing prompt builders.
- Produces: prompts that explicitly support relationship situation notes and no-chat inputs.

- [ ] **Step 1: Add failing prompt tests**

Update the existing import at the top of `lib/ai/__tests__/prompts.test.ts`:

```ts
import {
  formatStageBaseline,
  buildSignalEnhancerUserPrompt,
  buildRecommendationUserPrompt,
} from "../prompts/index";
```

Append this `describe` block to `lib/ai/__tests__/prompts.test.ts`:

```ts

describe("situation-first prompt wording", () => {
  it("labels raw input as situation input for signal enhancement", () => {
    const prompt = buildSignalEnhancerUserPrompt({
      rawText: "어제 만났고 이후 답장이 짧아졌습니다.",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      situationContext: "입력은 실제 만남 후기 중심입니다.",
      signals: [
        {
          signalType: "caution",
          signalKey: "post_meeting_followup_caution",
          title: "만남 뒤 연락 온도 주의",
          description: "답장이 짧아졌습니다.",
          evidenceText: "답장이 짧아짐",
          confidenceLevel: "medium",
        },
      ],
    });

    expect(prompt).toContain("## 상황 원문");
    expect(prompt).toContain("채팅이 없거나 적어도");
    expect(prompt).toContain("입력은 실제 만남 후기 중심입니다.");
  });

  it("asks recommendation generation to use meeting and follow-up context", () => {
    const prompt = buildRecommendationUserPrompt({
      rawText: "어제 만났고 이후 답장이 짧아졌습니다.",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      situationContext: "만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다.",
      recommendedAction: "slow_down",
      recommendedActionReason: "만남 뒤 연락 온도가 약합니다.",
      overallSummary: "좋은 신호와 조심할 신호가 섞여 있습니다.",
      signals: [{ signalType: "caution", signalKey: "post_meeting_followup_caution", title: "연락 온도 주의" }],
    });

    expect(prompt).toContain("실제 만남");
    expect(prompt).toContain("만남 뒤 연락");
    expect(prompt).toContain("채팅 원문만");
  });
});
```

- [ ] **Step 2: Run prompt tests to verify they fail**

```bash
npx vitest run lib/ai/__tests__/prompts.test.ts
```

Expected: FAIL because the prompt still says `## 대화 원문` and lacks no-chat situation instructions.

- [ ] **Step 3: Update prompt labels and instructions**

In `buildSignalEnhancerUserPrompt()`, change:

```ts
return `## 대화 원문
${params.rawText}
```

to:

```ts
return `## 상황 원문
${params.rawText}
```

Add this paragraph after `formatSituationContext(params.situationContext)`:

```ts
채팅이 없거나 적어도 실제 만남 후기와 만남 뒤 연락 흐름을 근거로 분석합니다.
단, 사용자의 느낌만으로 상대 마음을 단정하지 말고 관찰된 행동과 연락 흐름을 구분해 설명합니다.
```

Make the same `## 상황 원문` label change in `buildRecommendationUserPrompt()`.

Add this paragraph before `## 분석 요약` in `buildRecommendationUserPrompt()`:

```ts
실제 만남, 만남 뒤 연락, 채팅 원문만으로 보이는 신호를 구분해서 다음 행동을 제안합니다.
채팅 원문만 보고 단정하지 말고 가장 최근의 만남 뒤 연락 흐름을 함께 반영합니다.
```

- [ ] **Step 4: Run prompt tests**

```bash
npx vitest run lib/ai/__tests__/prompts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add landing-page-nextjs/lib/ai/prompts/system-prompt.ts landing-page-nextjs/lib/ai/__tests__/prompts.test.ts
git commit -m "feat: update prompts for situation-first analysis"
```

---

### Task 5: Signal Grouping Helper

**Files:**
- Create: `landing-page-nextjs/lib/signal-groups.ts`
- Create: `landing-page-nextjs/lib/__tests__/signal-groups.test.ts`

**Interfaces:**
- Consumes: signal objects with `signalKey`.
- Produces: `groupSignalsByContext()` for UI rendering.

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/signal-groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupSignalsByContext } from "../signal-groups";

const signal = (signalKey: string) => ({
  id: signalKey,
  signalType: "positive",
  signalKey,
  title: signalKey,
  description: signalKey,
  evidenceText: signalKey,
  confidenceLevel: "medium",
  displayOrder: 1,
});

describe("groupSignalsByContext", () => {
  it("groups meeting, follow-up, conflict, and chat signals", () => {
    const result = groupSignalsByContext([
      signal("reply_continuity"),
      signal("meeting_positive_vibe"),
      signal("post_meeting_followup_caution"),
      signal("signal_conflict"),
    ]);

    expect(result.chat.map((item) => item.signalKey)).toEqual(["reply_continuity"]);
    expect(result.meeting.map((item) => item.signalKey)).toEqual(["meeting_positive_vibe"]);
    expect(result.followUp.map((item) => item.signalKey)).toEqual(["post_meeting_followup_caution"]);
    expect(result.uncertainty.map((item) => item.signalKey)).toEqual(["signal_conflict"]);
  });

  it("puts unknown signal keys into chat by default", () => {
    const result = groupSignalsByContext([signal("new_signal")]);

    expect(result.chat.map((item) => item.signalKey)).toEqual(["new_signal"]);
    expect(result.meeting).toEqual([]);
    expect(result.followUp).toEqual([]);
    expect(result.uncertainty).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/signal-groups.test.ts
```

Expected: FAIL because `lib/signal-groups.ts` does not exist.

- [ ] **Step 3: Create `lib/signal-groups.ts`**

```ts
type SignalLike = {
  signalKey: string;
};

export type SignalGroups<T extends SignalLike> = {
  chat: T[];
  meeting: T[];
  followUp: T[];
  uncertainty: T[];
};

const meetingSignalKeys = new Set([
  "meeting_positive_vibe",
  "meeting_low_reciprocity",
]);

const followUpSignalKeys = new Set([
  "post_meeting_followup_positive",
  "post_meeting_followup_caution",
]);

const uncertaintySignalKeys = new Set([
  "signal_conflict",
  "limited_signal",
  "sample_size",
]);

export function groupSignalsByContext<T extends SignalLike>(signals: T[]): SignalGroups<T> {
  return signals.reduce<SignalGroups<T>>(
    (groups, signal) => {
      if (meetingSignalKeys.has(signal.signalKey)) {
        groups.meeting.push(signal);
      } else if (followUpSignalKeys.has(signal.signalKey)) {
        groups.followUp.push(signal);
      } else if (uncertaintySignalKeys.has(signal.signalKey)) {
        groups.uncertainty.push(signal);
      } else {
        groups.chat.push(signal);
      }

      return groups;
    },
    { chat: [], meeting: [], followUp: [], uncertainty: [] },
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/__tests__/signal-groups.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add landing-page-nextjs/lib/signal-groups.ts landing-page-nextjs/lib/__tests__/signal-groups.test.ts
git commit -m "feat: group analysis signals by context"
```

---

### Task 6: Situation-First UI Flow

**Files:**
- Modify: `landing-page-nextjs/components/analysis-experience.tsx`
- Modify: `landing-page-nextjs/components/analysis-experience.module.css`

**Interfaces:**
- Consumes: `GuidedAnswers` shape from Task 1 and `groupSignalsByContext()` from Task 5.
- Produces: UI that lets users proceed with non-chat situation text and sends guided answers to the API.

- [ ] **Step 1: Import helpers and add local option types**

In `components/analysis-experience.tsx`, add imports:

```ts
import { groupSignalsByContext } from "@/lib/signal-groups";
import type {
  AfterMeetingContact,
  DesiredHelp,
  GuidedAnswers,
  MeetingVibe,
  OtherInitiative,
  SituationInputFocus,
} from "@/lib/situation-input";
```

Add option arrays near the existing `relationshipStageOptions`:

```ts
const inputFocusOptions = [
  { value: "chat", label: "채팅 중심", description: "카톡이나 문자 흐름을 주로 보고 싶어요." },
  { value: "meeting_note", label: "만남 후기 중심", description: "실제로 만났을 때 느낌을 먼저 보고 싶어요." },
  { value: "mixed", label: "채팅 + 만남", description: "대화와 실제 만남 느낌을 함께 보고 싶어요." },
  { value: "follow_up", label: "만남 뒤 연락", description: "만난 뒤 연락 흐름이 헷갈려요." },
] as const;

const meetingVibeOptions = [
  { value: "none", label: "해당 없음", description: "아직 직접 만나지 않았어요." },
  { value: "awkward", label: "어색함", description: "대화가 잘 이어지지 않았어요." },
  { value: "normal", label: "보통", description: "나쁘진 않았지만 확신은 없어요." },
  { value: "good", label: "좋음", description: "대화가 편했고 분위기가 괜찮았어요." },
  { value: "great", label: "아주 좋음", description: "상대도 다음 만남을 언급했어요." },
] as const;

const otherInitiativeOptions = [
  { value: "unknown", label: "잘 모르겠음", description: "아직 판단하기 어려워요." },
  { value: "low", label: "낮음", description: "내가 더 많이 이끈 느낌이에요." },
  { value: "medium", label: "보통", description: "서로 어느 정도 맞춰갔어요." },
  { value: "high", label: "높음", description: "상대도 질문이나 제안을 꽤 했어요." },
] as const;

const afterMeetingContactOptions = [
  { value: "not_applicable", label: "해당 없음", description: "아직 만남 뒤 연락 상황이 없어요." },
  { value: "none", label: "아직 없음", description: "만난 뒤 아직 연락하지 않았어요." },
  { value: "self_first", label: "내가 먼저 함", description: "내가 먼저 연락했고 반응을 보는 중이에요." },
  { value: "other_first", label: "상대가 먼저 함", description: "상대가 먼저 연락했어요." },
  { value: "slower", label: "느려짐", description: "답장이 짧거나 느려졌어요." },
  { value: "ongoing", label: "이어지는 중", description: "만난 뒤에도 연락이 이어지고 있어요." },
] as const;

const desiredHelpOptions = [
  { value: "next_message", label: "다음 메시지", description: "뭐라고 보내면 좋을지 알고 싶어요." },
  { value: "ask_for_date", label: "애프터 제안", description: "다음 만남을 제안해도 될지 궁금해요." },
  { value: "wait_or_send", label: "기다릴지 판단", description: "더 보낼지 기다릴지 모르겠어요." },
  { value: "decide_to_stop", label: "정리 판단", description: "그만할지 계속 볼지 고민돼요." },
] as const;
```

- [ ] **Step 2: Add component state**

Inside `AnalysisExperience()`, add state after `userGoal`:

```ts
const [inputFocus, setInputFocus] = useState<SituationInputFocus>("mixed");
const [meetingVibe, setMeetingVibe] = useState<MeetingVibe>("none");
const [otherInitiative, setOtherInitiative] = useState<OtherInitiative>("unknown");
const [afterMeetingContact, setAfterMeetingContact] =
  useState<AfterMeetingContact>("not_applicable");
const [desiredHelp, setDesiredHelp] = useState<DesiredHelp>("wait_or_send");
const [situationFreeText, setSituationFreeText] = useState("");
```

Add helper values near `parsedMessages`:

```ts
const hasMeaningfulSituationText = rawText.trim().length >= 20 || situationFreeText.trim().length >= 20;
const canProceedFromInput = parsedMessages.length >= 2 || (inputFocus !== "chat" && hasMeaningfulSituationText);
const guidedAnswers: GuidedAnswers = {
  inputFocus,
  meetingVibe,
  otherInitiative,
  afterMeetingContact,
  desiredHelp,
  freeText: situationFreeText,
};
```

- [ ] **Step 3: Update validation**

Replace `handleMoveToContext()` with:

```ts
function handleMoveToContext() {
  if (!canProceedFromInput) {
    setErrorMessage(
      "채팅이 없으면 실제 만남 느낌이나 이후 연락 흐름을 20자 이상 적고 입력 중심을 만남 후기나 만남 뒤 연락으로 선택해 주세요.",
    );
    return;
  }

  setErrorMessage(null);
  setStep("context");
}
```

Replace the first validation block in `handleRunAnalysis()` with:

```ts
if (messages.length < 2 && !canProceedFromInput) {
  setStep("input");
  setErrorMessage(
    "분석할 채팅이나 상황 설명이 부족합니다. 대화 2줄 이상 또는 만남 후기 20자 이상을 입력해 주세요.",
  );
  return;
}
```

- [ ] **Step 4: Send guided answers to the API**

In the body for `POST /api/v1/conversations`, add:

```ts
guidedAnswers,
situationContext: situationFreeText,
```

Keep `messages` as parsed messages:

```ts
messages,
```

This means situation-only input sends `messages: []`, and Task 2 route validation allows it.

- [ ] **Step 5: Update input copy and preview**

Change the hero title:

```tsx
<h1 className={styles.title}>지금 상황을 넣어보세요</h1>
```

Change the hero description:

```tsx
<p className={styles.description}>
  카톡 캡처, 대화 내용, 실제 만났을 때 느낀 점, 이후 연락 흐름을 함께 볼게요.
  지금 필요한 다음 행동까지 정리해드릴게요.
</p>
```

Change the input card heading:

```tsx
<h2>분석하고 싶은 상황을 입력해 주세요</h2>
```

Change the textarea label and placeholder:

```tsx
<label className={styles.fieldLabel} htmlFor="conversation-input">
  지금 상황
</label>
```

```tsx
placeholder={`예시
어제 처음 만났는데 대화는 끊기지 않았고 2시간 정도 같이 있었어요.
상대가 질문을 많이 하진 않았지만 웃으면서 들어줬고, 다음에 또 보자는 말은 없었어요.
집에 와서 제가 먼저 잘 들어갔냐고 보냈고 답장은 왔는데 짧았어요.`}
```

Change the preview empty text:

```tsx
아직 입력된 게 없어요. 채팅이나 만남 후기를 적어주세요.
```

Add a non-chat preview branch below the message preview list:

```tsx
{parsedMessages.length === 0 && rawText.trim().length > 0 ? (
  <div className={styles.situationPreview}>
    <strong>상황 메모로 분석할게요</strong>
    <p>{rawText.trim().slice(0, 180)}</p>
  </div>
) : null}
```

- [ ] **Step 6: Add context controls**

In the context step, add `ChoiceGroup` controls before the existing relationship/channel controls:

```tsx
<ChoiceGroup
  label="무엇을 중심으로 볼까요?"
  options={inputFocusOptions}
  value={inputFocus}
  onChange={setInputFocus}
/>
<ChoiceGroup
  label="실제 만남 분위기는 어땠나요?"
  options={meetingVibeOptions}
  value={meetingVibe}
  onChange={setMeetingVibe}
/>
<ChoiceGroup
  label="상대 적극성은 어땠나요?"
  options={otherInitiativeOptions}
  value={otherInitiative}
  onChange={setOtherInitiative}
/>
<ChoiceGroup
  label="만남 뒤 연락은 어땠나요?"
  options={afterMeetingContactOptions}
  value={afterMeetingContact}
  onChange={setAfterMeetingContact}
/>
<ChoiceGroup
  label="지금 무엇을 정하고 싶나요?"
  options={desiredHelpOptions}
  value={desiredHelp}
  onChange={setDesiredHelp}
/>
```

Add a free text textarea in the context step after the choice groups:

```tsx
<label className={styles.fieldLabel} htmlFor="situation-free-text">
  추가로 느낀 점
</label>
<textarea
  id="situation-free-text"
  className={styles.smallTextarea}
  rows={4}
  value={situationFreeText}
  onChange={(event) => setSituationFreeText(event.target.value)}
  placeholder="예: 실제로는 편했지만 상대가 먼저 질문을 많이 하지는 않았어요."
/>
```

- [ ] **Step 7: Render grouped signals**

Before JSX `return`, compute:

```ts
const groupedSignals = streamingState ? groupSignalsByContext(streamingState.signals) : null;
```

Replace the single signal list render with four sections:

```tsx
{groupedSignals ? (
  <div className={styles.groupedSignalSections}>
    <SignalSection title="채팅 신호" signals={groupedSignals.chat} />
    <SignalSection title="실제 만남 신호" signals={groupedSignals.meeting} />
    <SignalSection title="만남 뒤 연락 신호" signals={groupedSignals.followUp} />
    <SignalSection title="불확실성" signals={groupedSignals.uncertainty} />
  </div>
) : null}
```

Create a small local component above `AnalysisExperience()`:

```tsx
function SignalSection({
  title,
  signals,
}: {
  title: string;
  signals: SignalRecord[];
}) {
  return (
    <section className={styles.signalSection}>
      <h4>{title}</h4>
      {signals.length === 0 ? (
        <p className={styles.signalSectionEmpty}>해당 신호는 아직 없습니다.</p>
      ) : (
        <div className={styles.signalList}>
          {signals.map((signal, index) => (
            <article
              key={signal.id}
              className={styles.signalCard}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className={styles.signalHeader}>
                <span className={styles.signalType}>{signalLabels[signal.signalType]}</span>
                <span className={styles.signalConfidence}>
                  {confidenceLabels[signal.confidenceLevel]}
                </span>
              </div>
              <div className={styles.signalCardText}>
                <h5>{signal.title}</h5>
                <p>{signal.description}</p>
                <div className={styles.evidenceBox}>{signal.evidenceText}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Add CSS**

Append to `components/analysis-experience.module.css`:

```css
.situationPreview {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.28);
}

.situationPreview strong {
  display: block;
  font-size: 13px;
  margin-bottom: 6px;
}

.situationPreview p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.smallTextarea {
  width: 100%;
  resize: vertical;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.35);
  color: inherit;
  font: inherit;
  line-height: 1.5;
}

.groupedSignalSections {
  display: grid;
  gap: 14px;
}

.signalSection {
  display: grid;
  gap: 10px;
}

.signalSection h4 {
  margin: 0;
  font-size: 15px;
}

.signalSectionEmpty {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  border: 1px dashed rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  padding: 12px;
}
```

- [ ] **Step 9: Run focused verification**

```bash
npx tsc --noEmit
npm test -- lib/__tests__/signal-groups.test.ts
```

Expected: TypeScript check passes, signal group tests pass.

- [ ] **Step 10: Commit**

```bash
git add landing-page-nextjs/components/analysis-experience.tsx landing-page-nextjs/components/analysis-experience.module.css
git commit -m "feat: add situation-first analysis UI"
```

---

### Task 7: End-To-End Verification And Docs

**Files:**
- Modify: `landing-page-nextjs/README.md`
- Modify: `docs/superpowers/specs/2026-07-05-situation-first-analysis-design.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documented usage and verified behavior.

- [ ] **Step 1: Update README analysis example**

In `landing-page-nextjs/README.md`, near the analysis request examples, add:

````md
### 상황 중심 분석

채팅 캡처 없이 실제 만남 후기만으로도 분석할 수 있습니다.

```json
{
  "relationshipStage": "after_first_date",
  "meetingChannel": "blind_date",
  "userGoal": "continue_chat",
  "rawText": "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아졌습니다.",
  "guidedAnswers": {
    "inputFocus": "meeting_note",
    "meetingCount": "once",
    "meetingVibe": "normal",
    "afterMeetingContact": "slower",
    "desiredHelp": "wait_or_send"
  }
}
```
````

- [ ] **Step 2: Mark spec implementation slice**

In `docs/superpowers/specs/2026-07-05-situation-first-analysis-design.md`, add under "단계별 구현 범위" after `### 1차`:

```md
이 구현 계획은 1차 범위와 최소한의 상황 기반 규칙 신호까지 포함한다. 사람/관계 단위 타임라인 모델과 학습 CLI의 사후 피드백 입력은 다음 계획에서 다룬다.
```

- [ ] **Step 3: Run full tests**

```bash
npm test
```

Expected: all Vitest files pass.

- [ ] **Step 4: Run manual API smoke test**

Start the dev server if it is not running:

```bash
npm run dev
```

In another terminal, run:

```bash
curl -s -X POST http://localhost:3000/api/v1/conversations \
  -H 'Content-Type: application/json' \
  -d '{
    "relationshipStage": "after_first_date",
    "meetingChannel": "blind_date",
    "userGoal": "continue_chat",
    "rawText": "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아져서 더 연락해도 될지 고민입니다.",
    "guidedAnswers": {
      "inputFocus": "meeting_note",
      "meetingCount": "once",
      "meetingVibe": "normal",
      "afterMeetingContact": "slower",
      "desiredHelp": "wait_or_send"
    }
  }'
```

Expected response includes:

```json
{
  "success": true,
  "data": {
    "conversation": {
      "messageCount": 0,
      "situationContext": "입력은 실제 만남 후기 중심입니다"
    }
  }
}
```

The exact `situationContext` string is longer; verify it contains the phrase above and `messageCount` is `0`.

- [ ] **Step 5: Run UI smoke check**

Open `/analyze` in the browser. Enter:

```text
어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아져서 더 연락해도 될지 고민입니다.
```

Choose:

- 입력 중심: 만남 후기 중심
- 관계 단계: 첫 만남 후
- 실제 만남 분위기: 보통
- 만남 뒤 연락: 느려짐
- 지금 무엇을 정하고 싶나요: 기다릴지 판단

Expected:

- The app allows moving past step 1 without parsed chat messages.
- The results page appears.
- The signal sections include "실제 만남 신호" and "만남 뒤 연락 신호".
- The recommendation is conservative and does not tell the user to pressure the other person.

- [ ] **Step 6: Commit**

```bash
git add landing-page-nextjs/README.md docs/superpowers/specs/2026-07-05-situation-first-analysis-design.md
git commit -m "docs: document situation-first analysis usage"
```

---

## Final Verification

Run from `landing-page-nextjs/`:

```bash
npm test
npx tsc --noEmit
```

Expected:

- Vitest reports all test files passing.
- TypeScript exits with code 0.

Run from repo root:

```bash
git status --short --branch
```

Expected:

- Working tree is clean.
- `main` is ahead by the implementation commits if not pushed.

## Execution Notes

- Implement this plan in a feature worktree or branch, then merge locally after tests pass.
- Do not add a Prisma migration in this implementation slice.
- Do not store uploaded screenshots.
- Keep user-facing copy in Korean.
- If the UI file becomes difficult to edit safely, create a small `components/signal-section.tsx` component in the same task and import it from `analysis-experience.tsx`.
