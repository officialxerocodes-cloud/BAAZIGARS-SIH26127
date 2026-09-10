import os
import re
import cv2
import json
import logging
from datetime import datetime, timezone
import supervision as sv
from ultralytics import YOLO
from paddleocr import PaddleOCR

# 1. Setup Logging & Models
logging.getLogger("ppocr").setLevel(logging.ERROR)
os.makedirs("data/snapshots", exist_ok=True)
os.makedirs("data/logs", exist_ok=True)

print("⚡ Loading YOLOv8 & PaddleOCR models...")
detector = YOLO("models/fgvd_yolov8s_best.pt")
ocr = PaddleOCR(use_textline_orientation=True, lang="en")

# 2. Tracking & Trigger Config
tracker = sv.ByteTrack()
box_annotator = sv.BoxAnnotator(thickness=2)
label_annotator = sv.LabelAnnotator(text_scale=0.5)

START_POINT = sv.Point(0, 400)
END_POINT = sv.Point(1280, 400)
line_zone = sv.LineZone(start=START_POINT, end=END_POINT)
line_annotator = sv.LineZoneAnnotator(thickness=2, text_thickness=1, text_scale=0.5)

PLATE_REGEX = r"[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}"

def extract_plate(crop_img):
    """Run PaddleOCR on vehicle crop, stitch text, and return plate."""
    results = ocr.ocr(crop_img, cls=True)
    
    if not results or results[0] is None:
        return "UNKNOWN", 0.0

    combined_text = ""
    total_conf = 0.0
    
    for line in results[0]:
        text, conf = line[1]
        combined_text += text
        total_conf += conf
        
    avg_conf = total_conf / len(results[0])
    cleaned = re.sub(r"[^A-Za-z0-9]", "", combined_text).upper()
    
    if re.search(PLATE_REGEX, cleaned) or (len(cleaned) >= 8 and any(c.isdigit() for c in cleaned)):
        return cleaned, avg_conf

    return "UNKNOWN", 0.0

def dispatch_violation(track_id, vehicle_type, plate, conf, snapshot_path):
    """Generate structured event payload."""
    event = {
        "event_id": f"CAM01_{track_id}_{int(datetime.now().timestamp())}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "camera_id": "CAM_INTERSECTION_01",
        "track_id": int(track_id),
        "vehicle_type": vehicle_type,
        "license_plate": plate,
        "ocr_confidence": round(float(conf), 2),
        "violation_type": "LINE_CROSSING_VIOLATION",
        "snapshot_uri": snapshot_path,
        "status": "FLAGGED"
    }
    
    log_file = "data/logs/violations.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(event) + "\n")
        
    print(f"🚨 VIOLATION RECORDED: [{vehicle_type} #{track_id}] Plate: {plate} ({conf:.2f}) -> Logged to {log_file}")

# 3. Stream Inference Loop
cap = cv2.VideoCapture("data/test_video.mp4")
print("🚀 Live pipeline running. Press 'q' to exit.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    results = detector(frame, verbose=False)[0]
    detections = sv.Detections.from_ultralytics(results)
    detections = tracker.update_with_detections(detections)
    crossed_in, crossed_out = line_zone.trigger(detections)

    for i, (in_trig, out_trig) in enumerate(zip(crossed_in, crossed_out)):
        if in_trig or out_trig:
            track_id = detections.tracker_id[i]
            class_id = detections.class_id[i]
            vehicle_type = results.names[class_id]
            
            x1, y1, x2, y2 = detections.xyxy[i].astype(int)
            h, w = frame.shape[:2]
            pad = 10
            crop = frame[max(0, y1-pad):min(h, y2+pad), max(0, x1-pad):min(w, x2+pad)]

            if crop.size > 0:
                snap_path = f"data/snapshots/violation_{track_id}.jpg"
                cv2.imwrite(snap_path, crop)
                plate, conf = extract_plate(crop)
                dispatch_violation(track_id, vehicle_type, plate, conf, snap_path)

    labels = [
        f"#{tracker_id} {results.names[cls_id]} {conf:.2f}"
        for cls_id, conf, tracker_id
        in zip(detections.class_id, detections.confidence, detections.tracker_id)
    ]
    annotated = box_annotator.annotate(scene=frame.copy(), detections=detections)
    annotated = label_annotator.annotate(scene=annotated, detections=detections, labels=labels)
    annotated = line_annotator.annotate(annotated, line_counter=line_zone)

    cv2.imshow("Real-Time Violation Pipeline", annotated)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

print("1. Starting script...")
import os
import cv2
print("2. Loaded standard libraries...")
from ultralytics import YOLO
print("3. Loaded YOLO library...")
from paddleocr import PaddleOCR
print("4. Loaded PaddleOCR library...")

# ... rest of your code ...
print("⚡ Initializing AI Models (This takes 30 seconds)...")
detector = YOLO("models/fgvd_yolov8s_best.pt")
# ...