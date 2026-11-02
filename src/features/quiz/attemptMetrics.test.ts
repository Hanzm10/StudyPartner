import { describe, expect, it } from 'vitest'
import type { AttemptItemRecord } from '../../data/types'
import type { Quiz } from '../../domain'
import { acceptIdentificationAnswer, metricsForAttempt } from './attemptMetrics'

const quiz: Quiz = {
  id: 'q',
  title: 'Bio',
  createdAt: '2026-01-01T00:00:00.000Z',
  items: [
    {
      id: 'i1',
      type: 'identification',
      prompt: 'Powerhouse of the cell?',
      acceptedAnswers: ['mitochondria'],
    },
    { id: 't1', type: 'true_false', prompt: 'DNA is a protein.', correct: false },
  ],
}

function record(partial: Partial<AttemptItemRecord>): AttemptItemRecord {
  return {
    itemId: 'i1',
    type: 'identification',
    answer: null,
    studentAnswer: null,
    key: null,
    status: 'unanswered',
    durationMs: 1000,
    ...partial,
  }
}

describe('metricsForAttempt', () => {
  it('counts an overridden miss as correct', () => {
    const items = [
      record({ answer: { text: 'mitochondrion' }, status: 'correct', overridden: true }),
      record({ itemId: 't1', type: 'true_false', answer: { value: true }, status: 'incorrect' }),
    ]
    const metrics = metricsForAttempt(
      quiz,
      items,
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T10:01:00.000Z',
    )
    expect(metrics.counts.correct).toBe(1)
    expect(metrics.counts.incorrect).toBe(1)
    expect(metrics.items.find((i) => i.itemId === 'i1')?.status).toBe('correct')
  })
})

describe('acceptIdentificationAnswer', () => {
  it('adds a new accepted answer once', () => {
    const taught = acceptIdentificationAnswer(quiz, 'i1', ' mitochondrion ')
    const item = taught?.items[0]
    expect(item?.type === 'identification' && item.acceptedAnswers).toEqual([
      'mitochondria',
      'mitochondrion',
    ])
    expect(acceptIdentificationAnswer(taught!, 'i1', 'mitochondrion')).toBeNull()
    expect(acceptIdentificationAnswer(quiz, 't1', 'false')).toBeNull()
  })
})
