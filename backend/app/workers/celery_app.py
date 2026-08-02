"""Celery application. Runs post-call jobs off the request path.

In the default (mock) setup the API finalizes calls inline, so Redis/Celery are
optional. Start a worker with:

    celery -A app.workers.celery_app worker --loglevel=info
"""
from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "sonari",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.post_call"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)
