import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type WaitlistEntry = {
  id: string;
  email: string;
  source: string;
  note: string | null;
  createdAt: string;
};

const dataDirectory =
  process.env.NODE_ENV === "production"
    ? "/tmp/signalmate-data"
    : path.join(process.cwd(), "data");
const waitlistFilePath = path.join(dataDirectory, "waitlist-dev.json");

async function ensureStoreExists() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(waitlistFilePath, "utf8");
  } catch {
    await writeFile(waitlistFilePath, "[]\n", "utf8");
  }
}

export async function readWaitlistEntries(): Promise<WaitlistEntry[]> {
  await ensureStoreExists();

  const file = await readFile(waitlistFilePath, "utf8");
  const parsed = JSON.parse(file) as WaitlistEntry[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function createWaitlistEntry(input: {
  email: string;
  source?: string;
  note?: string | null;
}) {
  const entries = await readWaitlistEntries();
  const normalizedEmail = input.email.trim().toLowerCase();

  const existing = entries.find((entry) => entry.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return { kind: "duplicate" as const, entry: existing };
  }

  const entry: WaitlistEntry = {
    id: randomUUID(),
    email: normalizedEmail,
    source: input.source?.trim() || "landing",
    note: input.note?.trim() || null,
    createdAt: new Date().toISOString(),
  };

  entries.push(entry);
  await writeFile(waitlistFilePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");

  return { kind: "created" as const, entry };
}
