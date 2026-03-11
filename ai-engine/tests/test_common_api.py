import pytest
from app.schemas.config_schema import SystemConfig

def test_config_schema_defaults():
    # Test that the system config initializes safely even with no inputs
    config = SystemConfig()
    
    assert config.enable_helmet_detection == False
    assert config.enable_speed_detection == False
    assert config.frame_rate_limit == 15
    assert type(config.speed_limits) == dict

def test_config_schema_updates():
    # Test updating specific configuration variables safely
    custom_data = {
        "enable_traffic_optimization": True,
        "frame_rate_limit": 30,
        "video_quality": "high"
    }
    
    config = SystemConfig(**custom_data)
    
    assert config.enable_traffic_optimization == True
    assert config.frame_rate_limit == 30
    assert config.video_quality == "high"
