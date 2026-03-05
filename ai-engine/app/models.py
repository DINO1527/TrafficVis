from sqlalchemy import Column, Integer, String, Float, Boolean, TIMESTAMP, Enum
from sqlalchemy.sql import func
import datetime

# FIX: Absolute import from the 'app' package
from app.database import Base

class VehicleLog(Base):
    __tablename__ = "vehicle_logs"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_type = Column(String(50))
    entry_time = Column(TIMESTAMP, server_default=func.now())
    camera_id = Column(String(20), default="Cam_01")

class Violation(Base):
    __tablename__ = "violations"
    id = Column(Integer, primary_key=True, index=True)
    violation_type = Column(String(50)) # NO_HELMET, SPEEDING, etc.
    vehicle_type = Column(String(50))
    license_plate = Column(String(20))
    speed_kph = Column(Float, default=0.0)
    evidence_path = Column(String(255))
    detected_at = Column(TIMESTAMP, server_default=func.now())
    is_reviewed = Column(Boolean, default=False)