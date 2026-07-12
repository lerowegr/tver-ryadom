import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@tver/shared'],
  // Оптимизация изображений отключена до подключения готовых R2-вариантов (этап 5):
  // Image Optimization Vercel/CF Images платные, ресайз делается при загрузке фото.
  images: { unoptimized: true },
};

export default nextConfig;
