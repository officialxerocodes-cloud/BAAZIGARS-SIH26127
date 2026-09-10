"""GT-aware stub ANPR — deterministic per (gt_plate, camera_id, ts).
82% clean, 10% 1-edit confusable, 8% miss. Same HTTP contract as real ANPR."""
import hashlib
import random
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from common.plate import canonicalize

app = FastAPI(title="anpr-stub")

CONFUSABLE_FLIP = {
    "0": "O", "O": "0",
    "1": "I", "I": "1",
    "8": "B", "B": "8",
    "5": "S", "S": "5",
    "2": "Z", "Z": "2",
}


class RecognizeIn(BaseModel):
    crop_b64: Optional[str] = None
    gt_plate: Optional[str] = None
    camera_id: Optional[str] = None
    ts: Optional[str] = None
    image_b64: Optional[str] = None


class RecognizeOut(BaseModel):
    plate: str
    canonical: str
    confidence: float
    box: Optional[list[float]] = None


def _seeded_rng(gt: str, cam: str, ts: str) -> random.Random:
    h = hashlib.md5(f"{gt}|{cam}|{ts}".encode()).hexdigest()
    seed = int(h[:8], 16)
    return random.Random(seed)


def _one_edit_flip(canonical: str, rng: random.Random) -> str:
    if not canonical:
        return canonical
    idx = rng.randrange(len(canonical))
    c = canonical[idx]
    flip = CONFUSABLE_FLIP.get(c)
    if flip:
        return canonical[:idx] + flip + canonical[idx + 1 :]
    if c.isdigit():
        return canonical[:idx] + str(rng.randint(0, 9)) + canonical[idx + 1 :]
    return canonical[:idx] + rng.choice("ABCDEFGHJKLMNPRSTUVWXYZ") + canonical[idx + 1 :]


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "anpr-stub"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "anpr-stub"}


@app.post("/v1/recognize")
async def recognize(inp: RecognizeIn):
    gt = canonicalize(inp.gt_plate or "")
    # No GT: file/real-footage path without ground truth — hash the crop to a fake plate
    if not gt:
        raw = (inp.crop_b64 or inp.image_b64 or "")[:64]
        h = hashlib.md5(raw.encode()).hexdigest().upper()
        fake = f"DL{h[0:2]}{h[2:4]}{h[4:6]}{h[6:10]}"
        fake = fake[:6] + "".join(c if c.isdigit() else str(ord(c) % 10) for c in fake[6:10])
        return JSONResponse({"plate": fake, "canonical": fake, "confidence": 0.82})

    cam = inp.camera_id or "CAM_000"
    ts = inp.ts or "2026-01-01T00:00:00+05:30"
    rng = _seeded_rng(gt, cam, ts)
    r = rng.random()
    if r < 0.08:
        return Response(status_code=204)
    if r < 0.18:
        corrupted = _one_edit_flip(gt, rng)
        conf = round(rng.uniform(0.62, 0.78), 3)
        return JSONResponse({"plate": corrupted, "canonical": corrupted, "confidence": conf})
    conf = round(rng.uniform(0.88, 0.97), 3)
    return JSONResponse({"plate": gt, "canonical": gt, "confidence": conf})


# alias used by some clients / replay paths
@app.post("/predict")
async def predict_alias(inp: RecognizeIn):
    return await recognize(inp)


@app.post("/v1/recognize-or-miss")
async def recognize_or_miss(inp: RecognizeIn):
    return await recognize(inp)
