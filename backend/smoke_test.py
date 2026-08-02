"""Quick end-to-end smoke test of the backend (no server needed)."""
import asyncio

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app
from app.seed import ensure_seed_data


async def _prep():
    await init_db()
    await ensure_seed_data()


def main():
    asyncio.run(_prep())
    client = TestClient(app)

    print("== health ==")
    h = client.get("/api/health").json()
    print("status:", h["status"], "version:", h["version"])
    for p in h["providers"]:
        print(f"  {p['kind']:10} -> {p['provider']:16} [{p['mode']}] "
              f"available={p['available']} {p['detail']}")

    biz = client.get("/api/businesses/me").json()
    print("\n== business ==", biz["name"], "| services:", len(biz["services"]))
    bid = biz["id"]

    print("\n== dashboard stats ==")
    print(client.get("/api/dashboard/stats").json())

    print("\n== simulate a call ==")
    turns = [
        "Hi, how much is a cleaning?",
        "Great, can I book one for next Tuesday at 10am? My name is Sam.",
        "No that's all, thanks!",
    ]
    call_id = None
    for t in turns:
        r = client.post("/api/simulate/turn", json={
            "business_id": bid, "call_id": call_id, "text": t
        }).json()
        call_id = r["call_id"]
        print(f"  caller> {t}")
        print(f"  agent [{r['intent']} {r['confidence']:.2f}"
              f"{' OUTCOME=' + r['outcome'] if r['outcome'] else ''}]> {r['reply']}")
    client.post(f"/api/simulate/{call_id}/hangup")

    print("\n== bookings after call ==")
    for b in client.get("/api/bookings").json():
        print(f"  {b['start_at']}  {b['service_name']}  {b.get('customer_name')}")

    print("\n== tts preview (mock) ==")
    audio = client.get("/api/tts", params={"text": "Hello there"})
    print("  content-type:", audio.headers["content-type"], "bytes:", len(audio.content))

    print("\nOK")


if __name__ == "__main__":
    main()
