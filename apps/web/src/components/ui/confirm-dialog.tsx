'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Окно подтверждения для действий, которые не хочется совершить случайно.
 *
 * Собрано по тому же чек-листу, по которому мы проходили сайт: закрывается
 * по Escape и по клику мимо, фокус уходит внутрь и возвращается на кнопку,
 * которая окно открыла, а табом нельзя уйти на страницу под окном.
 */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel = 'Отмена',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger — для действий, которые что-то обрывают или удаляют. */
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  /** Кто открыл окно — туда и вернём фокус. */
  const opener = useRef<HTMLElement | null>(null);

  const focusable = useCallback(
    () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      ),
    [],
  );

  useEffect(() => {
    if (!open) return;

    opener.current = document.activeElement as HTMLElement | null;
    // Фокус на «Отмена» было бы безопаснее, но здесь окно и так спрашивает
    // подтверждение, а лишний таб на каждый выход раздражает.
    confirm.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      // Кольцо: за последним элементом снова первый, и наоборот.
      if (event.shiftKey && (active === first || !panel.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    // Страница под окном не должна прокручиваться.
    const scrollLocked = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = scrollLocked;
      opener.current?.focus?.();
    };
  }, [open, onCancel, focusable]);

  if (!open) return null;

  const danger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-text"
    >
      <button
        type="button"
        aria-label="Закрыть"
        tabIndex={-1}
        onClick={onCancel}
        className="dialog-veil absolute inset-0 cursor-default"
      />

      <div
        ref={panel}
        className={`dialog-panel bg-bg relative w-full max-w-md p-9 md:p-11 ${
          danger ? 'is-danger' : ''
        }`}
      >
        <p className={`kicker-plain mb-4 ${danger ? 'text-danger' : 'text-faint'}`}>
          {danger ? 'Подтверждение' : 'Вопрос'}
        </p>
        <h2 id="confirm-title" className="font-display text-ink text-[1.625rem] leading-tight">
          {title}
        </h2>
        <p id="confirm-text" className="text-muted mt-4 text-sm leading-relaxed">
          {text}
        </p>

        <div className="mt-9 flex flex-wrap gap-4">
          <button
            ref={confirm}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`cursor-pointer px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 disabled:opacity-40 ${
              danger ? 'bg-danger text-bg hover:bg-danger-deep' : 'bg-ink text-bg hover:bg-ink-soft'
            }`}
          >
            {busy ? 'Секунду…' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="link-underline text-muted hover:text-ink cursor-pointer text-[0.6875rem] font-medium tracking-[0.18em] uppercase"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
