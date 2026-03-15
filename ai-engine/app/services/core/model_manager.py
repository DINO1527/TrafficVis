import logging
import os
import torch
from ultralytics import YOLO

logger = logging.getLogger(__name__)

def calculate_iou(boxA, boxB):
    xA, yA = max(boxA[0], boxB[0]), max(boxA[1], boxB[1])
    xB, yB = min(boxA[2], boxB[2]), min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    return interArea / float(boxAArea + boxBArea - interArea + 1e-5)

class ModelManager:
    def __init__(self, weights_path="weights"):
        self.device = self._get_nvidia_gpu()
        
        logger.info(f"Loading AI Models into {self.device} memory...")
        
        # 1. Primary Custom Model
        try:
            self.primary = YOLO(os.path.join(weights_path, "veichle_dedaction_best_model-X.pt"))
            self.primary.to(self.device)
            self.has_primary = True
        except Exception as e:
            logger.error(f"Primary model failed to load: {e}")
            self.has_primary = False

        # 2. Fallback Model (Standard YOLO11n)
        try:
            self.fallback = YOLO("yolo11n.pt") 
            self.fallback.to(self.device)
            self.has_fallback = True
        except Exception as e:
            logger.error(f"Fallback model failed to load: {e}")
            self.has_fallback = False

        # 3. Helmet Model
        try:
            self.helmet = YOLO(os.path.join(weights_path, "helmet_model.pt"))
            self.helmet.to(self.device)
        except:
            self.helmet = None

        # 4. License Plate Model
        try:
            self.plate = YOLO(os.path.join(weights_path, "license-plate-finetune-v1n.pt"))
            self.plate.to(self.device)
        except:
            self.plate = None

    def _get_nvidia_gpu(self):
        """Strictly searches for the NVIDIA RTX card, ignoring AMD integrated graphics."""
        if not torch.cuda.is_available():
            logger.warning("CUDA not available. Defaulting to CPU.")
            return 'cpu'

        for i in range(torch.cuda.device_count()):
            name = torch.cuda.get_device_name(i).lower()
            if "rtx" in name or "geforce" in name or "nvidia" in name:
                logger.info(f"✅ Locked AI to Dedicated GPU: {torch.cuda.get_device_name(i)} (Device {i})")
                os.environ['FLAGS_use_gpu'] = '1'
                return i
        
        # Fallback to device 0 if string matching fails
        logger.warning(f"Could not explicitly identify NVIDIA string. Using default GPU: {torch.cuda.get_device_name(0)}")
        return 0

    def process_vehicles(self, frame):
        """
        Runs the Primary model. If it misses vehicles, it catches them with the Fallback.
        Returns a unified list of detected vehicles to the main engine.
        """
        detected_vehicles = []
        primary_boxes_raw = []

        # 1. Run Primary Tracker
        if self.has_primary:
            results = self.primary.track(frame, persist=True, verbose=False, device=self.device)
            if results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                ids = results[0].boxes.id.int().cpu().tolist()
                classes = results[0].boxes.cls.int().cpu().tolist()
                
                for box, track_id, cls in zip(boxes, ids, classes):
                    class_name = self.primary.names[cls].lower()
                    primary_boxes_raw.append(box)
                    detected_vehicles.append({
                        'box': box, 'track_id': track_id, 'class_name': class_name, 'source': 'primary'
                    })

        # 2. Run Fallback Tracker (Only on vehicles the primary missed)
        if self.has_fallback:
            # We track fallbacks too so they can have speed & direction calculated!
            fallback_classes = [2, 3, 5, 6, 7] # Cars, Bikes, Buses, Trucks
            f_results = self.fallback.track(frame, persist=True, verbose=False, device=self.device, classes=fallback_classes)
            
            if f_results[0].boxes.id is not None:
                f_boxes = f_results[0].boxes.xyxy.cpu().numpy()
                f_ids = f_results[0].boxes.id.int().cpu().tolist()
                f_classes = f_results[0].boxes.cls.int().cpu().tolist()
                
                for f_box, f_id, f_cls in zip(f_boxes, f_ids, f_classes):
                    is_missed = True
                    for p_box in primary_boxes_raw:
                        if calculate_iou(f_box, p_box) > 0.3:
                            is_missed = False
                            break
                    
                    if is_missed:
                        class_name = self.fallback.names[f_cls].lower()
                        # Prepend 'FB_' to the ID so it doesn't conflict with primary IDs
                        detected_vehicles.append({
                            'box': f_box, 'track_id': int(f_id) + 100000, 'class_name': f"fb_{class_name}", 'source': 'fallback'
                        })

        return detected_vehicles