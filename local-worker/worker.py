from __future__ import annotations

import io
import json
import math
import os
import platform
import re
import socket
import sys
import time
from dataclasses import dataclass
from typing import Any

import httpx
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


SERVER_URL = os.environ.get("MANGALENS_SERVER_URL", "").rstrip("/")
WORKER_TOKEN = os.environ.get("MANGALENS_WORKER_TOKEN", "").strip()
WORKER_ID = os.environ.get(
    "MANGALENS_WORKER_ID", f"{socket.gethostname()}-{platform.machine()}"
).strip()[:120]
POLL_SECONDS = max(1.0, float(os.getenv("MANGALENS_POLL_SECONDS", "5")))
HEARTBEAT_SECONDS = max(
    5.0, float(os.getenv("MANGALENS_HEARTBEAT_SECONDS", "10"))
)
MIN_CONFIDENCE = min(
    1.0, max(0.0, float(os.getenv("MANGALENS_MIN_CONFIDENCE", "0.35")))
)
USE_MANGA_OCR = env_bool("MANGALENS_MANGA_OCR", True)
JAPANESE_SCRIPT = re.compile(r"[\u3040-\u30ff]")


@dataclass
class DetectedLine:
    left: float
    top: float
    right: float
    bottom: float
    text: str
    confidence: float

    @property
    def width(self) -> float:
        return max(1.0, self.right - self.left)

    @property
    def height(self) -> float:
        return max(1.0, self.bottom - self.top)


