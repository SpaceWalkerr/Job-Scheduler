export type RetryStrategy = "fixed" | "linear" | "exponential";

// Delay before the next attempt, given the attempt number that just failed (1-based).
export function nextRetryDelayMs(strategy: RetryStrategy, baseMs: number, failedAttempt: number): number {
  switch (strategy) {
    case "fixed":
      return baseMs;
    case "linear":
      return baseMs * failedAttempt;
    case "exponential":
      return baseMs * 2 ** (failedAttempt - 1);
  }
}
