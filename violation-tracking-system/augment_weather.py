import os
import cv2
import albumentations as A
from pathlib import Path
import shutil
import random

# Make sure to run: pip install albumentations opencv-python

def get_weather_transforms():
    """Define a set of weather augmentations using Albumentations."""
    return A.OneOf([
        A.RandomRain(brightness_coefficient=0.9, drop_width=1, blur_value=3, p=1.0),
        A.RandomSnow(brightness_coeff=2.5, snow_point_lower=0.3, snow_point_upper=0.5, p=1.0),
        A.RandomFog(fog_coef_lower=0.3, fog_coef_upper=0.5, alpha_coef=0.08, p=1.0),
        A.RandomSunFlare(flare_roi=(0, 0, 1, 0.5), angle_lower=0, angle_upper=1, num_flare_circles_lower=1, num_flare_circles_upper=5, src_radius=200, src_color=(255, 255, 255), p=1.0),
    ], p=1.0)

def augment_dataset(images_dir, labels_dir, aug_ratio=0.5):
    """
    Augments a portion of the dataset with weather conditions.
    aug_ratio: The fraction of images to augment.
    """
    transform = get_weather_transforms()
    
    image_paths = list(Path(images_dir).glob('*.jpg')) + list(Path(images_dir).glob('*.png'))
    
    # Select a random subset to augment
    num_to_augment = int(len(image_paths) * aug_ratio)
    selected_images = random.sample(image_paths, num_to_augment)
    
    print(f"Applying weather augmentations to {num_to_augment} images out of {len(image_paths)}...")
    
    for img_path in selected_images:
        # Read image
        img = cv2.imread(str(img_path))
        if img is None:
            continue
            
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Apply weather augmentation
        augmented = transform(image=img)
        aug_img = augmented['image']
        aug_img = cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR)
        
        # Save augmented image with prefix
        new_img_name = f"weather_{img_path.name}"
        new_img_path = img_path.parent / new_img_name
        cv2.imwrite(str(new_img_path), aug_img)
        
        # Copy the corresponding label file if it exists
        label_path = Path(labels_dir) / f"{img_path.stem}.txt"
        if label_path.exists():
            new_label_path = label_path.parent / f"weather_{label_path.name}"
            shutil.copy(str(label_path), str(new_label_path))

if __name__ == "__main__":
    # Base path for your dataset
    # Adjust this path based on where your dataset is stored.
    # Looking at dataset.yaml, your dataset is at:
    dataset_base = Path(r"D:\SIHProject\citywide-ai-traffic-monitor\violation-tracking-system\datasets\indian_plates")
    
    split = "train" 
    
    images_dir = dataset_base / split / "images"
    labels_dir = dataset_base / split / "labels"
    
    if images_dir.exists() and labels_dir.exists():
        # This will duplicate 50% of your images and apply weather effects to them
        augment_dataset(images_dir, labels_dir, aug_ratio=0.5)
        print("Weather augmentation complete!")
    else:
        print(f"Directories not found:\nImages: {images_dir}\nLabels: {labels_dir}")
