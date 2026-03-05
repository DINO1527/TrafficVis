import cv2
import numpy as np

class LaneMonitor:
    def __init__(self):
        pass # Stateless now, line data comes with the frame

    def is_below_line(self, point, line_start, line_end):
        """
        Uses Cross Product to determine if a point is 'below' or 'past' the line.
        """
        x, y = point
        x1, y1 = line_start
        x2, y2 = line_end
        
        # Cross Product check
        val = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
        return val > 0

    def check_crossing(self, frame_size, vehicle_box, lane_points):
        """
        Returns True if vehicle crosses the specific lane_points provided.
        lane_points: [[x1, y1], [x2, y2]] (Normalized 0.0-1.0)
        """
        if not lane_points or len(lane_points) < 2:
            return False

        h, w = frame_size
        x1, y1, x2, y2 = vehicle_box
        
        # Vehicle Footprint (Bottom Center)
        foot_x = (x1 + x2) / 2
        foot_y = y2

        # Convert normalized line coords to pixels
        p1_x, p1_y = lane_points[0][0] * w, lane_points[0][1] * h
        p2_x, p2_y = lane_points[1][0] * w, lane_points[1][1] * h
        
        return self.is_below_line((foot_x, foot_y), (p1_x, p1_y), (p2_x, p2_y))

    def draw_overlay(self, frame, lane_points):
        """Draws the specific line for this camera"""
        if not lane_points or len(lane_points) < 2:
            return frame

        h, w, _ = frame.shape
        p1 = (int(lane_points[0][0] * w), int(lane_points[0][1] * h))
        p2 = (int(lane_points[1][0] * w), int(lane_points[1][1] * h))
        
        # Draw Line
        cv2.line(frame, p1, p2, (0, 0, 255), 2)
        cv2.circle(frame, p1, 4, (0, 255, 255), -1)
        cv2.circle(frame, p2, 4, (0, 255, 255), -1)
        
        return frame