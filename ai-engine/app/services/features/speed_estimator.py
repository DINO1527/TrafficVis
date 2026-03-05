import math

class SpeedEstimator:
    def __init__(self):
        # Calibration: How many meters is 1 pixel?
        # In a real app, this should be dynamic per camera/lane
        self.pixels_per_meter = 0.05 
    
    def estimate_speed(self, history, fps_approx=30):
        """
        Calculates speed based on the last ~1 second of movement.
        Returns: speed (int) in km/h
        """
        if len(history) < 5:
            return 0
        
        # Look back approx 1 second (or as far as possible)
        # Assuming history stores {'x':.., 'y':.., 'time':..}
        current = history[-1]
        old = history[0] 
        
        time_diff = current['time'] - old['time']
        
        # Avoid division by zero or extremely small time steps
        if time_diff < 0.2: 
            return 0

        # Euclidean distance in pixels
        pixel_dist = math.hypot(current['x'] - old['x'], current['y'] - old['y'])
        
        # Calculation
        meters = pixel_dist * self.pixels_per_meter
        speed_mps = meters / time_diff
        speed_kmh = speed_mps * 3.6
        
        return int(speed_kmh)