import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Quiz } from '../../domain'
import { parseImportedQuiz, saveNewQuiz } from './saveQuiz'

type ImportQuizPanelProps = {
  onImported: (quiz: Quiz) => void
}

/** Paste a quiz made in another chat (e.g. Claude) and save it without an API key. */
export function ImportQuizPanel({ onImported }: ImportQuizPanelProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<Quiz | null>(null)

  function handleImport() {
    const result = parseImportedQuiz(text)
    if (result.status === 'none') {
      setError('Paste the quiz JSON first.')
      return
    }
    if (result.status === 'invalid') {
      setError(result.error)
      return
    }
    const saved = saveNewQuiz(result.quiz)
    setError(null)
    setText('')
    setImported(saved)
    setOpen(false)
    onImported(saved)
  }

  if (!open) {
    return (
      <div className="quiz-import">
        <button
          type="button"
          className="quiz-import-toggle"
          onClick={() => {
            setOpen(true)
            setImported(null)
          }}
        >
          Import quiz
        </button>
        {imported ? (
          <p className="quiz-import-success" role="status">
            Imported “{imported.title}” ({imported.items.length} question
            {imported.items.length === 1 ? '' : 's'}).{' '}
            <Link to={`/quiz/${imported.id}`}>Start it now</Link>
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="quiz-import is-open">
      <label className="quiz-import-label" htmlFor="quiz-import-text">
        Paste a quiz made in another chat
      </label>
      <p className="quiz-import-help">
        The ```quiz block or bare JSON both work, and extra text around it is
        ignored.
      </p>
      <textarea
        id="quiz-import-text"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        rows={8}
        spellCheck={false}
        placeholder={'```quiz\n{ "title": "...", "items": [ ... ] }\n```'}
        autoFocus
      />
      {error ? (
        <pre className="quiz-import-error" role="alert">
          {error}
        </pre>
      ) : null}
      <div className="quiz-import-actions">
        <button
          type="button"
          className="quiz-import-submit"
          onClick={handleImport}
          disabled={text.trim() === ''}
        >
          Import
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
