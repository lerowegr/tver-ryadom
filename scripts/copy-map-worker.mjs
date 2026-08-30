/**
 * Кладёт воркер MapLibre в public/, чтобы браузер мог его загрузить.
 *
 * С шестой версии библиотека держит воркер отдельным файлом и вычисляет путь
 * к нему из адреса своего же модуля. В сборке Next этот адрес указывает на
 * хешированный кусок в /_next/static/chunks, где никакого воркера нет:
 * сборщик не распознаёт динамический шаблон и файл не выкладывает. Итог —
 * воркер молча не стартует, карта остаётся пустой, ошибок в консоли ноль.
 *
 * Поэтому копируем оба файла сами и в коде карты указываем адрес явно через
 * setWorkerUrl. Копия генерируется при каждом запуске и сборке, чтобы она не
 * разошлась с установленной версией пакета.
 */

import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// Воркер импортирует общий файл как соседний, поэтому копировать нужно оба
// и класть их рядом — иначе воркер упадёт на импорте.
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
// Запускается из папки приложения — и сайта, и админки.
const TARGET = join(process.cwd(), 'public', 'maplibre');

async function main() {
  const pkg = createRequire(join(process.cwd(), 'package.json')).resolve('maplibre-gl/package.json');
  const dist = join(dirname(pkg), 'dist');

  await mkdir(TARGET, { recursive: true });

  for (const name of FILES) {
    const from = join(dist, name);
    const to = join(TARGET, name);

    // Пропускаем, если файл уже такой же: копирование идёт перед каждым
    // запуском, а лишняя запись сбивает наблюдатель за файлами в dev-режиме.
    const [src, dst] = await Promise.all([readFile(from), readFile(to).catch(() => null)]);
    if (dst && dst.equals(src)) continue;

    await copyFile(from, to);
    console.log(`воркер карты: обновлён public/maplibre/${name}`);
  }
}

main().catch((error) => {
  console.error('Не удалось скопировать воркер MapLibre:', error.message);
  process.exit(1);
});
