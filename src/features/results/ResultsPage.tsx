import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MarkdownBody } from '../../components/MarkdownBody'
import '../../components/markdown.css'
import {
  displayPrompt,
  formatKey,
  formatStudentAnswer,
  typeLabel,
} from '../../components/quizText'
import { studyRepository } from '../../data/repository'
import type { Attempt, AttemptItemRecord } from '../../data/types'
import { gradeItem, type AttemptMetrics, type Quiz } from '../../domain'
import { streamChat } from '../../llm/client'
import {
  acceptIdentificationAnswer,
  metricsForAttempt,
} from '../quiz/attemptMetrics'
import './results.css'

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—'
  }
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return `${hours}h ${remMinutes}m`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

function choiceText(
  choices: unknown,
  choiceId: string,
): string | null {
  if (!Array.isArray(choices)) {
    return null
  }
  for (const choice of choices) {
    if (
      choice &&
      typeof choice === 'object' &&
      'id' in choice &&
      (choice as { id: unknown }).id === choiceId &&
      'text' in choice
    ) {
      return String((choice as { text: unknown }).text)
    }
  }
  return null
}

function formatUnknown(value: unknown, key?: unknown): string {
  if (value == null) {
    return '—'
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => formatUnknown(entry)).join(', ')
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('choiceId' in record && typeof record.choiceId === 'string') {
      const keyRecord =
        key && typeof key === 'object' ? (key as Record<string, unknown>) : null
      const label = choiceText(keyRecord?.choices, record.choiceId)
      return label ?? record.choiceId
    }
    if ('value' in record && typeof record.value === 'boolean') {
      return record.value ? 'True' : 'False'
    }
    if ('text' in record && typeof record.text === 'string') {
      return record.text || '—'
    }
    if ('blanks' in record && Array.isArray(record.blanks)) {
      return (record.blanks as { id: string; acceptedAnswers: string[] }[])
        .map(
          (blank) =>
            `${blank.id}: ${(blank.acceptedAnswers ?? []).join(' / ')}`,
        )
        .join('; ')
    }
    if (
      'blanks' in record &&
      record.blanks &&
      typeof record.blanks === 'object' &&
      !Array.isArray(record.blanks)
    ) {
      return Object.entries(record.blanks as Record<string, string>)
        .map(([id, text]) => `${id}: ${text || '(empty)'}`)
        .join('; ')
    }
    if ('lines' in record && Array.isArray(record.lines)) {
      const lines = record.lines as unknown[]
      if (lines.length === 0) {
        return '—'
      }
      return lines.map((line, i) => `${i + 1}. ${String(line ?? '')}`).join(' · ')
    }
    if ('correctChoiceId' in record && typeof record.correctChoiceId === 'string') {
      const label = choiceText(record.choices, record.correctChoiceId)
      return label ?? `Correct choice: ${record.correctChoiceId}`
    }
    if ('correct' in record && typeof record.correct === 'boolean') {
      return record.correct ? 'True' : 'False'
    }
    if ('acceptedAnswers' in record && Array.isArray(record.acceptedAnswers)) {
      return (record.acceptedAnswers as string[]).join(' / ')
    }
    if ('acceptedItems' in record && Array.isArray(record.acceptedItems)) {
      return (record.acceptedItems as string[][])
        .map((group) => group.join(' / '))
        .join('; ')
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function statusClass(status: AttemptItemRecord['status']): string {
  return `results-status results-status-${status}`
}

const MISSED_SUFFIX = ' — missed'

/** A new quiz holding only the items this attempt got wrong or skipped. */
function buildMissedQuiz(quiz: Quiz, attempt: Attempt): Quiz | null {
  const missedIds = new Set(
    attempt.items
      .filter((entry) => entry && entry.status !== 'correct')
      .map((entry) => entry.itemId),
  )
  const items = quiz.items.filter((item) => missedIds.has(item.id))
  if (items.length === 0) {
    return null
  }
  const baseTitle = quiz.title.endsWith(MISSED_SUFFIX)
    ? quiz.title.slice(0, -MISSED_SUFFIX.length)
    : quiz.title
  return {
    id: crypto.randomUUID(),
    title: `${baseTitle}${MISSED_SUFFIX}`,
    createdAt: new Date().toISOString(),
    items,
  }
}

function itemPrompt(quiz: Quiz | null, itemId: string): string {
  return quiz?.items.find((item) => item.id === itemId)?.prompt ?? '(prompt unavailable)'
}

function buildConclusionPayload(attempt: Attempt, quiz: Quiz | null) {
  return {
    attempt: {
      id: attempt.id,
      quizId: attempt.quizId,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      metrics: attempt.metrics,
      items: attempt.items.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        prompt: itemPrompt(quiz, item.itemId),
        answer: item.answer,
        studentAnswer: item.studentAnswer,
        key: item.key,
        status: item.status,
        durationMs: item.durationMs,
        enumeration: item.enumeration,
      })),
    },
    quiz: quiz
      ? {
          id: quiz.id,
          title: quiz.title,
          itemCount: quiz.items.length,
        }
      : null,
  }
}

