import logging
import cv2
import threading
import time
import os
import uuid
import psutil
import torch
import numpy as np
from ultralytics import YOLO
from collections import defaultdict
from datetime import datetime

# Configure robust logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("TrafficEngine")

# Database & Config
from app.database import SessionLocal
from app.models import Violation
from app.schemas.config_schema import SystemConfig

# Features
from app.services.features.speed_estimator import SpeedEstimator
from app.services.features.lane_monitor import LaneMonitor
from app.services.features.helmet_detector import HelmetDetector
from app.services.features.traffic_optimizer import TrafficOptimizer 

# OCR Check
try:
    from paddleocr import PaddleOCR
    OCR_PKG_INSTALLED = True
except ImportError:
    logger.warning("PaddleOCR not installed. License plate reading will be disabled.")
    OCR_PKG_INSTALLED = False

class TrafficEngine:
    def __init__(self, weights_path="weights"):
        logger.info("Initializing Traffic Engine...")
        
        # 1. Hardware Acceleration
        self.use_cuda = torch.cuda.is_available()
        self.device = 0 if self.use_cuda else 'cpu'
        logger.info(f"Using Device: {self.device}")
        
        if self.use_cuda:
            logger.info(f"GPU Detected: {torch.cuda.get_device_name(0)}")
            os.environ['FLAGS_use_gpu'] = '1'

        # 2. Load Models Safely
        try:
            self.vehicle_model = YOLO(os.path.join(weights_path, "veichle_dedaction_best_model-X.pt"))
            if self.use_cuda: self.vehicle_model.to(self.device)
        except Exception as e:
            logger.error(f"Failed to load primary vehicle model: {e}")
            self.vehicle_model = None

        try:
            self.helmet_raw_model = YOLO(os.path.join(weights_path, "helmet_model.pt"))
            if self.use_cuda: self.helmet_raw_model.to(self.device)
        except:
            logger.warning("Helmet model missing. Feature will not function.")
            self.helmet_raw_model = None

        try:
            self.plate_model = YOLO(os.path.join(weights_path, "license-plate-finetune-v1n.pt"))
            if self.use_cuda: self.plate_model.to(self.device)
        except:
            logger.warning("License plate model missing.")
            self.plate_model = None

        # 3. Initialize Feature Controllers
        self.speed_est = SpeedEstimator()
        self.lane_mon = LaneMonitor()
        self.helmet_det = HelmetDetector(self.helmet_raw_model)
        self.optimizer = TrafficOptimizer()
        
        # 4. Initialize OCR
        self.ocr_available = False
        if OCR_PKG_INSTALLED:
            try:
                self.ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
                self.ocr_available = True
                logger.info("PaddleOCR Initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize OCR: {e}")

        # 5. State Management
        self.config = SystemConfig()
        self.running = False
        self.vehicle_history = defaultdict(list)
        self.violation_cooldown = {}
        
        # Multi-Cam State
        self.latest_frames = {}  
        self.lock = threading.Lock()
        
        os.makedirs("static/violations", exist_ok=True)

    def update_config(self, new_config: dict):
        try:
            self.config = SystemConfig(**new_config)
            logger.info(f"Config Updated. Active Sources: {len(self.config.video_sources)}")
        except Exception as e:
            logger.error(f"Config update failed: {e}")

    def get_health(self):
        try:
            return {
                "cpu_usage": psutil.cpu_percent(interval=None),
                "memory_usage": psutil.virtual_memory().percent,
                "active_models": ["YOLOv11", "Helmet", "OCR"] if self.running and self.vehicle_model else [],
                "corridor_status": self.optimizer.get_corridor_status(),
                "fps_processed": getattr(self.config, 'frame_rate_limit', 30)
            }
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {}

    def check_motion(self, current_frame, prev_frame):
        """Zero-Movement Check to save GPU load"""
        try:
            if prev_frame is None: return True
            gray1 = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(current_frame, cv2.COLOR_BGR2GRAY)
            gray1 = cv2.GaussianBlur(gray1, (21, 21), 0)
            gray2 = cv2.GaussianBlur(gray2, (21, 21), 0)
            
            diff = cv2.absdiff(gray1, gray2)
            thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)[1]
            
            changed_pixels = cv2.countNonZero(thresh)
            total_pixels = current_frame.shape[0] * current_frame.shape[1]
            return (changed_pixels / total_pixels) > 0.001 
        except Exception as e:
            return True # Default to true on error to ensure processing

    def read_license_plate(self, frame, vehicle_box):
        if not self.ocr_available or not self.plate_model: return "UNKNOWN"
        
        try:
            vx1, vy1, vx2, vy2 = map(int, vehicle_box)
            h, w, _ = frame.shape
            pad = 10
            vehicle_crop = frame[max(0, vy1-pad):min(h, vy2+pad), max(0, vx1-pad):min(w, vx2+pad)]
            
            if vehicle_crop.size == 0: return "UNKNOWN"

            plate_results = self.plate_model(vehicle_crop, verbose=False, device=self.device)
            best_text = "UNKNOWN"
            
            for r in plate_results:
                if len(r.boxes) > 0:
                    box = r.boxes.xyxy[0].cpu().numpy().astype(int)
                    px1, py1, px2, py2 = box
                    plate_crop = vehicle_crop[py1:py2, px1:px2]
                    
                    if plate_crop.size == 0: continue
                    
                    try:
                        ocr_result = self.ocr.ocr(plate_crop, cls=True, det=False)
                        if ocr_result and ocr_result[0]:
                            text, conf = ocr_result[0][0]
                            clean = ''.join(e for e in text if e.isalnum()).upper()
                            if len(clean) > 3: best_text = clean
                    except Exception as ocr_e:
                        logger.error(f"OCR reading failed: {ocr_e}")
            return best_text
        except Exception as e:
            logger.error(f"License plate extraction error: {e}")
            return "UNKNOWN"

    def save_to_database(self, violation_type, vehicle_type, plate_number, speed, frame, track_id, box=None):
        try:
            key = f"{track_id}_{violation_type}"
            last_time = self.violation_cooldown.get(key, 0)
            if time.time() - last_time < 15: return # Cooldown per vehicle
            self.violation_cooldown[key] = time.time()
            
            evidence_img = frame.copy()
            if box is not None:
                x1, y1, x2, y2 = map(int, box)
                cv2.rectangle(evidence_img, (x1, y1), (x2, y2), (0, 0, 255), 3)
                label_text = f"{violation_type} | {int(speed)}km/h"
                cv2.putText(evidence_img, label_text, (x1, max(20, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            filename = f"{violation_type}_{uuid.uuid4().hex[:8]}.jpg"
            filepath = os.path.join("static/violations", filename)
            cv2.imwrite(filepath, evidence_img)
            
            # DB Write
            db = SessionLocal()
            new_vio = Violation(
                violation_type=violation_type,
                vehicle_type=vehicle_type,
                license_plate=plate_number,
                speed_kph=speed,
                evidence_path=f"/static/violations/{filename}",
                detected_at=datetime.utcnow()
            )
            db.add(new_vio)
            db.commit()
            db.close()
            logger.info(f"🚨 VIOLATION SAVED: {violation_type} | {vehicle_type} | Plate: {plate_number}")
        except Exception as e:
            logger.error(f"Database save error: {e}", exc_info=True)

    def _process_stream(self, source_config):
        """Main inference loop for a single camera feed."""
        try:
            cam_id = source_config.id
            role = source_config.role 
            lane_data = getattr(source_config, 'lane_data', [])
            url = source_config.url
            
            # Traffic light configs
            enable_tl = getattr(source_config, 'enable_traffic_light', False)
            min_green = getattr(source_config, 'min_green_time', 15)
            max_green = getattr(source_config, 'max_green_time', 60)
            
            is_main = (role == 'main')
            src = 0 if url == "0" else url
            cap = cv2.VideoCapture(src)
            
            if not cap.isOpened():
                logger.error(f"Failed to open video source: {src}")
                return

            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            start_time = time.time()
            prev_frame_gray = None
            frame_count = 0
            
            VEHICLE_CLASSES = [2, 3, 5, 7] # COCO / YOLO generic classes for vehicles
            
            logger.info(f"Started processing stream: {cam_id}")

            while self.running and cap.isOpened():
                # --- FRAME SYNC ---
                if src != 0:
                    elapsed = time.time() - start_time
                    expected_frame = int(elapsed * fps)
                    current_pos = cap.get(cv2.CAP_PROP_POS_FRAMES)
                    if expected_frame > current_pos + 2:
                        if expected_frame - current_pos > 30:
                            cap.set(cv2.CAP_PROP_POS_FRAMES, expected_frame)
                        else:
                            for _ in range(int(expected_frame - current_pos)): cap.grab()
                
                ret, frame = cap.read()
                if not ret: 
                    # Loop video if file
                    if src != 0:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        start_time = time.time()
                    continue

                frame_count += 1
                time.sleep(1.0 / self.config.frame_rate_limit)

                if self.config.video_quality == 'low':
                    frame = cv2.resize(frame, (640, 360))
                elif self.config.video_quality == 'medium':
                    frame = cv2.resize(frame, (854, 480))
                
                # --- MOTION CHECK ---
                if frame_count % 5 != 0:
                    if not self.check_motion(frame, prev_frame_gray):
                        with self.lock: self.latest_frames[cam_id] = frame.copy()
                        continue
                prev_frame_gray = frame.copy()

                # --- AI INFERENCE ---
                annotated_frame = frame.copy()
                
                if role != 'none' and self.vehicle_model:
                    try:
                        results = self.vehicle_model.track(
                            frame, persist=True, verbose=False, device=self.device, classes=VEHICLE_CLASSES
                        )
                        annotated_frame = results[0].plot()
                        
                        counts = {'dir1': 0, 'dir2': 0}
                        
                        if results[0].boxes.id is not None:
                            boxes = results[0].boxes.xyxy.cpu().numpy()
                            ids = results[0].boxes.id.int().cpu().tolist()
                            classes = results[0].boxes.cls.int().cpu().tolist()
                            
                            for box, track_id, cls in zip(boxes, ids, classes):
                                class_name = self.vehicle_model.names[cls]
                                cx, cy = (box[0]+box[2])/2, (box[1]+box[3])/2
                                
                                self.vehicle_history[track_id].append({'x': cx, 'y': cy, 'time': time.time()})
                                if len(self.vehicle_history[track_id]) > 20: self.vehicle_history[track_id].pop(0)
                                
                                # Direction logic
                                direction = 'dir1'
                                if len(self.vehicle_history[track_id]) >= 5:
                                    dy = self.vehicle_history[track_id][-1]['y'] - self.vehicle_history[track_id][0]['y']
                                    direction = 'dir1' if dy > 0 else 'dir2'
                                counts[direction] += 1
                                
                                # SPEED ESTIMATION
                                spd = 0
                                if self.config.enable_speed_detection or self.config.enable_traffic_optimization:
                                    spd = self.speed_est.estimate_speed(self.vehicle_history[track_id])
                                    if spd > 3:
                                        cv2.putText(annotated_frame, f"{spd}km/h", (int(box[0]), int(box[1]-10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

                                # --- ROI FILTERING FOR TRAFFIC LIGHTS ---
                                is_in_roi = False
                                roi_polygon = getattr(source_config, 'roi_polygon', [])
                                if roi_polygon and len(roi_polygon) >= 3:
                                    # Convert normalized ROI points to pixel coordinates
                                    h, w = frame.shape[:2]
                                    pixel_roi = np.array([[int(p[0] * w), int(p[1] * h)] for p in roi_polygon], np.int32)
                                    
                                    # Check if the vehicle's bottom-center point is inside the drawn polygon
                                    bx, by = (box[0] + box[2]) / 2, box[3]
                                    if cv2.pointPolygonTest(pixel_roi, (bx, by), False) >= 0:
                                        is_in_roi = True
                                        
                                        # Only add to density count if inside ROI and speed is low (waiting)
                                        if spd < 10: 
                                            counts[direction] += 1
                                            # Draw a green dot to show AI is tracking this specific car for the light
                                            cv2.circle(annotated_frame, (int(bx), int(by)), 5, (0, 255, 0), -1)

                                # MAIN CAMERA VIOLATIONS
                                if is_main:
                                    # 1. Speed Violation
                                    if self.config.enable_speed_detection and spd > 0:
                                        limit = getattr(self.config.speed_limits, class_name, 60)
                                        if spd > limit:
                                            plate = self.read_license_plate(frame, box)
                                            self.save_to_database("SPEEDING", class_name, plate, spd, frame, track_id, box)

                                    # 2. Lane Violation
                                    if self.config.enable_lane_violation and lane_data:
                                        if self.lane_mon.check_crossing(frame.shape, box, lane_data):
                                            plate = self.read_license_plate(frame, box)
                                            self.save_to_database("LANE_CROSS", class_name, plate, spd, frame, track_id, box)

                                    # 3. Helmet Violation
                                    if self.config.enable_helmet_detection and class_name == 'motorcycle':
                                        if self.helmet_det.check_violation(frame, box):
                                            plate = self.read_license_plate(frame, box)
                                            self.save_to_database("NO_HELMET", class_name, plate, spd, frame, track_id, box)

                        # --- TRAFFIC LIGHT OPTIMIZATION UI ---
                        if self.config.enable_traffic_optimization and enable_tl:
                            # Pass only the ROI-filtered counts to the traffic light controller
                            light_state = self.light_controller.update_light(cam_id, enable_tl, min_green, max_green, counts)
                            if light_state:
                                color = (0, 255, 0) if light_state['light'] == 'GREEN' else (0, 0, 255)
                                cv2.rectangle(annotated_frame, (10, 10), (300, 70), (0,0,0), -1)
                                cv2.circle(annotated_frame, (40, 40), 15, color, -1)
                                cv2.putText(annotated_frame, f"LIGHT: {light_state['light']}", (70, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
                                cv2.putText(annotated_frame, f"Waiting Queue: {light_state['density']} veh", (70, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200,200,200), 1)

                        # Draw the ROI Polygon Overlay if configured
                        roi_polygon = getattr(source_config, 'roi_polygon', [])
                        if roi_polygon and len(roi_polygon) >= 3:
                            h, w = frame.shape[:2]
                            pixel_roi = np.array([[int(p[0] * w), int(p[1] * h)] for p in roi_polygon], np.int32)
                            cv2.polylines(annotated_frame, [pixel_roi], isClosed=True, color=(255, 165, 0), thickness=2)
                            cv2.putText(annotated_frame, "AI WAITING ZONE", (pixel_roi[0][0], pixel_roi[0][1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 165, 0), 2)

                        if is_main and self.config.enable_lane_violation:
                            annotated_frame = self.lane_mon.draw_overlay(annotated_frame, lane_data)

                    except Exception as ai_e:
                        logger.error(f"AI Inference loop error on {cam_id}: {ai_e}")

                with self.lock:
                    self.latest_frames[cam_id] = annotated_frame.copy()

            cap.release()
            logger.info(f"Stream {cam_id} closed naturally.")

        except Exception as e:
            logger.critical(f"Critical stream failure on {source_config.id}: {e}", exc_info=True)

    def start_all(self):
        if self.running: return
        self.running = True
        self.latest_frames = {}
        
        for source in getattr(self.config, 'video_sources', []):
            if source.enabled:
                t = threading.Thread(target=self._process_stream, args=(source,))
                t.daemon = True
                t.start()
        logger.info("All enabled streams started.")

    def stop(self):
        self.running = False
        logger.info("System shutting down...")

    def generate_frames(self, cam_id=None):
        while True:
            try:
                target_id = cam_id
                if not target_id and self.latest_frames:
                    target_id = next(iter(self.latest_frames))
                
                frame = None
                with self.lock:
                    if target_id in self.latest_frames:
                        frame = self.latest_frames[target_id]
                
                if frame is None:
                    time.sleep(0.1)
                    continue

                (flag, encodedImage) = cv2.imencode(".jpg", frame)
                if not flag: continue
                
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')
                time.sleep(0.05)
            except Exception as e:
                logger.error(f"Stream generation error: {e}")
                time.sleep(1)