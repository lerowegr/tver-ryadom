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
    <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Страницы каталога">
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition ${
            p === page
              ? 'bg-terra-500 text-white'
              : 'text-bark-700 hover:border-bark-500/50 border border-transparent bg-white'
          }`}
        >
          {p}
        </Link>
      ))}
    </nav>
  );
}
