import cv2
import os
from ultralytics import YOLO

class HelmetDetector:
    def __init__(self, weights_path="weights"):
        self.model_path = f"{weights_path}/helmet_model.pt"
        self.model = None
        
        if os.path.exists(self.model_path):
            try:
                self.model = YOLO(self.model_path)
            except Exception as e:
                print(f"⚠️ Helmet Model Error: {e}")
        else:
            print(f"⚠️ Helmet Model not found at {self.model_path}")

    def check_violation(self, frame, vehicle_box):
        """
        Returns True if a rider without a helmet is detected.
        """
        if self.model is None: 
            return False

        x1, y1, x2, y2 = map(int, vehicle_box)
        h, w, _ = frame.shape
        
        # Safety checks for crop boundaries
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        # Crop the motorbike area
        motorbike_crop = frame[y1:y2, x1:x2]
        
        if motorbike_crop.size == 0: 
            return False

        # Run Inference on the crop
        results = self.model(motorbike_crop, verbose=False)
        
        for r in results:
            for cls in r.boxes.cls:
                class_id = int(cls)
                # Check your model's specific class mapping!
                # Common: 0 = Helmet, 1 = No_Helmet (Head)
                if class_id == 1: 
                    return True
                    
        return False