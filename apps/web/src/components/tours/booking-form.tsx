'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { normalizeRuPhone } from '@tver/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/providers';
import { CheckIcon } from '@/components/ui/icons';
import { ApiRequestError } from '@/lib/api';
import { authFetch } from '@/lib/auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { BookingCreatedDto, ScheduleDto } from '@/lib/types';

interface BookingFormProps {
  tour: {
    id: string;
    title: string;
    price: number;
    priceType: 'per_person' | 'per_group';
    groupMin: number;
    groupMax: number | null;
    schedules: ScheduleDto[];
  };
}

const inputCls =
  'w-full rounded-2xl border border-sand-300 bg-white px-4 py-3 text-sm text-ink-900 ' +
  'placeholder:text-bark-500/60 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500/20';

export function BookingForm({ tour }: { tour: BookingFormProps['tour'] }) {
  const { user, status } = useAuth();
  const maxPeople = tour.groupMax ?? 30;
  const hasSlots = tour.schedules.length > 0;
  const [customDate, setCustomDate] = useState(!hasSlots);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<BookingCreatedDto | null>(null);

  const formSchema = useMemo(
    () =>
      z
        .object({
          scheduleId: z.string().optional(),
          desiredDate: z.string().optional(),
          peopleCount: z.coerce
            .number({ message: 'Укажите число участников' })
            .int()
            .min(tour.groupMin, `Минимум ${tour.groupMin}`)
            .max(maxPeople, `Максимум ${maxPeople}`),
          contactName: z.string().trim().min(2, 'Укажите имя'),
          contactPhone: z
            .string()
            .refine((v) => normalizeRuPhone(v) !== null, 'Укажите российский номер телефона'),
          contactEmail: z.string().email('Некорректный email').optional().or(z.literal('')),
          comment: z.string().max(2000, 'Слишком длинный комментарий').optional(),
        })
        .refine((data) => data.scheduleId || data.desiredDate, {
          message: 'Выберите дату экскурсии',
          path: ['scheduleId'],
        }),
    [tour.groupMin, maxPeople],
  );

  type FormValues = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      peopleCount: Math.max(tour.groupMin, 2),
      scheduleId: hasSlots ? tour.schedules[0]?.id : undefined,
    },
  });

  const peopleCount = watch('peopleCount') || tour.groupMin;
  const total = tour.priceType === 'per_person' ? tour.price * peopleCount : tour.price;

  // Авторизованному гостю подставляем контакты из профиля (не затирая введённое).
  useEffect(() => {
    if (!user) return;
    const { contactName, contactPhone, contactEmail } = getValues();
    if (!contactName) setValue('contactName', user.name);
    if (!contactPhone && user.phone) setValue('contactPhone', user.phone);
    if (!contactEmail && user.email) setValue('contactEmail', user.email);
  }, [user, getValues, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      // authFetch привязывает бронь к аккаунту, для гостя работает без токена.
      const booking = await authFetch<BookingCreatedDto>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
        tourId: tour.id,
        scheduleId: customDate ? undefined : values.scheduleId,
        desiredDate:
          customDate && values.desiredDate ? new Date(values.desiredDate).toISOString() : undefined,
        peopleCount: values.peopleCount,
        contactName: values.contactName,
        contactPhone: normalizeRuPhone(values.contactPhone),
        contactEmail: values.contactEmail || undefined,
        comment: values.comment || undefined,
        }),
      });
      setCreated(booking);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setSubmitError(error.message);
      } else {
        setSubmitError('Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.');
      }
    }
  });

  if (created) {
    return (
      <div className="text-center" role="status">
        <span className="bg-terra-500/10 text-terra-600 mx-auto mb-4 inline-flex rounded-full p-4">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h3 className="text-ink-900 font-display text-xl font-semibold">Заявка отправлена!</h3>
        <p className="text-bark-700 mt-2 text-sm leading-relaxed">
          {created.startsAt ? (
            <>
              «{created.tour.title}», {formatDateTime(created.startsAt)}.
              <br />
            </>
          ) : null}
          Мы свяжемся с вами для подтверждения брони в ближайшее время.
        </p>
        <p className="text-ink-900 mt-4 text-lg font-bold">К оплате: {formatPrice(created.totalPrice)}</p>
        <p className="text-bark-600 mt-1 text-xs">Оплата — на месте или по договорённости с гидом.</p>
        {status === 'authed' ? (
          <Link
            href="/account/bookings"
            className="bg-terra-500 hover:bg-terra-600 mt-5 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white transition"
          >
            Мои брони
          </Link>
        ) : (
          <p className="text-bark-600 mt-4 text-xs">
            <Link href="/auth" className="text-terra-600 font-semibold hover:underline">
              Создайте аккаунт
            </Link>
            , чтобы отслеживать брони и получать уведомления.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <fieldset>
        <legend className="text-ink-900 mb-2 text-sm font-semibold">Дата и время</legend>
        {hasSlots && !customDate ? (
          <div className="space-y-2">
            {tour.schedules.map((slot) => (
              <label
                key={slot.id}
                className="border-sand-300 has-checked:border-terra-500 has-checked:bg-terra-500/5 flex cursor-pointer items-center justify-between rounded-2xl border bg-white px-4 py-3 transition"
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    value={slot.id}
                    {...register('scheduleId')}
                    className="accent-terra-500 h-4 w-4"
                  />
                  <span className="text-ink-900 text-sm font-medium">{formatDateTime(slot.startsAt)}</span>
                </span>
                <span className="text-bark-600 text-xs">свободно {slot.freeSeats}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomDate(true);
                setValue('scheduleId', undefined);
              }}
              className="text-terra-600 text-sm font-medium underline-offset-4 hover:underline"
            >
              Нужна другая дата?
            </button>
          </div>
        ) : (
          <div>
            <input
              type="datetime-local"
              {...register('desiredDate')}
              min={new Date(Date.now() + 3600_000).toISOString().slice(0, 16)}
              className={inputCls}
              aria-label="Желаемые дата и время"
            />
            {hasSlots ? (
              <button
                type="button"
                onClick={() => {
                  setCustomDate(false);
                  setValue('desiredDate', undefined);
                  setValue('scheduleId', tour.schedules[0]?.id);
                }}
                className="text-terra-600 mt-2 text-sm font-medium underline-offset-4 hover:underline"
              >
                ← Выбрать из расписания
              </button>
            ) : null}
          </div>
        )}
        {errors.scheduleId ? (
          <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.scheduleId.message}</p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="peopleCount" className="text-ink-900 mb-2 block text-sm font-semibold">
          Участники
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Меньше участников"
            onClick={() => setValue('peopleCount', Math.max(tour.groupMin, peopleCount - 1))}
            className="border-sand-300 text-bark-700 hover:border-terra-500 h-11 w-11 rounded-full border bg-white text-xl font-bold"
          >
            −
          </button>
          <input
            id="peopleCount"
            type="number"
            {...register('peopleCount')}
            min={tour.groupMin}
            max={maxPeople}
            className={`${inputCls} w-20 text-center`}
          />
          <button
            type="button"
            aria-label="Больше участников"
            onClick={() => setValue('peopleCount', Math.min(maxPeople, peopleCount + 1))}
            className="border-sand-300 text-bark-700 hover:border-terra-500 h-11 w-11 rounded-full border bg-white text-xl font-bold"
          >
            +
          </button>
          <span className="text-bark-600 text-xs">до {maxPeople} чел.</span>
        </div>
        {errors.peopleCount ? (
          <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.peopleCount.message}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="contactName" className="sr-only">
          Имя
        </label>
        <input id="contactName" placeholder="Ваше имя" {...register('contactName')} className={inputCls} />
        {errors.contactName ? (
          <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.contactName.message}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="contactPhone" className="sr-only">
          Телефон
        </label>
        <input
          id="contactPhone"
          type="tel"
          placeholder="Телефон, например +7 900 123-45-67"
          {...register('contactPhone')}
          className={inputCls}
        />
        {errors.contactPhone ? (
          <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.contactPhone.message}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="contactEmail" className="sr-only">
          Email
        </label>
        <input
          id="contactEmail"
          type="email"
          placeholder="Email (необязательно)"
          {...register('contactEmail')}
          className={inputCls}
        />
        {errors.contactEmail ? (
          <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.contactEmail.message}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="comment" className="sr-only">
          Комментарий
        </label>
        <textarea
          id="comment"
          rows={2}
          placeholder="Комментарий: дети, темп, особые пожелания…"
          {...register('comment')}
          className={inputCls}
        />
      </div>

      <div className="border-cream-200 flex items-center justify-between border-t pt-4">
        <span className="text-bark-700 text-sm">Итого</span>
        <span className="text-ink-900 font-display text-2xl font-semibold">{formatPrice(total)}</span>
      </div>

      {submitError ? (
        <p className="bg-terra-500/10 text-terra-700 rounded-2xl px-4 py-3 text-sm font-medium" role="alert">
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-terra-500 shadow-soft hover:bg-terra-600 w-full rounded-full py-3.5 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {isSubmitting ? 'Отправляем…' : 'Забронировать'}
      </button>
      <p className="text-bark-600 text-center text-xs leading-relaxed">
        Это заявка, а не оплата: мы подтвердим бронь и ответим на вопросы.
      </p>
    </form>
  );
}
