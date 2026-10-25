import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './Toasts.css'
import type { Toast } from './toast.ts'

const SHOW_MS = 10_000

type Notify = (toast: Toast) => void

const Context = createContext<Notify | null>(null)

/** Shows toasts in a corner, newest last, each for 10 seconds or until dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly (Toast & { readonly id: number })[]>([])
  const nextId = useRef(0)
  const dismiss = useCallback((id: number) => {
    setToasts((shown) => shown.filter((toast) => toast.id !== id))
  }, [])
  const notify = useCallback<Notify>(
    (toast) => {
      const id = nextId.current++
      setToasts((shown) => [...shown, { ...toast, id }])
      setTimeout(() => dismiss(id), SHOW_MS)
    },
    [dismiss],
  )
  const value = useMemo(() => notify, [notify])
  return (
    <Context value={value}>
      {children}
      <ol className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <li key={toast.id} className="toast" data-ok={toast.ok}>
            <div className="toast-text">
              <span className="toast-title">{toast.title}</span>
              <span className="toast-detail">{toast.detail}</span>
              <a className="toast-link" href={toast.href} target="_blank" rel="noreferrer">
                {toast.hash} in the explorer
              </a>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </li>
        ))}
      </ol>
    </Context>
  )
}

/** Posts a toast. */
export function useToast(): Notify {
  const notify = useContext(Context)
  if (notify === null) throw new Error('Wrap the app in <ToastProvider>')
  return notify
}
