"""Модели предметной области.

Импортируются здесь все до единой: Alembic и `create_all` видят таблицу
только если её класс уже загружен. Модуль, забытый в этом списке, тихо
выпадет из миграций — и обнаружится это на проде.
"""

from app.domain.models.auth import Session, User
from app.domain.models.availability import AvailabilityBlock, BotDraft
from app.domain.models.bookings import Booking, Payment
from app.domain.models.content import (
    ContactRequest,
    Favorite,
    GalleryImage,
    Review,
    Setting,
)
from app.domain.models.notifications import Notification, OutboxMessage
from app.domain.models.tours import (
    Badge,
    RoutePoint,
    Schedule,
    Tour,
    TourBadge,
    TourImage,
)

__all__ = [
    "AvailabilityBlock",
    "Badge",
    "Booking",
    "BotDraft",
    "ContactRequest",
    "Favorite",
    "GalleryImage",
    "Notification",
    "OutboxMessage",
    "Payment",
    "Review",
    "RoutePoint",
    "Schedule",
    "Session",
    "Setting",
    "Tour",
    "TourBadge",
    "TourImage",
    "User",
]
