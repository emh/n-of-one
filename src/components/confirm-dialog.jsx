import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './ui.jsx';

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }) {
  const dialog = useRef();
  const cancel = useRef();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    cancel.current.focus();
    return () => {
      element.close();
      const target = previous?.isConnected ? previous : document.querySelector('main h1');
      target?.focus({ preventScroll: true });
    };
  }, []);
  function dismiss() {
    if (!pending.current) onClose();
  }
  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setError(error.message || 'Could not complete that action. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      class="confirm-dialog"
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target !== dialog.current) return;
        const bounds = dialog.current.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dismiss();
      }}
    >
      <span class="confirm-symbol">
        <Icon name="delete" size={23} />
      </span>
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-message`}>{message}</p>
      {error && (
        <p class="error-message" role="alert">
          {error}
        </p>
      )}
      <div class="confirm-actions">
        <button ref={cancel} class="button secondary" disabled={busy} onClick={dismiss}>
          Cancel
        </button>
        <button class="button destructive" disabled={busy} onClick={confirm}>
          {busy && <Icon name="loading" class="spin" size={16} />}
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
