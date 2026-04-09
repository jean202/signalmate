import { NextResponse } from "next/server";

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      error: null,
    },
    { status },
  );
}

export function errorResponse(status: number, code: string, message: string) {
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
