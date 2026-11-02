/** Trim, lowercase, strip punctuation, and collapse whitespace. */
export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the answer matches any accepted string after normalization. */
export function matchesAccepted(
  answer: string,
  acceptedAnswers: readonly string[],
): boolean {
  const normalized = normalizeAnswer(answer)
  if (normalized.length === 0) {
    return false
  }
  return acceptedAnswers.some(
    (accepted) => normalizeAnswer(accepted) === normalized,
  )
}
