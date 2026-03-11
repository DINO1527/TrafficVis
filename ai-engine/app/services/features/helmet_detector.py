import logging
import cv2

logger = logging.getLogger(__name__)

class HelmetDetector:
    def __init__(self, helmet_model):
        self.helmet_model = helmet_model

    def check_violation(self, frame, motorcycle_box):
        """
        Crops the motorcycle, runs the secondary helmet model.
        Returns True if a person is found WITHOUT a helmet (Violation).
        Returns False if they have a helmet or if inference fails.
        """
        try:
            if self.helmet_model is None:
                return False

            vx1, vy1, vx2, vy2 = map(int, motorcycle_box)
            h, w, _ = frame.shape
            
            # Add padding to the crop
            pad = 20
            crop = frame[max(0, vy1-pad):min(h, vy2+pad), max(0, vx1-pad):min(w, vx2+pad)]
            
            if crop.size == 0:
                return False

            # Run secondary YOLO model for helmet detection
            results = self.helmet_model(crop, verbose=False)
            
            violation_found = False
            for r in results:
                for box, cls in zip(r.boxes.xyxy, r.boxes.cls):
                    class_name = self.helmet_model.names[int(cls)].lower()
                    
                    # Check the model classes. Usually models have "no_helmet" or "helmet"
                    if "no_helmet" in class_name or "without" in class_name:
                        violation_found = True
                        break

            return violation_found

        except Exception as e:
            logger.error(f"[HelmetDetector] Error running helmet detection: {e}", exc_info=True)
            return False