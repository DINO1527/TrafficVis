import pytest
import numpy as np
from unittest.mock import MagicMock
from app.services.features.helmet_detector import HelmetDetector

class MockYOLOResult:
    def __init__(self, class_names):
        self.boxes = MagicMock()
        self.boxes.xyxy = [[0, 0, 10, 10]] * len(class_names)
        self.boxes.cls = [i for i in range(len(class_names))]
        
def test_helmet_violation_detected():
    # Create a fake YOLO model that returns "no_helmet"
    mock_model = MagicMock()
    mock_model.names = {0: "no_helmet"}
    
    # Setup mock return values
    mock_result = MockYOLOResult(["no_helmet"])
    mock_model.return_value = [mock_result]
    
    detector = HelmetDetector(helmet_model=mock_model)
    
    # Create fake image and bounding box
    fake_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    motorcycle_box = [10, 10, 50, 50]
    
    is_violation = detector.check_violation(fake_frame, motorcycle_box)
    assert is_violation == True

def test_helmet_compliant():
    # Fake model returns "helmet"
    mock_model = MagicMock()
    mock_model.names = {0: "helmet"}
    mock_result = MockYOLOResult(["helmet"])
    mock_model.return_value = [mock_result]
    
    detector = HelmetDetector(helmet_model=mock_model)
    fake_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    
    is_violation = detector.check_violation(fake_frame, [10, 10, 50, 50])
    assert is_violation == False
