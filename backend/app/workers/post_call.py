"""Post-call background job: finalize transcript, summary, notify owner.

The heavy lifting (summary + outcome) lives in ``call_service.finalize_call``.
This task wraps it for Celery and triggers the owner notification.
"""
from __future__ import annotations

import asyncio

from app.db import SessionLocal
from app.mcp_tools.notify_server import send_owner_summary
from app.services.call_service import finalize_call
from app.workers.celery_app import celery_app


async def _run(call_id: str) -> None:
    async with SessionLocal() as db:
        await finalize_call(db, call_id)
        await db.commit()
    await send_owner_summary(call_id)


@celery_app.task(name="post_call.process")
def process_call(call_id: str) -> None:
    asyncio.run(_run(call_id))
