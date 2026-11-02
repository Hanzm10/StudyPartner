import { useEffect, useState } from 'react'
import { dismissToast, subscribeToasts, type Toast } from './toast'
import './toaster.css'

const ICONS = { success: '✓', error: '!', info: 'i' } as const

/** Renders notifications from toast(); mount once in the app shell. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast-${item.kind}`}
          role={item.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-icon" aria-hidden="true">
            {ICONS[item.kind]}
          </span>
          <span className="toast-message">{item.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
