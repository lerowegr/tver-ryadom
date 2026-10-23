"""Хранилище файлов.

Фотографии остаются в Cloudflare R2: у него S3-совместимый API, и
переезжать вместе с бэкендом им незачем. Доступ спрятан за интерфейсом —
в тестах вместо сети подставляется словарь в памяти.

boto3 синхронный, поэтому вызовы уходят в отдельный поток: иначе загрузка
восьмимегабайтного файла заблокировала бы весь цикл событий, и соседние
запросы просто ждали бы.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import cached_property
from typing import Any

from app.core.config import Settings
from app.core.errors import NotFoundError


@dataclass(frozen=True, slots=True)
class StoredObject:
    body: bytes
    content_type: str


class ObjectStorage(ABC):
    @property
    @abstractmethod
    def configured(self) -> bool: ...

    @abstractmethod
    async def put(self, key: str, body: bytes, content_type: str) -> None: ...

    @abstractmethod
    async def get(self, key: str) -> StoredObject | None: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...


class R2Storage(ObjectStorage):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def configured(self) -> bool:
        return self._settings.storage_configured

    @cached_property
    def _client(self) -> Any:
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=self._settings.r2_endpoint_url,
            aws_access_key_id=self._settings.r2_access_key_id,
            aws_secret_access_key=self._settings.r2_secret_access_key,
            # R2 не знает регионов, но подпись требует указать хоть какой-то.
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )

    def _require(self) -> Any:
        if not self.configured:
            raise RuntimeError("Доступы к хранилищу не заданы")
        return self._client

    async def put(self, key: str, body: bytes, content_type: str) -> None:
        client = self._require()
        await asyncio.to_thread(
            client.put_object,
            Bucket=self._settings.r2_bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            # Содержимое по ключу не меняется — ключ включает случайную часть.
            CacheControl="public, max-age=31536000, immutable",
        )

    async def get(self, key: str) -> StoredObject | None:
        client = self._require()
        try:
            response = await asyncio.to_thread(
                client.get_object, Bucket=self._settings.r2_bucket, Key=key
            )
        except Exception as error:
            if _is_missing(error):
                return None
            raise
        body = await asyncio.to_thread(response["Body"].read)
        return StoredObject(
            body=body,
            content_type=response.get("ContentType", "application/octet-stream"),
        )

    async def delete(self, key: str) -> None:
        client = self._require()
        await asyncio.to_thread(
            client.delete_object, Bucket=self._settings.r2_bucket, Key=key
        )


class MemoryStorage(ObjectStorage):
    """Хранилище в памяти — для тестов и локального запуска без доступов."""

    def __init__(self) -> None:
        self.objects: dict[str, StoredObject] = {}

    @property
    def configured(self) -> bool:
        return True

    async def put(self, key: str, body: bytes, content_type: str) -> None:
        self.objects[key] = StoredObject(body=body, content_type=content_type)

    async def get(self, key: str) -> StoredObject | None:
        return self.objects.get(key)

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


def _is_missing(error: Exception) -> bool:
    """Отсутствующий ключ — не повод для пятисотки."""
    code = getattr(error, "response", {}).get("Error", {}).get("Code")
    return code in ("NoSuchKey", "404", "NotFound")


async def read_or_404(storage: ObjectStorage, key: str) -> StoredObject:
    stored = await storage.get(key)
    if stored is None:
        raise NotFoundError("Изображение не найдено")
    return stored
