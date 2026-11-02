export type ToastKind = 'success' | 'error' | 'info'

export type Toast = {
  id: number
  kind: ToastKind
  message: string
}

type Listener = (toasts: Toast[]) => void

const listeners = new Set<Listener>()
let toasts: Toast[] = []
let nextId = 1

function emit() {
  for (const listener of listeners) {
    listener(toasts)
  }
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Show a short notification at the bottom of the screen. */
export function toast(message: string, kind: ToastKind = 'success'): void {
  const id = nextId++
  // Keep the stack short; the newest message matters most.
  toasts = [...toasts.slice(-2), { id, kind, message }]
  emit()
  window.setTimeout(() => dismissToast(id), kind === 'error' ? 7000 : 4000)
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}