const CONCLUSION_SYSTEM =
  'You are a study coach. Given a graded quiz attempt as JSON, write a short conclusion for the student. Cover weak question types, rushed misses (incorrect answers answered unusually quickly), and what to review next. Keep it concise — a few short paragraphs or bullets. Do not invent scores that contradict the JSON.'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; attempt: Attempt; quiz: Quiz | null }

export function ResultsPage() {
  const { quizId = '', attemptId = '' } = useParams()
  const navigate = useNavigate()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [conclusion, setConclusion] = useState('')
  const [generating, setGenerating] = useState(false)
  const [conclusionError, setConclusionError] = useState<string | null>(null)
  const autoStartedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const attempt = studyRepository.getAttempt(attemptId)
    if (!attempt || attempt.quizId !== quizId) {
      setLoad({ status: 'missing' })
      return
    }
    const quiz = studyRepository.getQuiz(attempt.quizId)
    setLoad({ status: 'ready', attempt, quiz })
    setConclusion(attempt.conclusion ?? '')
    autoStartedRef.current = false
  }, [quizId, attemptId])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function runConclusion(
    attempt: Attempt,
    quiz: Quiz | null,
  ): Promise<void> {
    const settings = studyRepository.getSettings()
    if (!settings.apiKey.trim()) {
      setConclusionError(
        'Add an API key in Settings to generate a conclusion.',
      )
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setGenerating(true)
    setConclusionError(null)
    setConclusion('')

    try {
      const text = await streamChat(
        {
          provider: settings.provider,
          model: settings.model,
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          messages: [
            { role: 'system', content: CONCLUSION_SYSTEM },
            {
              role: 'user',
              content: JSON.stringify(buildConclusionPayload(attempt, quiz)),
            },
          ],
        },
        (chunk) => {
          setConclusion((prev) => prev + chunk)
        },
        controller.signal,
      )

      const latest = studyRepository.getAttempt(attempt.id)
      if (latest) {
        const updated = { ...latest, conclusion: text }
        studyRepository.saveAttempt(updated)
        setLoad({ status: 'ready', attempt: updated, quiz })
      }
      setConclusion(text)
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      const message =
        error instanceof Error ? error.message : 'Failed to generate conclusion.'
      setConclusionError(message)
    } finally {
      if (!controller.signal.aborted) {
        setGenerating(false)
      }
    }
  }

  useEffect(() => {
    if (load.status !== 'ready' || autoStartedRef.current) {
      return
    }
    if (load.attempt.conclusion) {
      return
    }
    const settings = studyRepository.getSettings()
    if (!settings.apiKey.trim()) {
      return
    }
    autoStartedRef.current = true
    void runConclusion(load.attempt, load.quiz)
  }, [load])

  const metrics: AttemptMetrics | null = useMemo(() => {
    if (load.status !== 'ready') {
      return null
    }
    return load.attempt.metrics ?? null
  }, [load])

  function setOverride(position: number, overridden: boolean) {
    if (load.status !== 'ready') {
      return
    }
    const { attempt, quiz } = load
    const entry = attempt.items[position]
    const quizItem = quiz?.items.find((item) => item.id === entry?.itemId)
    if (!entry || !quiz || !quizItem) {
      return
    }
    const record: AttemptItemRecord = overridden
      ? { ...entry, status: 'correct', overridden: true }
      : {
          ...entry,
          status: gradeItem(quizItem, entry.answer).status,
          overridden: undefined,
        }
    const items = [...attempt.items]
    items[position] = record
    const updated: Attempt = {
      ...attempt,
      items,
      metrics: attempt.finishedAt
        ? metricsForAttempt(quiz, items, attempt.startedAt, attempt.finishedAt)
        : attempt.metrics,
    }
    studyRepository.saveAttempt(updated)

    let nextQuiz = quiz
    const answer = entry.answer as { text?: unknown } | null
    if (overridden && typeof answer?.text === 'string') {
      const taught = acceptIdentificationAnswer(quiz, quizItem.id, answer.text)
      if (taught) {
        studyRepository.saveQuiz(taught)
        nextQuiz = taught
      }
    }
    setLoad({ status: 'ready', attempt: updated, quiz: nextQuiz })
  }

  function handleRetryMissed() {
    if (load.status !== 'ready' || !load.quiz) {
      return
    }
    const missed = buildMissedQuiz(load.quiz, load.attempt)
    if (!missed) {
      return
    }
    studyRepository.saveQuiz(missed)
    navigate(`/quiz/${missed.id}`)
  }

  function handleRetake() {
    if (load.status !== 'ready' || !load.quiz) {
      return
    }
    for (const unfinished of studyRepository
      .listAttempts(load.quiz.id)
      .filter((a) => !a.finishedAt)) {
      studyRepository.deleteAttempt(unfinished.id)
    }
    navigate(`/quiz/${load.quiz.id}`)
  }

  if (load.status === 'loading') {
    return (
      <section className="results-page">
        <p className="results-subtitle">Loading results…</p>
      </section>
    )
  }

  if (load.status === 'missing') {
    return (
      <section className="results-missing">
        <h1 className="results-title">Results not found</h1>
        <p>This attempt is missing or does not match the quiz.</p>
        <Link className="results-link" to="/quizzes">
          Back to quiz library
        </Link>
      </section>
    )
  }

  const { attempt, quiz } = load
  const title = quiz?.title ?? 'Quiz results'
  const missedCount = attempt.items.filter(
    (entry) => entry && entry.status !== 'correct',
  ).length

  return (
    <section className="results-page">
      <header className="results-header">
        <h1 className="results-title">{title}</h1>
        <p className="results-subtitle">
          Attempt finished{' '}
          {attempt.finishedAt
            ? new Date(attempt.finishedAt).toLocaleString()
            : '—'}
        </p>
        {quiz ? (
          <div className="results-actions">
            {missedCount > 0 ? (
              <button
                type="button"
                className="results-primary"
                onClick={handleRetryMissed}
              >
                Retry {missedCount} missed
              </button>
            ) : null}
            <button type="button" onClick={handleRetake}>
              Retake full quiz
            </button>
          </div>
        ) : null}
      </header>

      {metrics ? (
        <>
          <div className="results-cards" aria-label="Summary">
            <div className="results-card">
              <p className="results-card-label">Score</p>
              <p className="results-card-value">
                {metrics.counts.correct}/{metrics.counts.total}
              </p>
            </div>
            <div className="results-card">
              <p className="results-card-label">Accuracy</p>
              <p className="results-card-value">
                {formatPercent(metrics.accuracy)}
              </p>
            </div>
            <div className="results-card">
              <p className="results-card-label">Total time</p>
              <p className="results-card-value">
                {formatDuration(metrics.totalDurationMs)}
              </p>
            </div>
            <div className="results-card">
              <p className="results-card-label">Incorrect : correct</p>
              {metrics.incorrectToCorrectRatio == null ? (
                <>
                  <p className="results-card-value">n/a</p>
                  <p className="results-card-note">
                    Nothing was correct — ratio unavailable
                  </p>
                </>
              ) : (
                <p className="results-card-value">
                  {metrics.incorrectToCorrectRatio.toFixed(2)}
                </p>
              )}
            </div>
            <div className="results-card">
              <p className="results-card-label">Average item</p>
              <p className="results-card-value">
                {formatDuration(metrics.averageItemDurationMs)}
              </p>
            </div>
            <div className="results-card">
              <p className="results-card-label">Fastest item</p>
              <p className="results-card-value">
                {metrics.fastestItem
                  ? formatDuration(metrics.fastestItem.durationMs)
                  : '—'}
              </p>
            </div>
            <div className="results-card">
              <p className="results-card-label">Slowest item</p>
              <p className="results-card-value">
                {metrics.slowestItem
                  ? formatDuration(metrics.slowestItem.durationMs)
                  : '—'}
              </p>
            </div>
            <div className="results-card">
              <p className="results-card-label">Time on correct</p>
              <p className="results-card-value">
                {formatDuration(metrics.timeOnCorrectMs)}
              </p>
            </div>
            <div className="results-card">
              <p className="results-card-label">Time on incorrect</p>
              <p className="results-card-value">
                {formatDuration(metrics.timeOnIncorrectMs)}
              </p>
            </div>
          </div>

          {metrics.byType.length > 0 && (
            <section className="results-section">
              <h2 className="results-section-title">By type</h2>
              <table className="results-type-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Correct</th>
                    <th>Incorrect</th>
                    <th>Skipped</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.byType.map((row) => (
                    <tr key={row.type}>
                      <td>{typeLabel(row.type)}</td>
                      <td>
                        {row.correct}/{row.total}
                      </td>
                      <td>{row.incorrect}</td>
                      <td>{row.unanswered}</td>
                      <td>{formatPercent(row.accuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      ) : (
        <p className="results-subtitle">
          Metrics were not saved on this attempt.
        </p>
      )}

      <section className="results-section">
        <h2 className="results-section-title">Items</h2>
        <ol className="results-items">
          {attempt.items.map((item, index) => {
            if (!item) {
              return null
            }
            const quizItem = quiz?.items.find((q) => q.id === item.itemId)
            return (
              <li key={`${item.itemId}-${index}`} className="results-item">
                <div className="results-item-top">
                  <span className="results-item-index">
                    Question {index + 1}
                  </span>
                  <span className={statusClass(item.status)}>
                    {item.overridden ? 'correct (marked)' : item.status}
                  </span>
                  <span className="results-item-meta">
                    {typeLabel(item.type)} · {formatDuration(item.durationMs)}
                  </span>
                </div>
                <p className="results-item-prompt">
                  {quizItem
                    ? displayPrompt(quizItem)
                    : itemPrompt(quiz, item.itemId)}
                </p>
                <p className="results-item-meta">
                  <strong>Your answer:</strong>{' '}
                  {quizItem
                    ? formatStudentAnswer(quizItem, item.answer)
                    : formatUnknown(item.studentAnswer, item.key)}
                </p>
                <p className="results-item-meta">
                  <strong>Key:</strong>{' '}
                  {quizItem ? formatKey(quizItem) : formatUnknown(item.key)}
                </p>
                {item.enumeration && (
                  <p className="results-enum">
                    Enumeration — matched {item.enumeration.matched}, missing{' '}
                    {item.enumeration.missing}, extra {item.enumeration.extra}
                  </p>
                )}
                {quizItem?.explanation ? (
                  <p className="results-explanation">{quizItem.explanation}</p>
                ) : null}
                {quizItem && item.status === 'incorrect' ? (
                  <button
                    type="button"
                    className="results-override"
                    onClick={() => setOverride(index, true)}
                  >
                    I was right — mark correct
                  </button>
                ) : null}
                {quizItem && item.overridden ? (
                  <button
                    type="button"
                    className="results-override"
                    onClick={() => setOverride(index, false)}
                  >
                    Undo mark correct
                  </button>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      <section className="results-conclusion">
        <h2 className="results-section-title">Conclusion</h2>
        {conclusion ? (
          <div className="results-conclusion-body">
            <MarkdownBody content={conclusion} />
          </div>
        ) : (
          <p className="results-conclusion-empty">
            {generating
              ? 'Generating conclusion…'
              : 'No conclusion saved yet.'}
          </p>
        )}
        {conclusionError && (
          <p className="results-conclusion-error">{conclusionError}</p>
        )}
        <button
          type="button"
          disabled={generating}
          onClick={() => void runConclusion(attempt, quiz)}
        >
          {generating ? 'Generating…' : 'Generate conclusion'}
        </button>
      </section>

      <section className="results-json">
        <details>
          <summary>Raw attempt JSON</summary>
          <pre>{JSON.stringify(attempt, null, 2)}</pre>
        </details>
      </section>

      <Link className="results-link" to="/quizzes">
        Back to quiz library
      </Link>
    </section>
  )
}
