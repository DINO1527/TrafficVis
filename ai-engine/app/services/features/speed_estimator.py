import logging
import math
import time

logger = logging.getLogger(__name__)

class SpeedEstimator:
    def __init__(self, pixels_per_meter=25.0):
        # A rough calibration: how many pixels represent 1 meter in the real world.
        # Ideally, this should be dynamically calculated based on camera angle/calibration.
        self.ppm = pixels_per_meter

    def estimate_speed(self, history):
        """
        Calculates speed based on the history of vehicle bounding box centers.
        history format: [{'x': cx, 'y': cy, 'time': timestamp}, ...]
        """
        try:
            if not history or len(history) < 5:
                return 0

            # Compare the oldest point in history with the newest point
            p1 = history[0]
            p2 = history[-1]

            # Calculate Euclidean distance in pixels
            dist_pixels = math.hypot(p2['x'] - p1['x'], p2['y'] - p1['y'])
            
            # Convert to meters
            dist_meters = dist_pixels / self.ppm
            
            # Calculate time difference in seconds
            time_diff = p2['time'] - p1['time']
            
            if time_diff <= 0:
                return 0
                
            # Speed in meters per second (m/s)
            speed_mps = dist_meters / time_diff
            
            # Convert m/s to km/h
            speed_kmh = speed_mps * 3.6
            
            return round(speed_kmh, 1)

        except Exception as e:
            logger.error(f"[SpeedEstimator] Error calculating speed: {e}", exc_info=True)
            return 0