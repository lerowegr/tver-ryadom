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
        <span className="icon-tile mx-auto mb-6">
          <CheckIcon className="h-5 w-5" />
        </span>
        <h3 className="font-display text-ink text-xl">Заявка отправлена!</h3>
        <p className="text-muted mt-3 text-sm leading-relaxed">
          {created.startsAt ? (
            <>
              «{created.tour.title}», {formatDateTime(created.startsAt)}.
              <br />
            </>
          ) : null}
          Мы свяжемся с вами для подтверждения брони в ближайшее время.
        </p>
        <p className="text-ink mt-6 text-lg">К оплате: {formatPrice(created.totalPrice)}</p>
        <p className="text-muted mt-2 text-xs">Оплата — на месте или по договорённости с гидом.</p>
        {status === 'authed' ? (
          <Link
            href="/account/bookings"
            className="bg-ink text-bg hover:bg-ink-soft mt-7 inline-block cursor-pointer px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
          >
            Мои брони
          </Link>
        ) : (
          <p className="text-muted mt-5 text-xs">
            <Link href="/auth" className="link-underline text-ink">
              Создайте аккаунт
            </Link>
            , чтобы отслеживать брони и получать уведомления.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-7">
      <fieldset>
        <legend className="field-label mb-4">Дата и время</legend>
        {hasSlots && !customDate ? (
          <div className="space-y-2">
            {tour.schedules.map((slot) => (
              <label
                key={slot.id}
                className="border-line has-checked:border-ink flex cursor-pointer items-center justify-between border px-5 py-4 transition-colors duration-500"
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    value={slot.id}
                    {...register('scheduleId')}
                    className="accent-ink h-4 w-4"
                  />
                  <span className="text-ink text-sm">{formatDateTime(slot.startsAt)}</span>
                </span>
                <span className="text-muted text-xs">свободно {slot.freeSeats}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomDate(true);
                setValue('scheduleId', undefined);
              }}
              className="link-underline text-muted text-sm"
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
              className="field"
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
                className="link-underline text-muted mt-2 inline-block text-sm"
              >
                ← Выбрать из расписания
              </button>
            ) : null}
          </div>
        )}
        {errors.scheduleId ? (
          <p className="field-error">{errors.scheduleId.message}</p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="peopleCount" className="field-label mb-4">
          Участники
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Меньше участников"
            onClick={() => setValue('peopleCount', Math.max(tour.groupMin, peopleCount - 1))}
            className="border-line text-ink hover:border-ink h-12 w-12 cursor-pointer border transition-colors duration-500"
          >
            −
          </button>
          <input
            id="peopleCount"
            type="number"
            {...register('peopleCount')}
            min={tour.groupMin}
            max={maxPeople}
            className="field w-20 text-center"
          />
          <button
            type="button"
            aria-label="Больше участников"
            onClick={() => setValue('peopleCount', Math.min(maxPeople, peopleCount + 1))}
            className="border-line text-ink hover:border-ink h-12 w-12 cursor-pointer border transition-colors duration-500"
          >
            +
          </button>
          <span className="text-muted text-xs">до {maxPeople} чел.</span>
        </div>
        {errors.peopleCount ? (
          <p className="field-error">{errors.peopleCount.message}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="contactName" className="sr-only">
          Имя
        </label>
        <input id="contactName" placeholder="Ваше имя" {...register('contactName')} className="field" />
        {errors.contactName ? (
          <p className="field-error">{errors.contactName.message}</p>
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
          className="field"
        />
        {errors.contactPhone ? (
          <p className="field-error">{errors.contactPhone.message}</p>
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
          className="field"
        />
        {errors.contactEmail ? (
          <p className="field-error">{errors.contactEmail.message}</p>
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
          className="field"
        />
      </div>

      <div className="border-line flex items-center justify-between border-t pt-6">
        <span className="text-muted text-sm">Итого</span>
        <span className="font-display text-ink text-2xl">{formatPrice(total)}</span>
      </div>

      {submitError ? (
        <p className="border-danger text-danger border-l-2 py-2 pl-4 text-sm" role="alert">
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-ink text-bg hover:bg-ink-soft mt-4 w-full cursor-pointer py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-40"
      >
        {isSubmitting ? 'Отправляем…' : 'Забронировать'}
      </button>
      <p className="text-muted text-center text-xs leading-relaxed">
        Это заявка, а не оплата: мы подтвердим бронь и ответим на вопросы.
      </p>
    </form>
  );
}
