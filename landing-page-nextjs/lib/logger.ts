type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const VALID_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error", "silent"]);

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(scope: string) {
  return {
    debug(event: string, context?: LogContext) {
      writeLog("debug", scope, event, context);
    },
    info(event: string, context?: LogContext) {
      writeLog("info", scope, event, context);
    },
    warn(event: string, context?: LogContext) {
      writeLog("warn", scope, event, context);
    },
    error(event: string, context?: LogContext) {
      writeLog("error", scope, event, context);
    },
  };
}

export function getConfiguredLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? process.env.SIGNALMATE_LOG_LEVEL ?? "")
    .trim()
    .toLowerCase();

  if (VALID_LEVELS.has(raw as LogLevel)) {
    return raw as LogLevel;
  }

  if (process.env.NODE_ENV === "test") return "silent";
  return process.env.NODE_ENV === "production" ? "warn" : "info";
}

export function isLogLevelEnabled(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[getConfiguredLogLevel()];
}

function writeLog(
  level: Exclude<LogLevel, "silent">,
  scope: string,
  event: string,
  context?: LogContext,
) {
  if (!isLogLevelEnabled(level)) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    event,
    ...(context ? sanitizeContext(context) : {}),
  };

  const line = JSON.stringify(payload);

  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

function sanitizeContext(context: LogContext): LogContext {
  const seen = new WeakSet<object>();

  return JSON.parse(
    JSON.stringify(context, (_key, value: unknown) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (typeof value === "bigint") {
        return value.toString();
      }

      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }

      return value;
    }),
  ) as LogContext;
}
