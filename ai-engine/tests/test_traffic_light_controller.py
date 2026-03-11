import pytest
import time
from unittest.mock import patch
from app.services.features.traffic_light_controller import TrafficLightController

@patch('time.time')
def test_initial_green_assignment(mock_time):
    # Mock time to start at exactly 100 seconds
    mock_time.return_value = 100.0 
    
    controller = TrafficLightController()
    counts = {'dir1': 5, 'dir2': 0}
    
    # First camera to connect should get the GREEN light
    result = controller.update_light('cam_1', enable_light=True, min_green=10, max_green=60, counts=counts)
    
    assert result['light'] == 'GREEN'
    assert controller.current_green_cam == 'cam_1'

@patch('time.time')
def test_max_green_force_switch(mock_time):
    controller = TrafficLightController()
    
    # Step 1: Initialize at time = 0
    mock_time.return_value = 0.0
    controller.update_light('cam_1', True, 10, 30, {'dir1': 5}) # Gets Green
    controller.update_light('cam_2', True, 10, 30, {'dir1': 10}) # Gets Red
    
    # Step 2: Jump time forward by 35 seconds (exceeds max_green of 30)
    mock_time.return_value = 35.0
    
    # Update cam_1. It should force a switch because 35s > 30s max_green
    controller.update_light('cam_1', True, 10, 30, {'dir1': 5})
    
    # Check that cam_1 lost the green light and cam_2 got it due to priority
    assert controller.approaches['cam_1']['light'] == 'RED'
    assert controller.approaches['cam_2']['light'] == 'GREEN'
    assert controller.current_green_cam == 'cam_2'