import type { QuizItem } from '../domain'

const BLANK_TOKEN_RE = /\{\{([^}]+)\}\}/g

/** Blank ids in prompt order, then any blanks the prompt never mentions. */
export function blankOrder(item: QuizItem): string[] {
  if (item.type !== 'fill_in_the_blank') {
    return []
  }
  const known = new Set(item.blanks.map((b) => b.id))
  const ordered: string[] = []
  for (const match of item.prompt.matchAll(BLANK_TOKEN_RE)) {
    const id = match[1]!.trim()
    if (known.has(id) && !ordered.includes(id)) {
      ordered.push(id)
    }
  }
  for (const blank of item.blanks) {
    if (!ordered.includes(blank.id)) {
      ordered.push(blank.id)
    }
  }
  return ordered
}

/**
 * Prompt text safe to show a student. Blank ids are often the answer itself
 * (e.g. {{mitochondria}}), so they are replaced with numbered gaps.
 */
export function displayPrompt(item: QuizItem): string {
  if (item.type !== 'fill_in_the_blank') {
    return item.prompt
  }
  const order = blankOrder(item)
  return item.prompt.replace(BLANK_TOKEN_RE, (token, raw: string) => {
    const index = order.indexOf(raw.trim())
    return index >= 0 ? `_____ (${index + 1})` : token
  })
}

export function typeLabel(type: QuizItem['type']): string {
  switch (type) {
    case 'multiple_choice':
      return 'Multiple choice'
    case 'true_false':
      return 'True / False'
    case 'identification':
      return 'Identification'
    case 'fill_in_the_blank':
      return 'Fill in the blank'
    case 'enumeration':
      return 'Enumeration'
  }
}

/** Human-readable answer key for one item. */
export function formatKey(item: QuizItem): string {
  switch (item.type) {
    case 'multiple_choice':
      return (
        item.choices.find((c) => c.id === item.correctChoiceId)?.text ??
        item.correctChoiceId
      )
    case 'true_false':
      return item.correct ? 'True' : 'False'
    case 'identification':
      return item.acceptedAnswers.join(' / ')
    case 'fill_in_the_blank': {
      const order = blankOrder(item)
      return order
        .map((id, index) => {
          const blank = item.blanks.find((b) => b.id === id)
          return `(${index + 1}) ${blank?.acceptedAnswers.join(' / ') ?? ''}`
        })
        .join('; ')
    }
    case 'enumeration':
      return item.acceptedItems
        .map((group, index) =>
          item.orderMatters
            ? `${index + 1}. ${group.join(' / ')}`
            : group.join(' / '),
        )
        .join(item.orderMatters ? ' · ' : '; ')
  }
}

/** Human-readable student answer for one item; "—" when skipped. */
export function formatStudentAnswer(item: QuizItem, answer: unknown): string {
  if (!answer || typeof answer !== 'object') {
    return '—'
  }
  const record = answer as Record<string, unknown>
  switch (item.type) {
    case 'multiple_choice':
      return (
        item.choices.find((c) => c.id === record.choiceId)?.text ??
        String(record.choiceId ?? '—')
      )
    case 'true_false':
      return record.value === true ? 'True' : record.value === false ? 'False' : '—'
    case 'identification':
      return typeof record.text === 'string' && record.text.trim()
        ? record.text
        : '—'
    case 'fill_in_the_blank': {
      const blanks = (record.blanks ?? {}) as Record<string, string>
      return blankOrder(item)
        .map((id, index) => `(${index + 1}) ${blanks[id]?.trim() || '(empty)'}`)
        .join('; ')
    }
    case 'enumeration': {
      const lines = Array.isArray(record.lines)
        ? (record.lines as unknown[]).map((l) => String(l ?? '').trim()).filter(Boolean)
        : []
      return lines.length > 0 ? lines.join('; ') : '—'
    }
  }
}
