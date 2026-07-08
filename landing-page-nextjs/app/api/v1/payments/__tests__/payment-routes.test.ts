import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkoutPOST } from "../checkout/route";
import { POST as confirmPOST } from "../confirm/route";

const routeMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createPendingPayment: vi.fn(),
  claimAnalysisForUser: vi.fn(),
  confirmPayment: vi.fn(),
  failPayment: vi.fn(),
  confirmTossPayment: vi.fn(),
  generateOrderId: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: routeMocks.requireAuth,
}));

vi.mock("@/lib/db-store", () => ({
  createPendingPayment: routeMocks.createPendingPayment,
  claimAnalysisForUser: routeMocks.claimAnalysisForUser,
  confirmPayment: routeMocks.confirmPayment,
  failPayment: routeMocks.failPayment,
}));

vi.mock("@/lib/toss-payments", () => ({
  PLANS: {
    single_analysis: {
      amount: 3900,
      orderName: "시그널메이트 심화 분석",
    },
    subscription_monthly: {
      amount: 9900,
      orderName: "시그널메이트 월 구독",
    },
  },
  generateOrderId: routeMocks.generateOrderId,
  confirmTossPayment: routeMocks.confirmTossPayment,
}));

type ApiEnvelope<T = unknown> =
  | {
      success: true;
      data: T;
      error: null;
    }
  | {
      success: false;
      data: null;
      error: {
        code: string;
        message: string;
      };
    };

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readEnvelope<T = unknown>(response: Response): Promise<ApiEnvelope<T>> {
  return (await response.json()) as ApiEnvelope<T>;
}

