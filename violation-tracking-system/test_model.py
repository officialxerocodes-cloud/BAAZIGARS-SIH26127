from ultralytics import YOLO

# Load an existing model that you already trained
model = YOLO(r"runs\detect\runs\detect\models\plate_detector-150\weights\best.pt")

# A test image from your dataset
source_file = r"datasets\indian_plates\test\images\1000030904_jpg.rf.60be88ec89834c317d47af9f63d6f022.jpg"

print(f"Testing the model on: {source_file}")

# Run inference
results = model.predict(source=source_file, save=True, show=False)

print(f"Test completed. Results are saved in the runs/detect/predict folder!")
