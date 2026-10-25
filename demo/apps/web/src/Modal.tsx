import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  /** The id of the dialog's heading. */
  readonly labelledBy: string
  /** Called on Escape. Without it, Escape does nothing and the dialog stays until unmounted. */
  readonly onClose?: (() => void) | undefined
  readonly children: ReactNode
}

/**
 * A modal dialog, open while mounted: the browser shades the page behind it, makes it inert and
 * keeps focus inside.
 */
export function Modal({ labelledBy, onClose, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (element !== null && !element.open) element.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose?.()
      }}
    >
      <div className="section">{children}</div>
    </dialog>
  )
}
