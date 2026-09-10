from ultralytics import YOLO
import torch
import os

# Ensure the script always runs from its own directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def main():
    device = 0 if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    model = YOLO(r"runs/detect/models/plate_detector-4/weights/best.pt")

    model.train(
        data=r"datasets\indian_plates\data.yaml",
        epochs=150,
        imgsz=640,
        batch=8,
        device=device,
        workers=0,
        project=r"runs\detect\models",
        name="plate_detector-150",
        exist_ok=True,
        mosaic=0
    )

if __name__ == "__main__":
    main()

    