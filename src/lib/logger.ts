type Level = "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

function emit(level: Level, message: string, fields?: LogFields) {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const prefix = level === "error" ? "✖" : level === "warn" ? "⚠" : "·";
    const extra = fields ? " " + JSON.stringify(fields) : "";
    // eslint-disable-next-line no-console
    console[level === "info" ? "log" : level](`${prefix} ${message}${extra}`);
  } else {
    // eslint-disable-next-line no-console
    console[level === "info" ? "log" : level](
      JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields })
    );
  }
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
