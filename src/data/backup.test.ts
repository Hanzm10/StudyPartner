import { describe, expect, it } from 'vitest'
import type { Quiz } from '../domain'
import { buildBackup, mergeBackup, parseBackup } from './backup'
import { DEFAULT_QUIZ_PREFS, type Attempt } from './types'

function quiz(id: string, title = id): Quiz {
  return {
    id,
    title,
    createdAt: '2026-01-01T00:00:00.000Z',
    items: [{ id: 'q1', type: 'true_false', prompt: 'p', correct: true }],
  }
}

function attempt(id: string, quizId: string, finished = true): Attempt {
  return {
    id,
    quizId,
    startedAt: '2026-01-01T00:00:00.000Z',
    currentItemIndex: finished ? 1 : 0,
    items: [],
    ...(finished ? { finishedAt: '2026-01-01T00:01:00.000Z' } : {}),
  }
}

describe('backup', () => {
  it('round-trips through JSON and never includes settings', () => {
    const backup = buildBackup([quiz('a')], [attempt('x', 'a')], DEFAULT_QUIZ_PREFS)
    const text = JSON.stringify(backup)
    expect(text).not.toContain('apiKey')
    const parsed = parseBackup(text)
    expect(parsed.status).toBe('valid')
  })

  it('rejects non-backups with a helpful message', () => {
    expect(parseBackup('nope').status).toBe('invalid')
    const single = parseBackup(JSON.stringify(quiz('a')))
    expect(single.status === 'invalid' && single.error).toContain('Import quiz')
  })

  it('merges by id, keeps local-only data, and skips bad entries', () => {
    const local = {
      quizzes: [quiz('a', 'old title'), quiz('local')],
      attempts: [attempt('x', 'a'), attempt('mine', 'local', false)],
    }
    const backup = buildBackup(
      [
        quiz('a', 'new title'),
        quiz('b'),
        { id: 'broken', title: '', createdAt: '', items: [] } as unknown as Quiz,
      ],
      [
        attempt('x', 'a'),
        attempt('y', 'b'),
        attempt('orphan', 'missing-quiz'),
        attempt('theirs', 'local', false),
      ],
      DEFAULT_QUIZ_PREFS,
    )

    const result = mergeBackup(local, backup)
    expect(result.stats).toEqual({
      quizzesAdded: 1,
      quizzesUpdated: 1,
      attemptsAdded: 1,
      attemptsUpdated: 1,
      skipped: 3,
    })
    expect(result.quizzes.map((q) => q.id).sort()).toEqual(['a', 'b', 'local'])
    expect(result.quizzes.find((q) => q.id === 'a')?.title).toBe('new title')
    expect(result.attempts.map((a) => a.id).sort()).toEqual(['mine', 'x', 'y'])
  })
})
