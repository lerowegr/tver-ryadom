import type { NextConfig } from 'next';

/**
 * Базовые заголовки (P2/M8).
 * Без X-Frame-Options/CSP frame-ancestors: сайт работает внутри Telegram
 * WebView, и запрет фреймов сломал бы мини-приложение. CSP со script-src
 * не вводим, пока есть инлайн-скрипт js-motion и внешний telegram-web-app.js.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@tver/shared'],
  // Оптимизация изображений отключена до подключения готовых R2-вариантов (этап 5):
  // Image Optimization Vercel/CF Images платные, ресайз делается при загрузке фото.
  images: { unoptimized: true },
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
};

export default nextConfig;
