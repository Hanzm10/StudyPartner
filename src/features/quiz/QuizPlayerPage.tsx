import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  blankOrder,
  displayPrompt,
  formatKey,
  formatStudentAnswer,
  typeLabel,
} from '../../components/quizText'
import { studyRepository } from '../../data/repository'
import type {
  Attempt,
  AttemptItemRecord,
  AttemptOptions,
  QuizPrefs,
} from '../../data/types'
import {
  gradeItem,
  seededShuffle,
  type ItemAnswer,
  type Quiz,
  type QuizItem,
} from '../../domain'
import { acceptIdentificationAnswer, metricsForAttempt } from './attemptMetrics'
import './quiz-player.css'

type DraftState = {
  choiceId?: string
  value?: boolean
  text?: string
  blanks?: Record<string, string>
  lines?: string[]
}

type Feedback = {
  item: QuizItem
  position: number
  record: AttemptItemRecord
  isLast: boolean
}

const CHOICE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function emptyDraft(item: QuizItem): DraftState {
  switch (item.type) {
    case 'multiple_choice':
      return { choiceId: undefined }
    case 'true_false':
      return { value: undefined }
    case 'identification':
      return { text: '' }
    case 'fill_in_the_blank': {
      const blanks: Record<string, string> = {}
      for (const blank of item.blanks) {
        blanks[blank.id] = ''
      }
      return { blanks }
    }
    case 'enumeration':
      return { lines: [''] }
  }
}

function hasAnswer(item: QuizItem, draft: DraftState): boolean {
  switch (item.type) {
    case 'multiple_choice':
      return Boolean(draft.choiceId)
    case 'true_false':
      return typeof draft.value === 'boolean'
    case 'identification':
      return Boolean(draft.text?.trim())
    case 'fill_in_the_blank':
      return item.blanks.some((blank) =>
        Boolean(draft.blanks?.[blank.id]?.trim()),
      )
    case 'enumeration':
      return (draft.lines ?? []).some((line) => Boolean(line.trim()))
  }
}

function toItemAnswer(item: QuizItem, draft: DraftState): ItemAnswer {
  switch (item.type) {
    case 'multiple_choice':
      return { choiceId: draft.choiceId! }
    case 'true_false':
      return { value: draft.value! }
    case 'identification':
      return { text: draft.text ?? '' }
    case 'fill_in_the_blank':
      return { blanks: { ...(draft.blanks ?? {}) } }
    case 'enumeration':
      return { lines: [...(draft.lines ?? [])] }
  }
}

function createAttempt(quizId: string): Attempt {
  return {
    id: crypto.randomUUID(),
    quizId,
    startedAt: new Date().toISOString(),
    currentItemIndex: 0,
    items: [],
  }
}

function findOrCreateAttempt(quizId: string): Attempt {
  const unfinished = studyRepository
    .listAttempts(quizId)
    .find((attempt) => !attempt.finishedAt)
  if (unfinished) {
    return unfinished
  }
  const attempt = createAttempt(quizId)
  studyRepository.saveAttempt(attempt)
  return attempt
}

/** Play order for an attempt; attempts saved before options existed play in quiz order. */
function itemOrder(quiz: Quiz, attempt: Attempt): number[] {
  const order = attempt.options?.itemOrder
  if (order && order.length === quiz.items.length) {
    return order
  }
  return quiz.items.map((_, index) => index)
}

function displayedChoices(item: QuizItem, attempt: Attempt) {
  if (item.type !== 'multiple_choice') {
    return []
  }
  return attempt.options?.shuffleChoices
    ? seededShuffle(item.choices, `${attempt.id}:${item.id}`)
    : item.choices
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    (target.tagName === 'INPUT' &&
      !['radio', 'checkbox', 'button'].includes(
        (target as HTMLInputElement).type,
      ))
  )
}

