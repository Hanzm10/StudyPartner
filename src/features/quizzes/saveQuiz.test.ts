import { describe, expect, it } from 'vitest'
import { parseImportedQuiz } from './saveQuiz'

const quiz = {
  title: 'Cells',
  items: [
    { id: 'q1', type: 'true_false', prompt: 'Cells have DNA.', correct: true },
    { id: 'q1', type: 'identification', prompt: 'Powerhouse?', acceptedAnswers: ['mitochondria'] },
  ],
}
const json = JSON.stringify(quiz)

describe('parseImportedQuiz', () => {
  it('accepts a quiz fence, a json fence, and bare JSON with chatter', () => {
    for (const text of [
      `Here you go:\n\`\`\`quiz\n${json}\n\`\`\`\nGood luck!`,
      `\`\`\`json\n${json}\n\`\`\``,
      `Sure! ${json} Let me know.`,
    ]) {
      const result = parseImportedQuiz(text)
      expect(result.status).toBe('valid')
      if (result.status === 'valid') {
        expect(result.quiz.items).toHaveLength(2)
        expect(new Set(result.quiz.items.map((i) => i.id)).size).toBe(2)
      }
    }
  })

  it('reports empty and invalid input', () => {
    expect(parseImportedQuiz('   ').status).toBe('none')
    expect(parseImportedQuiz('{ "title": "x", "items": [] }').status).toBe('invalid')
    expect(parseImportedQuiz('not a quiz').status).toBe('invalid')
  })
})
