"""Фотографии экскурсий: приём, нарезка размеров, порядок, удаление.

Здесь перенос отступает от оригинала осознанно. На Workers размеры готовил
браузер и присылал их тремя полями: процессорного времени на ресайз там не
было, а WASM-кодек в лимит не помещался. На своём сервере это лишнее —
Pillow режет быстрее, чем файл долетает по сети, и больше не нужно верить,
что браузер прислал именно то, что обещал.

Готовые размеры по-прежнему принимаются: админка умеет их слать, и ломать
её ради красоты незачем.
"""

from __future__ import annotations

import io
import uuid
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select

from app.core.errors import NotFoundError, ValidationError
from app.core.unit_of_work import UnitOfWork
from app.domain.models.tours import TourImage
from app.domain.schemas.admin import AdminImage
from app.services.images import ImageUrlBuilder
from app.services.storage import ObjectStorage

#: Один файл не больше этого.
MAX_SIZE = 8 * 1024 * 1024
#: И весь запрос целиком: четыре поля по восемь мегабайт — уже перебор.
TOTAL_MAX_SIZE = 24 * 1024 * 1024

#: Ширины размеров. Высота считается пропорционально.
WIDTHS = {"hero": 1600, "card": 900, "thumb": 400}

#: Что вообще принимаем. Тип определяется по содержимому, а не по заголовку:
#: заголовок присылает клиент, и верить ему нельзя.
SIGNATURES: tuple[tuple[bytes, str, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
)
WEBP_PREFIX = b"RIFF"
WEBP_MARKER = b"WEBP"


@dataclass(frozen=True, slots=True)
class CheckedImage:
    data: bytes
    content_type: str
    extension: str


def detect(data: bytes) -> CheckedImage | None:
    """Тип по магическим байтам."""
    for prefix, content_type, extension in SIGNATURES:
        if data.startswith(prefix):
            return CheckedImage(data, content_type, extension)
    if len(data) >= 12 and data.startswith(WEBP_PREFIX) and data[8:12] == WEBP_MARKER:
        return CheckedImage(data, "image/webp", "webp")
    return None


class ImageProcessor:
    """Проверка файла и нарезка размеров."""

    def check(self, data: bytes) -> CheckedImage:
        if len(data) > MAX_SIZE:
            raise ValidationError(f"Файл больше {MAX_SIZE // 1024 // 1024} МБ")
        checked = detect(data)
        if checked is None:
            raise ValidationError("Поддерживаются JPEG, PNG и WebP")
        return checked

    def resize(self, data: bytes, width: int) -> CheckedImage:
        """Уменьшает до заданной ширины. Увеличивать не станет: растянутый
        кадр хуже маленького, а весит заметно больше."""
        try:
            with Image.open(io.BytesIO(data)) as source:
                source.load()
                if source.width <= width:
                    return self.check(data)

                height = round(source.height * width / source.width)
                resized = source.convert("RGB").resize(
                    (width, height), Image.Resampling.LANCZOS
                )
                buffer = io.BytesIO()
                # WebP: при схожем качестве он заметно легче JPEG, а
                # поддерживают его все живые браузеры.
                resized.save(buffer, format="WEBP", quality=82, method=4)
        except (UnidentifiedImageError, OSError) as error:
            raise ValidationError("Не удалось обработать изображение") from error

        return CheckedImage(buffer.getvalue(), "image/webp", "webp")


class AdminImageService:
    def __init__(
        self,
        uow: UnitOfWork,
        storage: ObjectStorage,
        images: ImageUrlBuilder,
        processor: ImageProcessor | None = None,
    ) -> None:
        self._uow = uow
        self._storage = storage
        self._images = images
        self._processor = processor or ImageProcessor()

    async def upload(
        self,
        tour_id: str,
        *,
        original: bytes | None,
        ready: dict[str, bytes],
        alt: str | None,
    ) -> AdminImage:
        tour = await self._uow.tours.get(tour_id)
        if tour is None:
            raise NotFoundError("Экскурсия не найдена")

        total = len(original or b"") + sum(len(data) for data in ready.values())
        if total > TOTAL_MAX_SIZE:
            raise ValidationError(
                f"Суммарный размер файлов больше {TOTAL_MAX_SIZE // 1024 // 1024} МБ"
            )
        if not original and not ready:
            raise ValidationError("Приложите изображение")

        folder = f"tours/{tour_id}"
        variants: dict[str, str] = {}

        # Готовые размеры от клиента кладём как есть.
        for name, data in ready.items():
            checked = self._processor.check(data)
            variants[name] = await self._store(folder, name, checked)

        if original is not None:
            checked = self._processor.check(original)
            variants["original"] = await self._store(folder, "original", checked)
            # Чего не прислали — нарежем сами.
            for name, width in WIDTHS.items():
                if name not in variants:
                    resized = self._processor.resize(checked.data, width)
                    variants[name] = await self._store(folder, name, resized)

        self._fill_gaps(variants)

        # Новая фотография встаёт в конец галереи.
        position = await self._uow.session.scalar(
            select(func.count()).select_from(TourImage).where(TourImage.tour_id == tour_id)
        )
        image = TourImage(
            tour_id=tour_id,
            r2_key=variants["original"],
            alt=(alt or "").strip() or tour.title,
            sort_order=int(position or 0),
            variants=variants,
        )
        self._uow.session.add(image)
        await self._uow.flush()
        return self._to_out(image)

    async def update(
        self, image_id: str, *, alt: str | None, sort_order: int | None
    ) -> TourImage:
        image = await self._uow.session.get(TourImage, image_id)
        if image is None:
            raise NotFoundError("Изображение не найдено")
        if alt is not None:
            image.alt = alt
        if sort_order is not None:
            image.sort_order = sort_order
        return image

    async def remove(self, image_id: str) -> None:
        image = await self._uow.session.get(TourImage, image_id)
        if image is None:
            raise NotFoundError("Изображение не найдено")

        # Файлы убираем вместе с записью, иначе в хранилище копится мусор,
        # за который платят, а найти его потом нечем.
        for key in {image.r2_key, *(image.variants or {}).values()}:
            await self._storage.delete(key)
        await self._uow.session.delete(image)

    async def _store(self, folder: str, name: str, checked: CheckedImage) -> str:
        key = f"{folder}/{uuid.uuid4()}-{name}.{checked.extension}"
        await self._storage.put(key, checked.data, checked.content_type)
        return key

    @staticmethod
    def _fill_gaps(variants: dict[str, str]) -> None:
        """Недостающие размеры подставляются ближайшим большим.

        Вёрстка не обязана знать, что именно удалось нарезать: `srcset`
        получит рабочий адрес в любом случае.
        """
        primary = (
            variants.get("original")
            or variants.get("hero")
            or variants.get("card")
            or variants.get("thumb")
        )
        if primary is None:  # pragma: no cover — проверено выше
            raise ValidationError("Приложите изображение")
        variants.setdefault("original", primary)
        variants.setdefault("hero", primary)
        variants.setdefault("card", variants["hero"])
        variants.setdefault("thumb", variants["card"])

    def _to_out(self, image: TourImage) -> AdminImage:
        return AdminImage(
            id=image.id,
            r2_key=image.r2_key,
            alt=image.alt,
            sort_order=image.sort_order,
            variants=self._images.build(image).variants,
        )