export function QuizPlayerPage() {
  const { quizId = '' } = useParams()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<Quiz | null | undefined>(undefined)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  useEffect(() => {
    if (!quizId) {
      setQuiz(null)
      return
    }
    const found = studyRepository.getQuiz(quizId)
    if (!found) {
      setQuiz(null)
      setAttempt(null)
      return
    }
    setQuiz(found)
    setAttempt(findOrCreateAttempt(quizId))
    setFeedback(null)
  }, [quizId])

  if (quiz === undefined) {
    return (
      <section className="quiz-player">
        <p className="quiz-player-progress">Loading quiz…</p>
      </section>
    )
  }

  if (quiz === null) {
    return (
      <section className="quiz-player-missing">
        <h1 className="quiz-player-title">Quiz not found</h1>
        <p>This quiz is missing or was deleted.</p>
        <Link className="quiz-player-link" to="/quizzes">
          Back to quiz library
        </Link>
      </section>
    )
  }

  if (!attempt) {
    return null
  }

  const activeQuiz = quiz
  const activeAttempt = attempt
  const order = itemOrder(quiz, attempt)
  const total = quiz.items.length
  const practice = attempt.options?.practice ?? false
  const correctSoFar = attempt.items.filter(
    (entry) => entry?.status === 'correct',
  ).length
  const answeredSoFar = attempt.items.filter(Boolean).length

  function handleStart(prefs: QuizPrefs) {
    studyRepository.saveQuizPrefs(prefs)
    const indexes = activeQuiz.items.map((_, index) => index)
    const options: AttemptOptions = {
      ...prefs,
      itemOrder: prefs.shuffleItems
        ? seededShuffle(indexes, activeAttempt.id)
        : indexes,
    }
    const started: Attempt = {
      ...activeAttempt,
      options,
      // The clock starts when the student presses Start, not when the page opened.
      startedAt: new Date().toISOString(),
    }
    studyRepository.saveAttempt(started)
    setAttempt(started)
  }

  function lockItem(answer: ItemAnswer | null, durationMs: number) {
    const position = activeAttempt.currentItemIndex
    const current = activeQuiz.items[order[position]!]
    if (!current) {
      return
    }

    const graded = gradeItem(current, answer)
    const record: AttemptItemRecord = {
      itemId: current.id,
      type: current.type,
      answer,
      studentAnswer: graded.studentAnswer,
      key: graded.key,
      status: graded.status,
      durationMs,
      ...(graded.enumeration ? { enumeration: graded.enumeration } : {}),
    }

    const items = [...activeAttempt.items]
    items[position] = record
    const nextIndex = position + 1
    const isLast = nextIndex >= activeQuiz.items.length

    let updated: Attempt = {
      ...activeAttempt,
      items,
      currentItemIndex: nextIndex,
    }
    if (isLast) {
      const finishedAt = new Date().toISOString()
      updated = {
        ...updated,
        finishedAt,
        metrics: metricsForAttempt(
          activeQuiz,
          items,
          activeAttempt.startedAt,
          finishedAt,
        ),
      }
    }
    studyRepository.saveAttempt(updated)

    if (practice) {
      setAttempt(updated)
      setFeedback({ item: current, position, record, isLast })
      return
    }
    if (isLast) {
      navigate(`/quiz/${activeQuiz.id}/results/${updated.id}`, { replace: true })
      return
    }
    setAttempt(updated)
  }

  function handleMarkCorrect() {
    if (!feedback) {
      return
    }
    const record: AttemptItemRecord = {
      ...feedback.record,
      status: 'correct',
      overridden: true,
    }
    const items = [...activeAttempt.items]
    items[feedback.position] = record
    let updated: Attempt = { ...activeAttempt, items }
    if (updated.finishedAt) {
      updated = {
        ...updated,
        metrics: metricsForAttempt(
          activeQuiz,
          items,
          updated.startedAt,
          updated.finishedAt,
        ),
      }
    }
    studyRepository.saveAttempt(updated)
    setAttempt(updated)
    setFeedback({ ...feedback, record })

    const answer = feedback.record.answer as { text?: unknown } | null
    if (typeof answer?.text === 'string') {
      const taught = acceptIdentificationAnswer(
        activeQuiz,
        feedback.item.id,
        answer.text,
      )
      if (taught) {
        studyRepository.saveQuiz(taught)
        setQuiz(taught)
      }
    }
  }

  function handleNext() {
    if (feedback?.isLast) {
      navigate(`/quiz/${activeQuiz.id}/results/${activeAttempt.id}`, {
        replace: true,
      })
      return
    }
    setFeedback(null)
  }

  const header = (
    <header className="quiz-player-header">
      <div className="quiz-player-header-row">
        <h1 className="quiz-player-title">{quiz.title}</h1>
        <Link className="quiz-player-exit" to="/quizzes">
          Save &amp; exit
        </Link>
      </div>
      {attempt.options ? (
        <p className="quiz-player-progress">
          Question {Math.min((feedback?.position ?? attempt.currentItemIndex) + 1, total)}{' '}
          of {total}
          {practice && answeredSoFar > 0
            ? ` · ${correctSoFar}/${answeredSoFar} correct so far`
            : ''}
        </p>
      ) : null}
      {attempt.options ? (
        <div
          className="quiz-player-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answeredSoFar}
        >
          <span style={{ width: `${(answeredSoFar / Math.max(total, 1)) * 100}%` }} />
        </div>
      ) : null}
    </header>
  )

  if (feedback) {
    return (
      <section className="quiz-player">
        {header}
        <FeedbackCard
          feedback={feedback}
          onNext={handleNext}
          onMarkCorrect={handleMarkCorrect}
        />
      </section>
    )
  }

  // New attempt with no options yet: let the student choose how to study.
  if (!attempt.options && attempt.items.length === 0) {
    return (
      <section className="quiz-player">
        {header}
        <StartPanel
          itemCount={total}
          initial={studyRepository.getQuizPrefs()}
          onStart={handleStart}
        />
      </section>
    )
  }

  const item = quiz.items[order[attempt.currentItemIndex]!]
  if (!item) {
    return (
      <section className="quiz-player-missing">
        <h1 className="quiz-player-title">{quiz.title}</h1>
        <p>This attempt has no remaining questions.</p>
        <Link className="quiz-player-link" to="/quizzes">
          Back to quiz library
        </Link>
      </section>
    )
  }

  return (
    <section className="quiz-player">
      {header}
      <QuestionCard
        key={`${attempt.id}:${attempt.currentItemIndex}`}
        item={item}
        choices={displayedChoices(item, attempt)}
        onLock={lockItem}
      />
    </section>
  )
}

