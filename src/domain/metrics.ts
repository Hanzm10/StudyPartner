import { gradeItem, type GradeResult, type ItemAnswer, type ItemStatus } from './grading'
import type { Quiz, QuizItemType } from './quiz'

export type ItemResponseInput = {
  itemId: string
  /** Omit, null, or undefined marks the item unanswered / skipped. */
  answer?: ItemAnswer | null
  durationMs: number
  /** Student-accepted grade that wins over the auto-grader. */
  statusOverride?: ItemStatus
}

export type GradedItemResult = GradeResult & {
  itemId: string
  type: QuizItemType
  durationMs: number
}

export type TypeBreakdown = {
  type: QuizItemType
  total: number
  correct: number
  incorrect: number
  unanswered: number
  accuracy: number
}

export type AttemptMetrics = {
  startedAt: string
  finishedAt: string
  totalDurationMs: number
  items: GradedItemResult[]
  counts: {
    total: number
    correct: number
    incorrect: number
    unanswered: number
  }
  accuracy: number
  /** Null when there are zero correct answers. */
  incorrectToCorrectRatio: number | null
  averageItemDurationMs: number
  fastestItem: { itemId: string; durationMs: number } | null
  slowestItem: { itemId: string; durationMs: number } | null
  timeOnCorrectMs: number
  timeOnIncorrectMs: number
  byType: TypeBreakdown[]
}

function toIso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString()
}

function toMs(value: string | Date): number {
  return typeof value === 'string' ? Date.parse(value) : value.getTime()
}

function accuracy(correct: number, total: number): number {
  if (total === 0) {
    return 0
  }
  return correct / total
}

/**
 * Pure attempt metrics from a quiz, per-item responses, and timestamps.
 * Skip / unanswered is a status, not an exception.
 */
export function computeAttemptMetrics(
  quiz: Quiz,
  responses: readonly ItemResponseInput[],
  startedAt: string | Date,
  finishedAt: string | Date,
): AttemptMetrics {
  const responseById = new Map(responses.map((r) => [r.itemId, r]))

  const items: GradedItemResult[] = quiz.items.map((item) => {
    const response = responseById.get(item.id)
    const graded = gradeItem(item, response?.answer ?? null)
    return {
      itemId: item.id,
      type: item.type,
      durationMs: response?.durationMs ?? 0,
      ...graded,
      ...(response?.statusOverride ? { status: response.statusOverride } : {}),
    }
  })

  const counts = {
    total: items.length,
    correct: items.filter((i) => i.status === 'correct').length,
    incorrect: items.filter((i) => i.status === 'incorrect').length,
    unanswered: items.filter((i) => i.status === 'unanswered').length,
  }

  const durations = items.map((i) => i.durationMs)
  const averageItemDurationMs =
    durations.length === 0
      ? 0
      : durations.reduce((sum, d) => sum + d, 0) / durations.length

  let fastestItem: AttemptMetrics['fastestItem'] = null
  let slowestItem: AttemptMetrics['slowestItem'] = null
  for (const item of items) {
    if (
      fastestItem == null ||
      item.durationMs < fastestItem.durationMs
    ) {
      fastestItem = { itemId: item.itemId, durationMs: item.durationMs }
    }
    if (
      slowestItem == null ||
      item.durationMs > slowestItem.durationMs
    ) {
      slowestItem = { itemId: item.itemId, durationMs: item.durationMs }
    }
  }

  const timeOnCorrectMs = items
    .filter((i) => i.status === 'correct')
    .reduce((sum, i) => sum + i.durationMs, 0)
  const timeOnIncorrectMs = items
    .filter((i) => i.status === 'incorrect')
    .reduce((sum, i) => sum + i.durationMs, 0)

  const typeOrder: QuizItemType[] = [
    'multiple_choice',
    'true_false',
    'identification',
    'fill_in_the_blank',
    'enumeration',
  ]
  const byType: TypeBreakdown[] = typeOrder
    .map((type) => {
      const typed = items.filter((i) => i.type === type)
      if (typed.length === 0) {
        return null
      }
      const correct = typed.filter((i) => i.status === 'correct').length
      const incorrect = typed.filter((i) => i.status === 'incorrect').length
      const unanswered = typed.filter((i) => i.status === 'unanswered').length
      return {
        type,
        total: typed.length,
        correct,
        incorrect,
        unanswered,
        accuracy: accuracy(correct, typed.length),
      }
    })
    .filter((row): row is TypeBreakdown => row != null)

  const startedIso = toIso(startedAt)
  const finishedIso = toIso(finishedAt)
  const totalDurationMs = Math.max(0, toMs(finishedAt) - toMs(startedAt))

  return {
    startedAt: startedIso,
    finishedAt: finishedIso,
    totalDurationMs,
    items,
    counts,
    accuracy: accuracy(counts.correct, counts.total),
    incorrectToCorrectRatio:
      counts.correct === 0 ? null : counts.incorrect / counts.correct,
    averageItemDurationMs,
    fastestItem: items.length === 0 ? null : fastestItem,
    slowestItem: items.length === 0 ? null : slowestItem,
    timeOnCorrectMs,
    timeOnIncorrectMs,
    byType,
  }
}

export type { ItemStatus }
