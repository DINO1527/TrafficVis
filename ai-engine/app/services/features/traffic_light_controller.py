import logging
import time

logger = logging.getLogger(__name__)

class TrafficLightController:
    def __init__(self):
        # Manages multiple cameras (approaches) at a single junction for light timing
        self.approaches = {} 
        self.current_green_cam = None
        self.last_switch_time = time.time()

    def _register_approach(self, cam_id):
        """Initializes state for a new camera feed joining the junction."""
        if cam_id not in self.approaches:
            self.approaches[cam_id] = {
                'light': 'RED',
                'density': 0,                   # Number of waiting vehicles/queue length
                'red_start_time': time.time(),  # Tracks how long vehicles have been waiting
                'green_start_time': 0
            }

    def update_light(self, cam_id, enable_light, min_green, max_green, counts):
        """
        Dynamic, shared traffic light controller for a multi-way junction.
        Evaluates queue lengths and waiting times to intelligently assign green lights.
        """
        try:
            # If the user hasn't enabled the traffic light feature for this cam, ignore it
            if not enable_light:
                return None

            now = time.time()
            self._register_approach(cam_id)
            
            # Update the real-time queue length (density) for this specific approach
            total_density = counts.get('dir1', 0) + counts.get('dir2', 0)
            self.approaches[cam_id]['density'] = total_density

            # System Initialization: If no camera has green yet, give it to the first one
            if self.current_green_cam is None:
                self.current_green_cam = cam_id
                self.approaches[cam_id]['light'] = 'GREEN'
                self.approaches[cam_id]['green_start_time'] = now
                self.last_switch_time = now

            # --- INTELLIGENT JUNCTION COORDINATION LOGIC ---
            active_cam = self.current_green_cam
            
            if active_cam in self.approaches:
                active_elapsed = now - self.approaches[active_cam]['green_start_time']
                active_density = self.approaches[active_cam]['density']
                
                # Rule A: Maximum allowed green time reached.
                force_switch = (active_elapsed >= max_green)
                # Rule B: Minimum time reached AND no more cars waiting.
                empty_switch = (active_elapsed >= min_green and active_density < 2)
                
                if force_switch or empty_switch:
                    best_cam = None
                    highest_priority = -1
                    
                    for cid, data in self.approaches.items():
                        if cid == active_cam:
                            continue
                            
                        # Priority calculation based on Queue Length and Waiting Time
                        wait_time_seconds = now - data['red_start_time']
                        priority = (data['density'] * 2.0) + (wait_time_seconds * 1.0)
                        
                        if priority > highest_priority:
                            highest_priority = priority
                            best_cam = cid
                    
                    # Execute the light switch
                    if best_cam and highest_priority > 0:
                        logger.info(f"Switching Traffic Light: {active_cam} -> {best_cam}. Priority Score: {highest_priority}")
                        
                        self.approaches[active_cam]['light'] = 'RED'
                        self.approaches[active_cam]['red_start_time'] = now
                        
                        self.current_green_cam = best_cam
                        self.approaches[best_cam]['light'] = 'GREEN'
                        self.approaches[best_cam]['green_start_time'] = now
                        self.last_switch_time = now

            # Return the calculated state for the requested camera
            state = self.approaches[cam_id]
            waiting_time = int(now - state['red_start_time']) if state['light'] == 'RED' else 0
            
            return {
                'light': state['light'],
                'density': state['density'],
                'waiting_time': waiting_time
            }

        except Exception as e:
            logger.error(f"[TrafficLightController] Error updating light for {cam_id}: {e}", exc_info=True)
            return None