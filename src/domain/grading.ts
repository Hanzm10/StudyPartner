import { matchesAccepted, normalizeAnswer } from './normalize'
import type {
  EnumerationItem,
  FillInTheBlankItem,
  IdentificationItem,
  MultipleChoiceItem,
  QuizItem,
  TrueFalseItem,
} from './quiz'

export type ItemStatus = 'correct' | 'incorrect' | 'unanswered'

export type MultipleChoiceAnswer = { choiceId: string }
export type TrueFalseAnswer = { value: boolean }
export type IdentificationAnswer = { text: string }
export type FillInTheBlankAnswer = { blanks: Record<string, string> }
export type EnumerationAnswer = { lines: string[] }

export type ItemAnswer =
  | MultipleChoiceAnswer
  | TrueFalseAnswer
  | IdentificationAnswer
  | FillInTheBlankAnswer
  | EnumerationAnswer

export type EnumerationBreakdown = {
  matched: number
  missing: number
  extra: number
}

export type GradeResult = {
  status: ItemStatus
  studentAnswer: unknown
  key: unknown
  enumeration?: EnumerationBreakdown
}

function unanswered(key: unknown): GradeResult {
  return {
    status: 'unanswered',
    studentAnswer: null,
    key,
  }
}

function gradeMultipleChoice(
  item: MultipleChoiceItem,
  answer: MultipleChoiceAnswer | null | undefined,
): GradeResult {
  const key = {
    correctChoiceId: item.correctChoiceId,
    choices: item.choices,
  }
  if (!answer || answer.choiceId == null || answer.choiceId === '') {
    return unanswered(key)
  }
  return {
    status: answer.choiceId === item.correctChoiceId ? 'correct' : 'incorrect',
    studentAnswer: { choiceId: answer.choiceId },
    key,
  }
}

function gradeTrueFalse(
  item: TrueFalseItem,
  answer: TrueFalseAnswer | null | undefined,
): GradeResult {
  const key = { correct: item.correct }
  if (!answer || typeof answer.value !== 'boolean') {
    return unanswered(key)
  }
  return {
    status: answer.value === item.correct ? 'correct' : 'incorrect',
    studentAnswer: { value: answer.value },
    key,
  }
}

function gradeIdentification(
  item: IdentificationItem,
  answer: IdentificationAnswer | null | undefined,
): GradeResult {
  const key = { acceptedAnswers: item.acceptedAnswers }
  if (!answer || answer.text == null || normalizeAnswer(answer.text).length === 0) {
    return unanswered(key)
  }
  return {
    status: matchesAccepted(answer.text, item.acceptedAnswers)
      ? 'correct'
      : 'incorrect',
    studentAnswer: { text: answer.text },
    key,
  }
}

function gradeFillInTheBlank(
  item: FillInTheBlankItem,
  answer: FillInTheBlankAnswer | null | undefined,
): GradeResult {
  const key = { blanks: item.blanks }
  if (!answer || !answer.blanks) {
    return unanswered(key)
  }

  const studentBlanks = answer.blanks
  const hasAnyInput = item.blanks.some((blank) => {
    const value = studentBlanks[blank.id]
    return value != null && normalizeAnswer(value).length > 0
  })
  if (!hasAnyInput) {
    return unanswered(key)
  }

  const allCorrect = item.blanks.every((blank) => {
    const value = studentBlanks[blank.id]
    if (value == null || normalizeAnswer(value).length === 0) {
      return false
    }
    return matchesAccepted(value, blank.acceptedAnswers)
  })

  return {
    status: allCorrect ? 'correct' : 'incorrect',
    studentAnswer: { blanks: studentBlanks },
    key,
  }
}

function gradeEnumeration(
  item: EnumerationItem,
  answer: EnumerationAnswer | null | undefined,
): GradeResult {
  const orderMatters = item.orderMatters ?? false
  const key = {
    acceptedItems: item.acceptedItems,
    orderMatters,
  }

  if (!answer || !Array.isArray(answer.lines)) {
    return {
      ...unanswered(key),
      enumeration: {
        matched: 0,
        missing: item.acceptedItems.length,
        extra: 0,
      },
    }
  }

  const lines = answer.lines.map((line) => line ?? '')
  const nonEmptyLines = lines.filter(
    (line) => normalizeAnswer(line).length > 0,
  )

  if (nonEmptyLines.length === 0) {
    return {
      ...unanswered(key),
      enumeration: {
        matched: 0,
        missing: item.acceptedItems.length,
        extra: 0,
      },
      studentAnswer: { lines },
    }
  }

  const enumeration = orderMatters
    ? gradeOrderedEnumeration(item.acceptedItems, nonEmptyLines)
    : gradeUnorderedEnumeration(item.acceptedItems, nonEmptyLines)

  return {
    status:
      enumeration.missing === 0 && enumeration.extra === 0
        ? 'correct'
        : 'incorrect',
    studentAnswer: { lines },
    key,
    enumeration,
  }
}

function gradeOrderedEnumeration(
  acceptedItems: readonly (readonly string[])[],
  lines: readonly string[],
): EnumerationBreakdown {
  const required = acceptedItems.length
  const provided = lines.length
  let matched = 0

  const compareCount = Math.min(required, provided)
  for (let i = 0; i < compareCount; i += 1) {
    if (matchesAccepted(lines[i]!, acceptedItems[i]!)) {
      matched += 1
    }
  }

  return {
    matched,
    missing: required - matched,
    extra: Math.max(0, provided - required),
  }
}

function gradeUnorderedEnumeration(
  acceptedItems: readonly (readonly string[])[],
  lines: readonly string[],
): EnumerationBreakdown {
  const remaining = acceptedItems.map((aliases) => [...aliases])
  let matched = 0
  let extra = 0

  for (const line of lines) {
    const index = remaining.findIndex((aliases) =>
      matchesAccepted(line, aliases),
    )
    if (index >= 0) {
      remaining.splice(index, 1)
      matched += 1
    } else {
      extra += 1
    }
  }

  return {
    matched,
    missing: remaining.length,
    extra,
  }
}

/**
 * Grade a single quiz item. Missing or empty answers are `unanswered`,
 * not thrown as errors.
 */
export function gradeItem(
  item: QuizItem,
  answer: ItemAnswer | null | undefined,
): GradeResult {
  switch (item.type) {
    case 'multiple_choice':
      return gradeMultipleChoice(item, answer as MultipleChoiceAnswer | null)
    case 'true_false':
      return gradeTrueFalse(item, answer as TrueFalseAnswer | null)
    case 'identification':
      return gradeIdentification(item, answer as IdentificationAnswer | null)
    case 'fill_in_the_blank':
      return gradeFillInTheBlank(item, answer as FillInTheBlankAnswer | null)
    case 'enumeration':
      return gradeEnumeration(item, answer as EnumerationAnswer | null)
    default: {
      const _exhaustive: never = item
      return _exhaustive
    }
  }
}
