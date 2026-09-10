import os
import shutil
from pathlib import Path
base_dir = Path(r"D:\violation-tracking-system\models\fgvd\IDD_FGVD")
images_target = base_dir / "images"
print("?? Searching for image files in FGVD dataset...")
for split in ["train", "val", "test"]:
    target_split_dir = images_target / split
    target_split_dir.mkdir(parents=True, exist_ok=True)
    source_split_dir = base_dir / split
    moved_count = 0
    if source_split_dir.exists():
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.PNG"):
            for img_file in source_split_dir.rglob(ext):
                if "images" in img_file.parts:
                    continue
                dest_file = target_split_dir / img_file.name
                shutil.move(str(img_file), str(dest_file))
                moved_count += 1
    print(f"? Moved {moved_count} images into 'images/{split}'")
print("\nDataset structure ready!")
