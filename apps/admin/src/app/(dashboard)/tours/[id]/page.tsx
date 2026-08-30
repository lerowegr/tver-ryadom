'use client';

import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TOUR_STATUSES, TOUR_STATUS_LABELS } from '@tver/shared';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { ApiRequestError, authFetch } from '@/lib/api';
import { slugify } from '@/lib/translit';
import type { AdminTourDetail } from '@/lib/types';
import { Card, Loading } from '@/components/ui';
import { TourImages } from '@/components/tour-images';
import { TourSchedules } from '@/components/tour-schedules';

/* Карта тянет 500 КБ библиотеки — грузим её только на странице тура и
   только после того, как остальная форма уже показана. */
const RoutePointMap = dynamic(() => import('@/components/route-point-map'), {
  ssr: false,
  loading: () => (
    <div className="bg-surface-soft flex h-[24rem] w-full items-center justify-center">
      <p className="text-muted text-sm">Загружаем карту…</p>
    </div>
  ),
});

interface TourFormValues {
  title: string;
  slug: string;
  subtitle: string;
  shortDescription: string;
  fullDescription: string;
  priceRub: number;
  priceType: 'per_person' | 'per_group';
  durationMinutes: number;
  groupMin: number;
  groupMax: string;
  meetingPoint: string;
  meetingLat: string;
  meetingLng: string;
  includedText: string;
  notIncludedText: string;
  recommendations: string;
  status: 'draft' | 'published' | 'archived';
  sortOrder: number;
  badgeSlugs: string[];
  program: { title: string; description: string; durationMinutes: string }[];
  routePoints: { title: string; description: string; lat: string; lng: string }[];
}

const emptyValues: TourFormValues = {
  title: '',
  slug: '',
  subtitle: '',
  shortDescription: '',
  fullDescription: '',
  priceRub: 1000,
  priceType: 'per_person',
  durationMinutes: 90,
  groupMin: 1,
  groupMax: '',
  meetingPoint: '',
  meetingLat: '',
  meetingLng: '',
  includedText: '',
  notIncludedText: '',
  recommendations: '',
  status: 'draft',
  sortOrder: 0,
  badgeSlugs: [],
  program: [],
  routePoints: [],
};

