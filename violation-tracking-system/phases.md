markdown_content = """# AI/CV Implementation Roadmap: City-Wide ANPR & Spatial-Temporal Analytics

This document outlines the sequential execution plan for developing the Computer Vision and AI pipeline for the multi-camera ANPR platform. It serves as a step-by-step guide from initial environment setup to the final hackathon demo integration.

---

## Phase 1: Environment Setup & Baseline Detection

**1. Initialize Development Environment**
* Setup a dedicated repository and virtual environment.
* Install core dependencies: `torch`, `torchvision`, `ultralytics` (YOLO), `supervision`, `opencv-python-headless`, `paddleocr`, and `fastapi`.
* Verify CUDA/GPU acceleration is active for local model inference.

**2. Acquire & Annotate Target Test Datasets**
* Curate a dataset of vehicle footage and Indian license plates under varying conditions (glare, rain, angled views, night).
* Prepare 3 to 4 distinct test video clips representing geographically adjacent intersections across a simulated city sector.

**3. Deploy Baseline Vehicle & Plate Detector**
* Load a pre-trained lightweight model (`YOLOv8s` or `YOLOv11s`) fine-tuned to output two critical bounding box classes: `vehicle` (car, bus, truck, motorcycle) and `license_plate`.
* Verify detection inference speeds locally on test video clips at >= 30 FPS.

---

## Phase 2: ROI Pre-processing & High-Accuracy OCR

**4. Build Plate Crop & Pre-processing Module**
* Write an automated crop handler to extract the detected `license_plate` bounding box from the high-resolution frame.
* Apply OpenCV image enhancement filters:
  * **Perspective Transform:** Deskew angled or tilted plates into flat rectangular crops.
  * **CLAHE:** Normalize extreme shadow and headlight glare.
  * **Bilateral Filtering:** Sharpen character edges while smoothing camera sensor noise.

**5. Integrate & Configure OCR Engine**
* Feed enhanced crops into `PaddleOCR` (PP-OCRv4) or `Fast-Plate-OCR`.
* Restrict character recognition to alphanumeric characters (A-Z, 0-9) to eliminate random symbol hallucinations.

**6. Implement Syntax Validation & Character Disambiguation**
* Build a regular expression validator enforcing standard Indian vehicle registration formats.
* Add deterministic position-based character correction rules:
  * Digits to letters in state/district prefix positions (e.g., `0` -> `O`, `8` -> `B`, `1` -> `I`).
  * Letters to digits in serial numeric positions (e.g., `O` -> `0`, `B` -> `8`, `Z` -> `2`).

---

## Phase 3: Frame Tracking & Macro Traffic Analytics

**7. Implement Local Vehicle Tracking**
* Wrap raw frame detections into `sv.Detections` and initialize `supervision.ByteTrack`.
* Assign persistent track IDs to ensure continuous tracking across frames, eliminating redundant OCR processing on stationary vehicles.

**8. Add Virtual Boundary Analytics**
* Define coordinate-based virtual entry/exit lines (`sv.LineZone`) across road lanes for each simulated camera feed.
* Calculate real-time traffic parameters:
  * Inflow vs. Outflow directional counts.
  * Lane occupancy and vehicle density.
  * Dwell time per vehicle to detect stationary bottlenecks.

**9. Build Visual Annotation Overlay**
* Utilize `sv.BoxAnnotator`, `sv.TraceAnnotator`, and `sv.LabelAnnotator` to generate clean, real-time video outputs.
* Display persistent vehicle trails, bounding boxes, plate text, and live counter overlays for the dashboard screen.

---

## Phase 4: Backend Pipeline & Spatial-Temporal Integration

**10. Define Structured Event Dispatcher**
* Structure an edge event payload that fires once per vehicle entry/exit event.
* Example payload:
  ```json
  {
    "camera_id": "CAM_SECTOR_62_NORTH",
    "timestamp": "2026-08-28T22:00:00Z",
    "tracker_id": 104,
    "vehicle_type": "car",
    "plate_number": "DL01AB1234",
    "ocr_confidence": 0.95,
    "direction": "northbound",
    "snapshot_path": "static/snapshots/DL01AB1234_104.jpg"
  }