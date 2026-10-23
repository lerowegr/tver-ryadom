"""Адреса картинок.

В базе лежат ключи файлов в хранилище, а клиенту нужны абсолютные адреса.
Сборка вынесена в отдельный объект: базовый адрес зависит от настроек, и
протаскивать его строкой через каждый сервис было бы шумно.

Недостающие размеры подставляются оригиналом. Так вёрстка не обязана
знать, успел ли обработчик нарезать варианты: `srcset` получит рабочий
адрес в любом случае, пусть и тяжелее нужного.
"""

from __future__ import annotations

from urllib.parse import quote

from app.domain.models.content import GalleryImage
from app.domain.models.tours import TourImage
from app.domain.schemas.tours import ImageOut

#: Размеры, которые ожидает вёрстка.
VARIANTS = ("thumb", "card", "hero", "original")


class ImageUrlBuilder:
    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")

    def url(self, key: str) -> str:
        # quote по сегментам: ключ содержит слеши, и кодировать их нельзя.
        return f"{self._base}/{quote(key, safe='/')}"

    def build(self, image: TourImage | GalleryImage) -> ImageOut:
        variants = {
            name: self.url(key) for name, key in (image.variants or {}).items() if key
        }
        original = variants.get("original") or self.url(image.r2_key)
        for name in VARIANTS:
            variants.setdefault(name, original)
        return ImageOut(r2_key=image.r2_key, alt=image.alt, variants=variants)

    def first(self, images: list[TourImage]) -> ImageOut | None:
        return self.build(images[0]) if images else None
