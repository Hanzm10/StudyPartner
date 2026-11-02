import { describe, expect, it } from 'vitest'
import { gradeItem } from './grading'
import { computeAttemptMetrics } from './metrics'
import { matchesAccepted, normalizeAnswer } from './normalize'
import type { Quiz } from './quiz'

describe('normalizeAnswer', () => {
  it('trims, lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeAnswer('  Hello,   World!!  ')).toBe('hello world')
    expect(normalizeAnswer('U.S.A.')).toBe('usa')
    expect(normalizeAnswer('United States')).toBe('united states')
  })

  it('matches any accepted answer after normalization', () => {
    expect(matchesAccepted('u.s.a.', ['USA', 'United States'])).toBe(true)
    expect(matchesAccepted('United  States!', ['USA', 'United States'])).toBe(
      true,
    )
    expect(matchesAccepted('Canada', ['USA', 'United States'])).toBe(false)
    expect(matchesAccepted('   ', ['USA'])).toBe(false)
  })
})

describe('gradeItem', () => {
  it('grades multiple choice exactly by choice id', () => {
    const item = {
      id: 'mc1',
      type: 'multiple_choice' as const,
      prompt: 'Capital of France?',
      choices: [
        { id: 'a', text: 'Paris' },
        { id: 'b', text: 'Lyon' },
      ],
      correctChoiceId: 'a',
    }

    expect(gradeItem(item, { choiceId: 'a' }).status).toBe('correct')
    expect(gradeItem(item, { choiceId: 'b' }).status).toBe('incorrect')
    expect(gradeItem(item, null).status).toBe('unanswered')
  })

  it('grades true/false exactly', () => {
    const item = {
      id: 'tf1',
      type: 'true_false' as const,
      prompt: 'Water freezes at 0°C.',
      correct: true,
    }

    expect(gradeItem(item, { value: true }).status).toBe('correct')
    expect(gradeItem(item, { value: false }).status).toBe('incorrect')
    expect(gradeItem(item, undefined).status).toBe('unanswered')
  })

  it('grades identification with normalized accepted answers', () => {
    const item = {
      id: 'id1',
      type: 'identification' as const,
      prompt: 'Largest planet?',
      acceptedAnswers: ['Jupiter', 'Planet Jupiter'],
    }

    expect(gradeItem(item, { text: 'jupiter!' }).status).toBe('correct')
    expect(gradeItem(item, { text: 'Planet   Jupiter' }).status).toBe('correct')
    expect(gradeItem(item, { text: 'Mars' }).status).toBe('incorrect')
    expect(gradeItem(item, { text: '  ' }).status).toBe('unanswered')
  })

  it('grades fill-in-the-blank and treats an empty blank as incorrect', () => {
    const item = {
      id: 'fib1',
      type: 'fill_in_the_blank' as const,
      prompt: 'The {{color}} fox jumped over the {{animal}}.',
      blanks: [
        { id: 'color', acceptedAnswers: ['brown', 'red'] },
        { id: 'animal', acceptedAnswers: ['dog', 'lazy dog'] },
      ],
    }

    expect(
      gradeItem(item, {
        blanks: { color: 'Brown', animal: 'lazy  dog!' },
      }).status,
    ).toBe('correct')

    expect(
      gradeItem(item, {
        blanks: { color: 'brown', animal: '' },
      }).status,
    ).toBe('incorrect')

    expect(
      gradeItem(item, {
        blanks: { color: '', animal: '' },
      }).status,
    ).toBe('unanswered')
  })

  it('grades unordered enumeration with matched/missing/extra', () => {
    const item = {
      id: 'en1',
      type: 'enumeration' as const,
      prompt: 'Primary colors',
      acceptedItems: [['red'], ['blue'], ['yellow', 'yellowish']],
      orderMatters: false,
    }

    const perfect = gradeItem(item, {
      lines: ['Yellow!', 'red', 'BLUE'],
    })
    expect(perfect.status).toBe('correct')
    expect(perfect.enumeration).toEqual({ matched: 3, missing: 0, extra: 0 })

    const withExtra = gradeItem(item, {
      lines: ['red', 'blue', 'yellow', 'green'],
    })
    expect(withExtra.status).toBe('incorrect')
    expect(withExtra.enumeration).toEqual({ matched: 3, missing: 0, extra: 1 })

    const missing = gradeItem(item, { lines: ['red', 'blue'] })
    expect(missing.status).toBe('incorrect')
    expect(missing.enumeration).toEqual({ matched: 2, missing: 1, extra: 0 })
  })

  it('grades ordered enumeration when orderMatters is true', () => {
    const item = {
      id: 'en2',
      type: 'enumeration' as const,
      prompt: 'Steps',
      acceptedItems: [['one', '1'], ['two', '2'], ['three', '3']],
      orderMatters: true,
    }

    expect(
      gradeItem(item, { lines: ['1', 'two', 'THREE'] }).status,
    ).toBe('correct')

    const wrongOrder = gradeItem(item, {
      lines: ['two', 'one', 'three'],
    })
    expect(wrongOrder.status).toBe('incorrect')
    expect(wrongOrder.enumeration?.matched).toBe(1)
    expect(wrongOrder.enumeration?.missing).toBe(2)
    expect(wrongOrder.enumeration?.extra).toBe(0)

    const extras = gradeItem(item, {
      lines: ['one', 'two', 'three', 'four'],
    })
    expect(extras.status).toBe('incorrect')
    expect(extras.enumeration).toEqual({ matched: 3, missing: 0, extra: 1 })
  })
})

