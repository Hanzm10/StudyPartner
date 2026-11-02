import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { studyRepository } from '../../data/repository'
import type { Attempt } from '../../data/types'
import type { Quiz } from '../../domain'
import { ImportQuizPanel } from './ImportQuizPanel'
import './quiz-library.css'

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function scoreLabel(attempt: Attempt): string {
  const metrics = attempt.metrics
  if (!metrics) {
    return 'Finished'
  }
  return `${metrics.counts.correct}/${metrics.counts.total} correct`
}

export function QuizLibraryPage() {
  const navigate = useNavigate()
  const [version, setVersion] = useState(0)

  const quizzes = useMemo(() => {
    void version
    return studyRepository
      .listQuizzes()
      .slice()
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          a.title.localeCompare(b.title),
      )
  }, [version])

  function attemptsFor(quizId: string): Attempt[] {
    return studyRepository
      .listAttempts(quizId)
      .slice()
      .sort(
        (a, b) =>
          Date.parse(b.startedAt) - Date.parse(a.startedAt),
      )
  }

  function handleRetake(quiz: Quiz) {
    const unfinished = studyRepository
      .listAttempts(quiz.id)
      .filter((attempt) => !attempt.finishedAt)
    for (const attempt of unfinished) {
      studyRepository.deleteAttempt(attempt.id)
    }
    setVersion((v) => v + 1)
    navigate(`/quiz/${quiz.id}`)
  }

  function handleDelete(quiz: Quiz) {
    if (!window.confirm(`Delete "${quiz.title}" and all its attempts?`)) {
      return
    }
    studyRepository.deleteQuiz(quiz.id)
    setVersion((v) => v + 1)
  }

  return (
    <section className="quiz-library">
      <h1 className="quiz-library-title">Quiz library</h1>

      <ImportQuizPanel onImported={() => setVersion((v) => v + 1)} />

      {quizzes.length === 0 ? (
        <p className="quiz-library-empty">
          No saved quizzes yet. <Link to="/chat">Build one in chat</Link> or
          import one above.
        </p>
      ) : (
        <ul className="quiz-library-list">
          {quizzes.map((quiz) => {
            const attempts = attemptsFor(quiz.id)
            const unfinished = attempts.find((a) => !a.finishedAt)
            const finished = attempts.filter((a) => a.finishedAt)

            return (
              <li key={quiz.id} className="quiz-library-item">
                <div className="quiz-library-item-header">
                  <h2 className="quiz-library-item-title">{quiz.title}</h2>
                  <p className="quiz-library-meta">
                    {quiz.items.length}{' '}
                    {quiz.items.length === 1 ? 'item' : 'items'} · Created{' '}
                    {formatDate(quiz.createdAt)}
                    {unfinished ? (
                      <span className="quiz-library-in-progress">
                        {' '}
                        · In progress
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="quiz-library-actions">
                  <Link className="quiz-library-start" to={`/quiz/${quiz.id}`}>
                    {unfinished ? 'Continue' : 'Start'}
                  </Link>
                  <button
                    type="button"
                    className="quiz-library-retake"
                    onClick={() => handleRetake(quiz)}
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    className="quiz-library-retake quiz-library-delete"
                    onClick={() => handleDelete(quiz)}
                  >
                    Delete
                  </button>
                </div>

                {finished.length > 0 && (
                  <div className="quiz-library-attempts">
                    <p className="quiz-library-attempts-label">Past attempts</p>
                    <ul>
                      {finished.map((attempt) => (
                        <li key={attempt.id}>
                          <Link
                            to={`/quiz/${quiz.id}/results/${attempt.id}`}
                          >
                            {formatDate(attempt.finishedAt ?? attempt.startedAt)}{' '}
                            · {scoreLabel(attempt)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
