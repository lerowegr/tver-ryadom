import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id } from './helpers';

/**
 * Закрытые дни и часы экскурсовода.
 *
 * Дата и время — местные московские, строками. Метка времени здесь была бы
 * ловушкой: «закрыть 3 ноября» означает сутки в Твери, а не сутки от полуночи
 * UTC, и при пересчёте в воркере край дня уезжал бы на три часа.
 *
 * Пустые start_time и end_time означают весь день. Период закрывается
 * отдельной строкой на каждый день: так его легко открыть обратно
 * по одному дню и не нужно резать диапазоны при пересечениях.
 */
export const availabilityBlocks = sqliteTable(
  'availability_blocks',
  {
    id: id(),
    /** ГГГГ-ММ-ДД по московскому времени. */
    date: text('date').notNull(),
    /** ЧЧ:ММ по московскому времени; пусто — закрыт весь день. */
    startTime: text('start_time'),
    endTime: text('end_time'),
    /** Для себя: «отпуск», «экскурсия со Спутника». Гостям не показывается. */
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('availability_blocks_date_idx').on(t.date)],
);
