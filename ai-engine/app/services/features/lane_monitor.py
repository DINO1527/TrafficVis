import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)

class LaneMonitor:
    def __init__(self):
        pass

    def check_crossing(self, frame_shape, box, lane_data):
        """
        Checks if the bottom center of the vehicle bounding box has crossed the solid line.
        lane_data comes from the frontend as normalized coords: [[x1, y1], [x2, y2]]
        """
        try:
            if not lane_data or len(lane_data) < 2:
                return False

            h, w = frame_shape[:2]
            
            # Convert frontend normalized coordinates (0.0 to 1.0) to pixel coordinates
            p1 = np.array([lane_data[0][0] * w, lane_data[0][1] * h])
            p2 = np.array([lane_data[1][0] * w, lane_data[1][1] * h])

            # Get the bottom-center point of the vehicle's bounding box
            bx = (box[0] + box[2]) / 2
            by = box[3]
            vehicle_point = np.array([bx, by])

            # Calculate cross product to find which side of the line the vehicle is on
            # This logic assumes crossing from one specific side is a violation (overtaking)
            line_vec = p2 - p1
            point_vec = vehicle_point - p1
            cross_product = np.cross(line_vec, point_vec)

            # Simple threshold check: if the point is very close to the line, trigger violation
            distance = np.abs(cross_product) / np.linalg.norm(line_vec)
            
            # If the bottom of the car is within 15 pixels of the solid line, it's crossing
            if distance < 15.0:
                return True

            return False

        except Exception as e:
            logger.error(f"[LaneMonitor] Error checking lane violation: {e}", exc_info=True)
            return False

    def draw_overlay(self, frame, lane_data):
        try:
            if not lane_data or len(lane_data) < 2:
                return frame
                
            h, w = frame.shape[:2]
            x1, y1 = int(lane_data[0][0] * w), int(lane_data[0][1] * h)
            x2, y2 = int(lane_data[1][0] * w), int(lane_data[1][1] * h)

            # Draw a thick solid red line representing the restricted lane zone
            cv2.line(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            return frame
        except Exception as e:
            logger.error(f"[LaneMonitor] Error drawing overlay: {e}", exc_info=True)
            return frame