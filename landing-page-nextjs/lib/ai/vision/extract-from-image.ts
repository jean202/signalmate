/**
 * 카카오톡/메시지 캡처 이미지에서 대화를 추출합니다.
 *
 * Claude Vision API에 이미지를 보내고, 표준 형식의 채팅 텍스트로 변환받습니다.
 * 변환된 텍스트는 기존 chat-parser가 그대로 처리할 수 있습니다.
 *
 * 출력 형식 예시:
 *   [오후 8:10] 나: 오늘 잘 들어갔어요?
 *   [오후 8:13] 상대: 네 덕분에요 :)
 */
import {
  buildInferenceOptions,
  callWithRetry,
  extractToolInput,
  getAnthropicClient,
  getInferenceTimeoutMs,
  getModelName,
  resolveMaxTokens,
} from "@/lib/ai/anthropic-client";
import { trackUsage } from "@/lib/ai/token-tracker";

export type ExtractedImageResult = {
  /** 표준 형식으로 정리된 채팅 텍스트. chat-parser가 직접 처리 가능. */
  rawText: string;
  /** 발견된 메시지 수 */
  messageCount: number;
  /** Vision이 본 추가 정보 (날짜, 채팅방 이름 등) */
  notes?: string;
};

const SUPPORTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export function isSupportedImageMimeType(mime: string): mime is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mime);
}

const SYSTEM_PROMPT = `당신은 한국어 채팅 스크린샷에서 대화를 정확하게 추출하는 도구입니다.

이미지는 보통 카카오톡, 문자, 데이팅 앱의 캡처입니다.

## 추출 규칙

1. **화자 구분**: 오른쪽 말풍선 = "나", 왼쪽 말풍선 = "상대"
   - 색깔이 아니라 위치(좌/우)로 판단하세요.
   - 둘 다 명확하지 않으면 "미확인"으로 표시.

2. **시간 정보**: 메시지에 시간이 보이면 "[오후 8:10]" 또는 "[오전 11:32]" 형식으로 보존.
   - 시간이 안 보이는 메시지는 시간 표기를 생략.
   - 날짜 구분선(예: "2024년 11월 15일")은 별도 라인으로 보존.

3. **출력 형식**:
   \`\`\`
   [오후 8:10] 나: 메시지 내용
   [오후 8:13] 상대: 메시지 내용
   \`\`\`
   - 시간 미확인 시: \`나: 메시지\` 또는 \`상대: 메시지\`
   - 메시지가 여러 줄이면 한 줄로 합치되 줄바꿈은 공백으로 처리.

4. **제외 대상**:
   - "사진을 보냈습니다", "이모티콘", "보이스톡 시작" 같은 시스템 메시지
   - 광고, 채팅방 상단 정보 (이름, 사진 등)
   - 입력창의 임시 텍스트
   - 안 읽음 표시(1, 2 등의 숫자)

5. **주의사항**:
   - 추측하지 말고 실제로 보이는 텍스트만 추출하세요.
   - 한국어를 그대로 보존 (영어로 번역 금지).
   - 이모지(😊, ㅋㅋ 등)는 그대로 유지.
   - 링크/URL은 그대로 보존.

이미지에서 위 규칙대로 대화를 추출하고 \`submit_extracted_chat\` 도구를 호출하세요.`;

const submitExtractedChatTool = {
  name: "submit_extracted_chat",
  description:
    "이미지에서 추출한 채팅 대화를 표준 형식으로 제출합니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      rawText: {
        type: "string",
        description:
          "표준 형식으로 정리된 채팅 텍스트. 한 줄에 한 메시지. " +
          "예: '[오후 8:10] 나: 안녕하세요'",
      },
      messageCount: {
        type: "integer",
        description: "추출한 메시지의 총 개수 (시스템 메시지 제외)",
      },
      notes: {
        type: "string",
        description:
          "이미지에서 발견한 추가 정보 (옵션). 예: '날짜는 11월 15일', '채팅방 이름 ABC'",
      },
    },
    required: ["rawText", "messageCount"],
  },
};

export async function extractChatFromImage(params: {
  imageBase64: string;
  mimeType: string;
  /** 분석 ID (옵션) — usage 추적용 */
  analysisId?: string;
}): Promise<ExtractedImageResult> {
  if (!isSupportedImageMimeType(params.mimeType)) {
    throw new Error(
      `Unsupported image type: ${params.mimeType}. Use one of: ${SUPPORTED_MIME_TYPES.join(", ")}`,
    );
  }

  const client = getAnthropicClient();
  // Vision은 Sonnet/Haiku 4.5+ 모두 지원. Haiku로 우선 시도.
  const model = process.env.ANTHROPIC_VISION_MODEL?.trim() || getModelName();
  const startTime = Date.now();
  const timeoutMs = getInferenceTimeoutMs("vision_extract");
  let retryCount = 0;

  try {
    const { response, result } = await callWithRetry(
      async (requestOptions) => {
        const response = await client.messages.create(
          {
            ...buildInferenceOptions(model, "vision_extract", {
              forcedToolUse: true,
            }),
            model,
            max_tokens: resolveMaxTokens(4000, "vision_extract", model),
            system: SYSTEM_PROMPT,
            tools: [submitExtractedChatTool],
            tool_choice: { type: "tool", name: "submit_extracted_chat" },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: params.mimeType as SupportedMimeType,
                      data: params.imageBase64,
                    },
                  },
                  {
                    type: "text",
                    text: "이 이미지에서 채팅 대화를 추출해주세요.",
                  },
                ],
              },
            ],
          },
          requestOptions,
        );

        const input = extractToolInput<{
          rawText: string;
          messageCount: number;
          notes?: string;
        }>(response, "submit_extracted_chat", "vision extraction");

        return {
          response,
          result: validate(input),
        };
      },
      {
        label: "vision_extract",
        extraRetries: 1,
        timeoutMs,
        onRetry: (info) => {
          retryCount = info.retryCount;
        },
      },
    );

    await trackUsage({
      analysisId: params.analysisId,
      modelName: model,
      chainStep: "vision_extract",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - startTime,
      retryCount,
      timeoutMs,
      success: true,
    }).catch(() => {});

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await trackUsage({
      analysisId: params.analysisId,
      modelName: model,
      chainStep: "vision_extract",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startTime,
      retryCount,
      timeoutMs,
      success: false,
      errorMessage,
    }).catch(() => {});
    throw error;
  }
}

function validate(input: {
  rawText: string;
  messageCount: number;
  notes?: string;
}): ExtractedImageResult {
  const rawText = (input.rawText ?? "").trim();
  if (!rawText) {
    throw new Error("Vision did not return any extracted text");
  }

  const messageCount = Number.isFinite(input.messageCount)
    ? Math.max(0, Math.floor(input.messageCount))
    : rawText.split("\n").filter((l) => l.trim()).length;

  return {
    rawText,
    messageCount,
    notes: input.notes?.trim() || undefined,
  };
}
