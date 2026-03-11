import pytest
import numpy as np
from app.services.features.lane_monitor import LaneMonitor

def test_lane_crossing_violation():
    monitor = LaneMonitor()
    
    # Mock Frame: 1000x1000 resolution
    frame_shape = (1000, 1000, 3)
    
    # Mock Lane: Horizontal line directly across the middle (y=500)
    # Frontend sends normalized coords: [x, y]
    lane_data = [[0.0, 0.5], [1.0, 0.5]] 
    
    # Mock Vehicle Box [x1, y1, x2, y2]
    # Bottom center of this box is x=500, y=505 (Just crossed the line)
    vehicle_box = [400, 400, 600, 505] 
    
    is_crossing = monitor.check_crossing(frame_shape, vehicle_box, lane_data)
    assert is_crossing == True

def test_no_lane_crossing():
    monitor = LaneMonitor()
    frame_shape = (1000, 1000, 3)
    lane_data = [[0.0, 0.5], [1.0, 0.5]] # Line at y=500
    
    # Vehicle is far above the line (bottom at y=200)
    vehicle_box = [400, 100, 600, 200] 
    
    is_crossing = monitor.check_crossing(frame_shape, vehicle_box, lane_data)
    assert is_crossing == False