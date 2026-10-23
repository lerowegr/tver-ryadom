"""Фотографии экскурсий: приём, нарезка, порядок, удаление."""

from __future__ import annotations

import io

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select

from app.core.database import Database
from app.domain.models.tours import TourImage
from app.services.admin.images import ImageProcessor, detect
from app.services.storage import MemoryStorage
from tests.factories import CatalogFixture


def make_image(width: int = 2000, height: int = 1500, fmt: str = "JPEG") -> bytes:
    """Настоящая картинка, а не случайные байты: Pillow должен её открыть."""
    image = Image.new("RGB", (width, height), (120, 110, 100))
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture
async def admin_headers(client: AsyncClient, user_factory) -> dict[str, str]:
    await user_factory(email="admin@tver-ryadom.ru", role="admin", name="Елена")
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@tver-ryadom.ru", "password": "Пароль-12345"},
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


@pytest.fixture
def storage(client: AsyncClient) -> MemoryStorage:
    """Хранилище в памяти вместо сети."""
    from app.api.deps import get_storage  # noqa: F401 — состояние ставим напрямую

    memory = MemoryStorage()
    client._transport.app.state.storage = memory  # type: ignore[attr-defined]
    return memory


class TestDetection:
    def test_recognises_formats(self) -> None:
        assert detect(make_image(10, 10, "JPEG")).content_type == "image/jpeg"
        assert detect(make_image(10, 10, "PNG")).content_type == "image/png"
        assert detect(make_image(10, 10, "WEBP")).content_type == "image/webp"

    def test_rejects_anything_else(self) -> None:
        # Заголовок присылает клиент, верить ему нельзя — смотрим байты.
        assert detect(b"<?php echo 1; ?>") is None
        assert detect(b"") is None


class TestProcessor:
    def test_resizes_down(self) -> None:
        resized = ImageProcessor().resize(make_image(2000, 1500), 400)
        with Image.open(io.BytesIO(resized.data)) as image:
            assert image.width == 400
            # Пропорции сохраняются.
            assert image.height == 300
        assert resized.content_type == "image/webp"

    def test_does_not_upscale(self) -> None:
        # Растянутый кадр хуже маленького, а весит заметно больше.
        original = make_image(300, 200)
        result = ImageProcessor().resize(original, 1600)
        assert result.data == original

    def test_rejects_oversized_file(self) -> None:
        from app.core.errors import ValidationError
        from app.services.admin.images import MAX_SIZE

        with pytest.raises(ValidationError):
            ImageProcessor().check(b"\xff\xd8\xff" + b"0" * (MAX_SIZE + 1))

    def test_rejects_non_image(self) -> None:
        from app.core.errors import ValidationError

        with pytest.raises(ValidationError):
            ImageProcessor().check("совсем не картинка".encode())


