import os
from roboflow import Roboflow
from ultralytics import YOLO

def main():
    # 1. Connect to Roboflow and point to the already-downloaded dataset
    rf = Roboflow(api_key="L2Mw3WWqfbA9l1nMFOat")
    project = rf.workspace("m-8rhdp").project("indian-number-plate-bkmfo")
    dataset = project.version(1).download("yolov8", location="./datasets/indian_plates")

    # 2. Initialize YOLOv8 Nano base model
    model = YOLO("yolov8n.pt")

    # 3. Train the model
    print("🚀 Starting Fine-Tuning on Indian Plates...")
    results = model.train(
        data=os.path.join(dataset.location, "data.yaml"),
        epochs=50,
        imgsz=640,
        batch=16,
        workers=0,
        device =0,              # Prevents Windows multiprocessing bottlenecks
        project="models",
        name="plate_detector"
    )

    print("✅ Training Complete! Weights saved to: models/plate_detector/weights/best.pt")

if __name__ == "__main__":
    main()