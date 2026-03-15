import logging
import math

logger = logging.getLogger(__name__)

class DirectionAnalyzer:
    def __init__(self):
        # Stores the "Dominant Axis" for each camera (horizontal or vertical)
        # This prevents diagonal camera angles from confusing the system.
        self.camera_axes = {}

    def analyze_direction(self, cam_id, history):
        """
        Determines if a vehicle is moving in dir1 or dir2 based on the camera's unique perspective.
        """
        if len(history) < 5:
            return 'dir1' # Default fallback until we have enough trajectory data

        # Get movement vector from oldest to newest point
        start_pt = history[0]
        end_pt = history[-1]
        
        dx = end_pt['x'] - start_pt['x']
        dy = end_pt['y'] - start_pt['y']

        # 1. Self-Calibrate the Camera Axis (Only happens for the first few vehicles)
        if cam_id not in self.camera_axes:
            if abs(dx) > abs(dy):
                self.camera_axes[cam_id] = 'horizontal'
                logger.info(f"[Direction] Calibrated Camera {cam_id} as HORIZONTAL axis.")
            else:
                self.camera_axes[cam_id] = 'vertical'
                logger.info(f"[Direction] Calibrated Camera {cam_id} as VERTICAL axis.")

        axis = self.camera_axes[cam_id]

        # 2. Assign Direction based on the calibrated axis
        if axis == 'horizontal':
            return 'dir1' if dx > 0 else 'dir2' # Right vs Left
        else:
            return 'dir1' if dy > 0 else 'dir2' # Down vs Up