import Anthropic from "@anthropic-ai/sdk";
import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateSeedCase, type SeedCase } from "../lib/seed-schema";

const SITUATION_TYPES = [
  "before_meeting",
  "after_first_date",
  "after_second_date",
  "cooling_down",
] as const;
const OUTCOMES = ["progressed", "stalled", "ended"] as const;
const CASES_PER_COMBO = Number(process.env.SEED_CASES_PER_COMBO ?? 5);

function buildPrompt(situationType: string, outcome: string, count: number): string {
  return `당신은 연애 상담 사례 작가입니다. 소개팅·썸 초기 상황의 익명 사례를 만듭니다.

조건:
- 상황 유형: ${situationType}
- 결말: ${outcome} (progressed=관계 진전 / stalled=흐지부지 정체 / ended=자연 종료·정리)
- ${count}개의 서로 다른 사례를 만드세요.
- 각 사례는 특정 개인을 식별할 수 없는 일반적인 패턴이어야 합니다.
- summaryText: 상황과 흐름 요약 2~3문장 (40~120자, 한국어)
- lesson: 이 사례에서 배울 점 1문장 (한국어)

JSON 배열만 출력하세요. 형식:
[{"summaryText": "...", "situationType": "${situationType}", "outcomeLabel": "${outcome}", "lesson": "..."}]`;
}

async function main() {
  const apiKey = process.env.SEED_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY(또는 SEED_ANTHROPIC_API_KEY)가 필요합니다.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const outDir = join(process.cwd(), "learning", "seeds", "drafts");
  mkdirSync(outDir, { recursive: true });

  for (const situationType of SITUATION_TYPES) {
    for (const outcome of OUTCOMES) {
      const response = await client.messages.create({
        model: process.env.SEED_MODEL ?? "claude-sonnet-5",
        max_tokens: 2000,
        messages: [
          { role: "user", content: buildPrompt(situationType, outcome, CASES_PER_COMBO) },
        ],
      });

      const text = response.content
        .filter((block): block is TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error(`[${situationType}/${outcome}] JSON 배열을 찾지 못했습니다. 건너뜁니다.`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      const cases: SeedCase[] = [];
      for (const item of parsed) {
        const result = validateSeedCase(item);
        if (result.ok) {
          cases.push(result.value);
        } else {
          console.warn(`  invalid case skipped: ${result.reason}`);
        }
      }

      const file = join(outDir, `${situationType}-${outcome}.json`);
      writeFileSync(file, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
      console.log(`[${situationType}/${outcome}] ${cases.length}건 -> ${file}`);
    }
  }

  console.log(
    "\n생성 완료. learning/seeds/drafts/를 수동 검수한 뒤 승인본을 learning/seeds/approved/로 옮기고 npm run learn:seed-embed를 실행하세요.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
