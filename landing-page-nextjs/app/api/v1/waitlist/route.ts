import { NextResponse } from "next/server";
import { createWaitlistEntry } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WaitlistRequestBody = {
  email?: string;
  source?: string;
  note?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function POST(request: Request) {
  let body: WaitlistRequestBody;

  try {
    body = (await request.json()) as WaitlistRequestBody;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const email = body.email?.trim();
  const note = body.note?.trim();
  const source = body.source?.trim() || "landing";

  if (!email) {
    return errorResponse(400, "VALIDATION_ERROR", "email is required.");
  }

  if (!emailPattern.test(email)) {
    return errorResponse(400, "VALIDATION_ERROR", "email must be a valid email address.");
  }

  if (note && note.length > 500) {
    return errorResponse(400, "VALIDATION_ERROR", "note must be 500 characters or fewer.");
  }

  const result = await createWaitlistEntry({
    email,
    source,
    note,
  });

  if (result.kind === "duplicate") {
    return errorResponse(409, "DUPLICATE_EMAIL", "This email is already on the waitlist.");
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        waitlistId: result.entry.id,
      },
      error: null,
    },
    { status: 201 },
  );
}
