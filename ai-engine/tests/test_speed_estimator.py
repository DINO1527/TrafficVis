import pytest
from app.services.features.speed_estimator import SpeedEstimator

def test_speed_calculation_normal():
    # Setup: 25 pixels = 1 meter
    estimator = SpeedEstimator(pixels_per_meter=25.0)
    
    # Mock history: Vehicle moves 25 pixels in 1 second (1 m/s = 3.6 km/h)
    mock_history = [
        {'x': 0, 'y': 0, 'time': 1.0},
        {'x': 5, 'y': 0, 'time': 1.2},
        {'x': 10, 'y': 0, 'time': 1.4},
        {'x': 15, 'y': 0, 'time': 1.6},
        {'x': 25, 'y': 0, 'time': 2.0} # Last point
    ]
    
    speed_kmh = estimator.estimate_speed(mock_history)
    assert speed_kmh == 3.6

def test_speed_calculation_stationary():
    estimator = SpeedEstimator(pixels_per_meter=25.0)
    
    # Mock history: Vehicle does not move
    mock_history = [
        {'x': 10, 'y': 10, 'time': 1.0},
        {'x': 10, 'y': 10, 'time': 2.0}
    ]
    
    speed_kmh = estimator.estimate_speed(mock_history)
    assert speed_kmh == 0.0

def test_speed_insufficient_history():
    estimator = SpeedEstimator()
    assert estimator.estimate_speed([]) == 0
    assert estimator.estimate_speed([{'x': 0, 'y': 0, 'time': 1.0}]) == 0