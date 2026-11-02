import type { Quiz, QuizItem } from '../../domain'

type QuizPreviewProps = {
  quiz: Quiz | null
  error: string | null
  canStart: boolean
  busy: boolean
  onRefresh: () => void
  onStart: () => void
}

function ModelFlags({ item }: { item: QuizItem }) {
  const flags: string[] = []
  if (item.modelWrittenQuestion) {
    flags.push('question')
  }
  if (item.modelWrittenAnswer) {
    flags.push('answer')
  }
  if (flags.length === 0) {
    return null
  }
  return (
    <span className="chat-preview-flags" title="Written by the model">
      Model-written: {flags.join(', ')}
    </span>
  )
}

function ItemAnswerSummary({ item }: { item: QuizItem }) {
  switch (item.type) {
    case 'multiple_choice':
      return (
        <ul className="chat-preview-choices">
          {item.choices.map((choice) => (
            <li
              key={choice.id}
              className={
                choice.id === item.correctChoiceId
                  ? 'chat-preview-choice is-correct'
                  : 'chat-preview-choice'
              }
            >
              {choice.text}
              {choice.id === item.correctChoiceId ? ' ✓' : ''}
            </li>
          ))}
        </ul>
      )
    case 'true_false':
      return <p className="chat-preview-key">Answer: {item.correct ? 'True' : 'False'}</p>
    case 'identification':
      return (
        <p className="chat-preview-key">
          Accepted: {item.acceptedAnswers.join(' · ')}
        </p>
      )
    case 'fill_in_the_blank':
      return (
        <ul className="chat-preview-blanks">
          {item.blanks.map((blank) => (
            <li key={blank.id}>
              <code>{`{{${blank.id}}}`}</code>: {blank.acceptedAnswers.join(' · ')}
            </li>
          ))}
        </ul>
      )
    case 'enumeration':
      return (
        <div className="chat-preview-enumeration">
          <p className="chat-preview-key">
            Order matters: {item.orderMatters ? 'yes' : 'no'}
          </p>
          <ol>
            {item.acceptedItems.map((group, index) => (
              <li key={index}>{group.join(' / ')}</li>
            ))}
          </ol>
        </div>
      )
    default:
      return null
  }
}

function typeLabel(type: QuizItem['type']): string {
  switch (type) {
    case 'multiple_choice':
      return 'Multiple choice'
    case 'true_false':
      return 'True / false'
    case 'identification':
      return 'Identification'
    case 'fill_in_the_blank':
      return 'Fill in the blank'
    case 'enumeration':
      return 'Enumeration'
    default:
      return type
  }
}

export function QuizPreview({
  quiz,
  error,
  canStart,
  busy,
  onRefresh,
  onStart,
}: QuizPreviewProps) {
  return (
    <aside className="chat-preview" aria-label="Quiz preview">
      <div className="chat-preview-header">
        <h2>Preview</h2>
        <div className="chat-preview-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>
            Refresh preview
          </button>
          <button
            type="button"
            className="chat-preview-start"
            onClick={onStart}
            disabled={!canStart || busy}
          >
            Start quiz
          </button>
        </div>
      </div>

      {error ? (
        <div className="chat-preview-error" role="alert">
          <strong>Validation error</strong>
          <pre>{error}</pre>
        </div>
      ) : null}

      {!quiz && !error ? (
        <p className="chat-preview-empty">
          When you approve a draft, the quiz JSON will appear here.
        </p>
      ) : null}

      {quiz ? (
        <div className="chat-preview-body">
          <h3 className="chat-preview-title">{quiz.title}</h3>
          <p className="chat-preview-meta">
            {quiz.items.length} item{quiz.items.length === 1 ? '' : 's'}
          </p>
          <ol className="chat-preview-items">
            {quiz.items.map((item, index) => (
              <li key={item.id} className="chat-preview-item">
                <div className="chat-preview-item-head">
                  <span className="chat-preview-index">{index + 1}.</span>
                  <span className="chat-preview-type">{typeLabel(item.type)}</span>
                  <ModelFlags item={item} />
                </div>
                <p className="chat-preview-prompt">{item.prompt}</p>
                <ItemAnswerSummary item={item} />
                {item.explanation ? (
                  <p className="chat-preview-explanation">{item.explanation}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </aside>
  )
}