function StartPanel({
  itemCount,
  initial,
  onStart,
}: {
  itemCount: number
  initial: QuizPrefs
  onStart: (prefs: QuizPrefs) => void
}) {
  const [prefs, setPrefs] = useState<QuizPrefs>(initial)

  function toggle(key: keyof QuizPrefs) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="quiz-player-card quiz-player-start">
      <p className="quiz-player-prompt">
        {itemCount} question{itemCount === 1 ? '' : 's'}. How do you want to take
        it?
      </p>
      <label className="quiz-player-option">
        <input
          type="checkbox"
          checked={prefs.practice}
          onChange={() => toggle('practice')}
        />
        <span>
          <strong>Practice mode</strong>
          <small>See the answer and explanation after every question.</small>
        </span>
      </label>
      <label className="quiz-player-option">
        <input
          type="checkbox"
          checked={prefs.shuffleItems}
          onChange={() => toggle('shuffleItems')}
        />
        <span>
          <strong>Shuffle questions</strong>
          <small>So you learn the material, not the order.</small>
        </span>
      </label>
      <label className="quiz-player-option">
        <input
          type="checkbox"
          checked={prefs.shuffleChoices}
          onChange={() => toggle('shuffleChoices')}
        />
        <span>
          <strong>Shuffle choices</strong>
          <small>Multiple-choice options appear in a new order.</small>
        </span>
      </label>
      <div className="quiz-player-actions">
        <button
          type="button"
          className="quiz-player-submit"
          onClick={() => onStart(prefs)}
          autoFocus
        >
          Start
        </button>
      </div>
      <p className="quiz-player-hint">
        Keyboard: 1–9 or A–Z pick a choice, T / F for true-false, Enter submits.
      </p>
    </div>
  )
}