function toFormValues(tour: AdminTourDetail): TourFormValues {
  return {
    title: tour.title,
    slug: tour.slug,
    subtitle: tour.subtitle ?? '',
    shortDescription: tour.shortDescription,
    fullDescription: tour.fullDescription,
    priceRub: tour.price / 100,
    priceType: tour.priceType,
    durationMinutes: tour.durationMinutes,
    groupMin: tour.groupMin,
    groupMax: tour.groupMax?.toString() ?? '',
    meetingPoint: tour.meetingPoint ?? '',
    meetingLat: tour.meetingLat?.toString() ?? '',
    meetingLng: tour.meetingLng?.toString() ?? '',
    includedText: tour.included.join('\n'),
    notIncludedText: tour.notIncluded.join('\n'),
    recommendations: tour.recommendations ?? '',
    status: tour.status,
    sortOrder: tour.sortOrder,
    badgeSlugs: tour.badges.map((b) => b.slug),
    program: tour.program.map((step) => ({
      title: step.title,
      description: step.description ?? '',
      durationMinutes: step.durationMinutes?.toString() ?? '',
    })),
    routePoints: tour.routePoints.map((point) => ({
      title: point.title,
      description: point.description ?? '',
      lat: point.lat.toString(),
      lng: point.lng.toString(),
    })),
  };
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function toPayload(values: TourFormValues) {
  return {
    title: values.title.trim(),
    slug: values.slug.trim(),
    subtitle: values.subtitle.trim() || undefined,
    shortDescription: values.shortDescription.trim(),
    fullDescription: values.fullDescription.trim(),
    price: Math.round(Number(values.priceRub) * 100),
    priceType: values.priceType,
    durationMinutes: Number(values.durationMinutes),
    groupMin: Number(values.groupMin) || 1,
    groupMax: values.groupMax ? Number(values.groupMax) : undefined,
    meetingPoint: values.meetingPoint.trim() || undefined,
    meetingLat: values.meetingLat ? Number(values.meetingLat) : undefined,
    meetingLng: values.meetingLng ? Number(values.meetingLng) : undefined,
    included: lines(values.includedText),
    notIncluded: lines(values.notIncludedText),
    recommendations: values.recommendations.trim() || undefined,
    status: values.status,
    sortOrder: Number(values.sortOrder) || 0,
    badgeSlugs: values.badgeSlugs,
    program: values.program
      .filter((step) => step.title.trim())
      .map((step) => ({
        title: step.title.trim(),
        description: step.description.trim() || undefined,
        durationMinutes: step.durationMinutes ? Number(step.durationMinutes) : undefined,
      })),
    routePoints: values.routePoints
      .filter((point) => point.title.trim())
      .map((point) => ({
        title: point.title.trim(),
        description: point.description.trim() || undefined,
        lat: Number(point.lat),
        lng: Number(point.lng),
      })),
  };
}

export default function TourEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;
  const isNew = id === 'new';

  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const tour = useQuery({
    queryKey: ['admin-tour', id],
    queryFn: () => authFetch<AdminTourDetail>(`/admin/tours/${id}`),
    enabled: !isNew,
  });

  const badges = useQuery({
    queryKey: ['badges'],
    queryFn: () => authFetch<{ slug: string; label: string }[]>('/badges'),
  });

  const { register, handleSubmit, control, reset, setValue, getValues } = useForm<TourFormValues>({
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (tour.data) reset(toFormValues(tour.data));
  }, [tour.data, reset]);

  const program = useFieldArray({ control, name: 'program' });
  const routePoints = useFieldArray({ control, name: 'routePoints' });

  // Точка, которую сейчас ставим на карте.
  const [activePoint, setActivePoint] = useState(0);
  // Следим за значениями, а не за полями массива: карте нужны сами координаты,
  // а они меняются и от ввода руками, и от перетаскивания метки.
  const watchedPoints = useWatch({ control, name: 'routePoints' }) ?? [];

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = toPayload(values);
      if (isNew) {
        const created = await authFetch<AdminTourDetail>('/admin/tours', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        router.replace(`/tours/${created.id}`);
      } else {
        await authFetch(`/admin/tours/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        await queryClient.invalidateQueries({ queryKey: ['admin-tour', id] });
        setMessage({ kind: 'ok', text: 'Сохранено' });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-tours'] });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const details = error.details ? ` (${Object.values(error.details).join('; ')})` : '';
        setMessage({ kind: 'error', text: error.message + details });
      } else {
        setMessage({ kind: 'error', text: 'Не удалось сохранить' });
      }
    } finally {
      setSaving(false);
    }
  });

  const archive = async () => {
    if (!window.confirm('Архивировать экскурсию? Она исчезнет из каталога.')) return;
    try {
      await authFetch(`/admin/tours/${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin-tours'] });
      router.push('/tours');
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiRequestError ? error.message : 'Не удалось архивировать',
      });
    }
  };

  if (!isNew && tour.isLoading) return <Loading />;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-ink text-[1.75rem] leading-tight">
          {isNew ? 'Новая экскурсия' : `Редактирование: ${tour.data?.title ?? ''}`}
        </h1>
        {!isNew ? (
          <button onClick={archive} className="btn-danger">
            Архивировать
          </button>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card title="Основное">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-title">
                Название
              </label>
              <input id="f-title" {...register('title', { required: true })} className="input" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-slug">
                Слаг (URL)
              </label>
              <div className="flex gap-2">
                <input id="f-slug" {...register('slug', { required: true })} className="input" />
                <button
                  type="button"
                  onClick={() => setValue('slug', slugify(getValues('title')))}
                  className="btn-secondary shrink-0 !px-3"
                  title="Сгенерировать из названия"
                >
                  ⟳
                </button>
              </div>
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-subtitle">
                Подзаголовок
              </label>
              <input id="f-subtitle" {...register('subtitle')} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-short">
                Краткое описание (карточка каталога)
              </label>
              <textarea id="f-short" rows={2} {...register('shortDescription', { required: true })} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-full">
                Полное описание (абзацы — с новой строки)
              </label>
              <textarea id="f-full" rows={6} {...register('fullDescription', { required: true })} className="input" />
            </div>
          </div>
        </Card>

        <Card title="Цена и параметры">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-price">
                Цена, ₽
              </label>
              <input id="f-price" type="number" min={0} step="0.01" {...register('priceRub', { required: true })} className="input" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-ptype">
                Тип цены
              </label>
              <select id="f-ptype" {...register('priceType')} className="input">
                <option value="per_person">за человека</option>
                <option value="per_group">за группу</option>
              </select>
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-dur">
                Длительность, минут
              </label>
              <input id="f-dur" type="number" min={15} {...register('durationMinutes', { required: true })} className="input" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-gmin">
                Группа от
              </label>
              <input id="f-gmin" type="number" min={1} {...register('groupMin')} className="input" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-gmax">
                Группа до (пусто — без лимита)
              </label>
              <input id="f-gmax" type="number" min={1} {...register('groupMax')} className="input" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-status">
                Статус
              </label>
              <select id="f-status" {...register('status')} className="input">
                {TOUR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TOUR_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-muted mb-2 text-sm font-medium">Тематические бейджи</p>
            <div className="flex flex-wrap gap-2">
              {(badges.data ?? []).map((badge) => (
                <label key={badge.slug} className="has-checked:bg-ink has-checked:text-white bg-surface-soft text-ink-soft cursor-pointer px-3.5 py-1.5 text-sm font-medium transition">
                  <input type="checkbox" value={badge.slug} {...register('badgeSlugs')} className="sr-only" />
                  {badge.label}
                </label>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Место встречи и условия">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-meet">
                Место встречи
              </label>
              <input id="f-meet" {...register('meetingPoint')} className="input" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-lat">
                Широта
              </label>
              <input id="f-lat" {...register('meetingLat')} className="input" placeholder="56.8626" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-lng">
                Долгота
              </label>
              <input id="f-lng" {...register('meetingLng')} className="input" placeholder="35.8988" />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-inc">
                Что входит (по строке на пункт)
              </label>
              <textarea id="f-inc" rows={4} {...register('includedText')} className="input" />
            </div>
            <div>
              <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-ninc">
                Что не входит
              </label>
              <textarea id="f-ninc" rows={4} {...register('notIncludedText')} className="input" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-muted mb-1.5 block text-sm font-medium" htmlFor="f-rec">
              Рекомендации гостям
            </label>
            <textarea id="f-rec" rows={2} {...register('recommendations')} className="input" />
          </div>
        </Card>

        <Card
          title="Программа"
          action={
            <button type="button" onClick={() => program.append({ title: '', description: '', durationMinutes: '' })} className="btn-secondary">
              + Шаг
            </button>
          }
        >
          {program.fields.length === 0 ? (
            <p className="text-muted text-sm">Добавьте шаги программы — они показываются таймлайном.</p>
          ) : (
            <div className="space-y-3">
              {program.fields.map((field, index) => (
                <div key={field.id} className="bg-surface-soft grid gap-3 p-4 sm:grid-cols-[1fr_8rem_auto]">
                  <div className="space-y-2">
                    <input placeholder="Название шага" {...register(`program.${index}.title`)} className="input" />
                    <input placeholder="Описание (необязательно)" {...register(`program.${index}.description`)} className="input" />
                  </div>
                  <input type="number" placeholder="Минут" {...register(`program.${index}.durationMinutes`)} className="input self-start" />
                  <button type="button" onClick={() => program.remove(index)} className="btn-danger self-start !px-3 !py-2 text-xs">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Точки маршрута"
          action={
            <button type="button" onClick={() => routePoints.append({ title: '', description: '', lat: '', lng: '' })} className="btn-secondary">
              + Точка
            </button>
          }
        >
          {routePoints.fields.length === 0 ? (
            <p className="text-muted text-sm">Точки с координатами рисуют маршрут на карте.</p>
          ) : (
            <div className="space-y-5">
              <RoutePointMap
                points={watchedPoints.map((point) => ({
                  title: point?.title ?? '',
                  lat: point?.lat ?? '',
                  lng: point?.lng ?? '',
                }))}
                activeIndex={Math.min(activePoint, routePoints.fields.length - 1)}
                onSelect={setActivePoint}
                onMove={(index, lat, lng) => {
                  // Шесть знаков — примерно десять сантиметров на местности,
                  // больше в координатах точки смысла нет.
                  setValue(`routePoints.${index}.lat`, lat.toFixed(6), { shouldDirty: true });
                  setValue(`routePoints.${index}.lng`, lng.toFixed(6), { shouldDirty: true });
                  setActivePoint(index);
                }}
              />

              <div className="space-y-3">
                {routePoints.fields.map((field, index) => {
                  const active = index === Math.min(activePoint, routePoints.fields.length - 1);
                  return (
                    <div
                      key={field.id}
                      onFocusCapture={() => setActivePoint(index)}
                      className={`grid gap-3 p-4 sm:grid-cols-[auto_1fr_7rem_7rem_auto] ${
                        active ? 'bg-surface-soft ring-ink ring-1' : 'bg-surface-soft'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActivePoint(index)}
                        aria-pressed={active}
                        aria-label={`Ставить на карте точку ${index + 1}`}
                        className={`flex h-8 w-8 cursor-pointer items-center justify-center self-start text-xs tabular-nums ${
                          active ? 'bg-ink text-bg' : 'border-line text-muted border'
                        }`}
                      >
                        {index + 1}
                      </button>
                      <div className="space-y-2">
                        <input placeholder="Название точки" {...register(`routePoints.${index}.title`)} className="input" />
                        <input placeholder="Описание (необязательно)" {...register(`routePoints.${index}.description`)} className="input" />
                      </div>
                      <input placeholder="Широта" {...register(`routePoints.${index}.lat`)} className="input self-start" />
                      <input placeholder="Долгота" {...register(`routePoints.${index}.lng`)} className="input self-start" />
                      <button type="button" onClick={() => routePoints.remove(index)} className="btn-danger self-start !px-3 !py-2 text-xs">
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {message ? (
          <p
            role="status"
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              message.kind === 'ok' ? 'bg-surface-soft/60 text-ink-soft' : 'bg-transparent text-danger'
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Сохраняем…' : isNew ? 'Создать экскурсию' : 'Сохранить изменения'}
          </button>
        </div>
      </form>

      {!isNew && tour.data ? (
        <>
          <TourImages tourId={tour.data.id} images={tour.data.images} />
          <TourSchedules tourId={tour.data.id} schedules={tour.data.schedules} />
        </>
      ) : null}
    </div>
  );
}
