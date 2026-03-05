import os
from huggingface_hub import hf_hub_download
from ultralytics import YOLO

# Create the weights directory
os.makedirs("weights", exist_ok=True)

print("--- Starting Model Downloads ---")

# 1. General Vehicle Detection (YOLOv11 Nano)
print("Downloading YOLOv11n...")
yolo_model = YOLO("yolo11n.pt") 

# 2. Helmet Detection
print("Downloading Helmet Detection Model...")
hf_hub_download(
    repo_id="sharathhhhh/safetyHelmet-detection-yolov8",
    filename="best.pt",
    local_dir="weights"
)
# Rename for clarity
if os.path.exists("weights/best.pt"):
    os.rename("weights/best.pt", "weights/helmet_model.pt")

# 3. License Plate Detection (YOLOv11 Nano version)
print("Downloading License Plate Model...")
hf_hub_download(
    repo_id="morsetechlab/yolov11-license-plate-detection",
    filename="license-plate-finetune-v1n.pt",
    local_dir="weights"
)

print("\n--- Success! ---")
print("Files in /weights:")
print(os.listdir("weights"))