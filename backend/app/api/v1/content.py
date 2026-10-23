"""Маршруты отзывов, избранного и обращений."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import (
    ContactServiceDep,
    CurrentUserDep,
    FavoriteServiceDep,
    OptionalUserDep,
    ReviewServiceDep,
    UowDep,
)
from app.core.responses import Envelope, ok
from app.domain.schemas.content import (
    ContactRequestCreate,
    ContactRequestCreated,
    FavoriteOut,
    LatestReview,
    ReviewCreate,
    ReviewCreated,
)

router = APIRouter(tags=["content"])


@router.get("/reviews/latest")
async def latest_reviews(service: ReviewServiceDep) -> Envelope[list[LatestReview]]:
    return ok(await service.latest())


@router.post("/reviews", status_code=status.HTTP_201_CREATED)
async def create_review(
    data: ReviewCreate,
    service: ReviewServiceDep,
    user: OptionalUserDep,
    uow: UowDep,
) -> Envelope[ReviewCreated]:
    """Отзыв принимается и от гостя; у вошедшего имя берётся из профиля."""
    review = await service.create(data, user.user_id if user else None)
    await uow.commit()
    return ok(review)


@router.get("/favorites")
async def list_favorites(
    service: FavoriteServiceDep, user: CurrentUserDep
) -> Envelope[list[FavoriteOut]]:
    return ok(await service.list_mine(user.user_id))


@router.put("/favorites/{tour_id}", status_code=status.HTTP_201_CREATED)
async def add_favorite(
    tour_id: str, service: FavoriteServiceDep, user: CurrentUserDep, uow: UowDep
) -> Envelope[dict[str, bool]]:
    await service.add(user.user_id, tour_id)
    await uow.commit()
    return ok({"added": True})


@router.delete("/favorites/{tour_id}")
async def remove_favorite(
    tour_id: str, service: FavoriteServiceDep, user: CurrentUserDep, uow: UowDep
) -> Envelope[dict[str, bool]]:
    await service.remove(user.user_id, tour_id)
    await uow.commit()
    return ok({"removed": True})


@router.post("/contact", status_code=status.HTTP_201_CREATED)
async def submit_contact_request(
    data: ContactRequestCreate, service: ContactServiceDep, uow: UowDep
) -> Envelope[ContactRequestCreated]:
    created = await service.submit(data)
    await uow.commit()
    return ok(created)
