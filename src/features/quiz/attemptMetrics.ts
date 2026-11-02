import type { AttemptItemRecord } from '../../data/types'
import { computeAttemptMetrics, type AttemptMetrics, type Quiz } from '../../domain'

/** Metrics for recorded items, honoring "mark correct" overrides. */
export function metricsForAttempt(
  quiz: Quiz,
  items: readonly AttemptItemRecord[],
  startedAt: string,
  finishedAt: string,
): AttemptMetrics {
  return computeAttemptMetrics(
    quiz,
    items
      .filter((entry): entry is AttemptItemRecord => entry != null)
      .map((entry) => ({
        itemId: entry.itemId,
        answer: entry.answer,
        durationMs: entry.durationMs,
        ...(entry.overridden ? { statusOverride: 'correct' as const } : {}),
      })),
    startedAt,
    finishedAt,
  )
}

/**
 * Teach the quiz a student's identification answer so later attempts accept it.
 * Returns the updated quiz, or null when nothing changed.
 */
export function acceptIdentificationAnswer(
  quiz: Quiz,
  itemId: string,
  text: string,
): Quiz | null {
  const trimmed = text.trim()
  const item = quiz.items.find((i) => i.id === itemId)
  if (!trimmed || !item || item.type !== 'identification') {
    return null
  }
  if (item.acceptedAnswers.includes(trimmed)) {
    return null
  }
  return {
    ...quiz,
    items: quiz.items.map((i) =>
      i.id === itemId && i.type === 'identification'
        ? { ...i, acceptedAnswers: [...i.acceptedAnswers, trimmed] }
        : i,
    ),
  }
}