describe('computeAttemptMetrics', () => {
  const quiz: Quiz = {
    id: 'quiz-1',
    title: 'Sample',
    createdAt: '2026-01-01T00:00:00.000Z',
    items: [
      {
        id: 'q1',
        type: 'multiple_choice',
        prompt: '2+2?',
        choices: [
          { id: 'a', text: '4' },
          { id: 'b', text: '5' },
        ],
        correctChoiceId: 'a',
      },
      {
        id: 'q2',
        type: 'true_false',
        prompt: 'Sky is green',
        correct: false,
      },
      {
        id: 'q3',
        type: 'identification',
        prompt: 'H2O is?',
        acceptedAnswers: ['water'],
      },
    ],
  }

  it('returns null incorrectToCorrectRatio when nothing is correct', () => {
    const metrics = computeAttemptMetrics(
      quiz,
      [
        { itemId: 'q1', answer: { choiceId: 'b' }, durationMs: 1000 },
        { itemId: 'q2', answer: { value: true }, durationMs: 2000 },
        { itemId: 'q3', answer: null, durationMs: 500 },
      ],
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T10:01:00.000Z',
    )

    expect(metrics.counts).toEqual({
      total: 3,
      correct: 0,
      incorrect: 2,
      unanswered: 1,
    })
    expect(metrics.incorrectToCorrectRatio).toBeNull()
    expect(metrics.accuracy).toBe(0)
    expect(metrics.totalDurationMs).toBe(60_000)
    expect(metrics.timeOnIncorrectMs).toBe(3000)
    expect(metrics.timeOnCorrectMs).toBe(0)
    expect(metrics.fastestItem).toEqual({ itemId: 'q3', durationMs: 500 })
    expect(metrics.slowestItem).toEqual({ itemId: 'q2', durationMs: 2000 })
  })

  it('computes ratio and type breakdown when some answers are correct', () => {
    const metrics = computeAttemptMetrics(
      quiz,
      [
        { itemId: 'q1', answer: { choiceId: 'a' }, durationMs: 1500 },
        { itemId: 'q2', answer: { value: true }, durationMs: 2500 },
        { itemId: 'q3', answer: { text: 'Water' }, durationMs: 1000 },
      ],
      new Date('2026-01-01T10:00:00.000Z'),
      new Date('2026-01-01T10:00:30.000Z'),
    )

    expect(metrics.counts.correct).toBe(2)
    expect(metrics.counts.incorrect).toBe(1)
    expect(metrics.incorrectToCorrectRatio).toBe(0.5)
    expect(metrics.accuracy).toBeCloseTo(2 / 3)
    expect(metrics.averageItemDurationMs).toBeCloseTo(5000 / 3)
    expect(metrics.byType.map((row) => row.type)).toEqual([
      'multiple_choice',
      'true_false',
      'identification',
    ])
  })
})

describe('computeAttemptMetrics statusOverride', () => {
  it('lets a student override win over the grader', () => {
    const quiz: Quiz = {
      id: 'q',
      title: 't',
      createdAt: '2026-01-01T00:00:00.000Z',
      items: [
        { id: 'a', type: 'identification', prompt: 'p', acceptedAnswers: ['x'] },
      ],
    }
    const metrics = computeAttemptMetrics(
      quiz,
      [{ itemId: 'a', answer: { text: 'y' }, durationMs: 1, statusOverride: 'correct' }],
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:01.000Z',
    )
    expect(metrics.counts.correct).toBe(1)
  })
})
