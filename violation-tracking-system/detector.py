import cv2
import os
import supervision as sv
from ultralytics import YOLO

def main():
    # 1. Setup directories
    os.makedirs("data/snapshots", exist_ok=True)
    video_path = "data/test_video.mp4" # We will need to put a sample video here
    
    # 2. Load your custom SIH model
    print("Loading custom FGVD model...")
    model = YOLO("models/fgvd_yolov8s_best.pt")

    # 3. Initialize ByteTrack and Annotators
    tracker = sv.ByteTrack()
    box_annotator = sv.BoxAnnotator(thickness=2)
    label_annotator = sv.LabelAnnotator(text_scale=0.5)
    
    # 4. Define the virtual trigger line (Adjust coordinates based on your video resolution)
    # Format: sv.Point(x, y)
    START_POINT = sv.Point(0, 400)
    END_POINT = sv.Point(1280, 400)
    line_zone = sv.LineZone(start=START_POINT, end=END_POINT)
    line_annotator = sv.LineZoneAnnotator(thickness=2, text_thickness=1, text_scale=0.5)

    # 5. Process Video Stream
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Could not open video at {video_path}. Please add a test video.")
        return

    print("🚀 Starting video inference...")
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Run YOLO inference
        results = model(frame, verbose=False)[0]
        
        # Convert YOLO results to Supervision format
        detections = sv.Detections.from_ultralytics(results)
        
        # Update tracking IDs
        detections = tracker.update_with_detections(detections)

        # Trigger line crossing logic
        crossed_in, crossed_out = line_zone.trigger(detections)

        # Save snapshots for vehicles crossing the line
        for i, (in_trigger, out_trigger) in enumerate(zip(crossed_in, crossed_out)):
            if in_trigger or out_trigger:
                track_id = detections.tracker_id[i]
                
                # Extract bounding box coordinates for cropping
                x1, y1, x2, y2 = detections.xyxy[i].astype(int)
                
                # Expand the crop slightly to ensure the whole vehicle/plate is captured
                h, w = frame.shape[:2]
                pad = 10
                crop = frame[max(0, y1-pad):min(h, y2+pad), max(0, x1-pad):min(w, x2+pad)]
                
                snapshot_path = f"data/snapshots/vehicle_{track_id}.jpg"
                if crop.size > 0:
                    cv2.imwrite(snapshot_path, crop)
                    print(f"📸 Captured vehicle #{track_id} -> {snapshot_path}")

        # Draw bounding boxes, labels, and the trigger line
        labels = [
            f"#{tracker_id} {results.names[class_id]} {conf:.2f}"
            for class_id, conf, tracker_id
            in zip(detections.class_id, detections.confidence, detections.tracker_id)
        ]
        
        annotated_frame = box_annotator.annotate(scene=frame.copy(), detections=detections)
        annotated_frame = label_annotator.annotate(scene=annotated_frame, detections=detections, labels=labels)
        annotated_frame = line_annotator.annotate(annotated_frame, line_counter=line_zone)

        # Display the output
        cv2.imshow("SIH Violation Tracker", annotated_frame)
        
        # Press 'q' to quit early
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()