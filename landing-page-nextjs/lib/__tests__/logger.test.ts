import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLogger,
  getConfiguredLogLevel,
  isLogLevelEnabled,
} from "@/lib/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("defaults to silent during tests", () => {
    vi.stubEnv("NODE_ENV", "test");

    expect(getConfiguredLogLevel()).toBe("silent");
    expect(isLogLevelEnabled("error")).toBe(false);
  });

  it("uses LOG_LEVEL when explicitly configured", () => {
    vi.stubEnv("LOG_LEVEL", "warn");

    expect(getConfiguredLogLevel()).toBe("warn");
    expect(isLogLevelEnabled("info")).toBe(false);
    expect(isLogLevelEnabled("warn")).toBe(true);
    expect(isLogLevelEnabled("error")).toBe(true);
  });

  it("writes structured JSON logs when enabled", () => {
    vi.stubEnv("LOG_LEVEL", "info");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    createLogger("test.scope").info("event_name", {
      conversationId: "conv_1",
      count: 2,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(infoSpy.mock.calls[0][0] as string) as {
      level: string;
      scope: string;
      event: string;
      conversationId: string;
      count: number;
    };
    expect(payload).toMatchObject({
      level: "info",
      scope: "test.scope",
      event: "event_name",
      conversationId: "conv_1",
      count: 2,
    });
  });
});
