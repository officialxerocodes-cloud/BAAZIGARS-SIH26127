import cv2
import supervision as sv
from ultralytics import YOLO

# 1. Load YOLOv8 model (downloads weights automatically on first run)
model = YOLO("yolov8n.pt")

# 2. Set up video stream info & frame generator
video_info = sv.VideoInfo.from_video_path(video_path="test_traffic.mp4")
frame_generator = sv.get_video_frames_generator(source_path="test_traffic.mp4")

# 3. Initialize ByteTrack tracker and annotators
tracker = sv.ByteTrack()
box_annotator = sv.BoxAnnotator()
label_annotator = sv.LabelAnnotator()

# Target classes for vehicles in COCO dataset: 2 = car, 3 = motorcycle, 5 = bus, 7 = truck
VEHICLE_CLASSES = [2, 3, 5, 7]

print("Starting video processing...")

# 4. Process frame by frame and write to output_traffic.mp4
with sv.VideoSink(target_path="output_traffic.mp4", video_info=video_info) as sink:
    for frame in frame_generator:
        # Run YOLO detection
        results = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(results)

        # Filter only vehicle classes
        detections = detections[
            [class_id in VEHICLE_CLASSES for class_id in detections.class_id]
        ]

        # Update tracker to assign persistent IDs
        detections = tracker.update_with_detections(detections)

        # Create labels showing Track ID and class name
        labels = [
            f"#{tracker_id} {model.names[class_id]}"
            for class_id, tracker_id in zip(
                detections.class_id, detections.tracker_id
            )
        ]

        # Draw bounding boxes and labels on the frame
        annotated_frame = box_annotator.annotate(
            scene=frame.copy(), detections=detections
        )
        annotated_frame = label_annotator.annotate(
            scene=annotated_frame, detections=detections, labels=labels
        )

        sink.write_frame(frame=annotated_frame)

print("Finished! Output saved as output_traffic.mp4")