class TestUpload:
    async def test_server_cuts_the_variants(
        self, client: AsyncClient, database: Database, storage: MemoryStorage,
        admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            f"/api/v1/admin/tours/{catalog.obzornaya}/images",
            headers=admin_headers,
            files={"file": ("photo.jpg", make_image(), "image/jpeg")},
            data={"alt": "Соборная площадь"},
        )
        assert response.status_code == 201
        data = response.json()["data"]

        # Прислали один файл — размеры нарезал сервер.
        assert set(data["variants"]) >= {"thumb", "card", "hero", "original"}
        assert data["alt"] == "Соборная площадь"
        assert len(storage.objects) == 4

        widths = {}
        for name in ("thumb", "card", "hero"):
            key = data["variants"][name].split("/images/")[-1]
            from urllib.parse import unquote

            with Image.open(io.BytesIO(storage.objects[unquote(key)].body)) as image:
                widths[name] = image.width
        assert widths == {"thumb": 400, "card": 900, "hero": 1600}

    async def test_accepts_ready_variants(
        self, client: AsyncClient, storage: MemoryStorage, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        # Прежняя админка готовит размеры в браузере — это должно работать.
        response = await client.post(
            f"/api/v1/admin/tours/{catalog.obzornaya}/images",
            headers=admin_headers,
            files={
                "hero": ("hero.webp", make_image(1600, 1200, "WEBP"), "image/webp"),
                "card": ("card.webp", make_image(900, 675, "WEBP"), "image/webp"),
                "thumb": ("thumb.webp", make_image(400, 300, "WEBP"), "image/webp"),
            },
        )
        assert response.status_code == 201
        assert len(storage.objects) == 3

    async def test_alt_falls_back_to_title(
        self, client: AsyncClient, storage: MemoryStorage, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            f"/api/v1/admin/tours/{catalog.obzornaya}/images",
            headers=admin_headers,
            files={"file": ("photo.jpg", make_image(600, 400), "image/jpeg")},
        )
        # Пустая подпись хуже названия экскурсии: её читает скринридер.
        assert response.json()["data"]["alt"] == "Живые истории старого города"

    async def test_rejects_garbage(
        self, client: AsyncClient, storage: MemoryStorage, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            f"/api/v1/admin/tours/{catalog.obzornaya}/images",
            headers=admin_headers,
            files={"file": ("shell.jpg", b"<?php echo 1; ?>", "image/jpeg")},
        )
        # Заголовок говорит «jpeg», содержимое — нет.
        assert response.status_code == 422
        assert storage.objects == {}

    async def test_requires_a_file(
        self, client: AsyncClient, storage: MemoryStorage, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        response = await client.post(
            f"/api/v1/admin/tours/{catalog.obzornaya}/images",
            headers=admin_headers,
            data={"alt": "Без файла"},
        )
        assert response.status_code == 422

    async def test_unknown_tour(
        self, client: AsyncClient, storage: MemoryStorage, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/api/v1/admin/tours/нет-такой/images",
            headers=admin_headers,
            files={"file": ("photo.jpg", make_image(600, 400), "image/jpeg")},
        )
        assert response.status_code == 404

    async def test_needs_admin(self, client: AsyncClient, catalog: CatalogFixture) -> None:
        response = await client.post(
            f"/api/v1/admin/tours/{catalog.obzornaya}/images",
            files={"file": ("photo.jpg", make_image(600, 400), "image/jpeg")},
        )
        assert response.status_code == 401

    async def test_order_grows(
        self, client: AsyncClient, database: Database, storage: MemoryStorage,
        admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        for _ in range(2):
            await client.post(
                f"/api/v1/admin/tours/{catalog.predmeste}/images",
                headers=admin_headers,
                files={"file": ("photo.jpg", make_image(600, 400), "image/jpeg")},
            )
        async with database.session() as session:
            images = (
                await session.execute(
                    select(TourImage).where(TourImage.tour_id == catalog.predmeste)
                )
            ).scalars().all()
        # Новая фотография встаёт в конец галереи.
        assert sorted(image.sort_order for image in images) == [0, 1]


class TestManageImages:
    async def _upload(
        self, client: AsyncClient, headers: dict[str, str], tour_id: str
    ) -> str:
        response = await client.post(
            f"/api/v1/admin/tours/{tour_id}/images",
            headers=headers,
            files={"file": ("photo.jpg", make_image(600, 400), "image/jpeg")},
        )
        return response.json()["data"]["id"]

    async def test_update_alt_and_order(
        self, client: AsyncClient, database: Database, storage: MemoryStorage,
        admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        image_id = await self._upload(client, admin_headers, catalog.obzornaya)
        response = await client.patch(
            f"/api/v1/admin/images/{image_id}",
            headers=admin_headers,
            json={"alt": "Новая подпись", "sortOrder": 5},
        )
        assert response.status_code == 200

        async with database.session() as session:
            image = await session.get(TourImage, image_id)
            assert image.alt == "Новая подпись"
            assert image.sort_order == 5

    async def test_delete_removes_files_too(
        self, client: AsyncClient, database: Database, storage: MemoryStorage,
        admin_headers: dict[str, str], catalog: CatalogFixture
    ) -> None:
        image_id = await self._upload(client, admin_headers, catalog.obzornaya)
        assert len(storage.objects) == 4

        await client.delete(f"/api/v1/admin/images/{image_id}", headers=admin_headers)

        # Иначе в хранилище копится мусор, за который платят.
        assert storage.objects == {}
        async with database.session() as session:
            assert (await session.get(TourImage, image_id)) is None

    async def test_delete_unknown(
        self, client: AsyncClient, storage: MemoryStorage, admin_headers: dict[str, str]
    ) -> None:
        response = await client.delete(
            "/api/v1/admin/images/нет-такой", headers=admin_headers
        )
        assert response.status_code == 404


class TestServing:
    async def test_serves_uploaded_file(
        self, client: AsyncClient, storage: MemoryStorage, admin_headers: dict[str, str],
        catalog: CatalogFixture
    ) -> None:
        upload = await client.post(
            f"/api/v1/admin/tours/{catalog.obzornaya}/images",
            headers=admin_headers,
            files={"file": ("photo.jpg", make_image(600, 400), "image/jpeg")},
        )
        url = upload.json()["data"]["variants"]["card"]
        path = "/images/" + url.split("/images/")[-1]

        response = await client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "public, max-age=31536000, immutable"

    async def test_missing_key(self, client: AsyncClient, storage: MemoryStorage) -> None:
        assert (await client.get("/images/tours/нет/такого.jpg")).status_code == 404

    async def test_refuses_to_climb_out(
        self, client: AsyncClient, storage: MemoryStorage
    ) -> None:
        # Ключ приходит из адреса — выход за пределы хранилища закрыт.
        assert (await client.get("/images/../secret")).status_code == 404