describe("POST /api/v1/payments/checkout", () => {
  beforeEach(() => {
    routeMocks.requireAuth.mockReset();
    routeMocks.createPendingPayment.mockReset();
    routeMocks.claimAnalysisForUser.mockReset();
    routeMocks.generateOrderId.mockReset();

    routeMocks.requireAuth.mockResolvedValue({ userId: "user_12345678" });
    routeMocks.claimAnalysisForUser.mockResolvedValue("claimed");
    routeMocks.createPendingPayment.mockResolvedValue({
      id: "payment_1",
      orderId: "single_user_12345678_1",
    });
    routeMocks.generateOrderId.mockReturnValue("single_user_12345678_1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a pending payment and returns Toss checkout metadata", async () => {
    vi.stubEnv("TOSS_CLIENT_KEY", "test_ck_123");

    const response = await checkoutPOST(
      jsonRequest("/api/v1/payments/checkout", {
        purchaseType: "single_analysis",
        analysisId: "analysis_1",
      }),
    );
    const payload = await readEnvelope<{
      orderId: string;
      orderName: string;
      amount: number;
      clientKey: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    if (payload.success) {
      expect(payload.data).toEqual({
        orderId: "single_user_12345678_1",
        orderName: "시그널메이트 심화 분석",
        amount: 3900,
        clientKey: "test_ck_123",
      });
    }
    expect(routeMocks.generateOrderId).toHaveBeenCalledWith(
      "single_analysis",
      "user_12345678",
    );
    expect(routeMocks.claimAnalysisForUser).toHaveBeenCalledWith("user_12345678", "analysis_1");
    expect(routeMocks.createPendingPayment).toHaveBeenCalledWith({
      userId: "user_12345678",
      orderId: "single_user_12345678_1",
      purchaseType: "single_analysis",
      amount: 3900,
      analysisId: "analysis_1",
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    routeMocks.requireAuth.mockResolvedValueOnce({
      error: Response.json(
        {
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
        },
        { status: 401 },
      ),
    });

    const response = await checkoutPOST(
      jsonRequest("/api/v1/payments/checkout", {
        purchaseType: "single_analysis",
      }),
    );
    const payload = await readEnvelope(response);

    expect(response.status).toBe(401);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe("UNAUTHORIZED");
    }
    expect(routeMocks.createPendingPayment).not.toHaveBeenCalled();
  });

  it("rejects single_analysis checkout without analysisId", async () => {
    const response = await checkoutPOST(
      jsonRequest("/api/v1/payments/checkout", {
        purchaseType: "single_analysis",
      }),
    );
    const payload = await readEnvelope(response);

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe("VALIDATION_ERROR");
    }
    expect(routeMocks.claimAnalysisForUser).not.toHaveBeenCalled();
    expect(routeMocks.createPendingPayment).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await checkoutPOST(
      jsonRequest("/api/v1/payments/checkout", "{"),
    );
    const payload = await readEnvelope(response);

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe("INVALID_JSON");
    }
    expect(routeMocks.createPendingPayment).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid purchaseType", async () => {
    const response = await checkoutPOST(
      jsonRequest("/api/v1/payments/checkout", {
        purchaseType: "lifetime",
      }),
    );
    const payload = await readEnvelope(response);

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe("VALIDATION_ERROR");
    }
    expect(routeMocks.generateOrderId).not.toHaveBeenCalled();
    expect(routeMocks.createPendingPayment).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/payments/confirm", () => {
  beforeEach(() => {
    routeMocks.confirmPayment.mockReset();
    routeMocks.failPayment.mockReset();
    routeMocks.confirmTossPayment.mockReset();

    routeMocks.confirmPayment.mockResolvedValue(undefined);
    routeMocks.failPayment.mockResolvedValue(undefined);
  });

  it("confirms Toss payment and marks the order paid", async () => {
    routeMocks.confirmTossPayment.mockResolvedValueOnce({
      ok: true,
      data: {
        paymentKey: "payment_key",
        orderId: "order_1",
        orderName: "시그널메이트 심화 분석",
        status: "DONE",
        totalAmount: 3900,
        method: "카드",
        approvedAt: "2026-05-15T00:00:00+09:00",
      },
    });

    const response = await confirmPOST(
      jsonRequest("/api/v1/payments/confirm", {
        paymentKey: "payment_key",
        orderId: "order_1",
        amount: 3900,
      }),
    );
    const payload = await readEnvelope<{
      paymentKey: string;
      orderId: string;
      amount: number;
      approvedAt: string;
      method: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    if (payload.success) {
      expect(payload.data).toEqual({
        paymentKey: "payment_key",
        orderId: "order_1",
        amount: 3900,
        approvedAt: "2026-05-15T00:00:00+09:00",
        method: "카드",
      });
    }
    expect(routeMocks.confirmTossPayment).toHaveBeenCalledWith({
      paymentKey: "payment_key",
      orderId: "order_1",
      amount: 3900,
    });
    expect(routeMocks.confirmPayment).toHaveBeenCalledWith({
      orderId: "order_1",
      paymentKey: "payment_key",
    });
    expect(routeMocks.failPayment).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await confirmPOST(
      jsonRequest("/api/v1/payments/confirm", "{"),
    );
    const payload = await readEnvelope(response);

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe("INVALID_JSON");
    }
    expect(routeMocks.confirmTossPayment).not.toHaveBeenCalled();
    expect(routeMocks.failPayment).not.toHaveBeenCalled();
  });

  it("returns 400 when required Toss fields are missing", async () => {
    const response = await confirmPOST(
      jsonRequest("/api/v1/payments/confirm", {
        paymentKey: "payment_key",
        orderId: "order_1",
      }),
    );
    const payload = await readEnvelope(response);

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe("VALIDATION_ERROR");
    }
    expect(routeMocks.confirmTossPayment).not.toHaveBeenCalled();
    expect(routeMocks.failPayment).not.toHaveBeenCalled();
  });

  it("marks the payment failed when Toss rejects confirmation", async () => {
    routeMocks.confirmTossPayment.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "INVALID_PAYMENT",
        message: "결제 승인에 실패했습니다.",
      },
    });

    const response = await confirmPOST(
      jsonRequest("/api/v1/payments/confirm", {
        paymentKey: "payment_key",
        orderId: "order_1",
        amount: 3900,
      }),
    );
    const payload = await readEnvelope(response);

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe("INVALID_PAYMENT");
    }
    expect(routeMocks.confirmTossPayment).toHaveBeenCalledWith({
      paymentKey: "payment_key",
      orderId: "order_1",
      amount: 3900,
    });
    expect(routeMocks.failPayment).toHaveBeenCalledWith("order_1");
    expect(routeMocks.confirmPayment).not.toHaveBeenCalled();
  });
});
