import { studyRepository } from '../../data/repository'
import type { Quiz } from '../../domain'
import { parseQuizFromAssistantMessage, type QuizFenceResult } from '../chat/parseQuizFence'

/**
 * Models often reuse ids like "quiz-1", which would overwrite an older quiz.
 * Reuse a saved quiz only when it is the same content; otherwise mint a new id.
 */
export function saveNewQuiz(quiz: Quiz): Quiz {
  const items = JSON.stringify(quiz.items)
  const existing = studyRepository
    .listQuizzes()
    .find((q) => q.title === quiz.title && JSON.stringify(q.items) === items)
  if (existing) {
    return existing
  }
  const saved: Quiz = {
    ...quiz,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  studyRepository.saveQuiz(saved)
  return saved
}

const ANY_FENCE_RE = /```[a-z]*\s*\r?\n([\s\S]*?)```/i

/**
 * Parse a quiz pasted from another chat: a ```quiz block, a ```json block,
 * or bare JSON, with or without text around it.
 */
export function parseImportedQuiz(text: string): QuizFenceResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { status: 'none' }
  }
  if (/```quiz/i.test(trimmed)) {
    return parseQuizFromAssistantMessage(trimmed)
  }
  const fenced = trimmed.match(ANY_FENCE_RE)?.[1]
  let json = fenced ?? trimmed
  if (!fenced) {
    // Tolerate chatter before/after the object, e.g. "Here's your quiz: {...}".
    const start = json.indexOf('{')
    const end = json.lastIndexOf('}')
    if (start >= 0 && end > start) {
      json = json.slice(start, end + 1)
    }
  }
  return parseQuizFromAssistantMessage(`\`\`\`quiz\n${json.trim()}\n\`\`\``)
}
