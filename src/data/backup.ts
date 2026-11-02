import { quizSchema, type Quiz } from '../domain'
import type { Attempt, QuizPrefs } from './types'

/**
 * Everything needed to move studying to another device.
 * Settings (and the API key in them) are deliberately left out.
 */
export type StudyBackup = {
  app: 'studypartner'
  version: 1
  exportedAt: string
  quizzes: Quiz[]
  attempts: Attempt[]
  quizPrefs?: QuizPrefs
}

export type MergeStats = {
  quizzesAdded: number
  quizzesUpdated: number
  attemptsAdded: number
  attemptsUpdated: number
  skipped: number
}

export type MergeResult = {
  quizzes: Quiz[]
  attempts: Attempt[]
  quizPrefs?: QuizPrefs
  stats: MergeStats
}

export function buildBackup(
  quizzes: Quiz[],
  attempts: Attempt[],
  quizPrefs: QuizPrefs,
): StudyBackup {
  return {
    app: 'studypartner',
    version: 1,
    exportedAt: new Date().toISOString(),
    quizzes,
    attempts,
    quizPrefs,
  }
}

export type ParsedBackup =
  | { status: 'valid'; backup: StudyBackup }
  | { status: 'invalid'; error: string }

export function parseBackup(text: string): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(text.trim())
  } catch {
    return { status: 'invalid', error: 'This is not a StudyPartner backup (invalid JSON).' }
  }
  const record = data as Partial<StudyBackup> | null
  if (!record || typeof record !== 'object' || record.app !== 'studypartner') {
    return {
      status: 'invalid',
      error:
        'This is not a StudyPartner backup. To add a single quiz, use Quizzes → Import quiz.',
    }
  }
  if (record.version !== 1) {
    return { status: 'invalid', error: `Unsupported backup version: ${String(record.version)}` }
  }
  if (!Array.isArray(record.quizzes) || !Array.isArray(record.attempts)) {
    return { status: 'invalid', error: 'Backup is missing quizzes or attempts.' }
  }
  return { status: 'valid', backup: record as StudyBackup }
}

function isAttempt(value: unknown): value is Attempt {
  const a = value as Partial<Attempt> | null
  return (
    !!a &&
    typeof a === 'object' &&
    typeof a.id === 'string' &&
    typeof a.quizId === 'string' &&
    typeof a.startedAt === 'string' &&
    typeof a.currentItemIndex === 'number' &&
    Array.isArray(a.items)
  )
}

/**
 * Merge a backup into local data. Matching ids are replaced by the backup's copy;
 * everything else on this device is kept. Invalid entries are skipped, not fatal.
 */
export function mergeBackup(
  local: { quizzes: Quiz[]; attempts: Attempt[] },
  backup: StudyBackup,
): MergeResult {
  const stats: MergeStats = {
    quizzesAdded: 0,
    quizzesUpdated: 0,
    attemptsAdded: 0,
    attemptsUpdated: 0,
    skipped: 0,
  }

  const quizzes = new Map(local.quizzes.map((q) => [q.id, q]))
  for (const raw of backup.quizzes) {
    const parsed = quizSchema.safeParse(raw)
    if (!parsed.success) {
      stats.skipped += 1
      continue
    }
    if (quizzes.has(parsed.data.id)) {
      stats.quizzesUpdated += 1
    } else {
      stats.quizzesAdded += 1
    }
    quizzes.set(parsed.data.id, parsed.data)
  }

  const attempts = new Map(local.attempts.map((a) => [a.id, a]))
  const localUnfinished = new Set(
    local.attempts.filter((a) => !a.finishedAt).map((a) => a.quizId),
  )
  for (const raw of backup.attempts) {
    if (!isAttempt(raw) || !quizzes.has(raw.quizId)) {
      stats.skipped += 1
      continue
    }
    const exists = attempts.has(raw.id)
    // One in-progress attempt per quiz: keep this device's own if it has one.
    if (!exists && !raw.finishedAt && localUnfinished.has(raw.quizId)) {
      stats.skipped += 1
      continue
    }
    if (exists) {
      stats.attemptsUpdated += 1
    } else {
      stats.attemptsAdded += 1
    }
    attempts.set(raw.id, raw)
  }

  return {
    quizzes: [...quizzes.values()],
    attempts: [...attempts.values()],
    quizPrefs: backup.quizPrefs,
    stats,
  }
}
