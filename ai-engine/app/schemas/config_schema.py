from pydantic import BaseModel
from typing import List, Optional, Literal

# 1. Sub-models for structured data
class SpeedLimitConfig(BaseModel):
    light_vehicle: int = 60  # Cars, Bikes, TukTuks, Vans
    heavy_vehicle: int = 40  # Buses, Trucks, Heavy Machinery

class VideoSourceConfig(BaseModel):
    id: str
    label: str
    url: str
    enabled: bool
    # PID Roles: 'main' = Violation + Density, 'pre'/'post' = Density Only
    role: Literal['main', 'pre', 'post', 'none'] = 'none'
    
    # NEW: Feed Direction
    feed_direction: Literal['1_way', '2_way'] = '2_way'
    
    lane_data: List[List[float]] = [] # [[x1, y1], [x2, y2]]
    roi_polygon: List[List[float]] = []
    
    # Traffic Light Settings
    enable_traffic_light: bool = False
    min_green_time: int = 15
    max_green_time: int = 60
    junction_type: Literal['t_junction', 'four_way'] = 'four_way'
    turn_type: Literal['two_turn', 'three_turn'] = 'two_turn'
    location: Optional[dict] = None

# 2. Main System Configuration
class SystemConfig(BaseModel):
    # Feature Toggles
    enable_helmet_detection: bool = False
    enable_speed_detection: bool = False
    enable_lane_violation: bool = False
    enable_traffic_optimization: bool = False

    # Performance & Tuning
    frame_rate_limit: int = 15
    video_quality: Literal['low', 'medium', 'high'] = 'medium'
    process_every_n_frames: int = 3
    latency_mode: Literal['ultra_low', 'balanced', 'smooth'] = 'balanced'
    smoothing_factor: float = 0.5

    # Settings
    speed_limits: SpeedLimitConfig = SpeedLimitConfig()
    
    # Video Inputs (The multi-cam source of truth)
    video_sources: List[VideoSourceConfig] = []
    
    # Legacy support (optional)
    lane_line: Optional[List[List[float]]] = None