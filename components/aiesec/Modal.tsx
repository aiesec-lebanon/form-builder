'use client';
import * as React from 'react';
import { Icon } from './icons';
import { cx } from './utils';

export interface ModalProps {
  open: boolean;
  /** Called on Esc, the close button or a backdrop click (when dismissible). Set `open` to false in it. */
  onClose: () => void;
  /** Short title that names the task, e.g. "Withdraw application?". */
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Actions, primary last, e.g. Cancel then Withdraw. Put `data-autofocus` on the safest one to focus it on open. */
  footer?: React.ReactNode;
  /** 400, 560 or 720px wide. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  /** Allow Esc and backdrop clicks to close. Default true. */
  dismissible?: boolean;
  closeLabel?: string;
  className?: string;
}

/** A focused task or confirmation on the native <dialog>: focus is trapped, the page is inert, Esc closes. */
export function Modal({ open, onClose, title, children, footer, size = 'md', dismissible = true, closeLabel = 'Close', className }: ModalProps) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      if (dismissible) onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [dismissible, onClose]);

  return (
    <dialog
      ref={ref}
      className={cx('ae-modal', size !== 'md' && `ae-modal--${size}`, className)}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
    >
      <div className="ae-modal__panel">
        <div className="ae-modal__header">
          <h2 id={titleId} className="ae-modal__title ae-h3">
            {title}
          </h2>
          <button type="button" className="ae-close" aria-label={closeLabel} onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="ae-modal__body ae-body">{children}</div>
        {footer && <div className="ae-modal__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
