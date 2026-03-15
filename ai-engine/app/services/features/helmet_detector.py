import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)

class HelmetDetector:
    def __init__(self, person_model, helmet_model):
        # person_model: Standard YOLO to detect 'person' (Class 0)
        # helmet_model: Custom YOLO to detect 'with_helmet' / 'without_helmet'
        self.person_model = person_model
        self.helmet_model = helmet_model

    def check_violation(self, frame, motorcycle_box):
        """
        Hierarchical Detection:
        1. Crops the motorcycle area.
        2. Detects Humans ('person') inside that area.
        3. Runs the helmet model specifically on the detected humans.
        Returns: (violation_found: bool, violator_head_boxes: list)
        """
        try:
            if self.helmet_model is None or self.person_model is None:
                return False, []

            vx1, vy1, vx2, vy2 = map(int, motorcycle_box)
            h, w, _ = frame.shape
            
            # Step 1: Add padding to the TOP of the motorcycle bounding box
            # to ensure we capture the upper bodies of the rider and passenger.
            box_height = vy2 - vy1
            pad_top = int(box_height * 0.6) 
            pad_sides = 30
            
            crop_y1 = max(0, vy1 - pad_top)
            crop_y2 = min(h, vy2 + 10)
            crop_x1 = max(0, vx1 - pad_sides)
            crop_x2 = min(w, vx2 + pad_sides)
            
            moto_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
            
            if moto_crop.size == 0:
                return False, []

            # Step 2: Detect Humans inside the motorcycle crop
            # Class '0' in standard COCO YOLO is 'person'
            person_results = self.person_model.predict(moto_crop, verbose=False, classes=[0])
            
            violation_found = False
            violator_boxes = []
            
            for pr in person_results:
                if len(pr.boxes) == 0:
                    continue
                    
                p_boxes = pr.boxes.xyxy.cpu().numpy()
                
                for p_box in p_boxes:
                    px1, py1, px2, py2 = map(int, p_box)
                    person_crop = moto_crop[py1:py2, px1:px2]
                    
                    if person_crop.size == 0:
                        continue
                        
                    # Step 3: Run secondary YOLO model for helmet detection ON THE PERSON
                    helmet_results = self.helmet_model.predict(person_crop, verbose=False)
                    
                    for hr in helmet_results:
                        if len(hr.boxes) == 0:
                            continue
                            
                        h_boxes = hr.boxes.xyxy.cpu().numpy()
                        classes = hr.boxes.cls.int().cpu().tolist()
                        
                        for head_box, cls in zip(h_boxes, classes):
                            class_name = self.helmet_model.names[cls].lower()
                            
                            # Target specific classes from your custom model
                            if class_name == "without_helmet" or "without" in class_name or "no_helmet" in class_name:
                                violation_found = True
                                
                                # Translate coordinates back through the hierarchies to the full frame:
                                # Head Box -> Person Crop -> Motorcycle Crop -> Original 1080p Frame
                                orig_x1 = int(head_box[0]) + px1 + crop_x1
                                orig_y1 = int(head_box[1]) + py1 + crop_y1
                                orig_x2 = int(head_box[2]) + px1 + crop_x1
                                orig_y2 = int(head_box[3]) + py1 + crop_y1
                                
                                violator_boxes.append([orig_x1, orig_y1, orig_x2, orig_y2])

            return violation_found, violator_boxes

        except Exception as e:
            logger.error(f"[HelmetDetector] Error running hierarchical helmet detection: {e}", exc_info=True)
            return False, []