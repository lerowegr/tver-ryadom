import Link from 'next/link';

export function Pagination({
  page,
  pages,
  basePath,
  query,
}: {
  page: number;
  pages: number;
  basePath: string;
  query: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (p > 1) params.set('page', String(p));
    else params.delete('page');
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav className="mt-20 flex items-center justify-center gap-3" aria-label="Страницы каталога">
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`flex h-12 w-12 items-center justify-center border text-xs tabular-nums transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            p === page ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-ink hover:text-ink'
          }`}
        >
          {p}
        </Link>
      ))}
    </nav>
  );
}
