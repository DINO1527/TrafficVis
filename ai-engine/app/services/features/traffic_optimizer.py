import time
from collections import deque

class DirectionOptimizer:
    """Handles Smoothing and Logic for ONE specific direction of a single camera."""
    def __init__(self, capacity=20):
        self.capacity = capacity
        # Moving Average buffers (approx 30 seconds of history)
        self.count_history = deque(maxlen=30) 
        self.speed_history = deque(maxlen=30)
        
        # PID Coefficients for density stabilization
        self.Kp = 0.5
        self.Ki = 0.1
        self.Kd = 0.05
        
        self.prev_error = 0
        self.integral = 0
        self.last_time = time.time()
        self.smoothed_density = 0.0

    def update(self, count, speeds):
        self.count_history.append(count)
        
        # Parked Vehicle Logic: 
        # 'speeds' only contains vehicles moving > 3km/h. 
        if len(speeds) > 0:
            # Traffic is flowing, get the average of moving cars
            self.speed_history.append(sum(speeds)/len(speeds))
        elif count > 5: 
            # High volume of cars but NO moving speeds = Traffic Jam / Gridlock
            self.speed_history.append(0)
        # If count is low and no speeds, they are likely just parked side-cars. Ignore them.
        
        ma_count = sum(self.count_history) / len(self.count_history)
        raw_density = min(ma_count / self.capacity, 1.0)
        
        # PID Controller to stabilize UI flickering
        current_time = time.time()
        dt = max(current_time - self.last_time, 0.1)
        error = raw_density - self.smoothed_density
        
        self.integral += error * dt
        derivative = (error - self.prev_error) / dt
        
        adjustment = (self.Kp * error) + (self.Ki * self.integral) + (self.Kd * derivative)
        
        self.smoothed_density += adjustment
        self.smoothed_density = max(0.0, min(1.0, self.smoothed_density))
        
        self.prev_error = error
        self.last_time = current_time

    def get_avg_speed(self):
        if not self.speed_history: return 0
        return int(sum(self.speed_history) / len(self.speed_history))
        
    def get_avg_count(self):
        if not self.count_history: return 0
        return int(sum(self.count_history) / len(self.count_history))

class CorridorOptimizer:
    """Dynamically combines ANY number of cameras into two directional statuses."""
    def __init__(self):
        # Dynamic dictionary: { 'cam_id': { 'dir1': DirectionOptimizer, 'dir2': DirectionOptimizer } }
        self.segments = {}

    def _ensure_segment(self, cam_id):
        if cam_id not in self.segments:
            self.segments[cam_id] = {
                'dir1': DirectionOptimizer(capacity=20), # e.g. Lane 1 (Down)
                'dir2': DirectionOptimizer(capacity=20)  # e.g. Lane 2 (Up)
            }

    def update_segment(self, cam_id, counts_dict, speeds_dict):
        """Called every frame by the Traffic Engine for each active camera"""
        self._ensure_segment(cam_id)
        self.segments[cam_id]['dir1'].update(counts_dict.get('dir1', 0), speeds_dict.get('dir1', []))
        self.segments[cam_id]['dir2'].update(counts_dict.get('dir2', 0), speeds_dict.get('dir2', []))

    def _calculate_direction_status(self, direction_key):
        total_density = 0.0
        total_vehicles = 0
        total_speed = 0
        active_cams = 0

        for cam_id, dirs in self.segments.items():
            opt = dirs[direction_key]
            if len(opt.count_history) > 0:
                total_density += opt.smoothed_density
                total_vehicles += opt.get_avg_count()
                total_speed += opt.get_avg_speed()
                active_cams += 1

        if active_cams == 0:
            return {
                "status_text": "Waiting for Data", 
                "congestion_level": "LOW",
                "density": 0.0, 
                "avg_speed_kmh": 0, 
                "total_vehicles": 0
            }
        
        # Average the values across all active cameras
        avg_density = total_density / active_cams
        overall_avg_speed = int(total_speed / active_cams)
        
        # Determine Status
        if avg_density < 0.35:
            msg, level = "Flowing Freely", "LOW"
        elif avg_density < 0.70:
            msg, level = "Moderate Traffic", "MEDIUM"
        else:
            msg, level = "Heavy Congestion", "HIGH"

        return {
            "status_text": msg,
            "congestion_level": level,
            "density": round(avg_density, 2),
            "avg_speed_kmh": overall_avg_speed,
            "total_vehicles": total_vehicles
        }

    def get_corridor_status(self):
        """Returns the split dual-lane status to the API"""
        return {
            "dir1": self._calculate_direction_status('dir1'),
            "dir2": self._calculate_direction_status('dir2')
        }