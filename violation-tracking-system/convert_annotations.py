import os
import xml.etree.ElementTree as ET
from pathlib import Path

# Base dataset paths (adjust if your folder path is different)
DATASET_ROOT = Path(r"D:\violation-tracking-system\models\fgvd\IDD_FGVD")  # Update to point to your extracted FGVD directory
SPLITS = ["train", "val", "test"]

# Define coarse vehicle classes for traffic tracking
CLASS_MAPPING = {
    "car": 0,
    "motorcycle": 1,
    "scooter": 2,
    "truck": 3,
    "autorickshaw": 4,
    "bus": 5,
    "mini-bus": 6,
}

def convert_bbox(size, box):
    dw = 1.0 / size[0]
    dh = 1.0 / size[1]
    x_center = (box[0] + box[1]) / 2.0
    y_center = (box[2] + box[3]) / 2.0
    w = box[1] - box[0]
    h = box[3] - box[2]
    return (x_center * dw, y_center * dh, w * dw, h * dh)

def convert_xml_to_yolo(xml_file, output_txt_file):
    tree = ET.parse(xml_file)
    root = tree.getroot()
    
    size = root.find("size")
    if size is None:
        return
    
    width = int(size.find("width").text)
    height = int(size.find("height").text)
    
    if width == 0 or height == 0:
        return

    yolo_lines = []
    for obj in root.iter("object"):
        cls_name = obj.find("name").text.strip().lower()
        
        # Match class name or check substring match (e.g., matching fine-grained names to coarse types)
        cls_id = None
        for key, val in CLASS_MAPPING.items():
            if key in cls_name:
                cls_id = val
                break
        
        if cls_id is None:
            continue
            
        xmlbox = obj.find("bndbox")
        b = (
            float(xmlbox.find("xmin").text),
            float(xmlbox.find("xmax").text),
            float(xmlbox.find("ymin").text),
            float(xmlbox.find("ymax").text),
        )
        bb = convert_bbox((width, height), b)
        yolo_lines.append(f"{cls_id} {' '.join([f'{a:.6f}' for a in bb])}\n")

    if yolo_lines:
        with open(output_txt_file, "w") as f:
            f.writelines(yolo_lines)

def run_conversion():
    for split in SPLITS:
        annos_dir = DATASET_ROOT / split / "annos"
        labels_dir = DATASET_ROOT / "labels" / split
        
        # If annos is directly inside the split directory or subfolder
        if not annos_dir.exists():
            # Search recursively for annos folder
            found = list(DATASET_ROOT.rglob(f"*{split}*/annos"))
            if found:
                annos_dir = found[0]
            else:
                continue

        labels_dir.mkdir(parents=True, exist_ok=True)
        xml_files = list(annos_dir.glob("*.xml"))
        print(f"Converting {len(xml_files)} XML files in {split}...")

        for xml_file in xml_files:
            txt_filename = xml_file.stem + ".txt"
            output_path = labels_dir / txt_filename
            convert_xml_to_yolo(xml_file, output_path)

    print("✅ Conversion completed successfully!")

if __name__ == "__main__":
    run_conversion()