def result_payload(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", None)
    if callable(payload):
        payload = payload()
    if payload is None and hasattr(result, "to_json"):
        payload = result.to_json()
    if isinstance(payload, str):
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        raise RuntimeError("Unsupported PaddleOCR result format")
    nested = payload.get("res")
    return nested if isinstance(nested, dict) else payload


def polygon_box(polygon: Any) -> tuple[float, float, float, float]:
    points = np.asarray(polygon, dtype=float).reshape(-1, 2)
    return (
        float(points[:, 0].min()),
        float(points[:, 1].min()),
        float(points[:, 0].max()),
        float(points[:, 1].max()),
    )


def boxes_touch(left: DetectedLine, right: DetectedLine) -> bool:
    overlap_x = max(0.0, min(left.right, right.right) - max(left.left, right.left))
    overlap_y = max(0.0, min(left.bottom, right.bottom) - max(left.top, right.top))
    overlap_x_ratio = overlap_x / max(1.0, min(left.width, right.width))
    overlap_y_ratio = overlap_y / max(1.0, min(left.height, right.height))
    vertical_gap = max(0.0, max(left.top, right.top) - min(left.bottom, right.bottom))
    horizontal_gap = max(
        0.0, max(left.left, right.left) - min(left.right, right.right)
    )
    return (
        overlap_x_ratio >= 0.25
        and vertical_gap <= min(left.height, right.height) * 0.8
    ) or (
        overlap_y_ratio >= 0.25
        and horizontal_gap <= min(left.width, right.width) * 0.8
    )


def group_lines(lines: list[DetectedLine]) -> list[list[DetectedLine]]:
    parents = list(range(len(lines)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    for left in range(len(lines)):
        for right in range(left + 1, len(lines)):
            if boxes_touch(lines[left], lines[right]):
                union(left, right)

    groups: dict[int, list[DetectedLine]] = {}
    for index, line in enumerate(lines):
        groups.setdefault(find(index), []).append(line)
    return list(groups.values())


class OcrEngine:
    def __init__(self) -> None:
        print("Loading PaddleOCR CPU models…", flush=True)
        self.paddle = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            engine="paddle",
        )
        self.manga = None
        if USE_MANGA_OCR:
            try:
                from manga_ocr import MangaOcr

                print("Loading manga-ocr Japanese model…", flush=True)
                self.manga = MangaOcr()
            except Exception as error:  # noqa: BLE001
                print(
                    f"manga-ocr unavailable; Paddle recognition will be used: {error}",
                    file=sys.stderr,
                    flush=True,
                )
        print("OCR worker models are ready.", flush=True)

    def detect(self, image: Image.Image) -> list[dict[str, Any]]:
        rgb = image.convert("RGB")
        predictions = list(self.paddle.predict(np.asarray(rgb)))
        if not predictions:
            return []
        payload = result_payload(predictions[0])
        raw_texts = payload.get("rec_texts")
        raw_scores = payload.get("rec_scores")
        texts = list(raw_texts) if raw_texts is not None else []
        scores = list(raw_scores) if raw_scores is not None else []
        boxes = payload.get("rec_boxes")
        polygons = payload.get("rec_polys")
        if polygons is None:
            polygons = payload.get("dt_polys")
        lines: list[DetectedLine] = []

        for index, raw_text in enumerate(texts):
            text = str(raw_text or "").strip()
            confidence = float(scores[index]) if index < len(scores) else 0.5
            if (
                not text
                or not math.isfinite(confidence)
                or confidence < MIN_CONFIDENCE
            ):
                continue
            if boxes is not None and index < len(boxes):
                left, top, right, bottom = map(float, boxes[index][:4])
            elif polygons is not None and index < len(polygons):
                left, top, right, bottom = polygon_box(polygons[index])
            else:
                continue
            if right <= left or bottom <= top:
                continue
            lines.append(
                DetectedLine(left, top, right, bottom, text, confidence)
            )

        output: list[dict[str, Any]] = []
        width, height = rgb.size
        for index, group in enumerate(group_lines(lines)):
            left = max(0.0, min(line.left for line in group))
            top = max(0.0, min(line.top for line in group))
            right = min(float(width), max(line.right for line in group))
            bottom = min(float(height), max(line.bottom for line in group))
            padding = max(2.0, min(right - left, bottom - top) * 0.08)
            crop_box = (
                int(max(0, left - padding)),
                int(max(0, top - padding)),
                int(min(width, right + padding)),
                int(min(height, bottom + padding)),
            )
            group_width, group_height = right - left, bottom - top
            if group_height > group_width * 1.2:
                ordered = sorted(group, key=lambda line: (-line.left, line.top))
            else:
                ordered = sorted(group, key=lambda line: (line.top, line.left))
            text = " ".join(line.text for line in ordered).strip()
            # manga-ocr is specialized for Japanese. Running it over Latin text
            # can replace an otherwise correct Paddle result with gibberish.
            if self.manga is not None and JAPANESE_SCRIPT.search(text):
                try:
                    recognized = str(self.manga(rgb.crop(crop_box))).strip()
                    if recognized:
                        text = recognized
                except Exception as error:  # noqa: BLE001
                    print(
                        f"manga-ocr crop failed; using Paddle text: {error}",
                        file=sys.stderr,
                        flush=True,
                    )
            if not text:
                continue
            normalized = [
                round(max(0, min(1000, (top / height) * 1000))),
                round(max(0, min(1000, (left / width) * 1000))),
                round(max(0, min(1000, (bottom / height) * 1000))),
                round(max(0, min(1000, (right / width) * 1000))),
            ]
            # A valid pixel box can collapse after normalization on very large
            # pages. Keep every submitted box at least one normalized unit wide.
            if normalized[2] <= normalized[0]:
                normalized[0] = min(normalized[0], 999)
                normalized[2] = normalized[0] + 1
            if normalized[3] <= normalized[1]:
                normalized[1] = min(normalized[1], 999)
                normalized[3] = normalized[1] + 1
            output.append(
                {
                    "id": f"ocr-{index + 1}",
                    "box_2d": normalized,
                    "original_text": text[:5000],
                    "confidence": sum(line.confidence for line in group)
                    / len(group),
                    "type": "speech",
                }
            )
        if len(output) > 200:
            output = sorted(
                output,
                key=lambda item: float(item["confidence"]),
                reverse=True,
            )[:200]
            output.sort(key=lambda item: (item["box_2d"][0], item["box_2d"][1]))
        return output


def validate_config() -> None:
    if not SERVER_URL.startswith(("https://", "http://localhost", "http://127.0.0.1")):
        raise RuntimeError(
            "MANGALENS_SERVER_URL must use HTTPS (HTTP is allowed only for localhost)"
        )
    if len(WORKER_TOKEN) < 32:
        raise RuntimeError("MANGALENS_WORKER_TOKEN must contain at least 32 characters")


def main() -> None:
    validate_config()
    headers = {
        "Authorization": f"Bearer {WORKER_TOKEN}",
        "X-Worker-ID": WORKER_ID,
    }
    engine = OcrEngine()
    print(f"Worker {WORKER_ID} polling {SERVER_URL}", flush=True)
    last_heartbeat = 0.0

    with httpx.Client(headers=headers, timeout=120.0, follow_redirects=False) as client:
        while True:
            job_id: str | None = None
            try:
                now = time.monotonic()
                if now - last_heartbeat >= HEARTBEAT_SECONDS:
                    heartbeat = client.post(
                        f"{SERVER_URL}/api/local-ocr/worker/heartbeat"
                    )
                    heartbeat.raise_for_status()
                    last_heartbeat = now
                claim = client.post(
                    f"{SERVER_URL}/api/local-ocr/worker/jobs/claim"
                )
                if claim.status_code == 204:
                    time.sleep(POLL_SECONDS)
                    continue
                claim.raise_for_status()
                job = claim.json()["job"]
                job_id = str(job["id"])
                print(f"Claimed OCR job {job_id}", flush=True)

                image_response = client.get(
                    f"{SERVER_URL}{job['imageUrl']}"
                )
                image_response.raise_for_status()
                with Image.open(io.BytesIO(image_response.content)) as image:
                    ocr_started = time.monotonic()
                    bubbles = engine.detect(image)
                    ocr_duration_ms = round(
                        (time.monotonic() - ocr_started) * 1000
                    )
                if not bubbles:
                    raise RuntimeError("No OCR text was detected")

                complete = client.post(
                    f"{SERVER_URL}/api/local-ocr/worker/jobs/{job_id}/complete",
                    json={
                        "bubbles": bubbles,
                        "metadata": {
                            "engine": "PaddleOCR PP-OCRv6",
                            "device": (
                                "CPU + Apple MPS"
                                if engine.manga is not None
                                else "CPU"
                            ),
                            "durationMs": ocr_duration_ms,
                            "regions": len(bubbles),
                            "mangaOcrEnabled": engine.manga is not None,
                        },
                    },
                    timeout=300.0,
                )
                if not complete.is_success:
                    raise RuntimeError(
                        f"OCR completion HTTP {complete.status_code}: "
                        f"{complete.text[:1000]}"
                    )
                print(
                    f"Completed OCR job {job_id} with {len(bubbles)} text regions",
                    flush=True,
                )
            except KeyboardInterrupt:
                print("Worker stopped.", flush=True)
                return
            except Exception as error:  # noqa: BLE001
                print(f"Worker cycle failed: {error}", file=sys.stderr, flush=True)
                if job_id:
                    try:
                        client.post(
                            f"{SERVER_URL}/api/local-ocr/worker/jobs/{job_id}/fail",
                            json={"error": str(error)[:500]},
                            timeout=30.0,
                        )
                    except Exception:
                        pass
                time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
