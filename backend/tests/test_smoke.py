import httpx, time, asyncio, asyncpg, os, datetime, json

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://anpr:anpr@localhost:5432/anpr")
INGEST = os.getenv("INGEST_URL", "http://localhost:8000")
API = os.getenv("API_URL", "http://localhost:8002")

def test_ingest_to_trajectory():
    plate = "DL8CPYTEST99"
    cam = "CAM_001"
    ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
    r = httpx.post(f"{INGEST}/ingest/v1/events", json={
        "camera_id": cam, "ts": ts, "plate_raw": plate, "canonical": plate,
        "confidence": 0.93, "vehicle_class": "private", "ground_truth": plate
    }, timeout=5)
    assert r.status_code == 200, r.text
    time.sleep(3)
    r2 = httpx.get(f"{API}/api/vehicles/{plate}/trajectory", timeout=5)
    assert r2.status_code == 200
    traj = r2.json()
    assert len(traj) >= 1
    assert traj[0]["canonical"] == plate

def test_search_fuzzy():
    r = httpx.get(f"{API}/api/vehicles/search?q=DL8C&limit=5", timeout=5)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