function QuestionCard({
  item,
  choices,
  onLock,
}: {
  item: QuizItem
  choices: { id: string; text: string }[]
  onLock: (answer: ItemAnswer | null, durationMs: number) => void
}) {
  const [draft, setDraft] = useState<DraftState>(() => emptyDraft(item))
  const [focusRow, setFocusRow] = useState<number | null>(null)
  const shownAtRef = useRef<number>(0)
  const lockedRef = useRef(false)
  const enumRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    shownAtRef.current = Date.now()
  }, [])

  useEffect(() => {
    if (focusRow != null) {
      enumRefs.current[focusRow]?.focus()
    }
  }, [focusRow])

  const canSubmit = hasAnswer(item, draft)
  const blanks = blankOrder(item)

  function lock(answer: ItemAnswer | null) {
    if (lockedRef.current) {
      return
    }
    lockedRef.current = true
    onLock(answer, Math.max(0, Date.now() - shownAtRef.current))
  }

  function onSubmit() {
    if (!hasAnswer(item, draft)) {
      return
    }
    lock(toItemAnswer(item, draft))
  }

  // Global shortcuts for click-to-answer types.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      const key = event.key.toLowerCase()
      if (item.type === 'multiple_choice') {
        let index = -1
        if (/^[1-9]$/.test(key)) {
          index = Number(key) - 1
        } else if (/^[a-z]$/.test(key)) {
          index = CHOICE_LETTERS.toLowerCase().indexOf(key)
        }
        const choice = choices[index]
        if (choice) {
          event.preventDefault()
          setDraft({ choiceId: choice.id })
          return
        }
      }
      if (item.type === 'true_false' && (key === 't' || key === 'f')) {
        event.preventDefault()
        setDraft({ value: key === 't' })
        return
      }
      if (event.key === 'Enter' && hasAnswer(item, draft)) {
        // Let Enter activate Skip / Remove / Add row; True/False buttons submit instead.
        if (
          event.target instanceof HTMLButtonElement &&
          !event.target.closest('.quiz-player-tf')
        ) {
          return
        }
        event.preventDefault()
        lock(toItemAnswer(item, draft))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function onTextKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }

  function onEnumKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      onSubmit()
      return
    }
    const lines = draft.lines ?? ['']
    if (!lines[index]?.trim()) {
      return
    }
    // Enter on the last row adds a row; Ctrl+Enter submits.
    if (index === lines.length - 1) {
      setDraft({ lines: [...lines, ''] })
    }
    setFocusRow(index + 1)
  }

  return (
    <div className="quiz-player-card">
      <p className="quiz-player-type">{typeLabel(item.type)}</p>
      <p className="quiz-player-prompt">{displayPrompt(item)}</p>

      <div className="quiz-player-controls">
        {item.type === 'multiple_choice' && (
          <div role="radiogroup" aria-label="Choices">
            {choices.map((choice, index) => (
              <label key={choice.id} className="quiz-player-choice">
                <input
                  type="radio"
                  name={`choice-${item.id}`}
                  checked={draft.choiceId === choice.id}
                  onChange={() => setDraft({ choiceId: choice.id })}
                />
                <span className="quiz-player-choice-letter" aria-hidden="true">
                  {CHOICE_LETTERS[index]}
                </span>
                <span>{choice.text}</span>
              </label>
            ))}
          </div>
        )}

        {item.type === 'true_false' && (
          <div className="quiz-player-tf">
            <button
              type="button"
              aria-pressed={draft.value === true}
              onClick={() => setDraft({ value: true })}
            >
              True
            </button>
            <button
              type="button"
              aria-pressed={draft.value === false}
              onClick={() => setDraft({ value: false })}
            >
              False
            </button>
          </div>
        )}

        {item.type === 'identification' && (
          <input
            className="quiz-player-input"
            type="text"
            value={draft.text ?? ''}
            onChange={(event) => setDraft({ text: event.target.value })}
            onKeyDown={onTextKeyDown}
            placeholder="Your answer"
            autoComplete="off"
            autoFocus
          />
        )}

        {item.type === 'fill_in_the_blank' && (
          <div className="quiz-player-blanks">
            {blanks.map((blankId, index) => (
              <div key={blankId} className="quiz-player-blank">
                <label htmlFor={`blank-${index}`}>Blank {index + 1}</label>
                <input
                  id={`blank-${index}`}
                  type="text"
                  value={draft.blanks?.[blankId] ?? ''}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      blanks: {
                        ...(prev.blanks ?? {}),
                        [blankId]: event.target.value,
                      },
                    }))
                  }
                  onKeyDown={onTextKeyDown}
                  autoComplete="off"
                  autoFocus={index === 0}
                />
              </div>
            ))}
          </div>
        )}

        {item.type === 'enumeration' && (
          <div className="quiz-player-enum">
            {(draft.lines ?? ['']).map((line, index) => (
              <div key={index} className="quiz-player-enum-row">
                <input
                  ref={(el) => {
                    enumRefs.current[index] = el
                  }}
                  type="text"
                  value={line}
                  onChange={(event) => {
                    const lines = [...(draft.lines ?? [''])]
                    lines[index] = event.target.value
                    setDraft({ lines })
                  }}
                  onKeyDown={(event) => onEnumKeyDown(event, index)}
                  placeholder={`Item ${index + 1}`}
                  autoComplete="off"
                  autoFocus={index === 0}
                />
                <button
                  type="button"
                  aria-label={`Remove row ${index + 1}`}
                  disabled={(draft.lines ?? []).length <= 1}
                  onClick={() => {
                    const lines = (draft.lines ?? ['']).filter(
                      (_, i) => i !== index,
                    )
                    setDraft({ lines: lines.length > 0 ? lines : [''] })
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="quiz-player-enum-add"
              onClick={() => {
                const lines = [...(draft.lines ?? ['']), '']
                setDraft({ lines })
                setFocusRow(lines.length - 1)
              }}
            >
              Add row
            </button>
            <p className="quiz-player-hint">
              Enter adds the next row · Ctrl+Enter submits
            </p>
          </div>
        )}
      </div>

      <div className="quiz-player-actions">
        <button
          type="button"
          className="quiz-player-submit"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          Submit and continue
        </button>
        <button type="button" className="quiz-player-skip" onClick={() => lock(null)}>
          Skip
        </button>
      </div>
      {!canSubmit && (
        <p className="quiz-player-hint">
          Enter an answer to submit, or skip this question.
        </p>
      )}
    </div>
  )
}

function FeedbackCard({
  feedback,
  onNext,
  onMarkCorrect,
}: {
  feedback: Feedback
  onNext: () => void
  onMarkCorrect: () => void
}) {
  const { item, record, isLast } = feedback
  const status = record.status

  useEffect(() => {
    // The Enter that submitted the answer can still be bubbling when this mounts.
    const mountedAt = performance.now()
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.timeStamp < mountedAt) {
        return
      }
      if (event.key === 'Enter' && !event.repeat) {
        if (event.target instanceof HTMLButtonElement) {
          return
        }
        event.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onNext])

  const headline =
    status === 'correct'
      ? record.overridden
        ? 'Marked correct'
        : 'Correct'
      : status === 'incorrect'
        ? 'Not quite'
        : 'Skipped'

  return (
    <div className={`quiz-player-card quiz-player-feedback is-${status}`}>
      <p className="quiz-player-type">{typeLabel(item.type)}</p>
      <p className="quiz-player-prompt">{displayPrompt(item)}</p>
      <p className="quiz-player-verdict" role="status">
        {headline}
      </p>
      <dl className="quiz-player-answers">
        <dt>Your answer</dt>
        <dd>{formatStudentAnswer(item, record.answer)}</dd>
        <dt>Answer key</dt>
        <dd>{formatKey(item)}</dd>
        {record.enumeration ? (
          <>
            <dt>Enumeration</dt>
            <dd>
              {record.enumeration.matched} matched · {record.enumeration.missing}{' '}
              missing · {record.enumeration.extra} extra
            </dd>
          </>
        ) : null}
      </dl>
      {item.explanation ? (
        <p className="quiz-player-explanation">{item.explanation}</p>
      ) : null}
      <div className="quiz-player-actions">
        <button
          type="button"
          className="quiz-player-submit"
          onClick={onNext}
          autoFocus
        >
          {isLast ? 'See results' : 'Next question'}
        </button>
        {status === 'incorrect' ? (
          <button
            type="button"
            className="quiz-player-skip"
            onClick={onMarkCorrect}
          >
            I was right — mark correct
          </button>
        ) : null}
      </div>
      <p className="quiz-player-hint">Press Enter to continue.</p>
    </div>
  )
}
