/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';

const handleAPIError = (error: any): string => {
  if (!error.response) return "Backend unreachable";
  return error.response.data?.message || "Unexpected server error";
};

// --- Data Types ---

export interface VideoSourceConfig {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  role: 'main' | 'pre' | 'post' | 'none'; 
  lane_data?: number[][]; 
}

export interface SpeedLimitConfig {
  car: number;
  motorbike: number;
  tuktuk: number;
  bus: number;
  truck: number;
}

export interface SystemConfig {
  enable_helmet_detection: boolean;
  enable_speed_detection: boolean;
  enable_lane_violation: boolean;
  enable_traffic_optimization: boolean;
  frame_rate_limit: number;
  video_quality: 'low' | 'medium' | 'high';
  process_every_n_frames: number;
  latency_mode: 'ultra_low' | 'balanced' | 'smooth'; 
  smoothing_factor: number; 
  speed_limits: SpeedLimitConfig;
  video_sources?: VideoSourceConfig[];
  lane_line?: number[][];
}

// NEW: Added Corridor Status interface
export interface CorridorStatus {
  status_text: string;
  congestion_level: 'LOW' | 'MEDIUM' | 'HIGH';
  density: number;
  avg_speed_kmh: number;
  total_vehicles: number;
}

export interface SystemHealth {
  cpu_usage: number;
  memory_usage: number;
  active_models: string[];
  pid_status: string;
  fps_processed: number;
  corridor_status?: CorridorStatus; // NEW: Added to health payload
}

export interface Violation {
  id: number;
  violation_type: string;
  vehicle_type: string;
  license_plate: string;
  speed_kph: number;
  evidence_path: string;
  detected_at: string;
}

// --- Axios Setup ---
const API = axios.create({
  baseURL: 'http://localhost:8000', 
  headers: { 'Content-Type': 'application/json' },
});

export const trafficAPI = {
  getStatus: async () => {
    try {
      // Returns { status: string, active: boolean, health: SystemHealth }
      const res = await API.get('/');
      return res.data;
    } catch(e) {
      throw new Error(handleAPIError(e));
    }
  },

  startSystem: async () => {
    try {
      // Backend now relies on saved config, no need to pass URL here
      const res = await API.post(`/control/start`);
      return res.data;
    } catch (error) {
      throw new Error(handleAPIError(error));
    }
  },
  
  stopSystem: async () => {
    try {
      const res = await API.post('/control/stop');
      return res.data;
    } catch (error) {
      throw new Error(handleAPIError(error));
    }
  },

  updateConfig: async (config: Partial<SystemConfig>) => {
    try {
      const res = await API.post('/config/update', config);
      return res.data;
    } catch (error) {
      throw new Error(handleAPIError(error));
    }
  },

  getViolations: async () => {
    try {
      const res = await API.get<Violation[]>('/violations');
      return res.data;
    } catch (error) {
      throw new Error(handleAPIError(error));
    }
  }
};