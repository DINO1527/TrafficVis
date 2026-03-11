import logging
import statistics

logger = logging.getLogger(__name__)

class TrafficOptimizer:
    def __init__(self):
        # Stores the general traffic flow data for each camera
        self.corridor_data = {}

    def update_segment(self, cam_id, counts, current_speeds):
        """
        Calculates road density and congestion levels for normal roads.
        Does NOT control traffic lights.
        """
        try:
            if cam_id not in self.corridor_data:
                self.corridor_data[cam_id] = {
                    'total_vehicles': 0,
                    'avg_speed_kmh': 0,
                    'congestion_level': 'LOW',
                    'status_text': 'Clear'
                }

            # Calculate total vehicles detected
            total_density = counts.get('dir1', 0) + counts.get('dir2', 0)
            
            # Calculate average speed
            all_speeds = current_speeds.get('dir1', []) + current_speeds.get('dir2', [])
            avg_speed = int(statistics.mean(all_speeds)) if all_speeds else 0

            # --- CONGESTION LOGIC ---
            level = 'LOW'
            status_text = 'Clear Flow'

            if total_density > 15:
                if avg_speed < 15:
                    level = 'HIGH'
                    status_text = 'Heavy Traffic / Jammed'
                else:
                    level = 'MEDIUM'
                    status_text = 'Dense but Moving'
            elif total_density > 7:
                level = 'MEDIUM'
                if avg_speed < 20:
                    status_text = 'Slowing Down'
                else:
                    status_text = 'Moderate Traffic'

            # Update state
            self.corridor_data[cam_id] = {
                'total_vehicles': total_density,
                'avg_speed_kmh': avg_speed,
                'congestion_level': level,
                'status_text': status_text
            }

            return self.corridor_data[cam_id]

        except Exception as e:
            logger.error(f"[TrafficOptimizer] Error updating segment for {cam_id}: {e}", exc_info=True)
            return None

    def get_corridor_status(self):
        """Returns the status of all roads for the dashboard health check."""
        try:
            status = {'junctions': {}} # Kept key name for frontend compatibility
            for cam_id, data in self.corridor_data.items():
                status['junctions'][cam_id] = data
            return status
        except Exception as e:
            logger.error(f"[TrafficOptimizer] Error getting status: {e}", exc_info=True)
            return {}