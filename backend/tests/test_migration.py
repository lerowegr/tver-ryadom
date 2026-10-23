"""Перенос данных из D1 в PostgreSQL."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.database import Database
from app.domain.models.auth import User
from app.domain.models.bookings import Booking
from app.domain.models.content import Setting
from app.domain.models.tours import Tour
from scripts.migrate_from_d1 import convert, load_dump

#: Выгрузка в том виде, в каком её отдаёт wrangler: время целыми числами,
#: булевы значения нулём и единицей, JSON — текстом.
DUMP = """
PRAGMA foreign_keys=OFF;
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT, phone TEXT, name TEXT NOT NULL,
  password_hash TEXT, role TEXT, avatar_key TEXT, email_verified_at INTEGER,
  telegram_chat_id TEXT, vk_user_id TEXT, max_user_id TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO users VALUES (
  'user-1','elena@example.com','+79001112233','Елена',
  'pbkdf2$100000$c29sdA==$aGFzaA==','admin',NULL,1762000000,
  '555',NULL,NULL,1700000000,1700000000
);
CREATE TABLE tours (
  id TEXT PRIMARY KEY, slug TEXT, title TEXT, subtitle TEXT,
  short_description TEXT, full_description TEXT, program TEXT,
  price INTEGER, price_type TEXT, duration_minutes INTEGER,
  group_min INTEGER, group_max INTEGER, meeting_point TEXT,
  meeting_lat REAL, meeting_lng REAL, included TEXT, not_included TEXT,
  recommendations TEXT, status TEXT, sort_order INTEGER,
  rating_avg REAL, rating_count INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO tours VALUES (
  'tour-1','obzornaya','Живые истории','Обзорная','Кратко','Полно','[]',
  450000,'per_group',120,1,5,'Соборная площадь',56.86,35.9,
  '["Гид"]','["Билеты"]','Удобная обувь','published',1,5.0,2,
  1700000000,1700000000
);
CREATE TABLE bookings (
  id TEXT PRIMARY KEY, user_id TEXT, tour_id TEXT NOT NULL, schedule_id TEXT,
  desired_date INTEGER, people_count INTEGER, total_price INTEGER,
  status TEXT, payment_status TEXT, contact_name TEXT, contact_phone TEXT,
  contact_email TEXT, comment TEXT, admin_comment TEXT, cancel_reason TEXT,
  source TEXT, reminder_sent_at INTEGER, reminder_off INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO bookings VALUES (
  'booking-1','user-1','tour-1',NULL,1764000000,2,450000,'confirmed','none',
  'Мария','+79001112233',NULL,NULL,NULL,NULL,'web',NULL,1,
  1700000000,1700000000
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
INSERT INTO settings VALUES ('contacts.vk','"https://vk.ru/tverexkursii"',1700000000);
INSERT INTO settings VALUES ('about.team','[{"name":"Елена"}]',1700000000);
"""


@pytest.fixture
def dump_file(tmp_path: Path) -> Path:
    path = tmp_path / "dump.sql"
    path.write_text(DUMP, encoding="utf-8")
    return path


class TestConversion:
    def test_seconds_become_dates(self, dump_file: Path) -> None:
        source = load_dump(dump_file)
        row = source.execute("SELECT * FROM users").fetchone()
        converted = convert("users", row)

        # Без пересчёта вместо дат получился бы 1970 год.
        assert converted["created_at"] == datetime.fromtimestamp(1700000000, UTC)
        assert converted["email_verified_at"].year == 2025

    def test_zero_and_one_become_boolean(self, dump_file: Path) -> None:
        source = load_dump(dump_file)
        row = source.execute("SELECT * FROM bookings").fetchone()
        converted = convert("bookings", row)
        # В SQLite булевых значений нет.
        assert converted["reminder_off"] is True

    def test_json_columns_are_parsed(self, dump_file: Path) -> None:
        source = load_dump(dump_file)
        row = source.execute("SELECT * FROM tours").fetchone()
        converted = convert("tours", row)
        assert converted["included"] == ["Гид"]
        assert converted["program"] == []

    def test_settings_keep_both_shapes(self, dump_file: Path) -> None:
        source = load_dump(dump_file)
        rows = {
            row["key"]: convert("settings", row)["value"]
            for row in source.execute("SELECT * FROM settings")
        }
        assert rows["contacts.vk"] == "https://vk.ru/tverexkursii"
        assert rows["about.team"] == [{"name": "Елена"}]

    def test_password_hash_survives(self, dump_file: Path) -> None:
        source = load_dump(dump_file)
        row = source.execute("SELECT * FROM users").fetchone()
        converted = convert("users", row)
        # Формат совпадает — заводить пароль заново никому не придётся.
        assert converted["password_hash"].startswith("pbkdf2$100000$")

    def test_pragma_lines_do_not_break_loading(self, dump_file: Path) -> None:
        # Выгрузка wrangler содержит служебные строки.
        assert load_dump(dump_file).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


class TestTransfer:
    async def test_rows_land_in_the_new_database(
        self, dump_file: Path, database: Database
    ) -> None:
        """Полный перенос в подготовленную базу.

        Здесь это SQLite, но проверяется не диалект, а само преобразование
        и порядок таблиц: ссылки должны сойтись.
        """
        from app.core.database import Base
        from scripts.migrate_from_d1 import ORDER
        from scripts.migrate_from_d1 import convert as convert_row

        source: sqlite3.Connection = load_dump(dump_file)
        async with database.engine.begin() as connection:
            for table in ORDER:
                try:
                    rows = source.execute(f"SELECT * FROM {table}").fetchall()
                except sqlite3.OperationalError:
                    continue
                if not rows:
                    continue
                payload = [convert_row(table, row) for row in rows]
                await connection.execute(
                    Base.metadata.tables[table].insert(), payload
                )

        async with database.session() as session:
            user = (await session.execute(select(User))).scalars().one()
            tour = (await session.execute(select(Tour))).scalars().one()
            booking = (await session.execute(select(Booking))).scalars().one()
            setting = await session.get(Setting, "contacts.vk")

        assert user.name == "Елена" and user.is_admin
        assert tour.included == ["Гид"]
        assert booking.user_id == user.id
        assert booking.reminder_off is True
        # Время вернулось с поясом, а не наивным.
        assert booking.created_at.tzinfo is not None
        assert setting.value == "https://vk.ru/tverexkursii"
