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

# Database & Config
from app.database import SessionLocal
from app.models import Violation
from app.schemas.config_schema import SystemConfig

# Features
from app.services.features.speed_estimator import SpeedEstimator
from app.services.features.lane_monitor import LaneMonitor
from app.services.features.helmet_detector import HelmetDetector
from app.services.features.traffic_optimizer import CorridorOptimizer # CHANGED IMPORT

# OCR Check
try:
    from paddleocr import PaddleOCR
    OCR_PKG_INSTALLED = True
except ImportError:
    print("WARNING: PaddleOCR not installed.")
    OCR_PKG_INSTALLED = False

class TrafficEngine:
    def __init__(self, weights_path="weights"):
        # 1. Determine Hardware Acceleration
        self.use_cuda = torch.cuda.is_available()
        self.device = 0 if self.use_cuda else 'cpu'
        print(f"--- Initializing Traffic Engine on Device: {self.device} ---")
        if self.use_cuda:
            print(f"    GPU: {torch.cuda.get_device_name(0)}")
            # Set PaddleOCR GPU flag via environment variable
            os.environ['FLAGS_use_gpu'] = '1'
        
        # 2. Load Models (Force load to GPU immediately)
        if os.path.exists(f"{weights_path}/yolo11n.pt"):
            self.vehicle_model = YOLO(f"{weights_path}/yolo11n.pt")
            self.vehicle_model.to(self.device) 
        else:
            print(f"CRITICAL: {weights_path}/yolo11n.pt not found.")
            self.vehicle_model = None

        self.helmet_model = YOLO(f"{weights_path}/helmet_model.pt")
        self.plate_model = YOLO(f"{weights_path}/license-plate-finetune-v1n.pt")
        
        # 3. Features
        self.speed_est = SpeedEstimator()
        self.lane_mon = LaneMonitor()
        self.helmet_det = HelmetDetector(weights_path)
        self.optimizer = CorridorOptimizer() # UPDATED TO CORRIDOR OPTIMIZER
        
        # 4. OCR
        self.ocr_available = False
        if OCR_PKG_INSTALLED:
            try:
                # GPU is handled via os.environ['FLAGS_use_gpu'] set above.
                self.ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
                self.ocr_available = True
                print(f"✅ PaddleOCR Ready")
            except Exception as e:
                print(f"⚠️ OCR Init Warning: {e}")

        # 5. State
        self.config = SystemConfig()
        self.running = False
        self.vehicle_history = defaultdict(list)
        self.violation_cooldown = {}
        
        # Multi-Cam State
        self.latest_frames = {}   # {id: frame}
        self.lock = threading.Lock()
        
        os.makedirs("static/violations", exist_ok=True)

    def update_config(self, new_config: dict):
        self.config = SystemConfig(**new_config)
        print("Config Updated. Active Sources:", len(self.config.video_sources))

    def get_health(self):
        """System stats for Dashboard"""
        corridor_status = self.optimizer.get_corridor_status()
        
        return {
            "cpu_usage": psutil.cpu_percent(interval=None),
            "memory_usage": psutil.virtual_memory().percent,
            "active_models": ["YOLOv11n", "Helmet", "OCR"] if self.running and self.use_cuda else [],
            "corridor_status": corridor_status, # ADDED CORRIDOR STATUS HERE
            "fps_processed": self.config.frame_rate_limit
        }

    # --- INTELLIGENT LOGIC HELPERS ---

    def check_motion(self, current_frame, prev_frame):
        """Zero-Movement Check (Runs on CPU to save GPU for Inference)"""
        if prev_frame is None: return True
        
        gray1 = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(current_frame, cv2.COLOR_BGR2GRAY)
        gray1 = cv2.GaussianBlur(gray1, (21, 21), 0)
        gray2 = cv2.GaussianBlur(gray2, (21, 21), 0)
        
        diff = cv2.absdiff(gray1, gray2)
        thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)[1]
        
        changed_pixels = cv2.countNonZero(thresh)
        total_pixels = current_frame.shape[0] * current_frame.shape[1]
        motion_ratio = changed_pixels / total_pixels
        
        return motion_ratio > 0.001 

    def read_license_plate(self, frame, vehicle_box):
        """Tier 3: Run ONLY on confirmed violations"""
        if not self.ocr_available: return "OCR_DISABLED"
        
        vx1, vy1, vx2, vy2 = map(int, vehicle_box)
        h, w, _ = frame.shape
        pad = 10
        vehicle_crop = frame[max(0, vy1-pad):min(h, vy2+pad), max(0, vx1-pad):min(w, vx2+pad)]
        
        if vehicle_crop.size == 0: return "UNKNOWN"

        # Detect Plate (Force GPU + FP16)
        plate_results = self.plate_model(vehicle_crop, verbose=False, device=self.device, half=self.use_cuda)
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
                except: pass
        return best_text

    def save_to_database(self, violation_type, vehicle_type, plate_number, speed, frame, track_id, box=None):
        key = f"{track_id}_{violation_type}"
        last_time = self.violation_cooldown.get(key, 0)
        if time.time() - last_time < 10: return 
        self.violation_cooldown[key] = time.time()
        
        # Prepare Evidence Image
        evidence_img = frame.copy()
        if box is not None:
            x1, y1, x2, y2 = map(int, box)
            # Draw Thick Red Box
            cv2.rectangle(evidence_img, (x1, y1), (x2, y2), (0, 0, 255), 3)
            
            # Draw Label
            label_text = f"{violation_type} | {int(speed)}km/h"
            t_size = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            cv2.rectangle(evidence_img, (x1, y1 - t_size[1] - 10), (x1 + t_size[0] + 10, y1), (0, 0, 255), -1)
            cv2.putText(evidence_img, label_text, (x1 + 5, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        filename = f"{violation_type}_{uuid.uuid4().hex[:8]}.jpg"
        filepath = os.path.join("static/violations", filename)
        cv2.imwrite(filepath, evidence_img)
        
        try:
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
            print(f"✅ SAVED: {violation_type} | {plate_number}")
        except Exception as e:
            print(f"❌ DB Error: {e}")

    # --- MAIN PROCESSING LOOP ---

    def _process_stream(self, source_config):
        cam_id = source_config.id
        role = source_config.role 
        lane_data = source_config.lane_data
        url = source_config.url
        
        is_main = (role == 'main')
        
        src = 0 if url == "0" else url
        cap = cv2.VideoCapture(src)
        
        # Real-time Sync Variables
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps > 60: fps = 30 # Fallback
        
        start_time = time.time()
        
        prev_frame_gray = None
        frame_count = 0
        
        # Vehicle Classes (Car=2, Bike=3, Bus=5, Truck=7)
        VEHICLE_CLASSES = [2, 3, 5, 7]
        
        while self.running and cap.isOpened():
            # --- REAL-TIME SYNC LOGIC ---
            if src != 0:
                elapsed = time.time() - start_time
                expected_frame = int(elapsed * fps)
                current_pos = cap.get(cv2.CAP_PROP_POS_FRAMES)
                if expected_frame > current_pos + 2:
                    if expected_frame - current_pos > 30:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, expected_frame)
                    else:
                        frames_to_skip = expected_frame - current_pos
                        for _ in range(int(frames_to_skip)):
                            cap.grab()
            
            ret, frame = cap.read()
            if not ret: 
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0) 
                start_time = time.time() 
                continue

            frame_count += 1
            
            # 1. Performance Limiter
            time.sleep(1.0 / self.config.frame_rate_limit)

            if self.config.video_quality == 'low':
                frame = cv2.resize(frame, (640, 360))
            elif self.config.video_quality == 'medium':
                frame = cv2.resize(frame, (854, 480))
            
            # 2. Motion Check
            if frame_count % 5 != 0:
                is_moving = self.check_motion(frame, prev_frame_gray)
                if not is_moving:
                    with self.lock: self.latest_frames[cam_id] = frame.copy()
                    continue
            prev_frame_gray = frame.copy()

            # 3. AI Inference (GPU)
            if role != 'none':
                # Filtered Detection
                results = self.vehicle_model.track(
                    frame, 
                    persist=True, 
                    verbose=False, 
                    device=self.device, 
                    half=self.use_cuda,
                    classes=VEHICLE_CLASSES 
                )
                annotated_frame = results[0].plot()
                
                counts = {'dir1': 0, 'dir2': 0}
                current_speeds = {'dir1': [], 'dir2': []}
                
                if results[0].boxes.id is not None:
                    boxes = results[0].boxes.xyxy.cpu()
                    ids = results[0].boxes.id.int().cpu().tolist()
                    classes = results[0].boxes.cls.int().cpu().tolist()
                    
                    for box, track_id, cls in zip(boxes, ids, classes):
                        class_name = self.vehicle_model.names[cls]
                        
                        cx, cy = (box[0]+box[2])/2, (box[1]+box[3])/2
                        self.vehicle_history[track_id].append({'x': cx, 'y': cy, 'time': time.time()})
                        if len(self.vehicle_history[track_id]) > 20: self.vehicle_history[track_id].pop(0)
                        
                        # --- DIRECTION & SPEED CALCULATION ---
                        direction = 'dir1' # Default
                        if len(self.vehicle_history[track_id]) >= 5:
                            dy = self.vehicle_history[track_id][-1]['y'] - self.vehicle_history[track_id][0]['y']
                            direction = 'dir1' if dy > 0 else 'dir2' # dir1 = Moving Down, dir2 = Moving Up
                        
                        counts[direction] += 1
                        
                        spd = 0
                        if self.config.enable_speed_detection or self.config.enable_traffic_optimization:
                            spd = self.speed_est.estimate_speed(self.vehicle_history[track_id])
                            
                            # Parked / Slow moving vehicle detection
                            if spd > 3:
                                current_speeds[direction].append(spd)
                                cv2.putText(annotated_frame, f"{spd}km/h", (int(box[0]), int(box[1]-10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                            else:
                                cv2.putText(annotated_frame, "PARKED/SLOW", (int(box[0]), int(box[1]-10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 2)
                        
                        # --- VIOLATION LOGIC (MAIN CAMERA ONLY) ---
                        if is_main:
                            # A. SPEED VIOLATION
                            if self.config.enable_speed_detection and spd > 0:
                                limit = getattr(self.config.speed_limits, class_name, 60)
                                if spd > limit:
                                    cv2.rectangle(annotated_frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0,0,255), 3)
                                    plate = self.read_license_plate(frame, box)
                                    self.save_to_database("SPEEDING", class_name, plate, spd, frame, track_id, box)

                            # B. LANE
                            if self.config.enable_lane_violation and lane_data:
                                if self.lane_mon.check_crossing(frame.shape[:2], box, lane_data):
                                    cv2.rectangle(annotated_frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0,0,255), 3)
                                    plate = self.read_license_plate(frame, box)
                                    self.save_to_database("LANE_CROSS", class_name, plate, 0, frame, track_id, box)

                            # C. HELMET
                            if self.config.enable_helmet_detection and class_name == 'motorcycle':
                                if self.helmet_det.check_violation(frame, box):
                                    cv2.rectangle(annotated_frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0,0,255), 3)
                                    plate = self.read_license_plate(frame, box)
                                    self.save_to_database("NO_HELMET", class_name, plate, 0, frame, track_id, box)

                # --- TRAFFIC OPTIMIZATION (ALL CAMERAS) ---
                if self.config.enable_traffic_optimization:
                    # Feed counts and speeds to the global optimizer dynamically using cam_id
                    self.optimizer.update_segment(cam_id, counts, current_speeds)
                    
                    if is_main:
                        # Draw overall corridor status on the main video feed
                        status = self.optimizer.get_corridor_status()
                        d1 = status['dir1']
                        d2 = status['dir2']
                        
                        cv2.rectangle(annotated_frame, (10, 10), (750, 70), (0, 0, 0), -1)
                        c1 = (0, 255, 0) if d1['congestion_level'] == 'LOW' else (0, 165, 255) if d1['congestion_level'] == 'MEDIUM' else (0, 0, 255)
                        c2 = (0, 255, 0) if d2['congestion_level'] == 'LOW' else (0, 165, 255) if d2['congestion_level'] == 'MEDIUM' else (0, 0, 255)
                        
                        cv2.putText(annotated_frame, f"LANE 1: {d1['status_text']} | Avg: {d1['avg_speed_kmh']}km/h | Vol: {d1['total_vehicles']}", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, c1, 2)
                        cv2.putText(annotated_frame, f"LANE 2: {d2['status_text']} | Avg: {d2['avg_speed_kmh']}km/h | Vol: {d2['total_vehicles']}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, c2, 2)

                if is_main and self.config.enable_lane_violation:
                    annotated_frame = self.lane_mon.draw_overlay(annotated_frame, lane_data)
                
                if is_main and self.config.enable_traffic_optimization:
                    self.pid_result = self.pid_ctrl.update(self.densities['main'], self.densities['pre'], self.densities['post'])
                    cv2.putText(annotated_frame, f"PID GREEN: {self.pid_result}s", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                with self.lock:
                    self.latest_frames[cam_id] = annotated_frame.copy()
            else:
                with self.lock:
                    self.latest_frames[cam_id] = frame.copy()

        cap.release()

    def start_all(self):
        if self.running: return
        self.running = True
        self.latest_frames = {}
        
        for source in self.config.video_sources:
            if source.enabled:
                t = threading.Thread(target=self._process_stream, args=(source,))
                t.daemon = True
                t.start()

    def stop(self):
        self.running = False

    def generate_frames(self, cam_id=None):
        while True:
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