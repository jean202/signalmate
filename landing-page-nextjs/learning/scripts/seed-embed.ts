import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSeedCase, type SeedCase } from "../lib/seed-schema";

const EMBEDDING_MODEL = "text-embedding-3-small";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY가 필요합니다.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL이 필요합니다.");
    process.exit(1);
  }

  const approvedDir = join(process.cwd(), "learning", "seeds", "approved");
  let files: string[];
  try {
    files = readdirSync(approvedDir).filter((name) => name.endsWith(".json"));
  } catch {
    console.error(`승인 폴더가 없습니다: ${approvedDir}`);
    process.exit(1);
  }

  const cases: SeedCase[] = [];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(approvedDir, file), "utf8")) as unknown[];
    for (const item of raw) {
      const result = validateSeedCase(item);
      if (result.ok) {
        cases.push(result.value);
      } else {
        console.warn(`${file}: invalid case skipped (${result.reason})`);
      }
    }
  }

  if (cases.length === 0) {
    console.error("업서트할 승인 사례가 없습니다.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await prisma.$executeRawUnsafe("DELETE FROM reference_cases");

  for (const seedCase of cases) {
    const embedding = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: `${seedCase.situationType} ${seedCase.summaryText}`,
    });
    const vectorStr = `[${embedding.data[0].embedding.join(",")}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO reference_cases (id, summary_text, situation_type, outcome_label, lesson, embedding)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::vector)`,
      randomUUID(),
      seedCase.summaryText,
      seedCase.situationType,
      seedCase.outcomeLabel,
      seedCase.lesson,
      vectorStr,
    );
  }

  console.log(`reference_cases 업서트 완료: ${cases.length}건`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
