import pytest
from app.services.features.traffic_optimizer import TrafficOptimizer

def test_high_congestion():
    optimizer = TrafficOptimizer()
    
    # 16 total vehicles (High Volume), speeds averaging 10km/h (Slow)
    counts = {'dir1': 10, 'dir2': 6} 
    speeds = {'dir1': [10, 12, 8], 'dir2': [10]} 
    
    result = optimizer.update_segment('cam_1', counts, speeds)
    
    assert result['total_vehicles'] == 16
    assert result['avg_speed_kmh'] == 10
    assert result['congestion_level'] == 'HIGH'
    assert result['status_text'] == 'Heavy Traffic / Jammed'

def test_low_congestion():
    optimizer = TrafficOptimizer()
    
    # 4 vehicles (Low Volume), speeds averaging 50km/h (Fast)
    counts = {'dir1': 2, 'dir2': 2}
    speeds = {'dir1': [50, 55], 'dir2': [45, 60]}
    
    result = optimizer.update_segment('cam_2', counts, speeds)
    
    assert result['congestion_level'] == 'LOW'
    assert result['status_text'] == 'Clear Flow'