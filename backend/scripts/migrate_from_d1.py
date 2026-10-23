"""Перенос данных из Cloudflare D1 в PostgreSQL.

Выгрузка снимается соседним скриптом `dump_d1.cmd` (или вручную через
`wrangler d1 export`), а этот читает её и заливает в новую базу.

Три вещи, ради которых скрипт вообще написан:

* **Время.** В D1 метки лежат целыми числами — секундами с начала эпохи.
  В PostgreSQL это `timestamptz`, и пересчитывать их надо явно, иначе
  вместо дат получится 1970 год.
* **Булевы значения.** В SQLite их нет, вместо них ноль и единица.
* **Порядок.** Записи ссылаются друг на друга, поэтому таблицы заливаются
  в порядке зависимостей — иначе внешние ключи не дадут вставить.

Пароли переносятся как есть: формат хеша совпадает, и заводить их заново
никому не придётся.

    python scripts/migrate_from_d1.py dump.sql [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings
from app.core.database import Base, Database

#: Порядок заливки: сперва то, на что ссылаются.
ORDER = (
    "users",
    "badges",
    "tours",
    "tour_badges",
    "tour_images",
    "route_points",
    "schedules",
    "bookings",
    "payments",
    "reviews",
    "favorites",
    "gallery_images",
    "contact_requests",
    "settings",
    "notifications",
    "outbox",
    "availability_blocks",
    "bot_drafts",
    "sessions",
)

#: Колонки со временем: из секунд в дату с поясом.
TIMESTAMPS = {
    "created_at", "updated_at", "expires_at", "revoked_at", "starts_at",
    "desired_date", "reminder_sent_at", "email_verified_at", "read_at",
    "scheduled_at", "sent_at",
}

#: Колонки с булевым значением: из нуля и единицы.
BOOLEANS = {"reminder_off"}

#: Колонки с JSON: в D1 это текст.
JSON_COLUMNS = {
    "program", "included", "not_included", "variants", "payload", "value",
}


def load_dump(path: Path) -> sqlite3.Connection:
    """Загружает выгрузку в SQLite в памяти.

    Через настоящий SQLite, а не разбором SQL вручную: выгрузка содержит
    экранирование, многострочные значения и всё прочее, что самодельный
    разбор рано или поздно прочитает неверно.
    """
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row

    sql = path.read_text(encoding="utf-8")
    # В выгрузке wrangler встречаются служебные строки, которых SQLite
    # не понимает; их пропускаем.
    sql = re.sub(r"^PRAGMA .*$", "", sql, flags=re.M)
    connection.executescript(sql)
    return connection


def convert(table: str, row: sqlite3.Row) -> dict[str, Any]:
    result: dict[str, Any] = {}
    # sqlite3.Row — не словарь: keys() у него единственный способ
    # узнать имена колонок.
    for key in row.keys():  # noqa: SIM118
        value = row[key]
        if value is None:
            result[key] = None
        elif key in TIMESTAMPS:
            result[key] = datetime.fromtimestamp(int(value), UTC)
        elif key in BOOLEANS:
            result[key] = bool(value)
        elif key in JSON_COLUMNS and isinstance(value, str):
            try:
                result[key] = json.loads(value)
            except json.JSONDecodeError:
                # Настройки хранились и просто строкой — оставляем как есть.
                result[key] = value
        else:
            result[key] = value
    return result


async def transfer(dump: Path, *, dry_run: bool) -> dict[str, int]:
    source = load_dump(dump)
    settings = get_settings()
    database = Database(str(settings.database_url))

    counts: dict[str, int] = {}
    try:
        async with database.engine.begin() as connection:
            for table in ORDER:
                try:
                    rows = source.execute(f"SELECT * FROM {table}").fetchall()
                except sqlite3.OperationalError:
                    # Таблицы может не быть: выгрузка старше последних миграций.
                    continue
                if not rows:
                    counts[table] = 0
                    continue

                payload = [convert(table, row) for row in rows]
                counts[table] = len(payload)
                if dry_run:
                    continue

                target = Base.metadata.tables[table]
                # Пачками: один INSERT на тысячу строк вместо тысячи
                # отдельных обращений.
                for start in range(0, len(payload), 500):
                    await connection.execute(
                        target.insert(), payload[start : start + 500]
                    )
    finally:
        await database.dispose()
        source.close()

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Перенос данных из D1 в PostgreSQL")
    parser.add_argument("dump", type=Path, help="Файл выгрузки wrangler d1 export")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Только посчитать записи, ничего не записывая",
    )
    args = parser.parse_args()

    if not args.dump.exists():
        parser.error(f"Файл не найден: {args.dump}")

    counts = asyncio.run(transfer(args.dump, dry_run=args.dry_run))

    print("Перенос" if not args.dry_run else "Проверка (без записи)")
    for table, total in counts.items():
        print(f"  {table:22} {total:>6}")
    print(f"\nВсего записей: {sum(counts.values())}")


if __name__ == "__main__":  # pragma: no cover
    main()

