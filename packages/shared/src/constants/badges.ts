/** Предустановленные тематические бейджи экскурсий; админ может добавлять свои. */
export const DEFAULT_BADGES = [
  { slug: 'hit', label: 'Хит' },
  { slug: 'first-visit', label: 'Для первого знакомства' },
  { slug: 'with-kids', label: 'С детьми' },
  { slug: 'historical', label: 'Историческая' },
  { slug: 'popular', label: 'Популярная' },
  { slug: 'walking', label: 'Пешеходная' },
  { slug: 'by-car', label: 'На автомобиле' },
  { slug: 'author-route', label: 'Авторский маршрут' },
] as const;

export type BadgeSlug = (typeof DEFAULT_BADGES)[number]['slug'];
