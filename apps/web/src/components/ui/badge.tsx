const accents: Record<string, string> = {
  hit: 'bg-terra-500 text-white',
  popular: 'bg-sand-300 text-bark-800',
};

export function TourBadge({ slug, label }: { slug: string; label: string }) {
  const cls = accents[slug] ?? 'bg-cream-200 text-bark-700';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
