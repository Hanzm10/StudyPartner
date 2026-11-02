import { safeParseQuiz, type Quiz } from '../../domain'

const QUIZ_FENCE_RE = /```quiz\s*\r?\n([\s\S]*?)```/i

export type QuizFenceResult =
  | { status: 'none' }
  | { status: 'invalid'; error: string }
  | { status: 'valid'; quiz: Quiz }

export function extractQuizFenceJson(content: string): string | null {
  const match = content.match(QUIZ_FENCE_RE)
  if (!match?.[1]) {
    return null
  }
  const trimmed = match[1].trim()
  return trimmed.length > 0 ? trimmed : null
}

function formatZodError(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>
}): string {
  return error.issues
    .map((issue) => {
      const path =
        issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    .join('\n')
}

/**
 * Parses a ```quiz fence from an assistant message.
 * Fills missing id / createdAt client-side, then validates with safeParseQuiz.
 */
export function parseQuizFromAssistantMessage(content: string): QuizFenceResult {
  const raw = extractQuizFenceJson(content)
  if (!raw) {
    return { status: 'none' }
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown JSON error'
    return { status: 'invalid', error: `Invalid JSON: ${message}` }
  }

  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.trim() === '') {
      record.id = crypto.randomUUID()
    }
    if (typeof record.createdAt !== 'string' || record.createdAt.trim() === '') {
      record.createdAt = new Date().toISOString()
    }
    // Models sometimes repeat item ids; grading and results key on them.
    if (Array.isArray(record.items)) {
      const seen = new Set<string>()
      record.items.forEach((item: unknown, index) => {
        if (!item || typeof item !== 'object') {
          return
        }
        const entry = item as Record<string, unknown>
        let id =
          typeof entry.id === 'string' && entry.id.trim() !== ''
            ? entry.id
            : `item-${index + 1}`
        while (seen.has(id)) {
          id = `${id}-${index + 1}`
        }
        seen.add(id)
        entry.id = id
      })
    }
  }

  const parsed = safeParseQuiz(data)
  if (!parsed.success) {
    return { status: 'invalid', error: formatZodError(parsed.error) }
  }

  return { status: 'valid', quiz: parsed.data }
}

/** Preview state derived from the latest assistant message only. */
export function previewFromLatestAssistant(
  messages: Array<{ role: string; content: string }>,
): QuizFenceResult {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'assistant') {
      return parseQuizFromAssistantMessage(message.content)
    }
  }
  return { status: 'none' }
}
