const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

/** HTTP status from Anthropic SDK errors (`status`) or got/Pluggy errors (`response.statusCode`). */
function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: unknown; response?: { statusCode?: unknown } };
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.statusCode === "number") return e.response.statusCode;
  return undefined;
}

/** Network errors, timeouts, rate limits and 5xx are worth retrying; other 4xx (bad key, no credits) are not. */
export function isRetryable(err: unknown) {
  const status = statusOf(err);
  return status === undefined || status >= 500 || status === 408 || status === 409 || status === 429;
}

/** Retries an async function with exponential backoff on retryable failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) break;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}
