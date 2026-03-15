import logging
import cv2
import threading
import time
import os
import uuid
import psutil
import numpy as np
import re
from collections import defaultdict

# Configure robust logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("TrafficEngine")

# Core Systems & Database
from app.database import SessionLocal
from app.models import Violation
from app.schemas.config_schema import SystemConfig
from app.services.core.model_manager import ModelManager

# Features
from app.services.features.speed_estimator import SpeedEstimator
from app.services.features.lane_monitor import LaneMonitor
from app.services.features.helmet_detector import HelmetDetector
from app.services.features.traffic_optimizer import TrafficOptimizer 
from app.services.features.traffic_light_controller import TrafficLightController

# OCR Check
try:
    from paddleocr import PaddleOCR
    OCR_PKG_INSTALLED = True
except ImportError:
    OCR_PKG_INSTALLED = False

class TrafficEngine:
    def __init__(self):
        logger.info("Initializing Refactored Traffic Engine...")
        
        # 1. Load Core Managers
        self.ai = ModelManager()
        
        # 2. Load Feature Controllers
        self.speed_est = SpeedEstimator()
        self.lane_mon = LaneMonitor()
        self.helmet_det = HelmetDetector(person_model=self.ai.fallback, helmet_model=self.ai.helmet)
        self.optimizer = TrafficOptimizer() 
        self.light_controller = TrafficLightController() 
        
        # 3. Init OCR
        self.ocr_available = False
        if OCR_PKG_INSTALLED:
            try:
                self.ocr = PaddleOCR(use_angle_cls=True, lang='en')
                self.ocr_available = True
            except: pass

        # Categorization for Speed Limits (Using Normalized Common Names)
        self.HEAVY_VEHICLES = ['bus', 'truck']
        self.LIGHT_VEHICLES = ['car', 'van', 'motorbike', 'tuktuk', 'bicycle']

        # State Management
        self.config = SystemConfig()
        self.running = False
        self.vehicle_history = defaultdict(list)
        self.track_states = {} 
        self.violation_cooldown = {}
        self.latest_frames = {}  
        self.lock = threading.Lock()
        
        os.makedirs("static/violations", exist_ok=True)

    def update_config(self, new_config: dict):
        self.config = SystemConfig(**new_config)

    def get_health(self):
        combined_status = self.optimizer.get_corridor_status()
        junction_status = {'junctions': {}}
        if hasattr(self.light_controller, 'get_corridor_status'):
            junction_status = self.light_controller.get_corridor_status()
        elif hasattr(self.light_controller, 'approaches'):
            now = time.time()
            for cam_id, data in self.light_controller.approaches.items():
                wait_t = int(now - data.get('red_start_time', now)) if data.get('light') == 'RED' else 0
                junction_status['junctions'][cam_id] = {
                    'light': data.get('light', 'RED'),
                    'waiting_time_sec': wait_t
                }
        
        for j_id, j_data in junction_status.get('junctions', {}).items():
            if j_id in combined_status.get('junctions', {}):
                combined_status['junctions'][j_id]['light'] = j_data.get('light', 'RED')
                combined_status['junctions'][j_id]['waiting_time_sec'] = j_data.get('waiting_time_sec', 0)

        return {
            "cpu_usage": psutil.cpu_percent(interval=None),
            "memory_usage": psutil.virtual_memory().percent,
            "active_models": ["Modular-Tracking"],
            "corridor_status": combined_status,
            "fps_processed": getattr(self.config, 'frame_rate_limit', 30)
        }

    def _normalize_class_name(self, raw_name):
        """
        Maps raw model outputs (like 'fb_car', 'tempo-traveller', 'suv') 
        into clean, common vehicle categories.
        """
        clean_name = raw_name.replace('fb_', '').lower()
        mapping = {
            'car': 'car', 'sedan': 'car', 'suv': 'car','hatchback': 'car',
            'motorcycle': 'motorbike', 'motorbike': 'motorbike', 'two-wheeler': 'motorbike',
            'bus': 'bus',
            'truck': 'truck', 'lcv': 'truck', 'heavy_vehicle': 'truck',
            'van': 'van', 'tempo-traveller': 'van',
            'tuktuk': 'tuktuk', 'three-wheeler': 'tuktuk',
            'bicycle': 'bicycle', 'cycle': 'bicycle'
        }
        return mapping.get(clean_name, clean_name)

    def format_sl_plate(self, raw_text):
        clean = ''.join(e for e in raw_text if e.isalnum()).upper()
        if len(clean) >= 5 and clean[-4:].isdigit(): return f"{clean[:-4]}-{clean[-4:]}"
        return clean if len(clean) > 3 else "UNKNOWN"

    def read_license_plate(self, frame, vehicle_box):
        if not self.ocr_available or not self.ai.plate: return "UNKNOWN"
        try:
            vx1, vy1, vx2, vy2 = map(int, vehicle_box)
            h, w, _ = frame.shape
            vehicle_crop = frame[max(0, vy1-15):min(h, vy2+15), max(0, vx1-15):min(w, vx2+15)]
            if vehicle_crop.size == 0: return "UNKNOWN"

            plate_results = self.ai.plate.predict(vehicle_crop, verbose=False, device=self.ai.device)
            for r in plate_results:
                if len(r.boxes) > 0:
                    px1, py1, px2, py2 = r.boxes.xyxy[0].cpu().numpy().astype(int)
                    plate_crop = vehicle_crop[py1:py2, px1:px2]
                    try:
                        ocr_result = self.ocr.ocr(plate_crop, cls=True, det=False)
                        if ocr_result and ocr_result[0]:
                            return self.format_sl_plate(ocr_result[0][0][0])
                    except: pass
            return "UNKNOWN"
        except: return "UNKNOWN"

    def save_to_database(self, violation_type, vehicle_type, plate_number, speed, frame, track_id, box):
        try:
            # Global throttle to prevent database locking, actual deduplication happens in tracking state
            key = f"global_{violation_type}"
            if time.time() - self.violation_cooldown.get(key, 0) < 1.0: return 
            self.violation_cooldown[key] = time.time()
            
            evidence_img = frame.copy()
            x1, y1, x2, y2 = map(int, box)
            cv2.rectangle(evidence_img, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(evidence_img, f"{violation_type} | {int(speed)}km/h", (x1, max(20, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            filename = f"{violation_type}_{uuid.uuid4().hex[:8]}.jpg"
            cv2.imwrite(os.path.join("static/violations", filename), evidence_img)
            
            db = SessionLocal()
            new_vio = Violation(violation_type=violation_type, vehicle_type=vehicle_type, license_plate=plate_number, speed_kph=speed, evidence_path=f"/static/violations/{filename}")
            db.add(new_vio)
            db.commit()
            db.close()
        except Exception as e:
            logger.error(f"DB Error: {e}")

    def _process_stream(self, source_config):
        cam_id = source_config.id
        role = source_config.role 
        feed_direction = getattr(source_config, 'feed_direction', '2_way')
        lane_data = getattr(source_config, 'lane_data', [])
        roi_polygon = getattr(source_config, 'roi_polygon', [])
        enable_tl = getattr(source_config, 'enable_traffic_light', False)
        
        is_main = (role == 'main')
        
        cap = cv2.VideoCapture(0 if source_config.url == "0" else source_config.url)
        frame_count = 0

        while self.running and cap.isOpened():
            ret, frame = cap.read()
            if not ret: 
                if source_config.url != "0": cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            frame_count += 1
            
            # --- FRONTEND DRIVEN PERFORMANCE CONTROL ---
            skip_frames = getattr(self.config, 'process_every_n_frames', 3)
            if skip_frames > 1 and frame_count % skip_frames != 0:
                continue

            if self.config.video_quality == 'low': frame = cv2.resize(frame, (640, 360))
            elif self.config.video_quality == 'medium': frame = cv2.resize(frame, (854, 480))

            annotated_frame = frame.copy()
            counts = {'dir1': 0, 'dir2': 0, 'total_1way': 0}
            tl_counts = {'dir1': 0, 'dir2': 0}
            current_speeds = {'dir1': [], 'dir2': []}
            
            # Calculate the exact center X-coordinate for a vertical split
            frame_center_x = frame.shape[1] / 2
            
            # Draw visual Vertical Split Line for 2-way roads
            if feed_direction == '2_way':
                mid_x = int(frame_center_x)
                # Draw a thick, obvious YELLOW vertical line down the middle
                cv2.line(annotated_frame, (mid_x, 0), (mid_x, frame.shape[0]), (0, 255, 255), 3)
                
                # Draw clear text labels on the Left and Right sides
                cv2.putText(annotated_frame, "LEFT SIDE (DIR 1)", (mid_x - 220, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                cv2.putText(annotated_frame, "RIGHT SIDE (DIR 2)", (mid_x + 20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

            if role != 'none':
                try:
                    # --- AI PROCESSING (Modular) ---
                    vehicles = self.ai.process_vehicles(frame)

                    for v in vehicles:
                        box, track_id, raw_class, source = v['box'], v['track_id'], v['class_name'], v['source']
                        
                        # Normalize to common vehicle names (e.g., car, bus, motorbike)
                        class_name = self._normalize_class_name(raw_class)
                        
                        if track_id not in self.track_states:
                            self.track_states[track_id] = {
                                'direction': None, 
                                'helmet_checked': False, 
                                'helmet_violation': False, 
                                'plate': "UNKNOWN",
                                'logged_violations': set() # Ensures violations are only logged ONCE per vehicle
                            }
                        state = self.track_states[track_id]
                        
                        cx, cy = (box[0]+box[2])/2, (box[1]+box[3])/2
                        self.vehicle_history[track_id].append({'x': cx, 'y': cy, 'time': time.time()})
                        if len(self.vehicle_history[track_id]) > 15: self.vehicle_history[track_id].pop(0)
                        
                        # --- SPATIAL DIRECTION LOGIC (VERTICAL SPLIT) ---
                        if state['direction'] is None:
                            if feed_direction == '1_way':
                                state['direction'] = 'dir1'
                            else:
                                # Left side (X < Center) is dir1, Right side (X > Center) is dir2
                                state['direction'] = 'dir1' if cx < frame_center_x else 'dir2'
                        
                        direction = state['direction']
                        
                        counts[direction] += 1
                        counts['total_1way'] += 1

                        # Draw Box (Green for Primary, Orange for Fallback)
                        color = (0, 255, 0) if source == 'primary' else (0, 165, 255)
                        cv2.rectangle(annotated_frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), color, 2)
                        
                        display_text = f"{class_name.upper()} (FB)" if source == 'fallback' else class_name.upper()
                        cv2.putText(annotated_frame, display_text, (int(box[0]), int(box[1]-10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

                        # --- SPEED LOGIC ---
                        spd = 0
                        if self.config.enable_speed_detection or self.config.enable_traffic_optimization:
                            spd = self.speed_est.estimate_speed(self.vehicle_history[track_id])
                            if spd > 3:
                                current_speeds[direction].append(spd)
                                cv2.putText(annotated_frame, f"{spd}km/h", (int(box[0]), int(box[3]+15)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

                        # --- ROI & TRAFFIC LIGHT ---
                        is_in_roi = True
                        if roi_polygon and len(roi_polygon) >= 3:
                            h, w = frame.shape[:2]
                            pixel_roi = np.array([[int(p[0] * w), int(p[1] * h)] for p in roi_polygon], np.int32)
                            if cv2.pointPolygonTest(pixel_roi, (cx, box[3]), False) < 0: is_in_roi = False

                        if is_in_roi and spd < 10:
                            tl_counts[direction] += 1
                            cv2.circle(annotated_frame, (int(cx), int(box[3])), 5, (0, 255, 0), -1) 

                        # --- STRICTLY DEDUPLICATED VIOLATIONS ---
                        if role == 'main':
                            # Speeding
                            if self.config.enable_speed_detection and spd > 0:
                                limit = self.config.speed_limits.heavy_vehicle if class_name in self.HEAVY_VEHICLES else self.config.speed_limits.light_vehicle
                                if spd > limit and "SPEEDING" not in state['logged_violations']:
                                    if state['plate'] == "UNKNOWN": state['plate'] = self.read_license_plate(frame, box)
                                    self.save_to_database("SPEEDING", class_name, state['plate'], spd, frame, track_id, box)
                                    state['logged_violations'].add("SPEEDING")

                            # Lane Crossing
                            if self.config.enable_lane_violation and lane_data:
                                if self.lane_mon.check_crossing(frame.shape, box, lane_data):
                                    if "LANE_CROSS" not in state['logged_violations']:
                                        if state['plate'] == "UNKNOWN": state['plate'] = self.read_license_plate(frame, box)
                                        self.save_to_database("LANE_CROSS", class_name, state['plate'], spd, frame, track_id, box)
                                        state['logged_violations'].add("LANE_CROSS")

                            # Helmet Detection
                            if self.config.enable_helmet_detection and class_name == 'motorbike':
                                if not state['helmet_checked'] and (box[3] - box[1]) > (frame.shape[0] * 0.15):
                                    is_violation, heads = self.helmet_det.check_violation(frame, box)
                                    state['helmet_checked'], state['helmet_violation'] = True, is_violation
                                    
                                    if is_violation and "NO_HELMET" not in state['logged_violations']:
                                        if state['plate'] == "UNKNOWN": state['plate'] = self.read_license_plate(frame, box)
                                        self.save_to_database("NO_HELMET", class_name, state['plate'], spd, frame, track_id, box)
                                        state['logged_violations'].add("NO_HELMET")
                                
                                if state['helmet_violation']:
                                    cv2.putText(annotated_frame, "NO HELMET", (int(box[0]), max(10, int(box[1])-5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

                    # --- OPTIMIZERS & OVERLAYS ---
                    if self.config.enable_traffic_optimization:
                        self.optimizer.update_segment(cam_id, counts if feed_direction == '2_way' else {'dir1': counts['total_1way']}, current_speeds)
                    
                    if self.config.enable_traffic_optimization and enable_tl:
                        light_state = self.light_controller.update_light(cam_id, enable_tl, getattr(source_config, 'min_green_time', 15), getattr(source_config, 'max_green_time', 60), tl_counts if feed_direction == '2_way' else {'dir1': tl_counts['dir1'] + tl_counts['dir2']})
                        if light_state:
                            color = (0, 255, 0) if light_state['light'] == 'GREEN' else (0, 0, 255)
                            cv2.rectangle(annotated_frame, (10, 10), (300, 70), (0,0,0), -1)
                            cv2.circle(annotated_frame, (40, 40), 15, color, -1)
                            cv2.putText(annotated_frame, f"LIGHT: {light_state['light']}", (70, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

                    flow_text = f"1-Way Volume: {counts['total_1way']}" if feed_direction == '1_way' else f"2-Way Flow -> L-Side (D1): {counts['dir1']} | R-Side (D2): {counts['dir2']}"
                    
                    # Add a dark background rectangle to make the flow text easier to read
                    cv2.rectangle(annotated_frame, (10, frame.shape[0] - 45), (450, frame.shape[0] - 10), (0, 0, 0), -1)
                    cv2.putText(annotated_frame, flow_text, (20, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                    if roi_polygon and len(roi_polygon) >= 3:
                        pixel_roi = np.array([[int(p[0] * frame.shape[1]), int(p[1] * frame.shape[0])] for p in roi_polygon], np.int32)
                        cv2.polylines(annotated_frame, [pixel_roi], isClosed=True, color=(255, 165, 0), thickness=2)
                        
                    if is_main and self.config.enable_lane_violation:
                        annotated_frame = self.lane_mon.draw_overlay(annotated_frame, lane_data)

                except Exception as ai_e:
                    logger.error(f"AI error on {cam_id}: {ai_e}", exc_info=True)

            with self.lock:
                self.latest_frames[cam_id] = annotated_frame.copy()

        cap.release()

    def start_all(self):
        if self.running: return
        self.running = True
        for source in getattr(self.config, 'video_sources', []):
            if source.enabled:
                threading.Thread(target=self._process_stream, args=(source,), daemon=True).start()

    def stop(self):
        self.running = False

    def generate_frames(self, cam_id=None):
        try:
            while True:
                target_id = cam_id or (next(iter(self.latest_frames)) if self.latest_frames else None)
                frame = self.latest_frames.get(target_id)
                if frame is None:
                    time.sleep(0.1)
                    continue
                flag, encodedImage = cv2.imencode(".jpg", frame)
                if flag: 
                    yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')
                time.sleep(0.05)
        except GeneratorExit:
            pass
        except Exception as e:
            logger.error(f"Frame generator error: {e}")