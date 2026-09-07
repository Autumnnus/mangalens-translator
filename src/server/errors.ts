/**
 * Drizzle wraps database failures as "Failed query: ..." and keeps the real
 * Postgres message in `cause`. Surface it so a missing table or column is
 * obvious from the API response.
 */
export const describeError = (error: unknown, fallback = "Unknown server error") => {
  if (!(error instanceof Error)) return fallback;
  const cause = (error as Error & { cause?: unknown }).cause;
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : null;
  if (causeMessage && error.message.startsWith("Failed query")) {
    return `Database error: ${causeMessage}`;
  }
  if (causeMessage && !error.message.includes(causeMessage)) {
    return `${error.message} (${causeMessage})`;
  }
  return error.message || fallback;
};
