/**
 * Runs `task`, and on failure runs it once more. Slack sends fail transiently
 * often enough (network blips) that a single retry is worth it, but more than
 * one would delay the admin alert for a real outage (docs/ARCHITECTURE.md).
 */
export async function withOneRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch {
    return await task();
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
