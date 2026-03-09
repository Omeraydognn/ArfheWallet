/**
 * NetworkErrorHandler — Global network error classification, retry logic, and timeout handling.
 *
 * Provides:
 * - Error classification (rate-limit, timeout, network offline, RPC error, etc.)
 * - withRetry(): exponential backoff retry wrapper
 * - withTimeout(): AbortController-based timeout wrapper for fetch
 * - User-friendly error message mapping (i18n-ready keys)
 */

// ─── Error Types ────────────────────────────────────────────────────────────

export enum NetworkErrorType {
  /** No internet connection */
  Offline = "OFFLINE",
  /** Request timed out */
  Timeout = "TIMEOUT",
  /** HTTP 429 — rate limited by provider */
  RateLimited = "RATE_LIMITED",
  /** Server returned 5xx */
  ServerError = "SERVER_ERROR",
  /** RPC-level JSON error (e.g. invalid method, revert) */
  RpcError = "RPC_ERROR",
  /** User rejected or insufficient funds — NOT retryable */
  UserError = "USER_ERROR",
  /** All retries exhausted */
  MaxRetriesExceeded = "MAX_RETRIES_EXCEEDED",
  /** Generic/unknown error */
  Unknown = "UNKNOWN",
}

export interface ClassifiedError {
  type: NetworkErrorType;
  /** Raw error message */
  message: string;
  /** i18n key for user-facing toast */
  i18nKey: string;
  /** Whether this error can be retried */
  retryable: boolean;
  /** HTTP status code (if available) */
  statusCode?: number;
}

// ─── Error Classifier ───────────────────────────────────────────────────────

export function classifyError(error: unknown): ClassifiedError {
  const msg = error instanceof Error ? error.message : String(error);
  const lowerMsg = msg.toLowerCase();

  // 1. Offline
  if (!navigator.onLine || lowerMsg.includes("failed to fetch") || lowerMsg.includes("networkerror") || lowerMsg.includes("net::err")) {
    return { type: NetworkErrorType.Offline, message: msg, i18nKey: "networkError.offline", retryable: true };
  }

  // 2. Timeout (AbortController or custom)
  if (lowerMsg.includes("timeout") || lowerMsg.includes("aborted") || (error instanceof DOMException && error.name === "AbortError")) {
    return { type: NetworkErrorType.Timeout, message: msg, i18nKey: "networkError.timeout", retryable: true };
  }

  // 3. Rate limited
  if (lowerMsg.includes("429") || lowerMsg.includes("rate limit") || lowerMsg.includes("too many request")) {
    return { type: NetworkErrorType.RateLimited, message: msg, i18nKey: "networkError.rateLimited", retryable: true, statusCode: 429 };
  }

  // 4. Server errors (5xx)
  if (lowerMsg.includes("500") || lowerMsg.includes("502") || lowerMsg.includes("503") || lowerMsg.includes("504") || lowerMsg.includes("internal server error") || lowerMsg.includes("bad gateway") || lowerMsg.includes("service unavailable")) {
    return { type: NetworkErrorType.ServerError, message: msg, i18nKey: "networkError.serverError", retryable: true };
  }

  // 5. User errors — NOT retryable
  if (lowerMsg.includes("insufficient funds") || lowerMsg.includes("yetersiz bakiye") || lowerMsg.includes("user rejected") || lowerMsg.includes("user denied") || lowerMsg.includes("nonce too low")) {
    return { type: NetworkErrorType.UserError, message: msg, i18nKey: "networkError.userError", retryable: false };
  }

  // 6. RPC-level JSON errors
  if (lowerMsg.includes("rpc") || lowerMsg.includes("json-rpc") || lowerMsg.includes("execution reverted") || lowerMsg.includes("invalid method") || lowerMsg.includes("method not found")) {
    return { type: NetworkErrorType.RpcError, message: msg, i18nKey: "networkError.rpcError", retryable: false };
  }

  // 7. Unknown
  return { type: NetworkErrorType.Unknown, message: msg, i18nKey: "networkError.unknown", retryable: true };
}

