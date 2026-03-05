import os
import torch
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

# Assumes you have these files in the app/ folder
from app.database import engine, get_db
from app import models 
from app.services.traffic_engine import TrafficEngine
from app.schemas.config_schema import SystemConfig

# Create Tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sri Lanka Traffic AI System")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static Files for Violations
os.makedirs("static/violations", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize Engine
traffic_engine = TrafficEngine()

# Startup Hardware Check
if torch.cuda.is_available():
    print(f"✅ GPU DETECTED: {torch.cuda.get_device_name(0)}")
    print("   AI Engine will use CUDA acceleration.")
else:
    print("⚠️ GPU NOT DETECTED: Running in CPU mode.")
    print("   To enable GPU, install PyTorch with CUDA support.")

@app.get("/")
def read_root():
    hardware_info = {
        "gpu_available": torch.cuda.is_available(),
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    }
    
    # We get health here which now includes the Corridor Status
    health_data = traffic_engine.get_health()
    
    return {
        "status": "AI Online", 
        "active": traffic_engine.running, 
        "health": health_data, # Now contains the optimizer data
        "hardware": hardware_info
    }

@app.get("/video_feed")
def video_feed(id: str = None, q: str = 'medium', fps: int = 30):
    return StreamingResponse(traffic_engine.generate_frames(cam_id=id), 
                             media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/control/start")
def start_processing():
    if traffic_engine.running:
        return {"message": "Already running"}
    
    if not traffic_engine.config.video_sources:
        # Fallback if no config sent yet
        return {"message": "No sources configured. Please save settings first."}

    traffic_engine.start_all()
    return {"message": "Traffic AI Started"}

@app.post("/control/stop")
def stop_processing():
    traffic_engine.stop()
    return {"message": "Traffic AI Stopped"}

@app.post("/config/update")
def update_settings(config: SystemConfig):
    traffic_engine.update_config(config.dict())
    return {"message": "Configuration updated"}

@app.get("/violations")
def get_recent_violations(db: Session = Depends(get_db)):
    return db.query(models.Violation).order_by(models.Violation.detected_at.desc()).limit(50).all()