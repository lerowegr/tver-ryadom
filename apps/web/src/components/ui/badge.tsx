/**
 * Отметка тура. В монохроме различать бейджи цветом нечем, поэтому
 * значимые («Хит», «Эксклюзив») даются заливкой, прочие — рамкой.
 */
const filled = new Set(['hit', 'exclusive']);

export function TourBadge({ slug, label }: { slug: string; label: string }) {
  const cls = filled.has(slug) ? 'bg-ink text-bg' : 'border-line-strong text-muted border';
  return (
    <span
      className={`inline-flex items-center px-3.5 py-2 text-[0.625rem] font-medium tracking-[0.18em] uppercase ${cls}`}
    >
      {label}
    </span>
  );
}
