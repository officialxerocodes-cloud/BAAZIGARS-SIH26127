import os
import re
import cv2
import logging
from paddleocr import PaddleOCR

logging.getLogger("ppocr").setLevel(logging.ERROR)
ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

PLATE_REGEX = r"[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}"

def clean_text(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", text).upper()

def process_snapshots(snapshot_dir="data/snapshots"):
    if not os.path.exists(snapshot_dir):
        print(f"Directory {snapshot_dir} does not exist.")
        return

    print(f"🔍 Scanning {snapshot_dir} for license plates...\n")
    
    for filename in os.listdir(snapshot_dir):
        if not filename.endswith((".jpg", ".png")):
            continue
            
        img_path = os.path.join(snapshot_dir, filename)
        results = ocr.ocr(img_path, cls=True)
        
        print(f"🤖 RAW AI VISION FOR [{filename}]:")
        if not results or results[0] is None:
            print("   -> I see absolutely no text here.\n")
            continue
            
        # 1. Stitch all detected text boxes together
        combined_text = ""
        total_conf = 0.0
        
        for line in results[0]:
            text, conf = line[1]
            print(f"   -> Found: '{text}' (Confidence: {conf:.2f})")
            combined_text += text
            total_conf += conf
            
        # 2. Calculate average confidence and clean the combined string
        avg_conf = total_conf / len(results[0])
        cleaned_plate = clean_text(combined_text)
        
        # 3. Validate the full stitched text
        if re.search(PLATE_REGEX, cleaned_plate) or (len(cleaned_plate) >= 8 and any(c.isdigit() for c in cleaned_plate)):
            print(f"✅ FINAL EXTRACTED PLATE: {cleaned_plate} | Confidence: {avg_conf:.2f}\n")
        else:
            print(f"❌ REJECTED: Combined text '{cleaned_plate}' did not match plate format.\n")

if __name__ == "__main__":
    process_snapshots()