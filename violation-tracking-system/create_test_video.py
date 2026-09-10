import cv2
import numpy as np
import os

os.makedirs("data/test_videos", exist_ok=True)

# Video settings
width, height = 1280, 720
fps = 30
duration = 10  # seconds
total_frames = fps * duration

# Create video writer
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('data/test_videos/synthetic_traffic.mp4', fourcc, fps, (width, height))

print(f"Creating synthetic video: {total_frames} frames...")

# Generate frames with moving rectangles (simulating vehicles)
for frame_num in range(total_frames):
    frame = np.ones((height, width, 3), dtype=np.uint8) * 150  # Gray background
    
    # Draw road
    cv2.rectangle(frame, (0, 300), (width, 500), (100, 100, 100), -1)
    
    # Draw lane lines
    for x in range(0, width, 50):
        cv2.line(frame, (x + int(frame_num * 5) % 50, 400), 
                (x + 30 + int(frame_num * 5) % 50, 400), (255, 255, 0), 2)
    
    # Draw moving vehicles (rectangles)
    car_pos_1 = (100 + frame_num * 3) % (width + 200)
    car_pos_2 = (300 + frame_num * 2) % (width + 200)
    
    # Vehicle 1
    cv2.rectangle(frame, (int(car_pos_1 - 100), 320), (int(car_pos_1 - 20), 380), (0, 0, 255), -1)
    cv2.putText(frame, "DL01AB1234", (int(car_pos_1 - 95), 360), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
    
    # Vehicle 2
    cv2.rectangle(frame, (int(car_pos_2 - 100), 420), (int(car_pos_2 - 20), 480), (0, 255, 0), -1)
    cv2.putText(frame, "DL05XY5678", (int(car_pos_2 - 95), 460), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
    
    # Add info text
    cv2.putText(frame, f"Frame: {frame_num}", (10, 30), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(frame, "Test Traffic Video", (10, height - 20), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    
    out.write(frame)
    
    if frame_num % 30 == 0:
        print(f"  Frame {frame_num}/{total_frames}")

out.release()
print("✅ Video created: data/test_videos/synthetic_traffic.mp4")
