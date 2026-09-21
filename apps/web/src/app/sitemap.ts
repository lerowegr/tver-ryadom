import type { MetadataRoute } from 'next';
import { site } from '@/config/site';
import { getTours, safe } from '@/lib/data';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const toursPage = await safe(getTours(), { items: [], total: 0, page: 1, limit: 12, pages: 1 });

  const staticPages: MetadataRoute.Sitemap = ['', '/excursions', '/schedule', '/about', '/contacts'].map(
    (path) => ({
      url: `${site.url}${path}`,
      changeFrequency: 'weekly',
      priority: path === '' ? 1 : 0.8,
    }),
  );

  const tourPages: MetadataRoute.Sitemap = toursPage.items.map((tour) => ({
    url: `${site.url}/excursions/${tour.slug}`,
    changeFrequency: 'weekly',
    priority: 0.9,
  }));

  return [...staticPages, ...tourPages];
}