// ─── Retry Options ──────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelayMs?: number;
  /** Abort signal — cancels all retries immediately */
  signal?: AbortSignal;
  /** Callback fired before each retry — use for logging/toast */
  onRetry?: (attempt: number, maxAttempts: number, error: ClassifiedError) => void;
  /** Custom check: should we retry this particular error? (overrides default) */
  shouldRetry?: (error: ClassifiedError) => boolean;
}

// ─── withRetry ──────────────────────────────────────────────────────────────

/**
 * Execute an async function with exponential backoff retry.
 *
 * ```ts
 * const data = await withRetry(() => network.getTokenBalances(cache, addr), {
 *   maxRetries: 3,
 *   onRetry: (attempt, max, err) => console.log(`Retry ${attempt}/${max}...`),
 * });
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 10_000,
    signal,
    onRetry,
    shouldRetry,
  } = options;

  let lastError: ClassifiedError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check abort
    if (signal?.aborted) {
      throw new NetworkError(
        classifyError(new DOMException("Aborted", "AbortError"))
      );
    }

    try {
      return await fn();
    } catch (err) {
      lastError = classifyError(err);

      // Should we retry?
      const canRetry = shouldRetry
        ? shouldRetry(lastError)
        : lastError.retryable;

      if (!canRetry || attempt >= maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
      const jitter = Math.random() * 0.3 * baseDelay; // 0–30% jitter
      const delay = Math.min(baseDelay + jitter, maxDelayMs);

      // Rate limited → use longer delay
      const finalDelay = lastError.type === NetworkErrorType.RateLimited
        ? Math.max(delay, 2000)
        : delay;

      onRetry?.(attempt + 1, maxRetries, lastError);

      // Wait with abort support
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, finalDelay);
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }
  }

  // All retries exhausted
  const exhausted: ClassifiedError = {
    type: NetworkErrorType.MaxRetriesExceeded,
    message: `All ${maxRetries} retries failed. Last error: ${lastError?.message ?? "unknown"}`,
    i18nKey: "networkError.maxRetries",
    retryable: false,
  };

  throw new NetworkError(exhausted);
}

// ─── withTimeout ────────────────────────────────────────────────────────────

/**
 * Wraps a fetch call with a timeout via AbortController.
 * Returns the original Response on success.
 *
 * ```ts
 * const response = await withTimeout(fetch(url, { method: "POST", body }), 15000);
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 15_000,
  label: string = "Request"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ─── Fetch with timeout helper ──────────────────────────────────────────────

/**
 * Enhanced fetch with built-in timeout support.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── NetworkError class ─────────────────────────────────────────────────────

/**
 * Typed error class carrying classification metadata.
 * Thrown by withRetry when all attempts fail.
 */
export class NetworkError extends Error {
  classified: ClassifiedError;

  constructor(classified: ClassifiedError) {
    super(classified.message);
    this.name = "NetworkError";
    this.classified = classified;
  }
}

// ─── Helper: get user-facing message ────────────────────────────────────────

/**
 * Returns a plain English fallback message (used when i18n is not available).
 */
export function getErrorFallbackMessage(type: NetworkErrorType): string {
  switch (type) {
    case NetworkErrorType.Offline:
      return "No internet connection. Please check your network.";
    case NetworkErrorType.Timeout:
      return "Request timed out. Please try again.";
    case NetworkErrorType.RateLimited:
      return "Too many requests. Please wait a moment.";
    case NetworkErrorType.ServerError:
      return "Server is temporarily unavailable. Please try again later.";
    case NetworkErrorType.RpcError:
      return "Blockchain RPC error. Please try again.";
    case NetworkErrorType.UserError:
      return "Transaction error. Please check your input.";
    case NetworkErrorType.MaxRetriesExceeded:
      return "Connection failed after multiple attempts. Please retry.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}
