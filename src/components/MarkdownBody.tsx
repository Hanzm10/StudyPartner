import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const QUIZ_FENCE_RE = /```quiz\s*\r?\n([\s\S]*?)```/gi

type MarkdownBodyProps = {
  content: string
  /** When true, replace ```quiz fences with a short note (chat assistant). */
  hideQuizFence?: boolean
  className?: string
}

/**
 * Renders model Markdown safely (no raw HTML). Used in chat and results.
 */
export function MarkdownBody({
  content,
  hideQuizFence = false,
  className,
}: MarkdownBodyProps) {
  let source = content
  let quizAttached = false

  if (hideQuizFence) {
    const next = source.replace(QUIZ_FENCE_RE, () => {
      quizAttached = true
      return ''
    })
    source = next.replace(/\n{3,}/g, '\n\n').trim()
  }

  if (!source && quizAttached) {
    return (
      <div className={className ? `md-body ${className}` : 'md-body'}>
        <p className="md-quiz-note">Quiz draft attached — see the preview.</p>
      </div>
    )
  }

  return (
    <div className={className ? `md-body ${className}` : 'md-body'}>
      {source ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
          }}
        >
          {source}
        </ReactMarkdown>
      ) : null}
      {quizAttached ? (
        <p className="md-quiz-note">Quiz draft attached — see the preview.</p>
      ) : null}
    </div>
  )
}
