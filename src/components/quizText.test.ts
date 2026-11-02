import { describe, expect, it } from 'vitest'
import type { QuizItem } from '../domain'
import { displayPrompt, formatKey, formatStudentAnswer } from './quizText'

const fib: QuizItem = {
  id: 'f',
  type: 'fill_in_the_blank',
  prompt: 'The {{mitochondria}} makes {{atp}}.',
  blanks: [
    { id: 'atp', acceptedAnswers: ['ATP'] },
    { id: 'mitochondria', acceptedAnswers: ['mitochondria'] },
  ],
}

describe('quizText', () => {
  it('hides blank ids behind numbered gaps in prompt order', () => {
    expect(displayPrompt(fib)).toBe('The _____ (1) makes _____ (2).')
    expect(formatKey(fib)).toBe('(1) mitochondria; (2) ATP')
    expect(
      formatStudentAnswer(fib, { blanks: { mitochondria: 'nucleus', atp: '' } }),
    ).toBe('(1) nucleus; (2) (empty)')
  })
})
