"""Наполнение базы для тестов.

Данные собраны по мотивам настоящих — три маршрута Елены: обзорная
прогулка, Савватьево и «Предместье». Так проверки читаются как описание
поведения сайта, а не как возня с абстрактными «tour-1» и «tour-2».
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.database import Database
from app.domain.models.content import Review
from app.domain.models.tours import (
    Badge,
    RoutePoint,
    Schedule,
    Tour,
    TourBadge,
    TourImage,
)

BADGES = [
    ("hit", "Хит"),
    ("walking", "Пешеходная"),
    ("by-car", "На автомобиле"),
    ("author-route", "Авторский маршрут"),
]


class CatalogFixture:
    """Готовый каталог: что создано, доступно как поля."""

    def __init__(self, obzornaya: str, predmeste: str, savvatevo: str, draft: str) -> None:
        self.obzornaya = obzornaya
        self.predmeste = predmeste
        self.savvatevo = savvatevo
        self.draft = draft


async def seed_catalog(database: Database) -> CatalogFixture:
    now = datetime.now(UTC)

    async with database.session() as session:
        badges = {slug: Badge(slug=slug, label=label) for slug, label in BADGES}
        session.add_all(badges.values())
        await session.flush()

        obzornaya = Tour(
            slug="obzornaya-po-tveri",
            title="Живые истории старого города",
            subtitle="Обзорная экскурсия по Твери",
            short_description="Двухчасовая пешеходная прогулка по историческому центру.",
            full_description="Приглашаю на двухчасовую пешеходную прогулку.",
            # Программы и маршрута у пешеходных прогулок нет — так просила Елена.
            program=[],
            price=450000,
            price_type="per_group",
            duration_minutes=120,
            group_min=1,
            group_max=5,
            meeting_point="У входа в Детский музейный центр: ул. Советская, д. 3а",
            meeting_lat=56.8622,
            meeting_lng=35.9003,
            included=["Сопровождение аттестованного экскурсовода"],
            not_included=["Входные билеты в музеи"],
            recommendations="Наденьте удобную обувь.",
            status="published",
            sort_order=1,
        )
        predmeste = Tour(
            slug="predmeste-tveri",
            title="Тверское предместье: город на границе эпох",
            short_description="Пешеходная прогулка туда, где центр переходил в предместье.",
            full_description="Приглашаю на пешеходную прогулку по необычной части Твери.",
            program=[],
            price=450000,
            price_type="per_group",
            duration_minutes=120,
            status="published",
            sort_order=2,
        )
        savvatevo = Tour(
            slug="savvatevo-na-avto",
            title="Экскурсия в Савватьево: истории чудес и пирожки",
            short_description="Автомобильно-пешеходное путешествие в Савватьево.",
            full_description="Приглашаю вас в путешествие по Тверской земле.",
            program=[
                {"title": "Дорога из Твери в Савватьево", "durationMinutes": 30},
                {
                    "title": "Знаменский храм и Савватьева пустынь",
                    "description": "Как возникла обитель.",
                    "durationMinutes": 45,
                },
            ],
            price=650000,
            price_type="per_group",
            duration_minutes=150,
            group_max=4,
            status="published",
            sort_order=3,
        )
        # Черновик: в каталоге его быть не должно ни при каких фильтрах.
        draft = Tour(
            slug="chernovik",
            title="Ещё не готова",
            short_description="Черновик",
            full_description="Черновик",
            price=100000,
            duration_minutes=60,
            status="draft",
        )
        session.add_all([obzornaya, predmeste, savvatevo, draft])
        await session.flush()

        session.add_all([
            TourBadge(tour_id=obzornaya.id, badge_id=badges["hit"].id),
            TourBadge(tour_id=obzornaya.id, badge_id=badges["walking"].id),
            TourBadge(tour_id=predmeste.id, badge_id=badges["walking"].id),
            TourBadge(tour_id=predmeste.id, badge_id=badges["author-route"].id),
            TourBadge(tour_id=savvatevo.id, badge_id=badges["by-car"].id),
        ])

        session.add_all([
            TourImage(
                tour_id=obzornaya.id,
                r2_key="tours/obzornaya/первое фото.jpg",
                alt="Обзорная экскурсия",
                sort_order=0,
                variants={"card": "tours/obzornaya/card.webp"},
            ),
            TourImage(
                tour_id=obzornaya.id,
                r2_key="tours/obzornaya/second.jpg",
                alt=None,
                sort_order=1,
                variants={},
            ),
        ])

        # Порядок задаётся sort_order, а не порядком вставки: иначе ошибку
        # сортировки тест бы не поймал.
        session.add_all([
            RoutePoint(
                tour_id=savvatevo.id,
                title="Святой источник",
                description="Последняя остановка.",
                lat=56.8312,
                lng=36.1068,
                sort_order=2,
            ),
            RoutePoint(
                tour_id=savvatevo.id,
                title="Успенский собор Отроч монастыря",
                description="Место встречи и отправления.",
                lat=56.86486,
                lng=35.91694,
                sort_order=0,
            ),
            RoutePoint(
                tour_id=savvatevo.id,
                title="Знаменский храм, Савватьево",
                description=None,
                lat=56.83236,
                lng=36.10445,
                sort_order=1,
            ),
        ])

        session.add_all([
            Schedule(
                tour_id=obzornaya.id,
                starts_at=now + timedelta(days=7),
                capacity=5,
                booked_count=2,
                status="open",
            ),
            # Прошедший и закрытый слоты не должны попасть в выдачу.
            Schedule(
                tour_id=obzornaya.id,
                starts_at=now - timedelta(days=3),
                capacity=5,
                status="open",
            ),
            Schedule(
                tour_id=obzornaya.id,
                starts_at=now + timedelta(days=14),
                capacity=5,
                status="closed",
            ),
            Schedule(
                tour_id=savvatevo.id,
                starts_at=now + timedelta(days=3),
                capacity=4,
                booked_count=4,
                status="open",
            ),
            # Слот у черновика: в разделе «Расписание» его быть не должно.
            Schedule(
                tour_id=draft.id,
                starts_at=now + timedelta(days=5),
                capacity=10,
                status="open",
            ),
        ])

        session.add_all([
            Review(
                tour_id=obzornaya.id,
                author_name="Татьяна П.",
                rating=5,
                text="Елена — знающий интересный гид, отвечала на все наши вопросы.",
                status="approved",
                created_at=now - timedelta(days=6),
            ),
            Review(
                tour_id=obzornaya.id,
                author_name="Ирина В.",
                rating=5,
                text="Очень интересная подача материала, время пролетело незаметно.",
                status="approved",
                created_at=now - timedelta(days=11),
            ),
            # На модерации — наружу выходить не должен.
            Review(
                tour_id=obzornaya.id,
                author_name="Аноним",
                rating=1,
                text="Этот отзыв ещё не одобрен и показываться не должен.",
                status="pending",
                created_at=now,
            ),
        ])

        obzornaya.rating_avg = 5.0
        obzornaya.rating_count = 2

        await session.commit()
        return CatalogFixture(
            obzornaya=obzornaya.id,
            predmeste=predmeste.id,
            savvatevo=savvatevo.id,
            draft=draft.id,
        )
