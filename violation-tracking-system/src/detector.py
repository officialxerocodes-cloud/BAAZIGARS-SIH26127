import cv2
import supervision as sv
from ultralytics import YOLO

# 1. Load detection model (downloads yolov8s.pt automatically on first run)
model = YOLO("yolov8s.pt")

# 2. Initialize ByteTrack tracker and annotators
tracker = sv.ByteTrack()
box_annotator = sv.BoxAnnotator()
label_annotator = sv.LabelAnnotator()
trace_annotator = sv.TraceAnnotator()

# 3. Open test video feed (replace 0 with video file path, e.g. "data/test_videos/intersection_1.mp4")
cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Run inference (filter classes for vehicles: 2: car, 3: motorcycle, 5: bus, 7: truck)
    results = model(frame, classes=[2, 3, 5, 7], verbose=False)[0]
    
    # Convert predictions to Supervision format and update tracks
    detections = sv.Detections.from_ultralytics(results)
    detections = tracker.update_with_detections(detections)

    # Format labels with tracker ID and class name
    labels = [
        f"#{tracker_id} {model.names[class_id]} {confidence:.2f}"
        for tracker_id, class_id, confidence 
        in zip(detections.tracker_id, detections.class_id, detections.confidence)
    ]

    # Annotate frame
    annotated_frame = box_annotator.annotate(scene=frame.copy(), detections=detections)
    annotated_frame = label_annotator.annotate(scene=annotated_frame, detections=detections, labels=labels)
    annotated_frame = trace_annotator.annotate(scene=annotated_frame, detections=detections)

    cv2.imshow("Multi-Vehicle Tracking", annotated_frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()