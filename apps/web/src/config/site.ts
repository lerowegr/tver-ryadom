export const site = {
  name: 'Тверь рядом',
  tagline: 'Покажем Тверь спокойно, живо и без скучной лекции',
  description:
    'Авторские пешеходные и автомобильные экскурсии по Твери и окрестностям: обзорные прогулки, Савватьево, предместья. Живые истории вместо скучных лекций.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  nav: [
    { href: '/excursions', label: 'Экскурсии' },
    { href: '/schedule', label: 'Расписание' },
    { href: '/about', label: 'Об экскурсоводе' },
    { href: '/contacts', label: 'Контакты' },
  ],
  /** Запасные контакты на случай недоступности API (реальные — в настройках БД). */
  fallbackContacts: {
    'contacts.phone': '+79000000000',
    'contacts.email': 'hello@tver-ryadom.ru',
    'contacts.telegram': 'https://t.me/tver_ryadom',
    'contacts.vk': 'https://vk.ru/tverexkursii',
    'company.name': 'Тверь рядом',
    'company.tagline': 'Покажем Тверь спокойно, живо и без скучной лекции',
  } as Record<string, string>,
} as const;
