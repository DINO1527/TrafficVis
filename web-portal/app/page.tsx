/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, Square, Activity, FileWarning, 
  Video, Clock, BarChart3, ChevronRight, ShieldCheck, 
  Settings2, Monitor, AlertTriangle, Route, Car, Gauge
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

// --- INLINED API TYPES & LOGIC ---

export interface VideoSourceConfig {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  role: 'main' | 'pre' | 'post' | 'none'; 
  lane_data?: number[][]; 
}

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
  corridor_status?: {
    dir1: CorridorStatus;
    dir2: CorridorStatus;
  };
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

export const trafficAPI = {
  getStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/`);
      if (!res.ok) throw new Error('Backend unreachable');
      return await res.json();
    } catch (e: any) {
      throw new Error(e.message || "Backend unreachable");
    }
  },

  startSystem: async () => {
    try {
      const res = await fetch(`${API_BASE}/control/start`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start');
      return await res.json();
    } catch (error: any) {
      throw new Error(error.message);
    }
  },
  
  stopSystem: async () => {
    try {
      const res = await fetch(`${API_BASE}/control/stop`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to stop');
      return await res.json();
    } catch (error: any) {
      throw new Error(error.message);
    }
  },

  getViolations: async () => {
    try {
      const res = await fetch(`${API_BASE}/violations`);
      if (!res.ok) throw new Error('Failed to fetch violations');
      return await res.json() as Violation[];
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
};

// --- MAIN COMPONENT ---

export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [time, setTime] = useState("");
  const [isClient, setIsClient] = useState(false);
  
  const [sources, setSources] = useState<VideoSourceConfig[]>([]);
  const [activeCamId, setActiveCamId] = useState<string | null>(null);
  
  // Stable token for MJPEG stream to prevent flickering on re-renders
  const [streamSession, setStreamSession] = useState<number>(Date.now());

  // 1. Load Config
  useEffect(() => {
    setIsClient(true);
    const savedData = localStorage.getItem('trafficVis_data_v4');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.sources && Array.isArray(parsed.sources)) {
          setSources(parsed.sources);
          if (parsed.sources.length > 0) setActiveCamId(parsed.sources[0].id);
        }
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
  }, []);

  // 2. Polling for Violations & Health/Optimizer Status
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);

    const dataInterval = setInterval(async () => {
      try {
        if (error === "Backend unreachable") setError(null);
        
        const vioRes = await trafficAPI.getViolations();
        setViolations(vioRes);
        
        const status = await trafficAPI.getStatus();
        setIsRunning(status.active);
        setHealth(status.health);
        
      } catch (e: any) { 
        // Silent fail on polling
      }
    }, 2000);

    return () => { clearInterval(timer); clearInterval(dataInterval); };
  }, [error]); 

  // 3. Controls
  const handleStart = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await trafficAPI.startSystem();
      setStreamSession(Date.now()); // Reset streams
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleStop = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await trafficAPI.stopSystem();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const stats = {
    speeding: violations.filter(v => v.violation_type === 'SPEEDING').length,
    helmet: violations.filter(v => v.violation_type === 'NO_HELMET').length,
    lane: violations.filter(v => v.violation_type === 'LANE_CROSS').length,
  };

  if (!isClient) return null;

  // Derive styles from corridor status
  const corridor = health?.corridor_status;
  
  const renderDirection = (dirStatus: CorridorStatus | undefined, title: string) => {
    if (!dirStatus) return null;
    const isHigh = dirStatus.congestion_level === 'HIGH';
    const isMed = dirStatus.congestion_level === 'MEDIUM';
    const levelColor = isHigh ? 'text-red-500' : isMed ? 'text-yellow-500' : 'text-emerald-500';
    const levelBg = isHigh ? 'bg-red-500/10 border-red-500/20' : isMed ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-emerald-500/10 border-emerald-500/20';
    
    return (
      <div className={`flex-1 rounded-2xl border p-4 xl:p-6 flex flex-col md:flex-row items-center justify-between gap-4 transition-colors duration-500 ${levelBg}`}>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className={`p-3 rounded-full bg-slate-950/50 border ${levelColor.replace('text', 'border')}`}>
             <Route size={24} className={levelColor} />
          </div>
          <div>
             <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
             <div className={`text-xl xl:text-2xl font-black truncate ${levelColor}`}>{dirStatus.status_text}</div>
          </div>
        </div>
        
        <div className="flex gap-4 xl:gap-6 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 w-full md:w-auto justify-between">
           <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-[10px] xl:text-xs font-bold uppercase mb-1"><Gauge size={12}/> Speed</div>
              <div className="text-lg xl:text-xl font-mono text-white font-bold">{dirStatus.avg_speed_kmh} <span className="text-[10px] text-slate-500">km/h</span></div>
           </div>
           <div className="w-px bg-slate-800"></div>
           <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-[10px] xl:text-xs font-bold uppercase mb-1"><Car size={12}/> Volume</div>
              <div className="text-lg xl:text-xl font-mono text-white font-bold">{dirStatus.total_vehicles} <span className="text-[10px] text-slate-500">v/m</span></div>
           </div>
           <div className="w-px bg-slate-800"></div>
           <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-[10px] xl:text-xs font-bold uppercase mb-1"><Activity size={12}/> Load</div>
              <div className="text-lg xl:text-xl font-mono text-white font-bold">{(dirStatus.density * 100).toFixed(0)}<span className="text-[10px] text-slate-500">%</span></div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      {error && (
        <div className="bg-red-950 border border-red-800 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* --- Top Header --- */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Traffic Command Center</h2>
          <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
            <span className={`flex items-center gap-1 font-bold ${isRunning ? 'text-green-400' : 'text-blue-400'}`}>
               <ShieldCheck size={14} /> {isRunning ? "AI Processing Active" : "System Ready"}
            </span>
            <span>•</span>
            <span>Colombo, Sri Lanka</span>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-end md:items-center gap-4 w-full xl:w-auto">
          <div className="bg-slate-950 px-4 py-2 rounded-lg border border-slate-800 flex items-center gap-3 shadow-inner">
            <Clock className="text-blue-500 animate-pulse" size={20} />
            <span className="text-2xl font-mono font-bold text-slate-200 tracking-wider w-36 text-center">{time || "--:--:--"}</span>
          </div>

          <div className="flex gap-2">
            {!isRunning ? (
              <button onClick={handleStart} disabled={actionLoading || sources.length === 0} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg flex items-center gap-2 font-bold transition shadow-lg shadow-blue-900/20">
                <Play size={20} fill="currentColor" /> INITIALIZE AI
              </button>
            ) : (
              <button onClick={handleStop} disabled={actionLoading} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-6 py-3 rounded-lg flex items-center gap-2 font-bold transition shadow-lg shadow-red-900/20">
                <Square size={20} fill="currentColor" /> TERMINATE AI
              </button>
            )}
          </div>
        </div>
      </div>

      {/* --- OPTIMIZED CORRIDOR DASHBOARD (SPLIT DIRECTIONS) --- */}
      {corridor && isRunning && (
        <div className="flex flex-col lg:flex-row gap-4 w-full">
          {renderDirection(corridor.dir1, "Lane 1 (Down/Left)")}
          {renderDirection(corridor.dir2, "Lane 2 (Up/Right)")}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        
        {/* LEFT COL: Video Grid */}
        <div className="2xl:col-span-2 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Video size={18} className="text-blue-500" /> Synchronized CCTV Feeds
            </h3>
            <a href="/settings" className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded flex items-center gap-1 transition">
              <Settings2 size={14} /> Configure Sources
            </a>
          </div>
          
          {/* Dynamic Video Grid - Streams ALL 3 CAMERAS */}
          {sources.length === 0 ? (
             <div className="h-64 bg-slate-900/50 rounded-xl border border-slate-800 border-dashed flex flex-col items-center justify-center text-slate-500">
                <Video size={48} className="mb-4 opacity-50" />
                <p>No video sources configured.</p>
                <a href="/settings" className="text-blue-400 hover:underline mt-2">Go to Settings</a>
             </div>
          ) : (
            <div className={`grid gap-4 ${sources.length === 1 ? 'grid-cols-1' : sources.length === 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {sources.map((cam) => {
                
                // If running, grab the MJPEG stream for this specific camera ID.
                // Using streamSession prevents the browser from reloading the image on every component render.
                const videoSrc = isRunning ? `${API_BASE}/video_feed?id=${cam.id}&session=${streamSession}` : null;

                return (
                  <div 
                    key={cam.id} 
                    className={`relative group bg-black rounded-xl border aspect-video overflow-hidden shadow-2xl transition-all cursor-pointer ${activeCamId === cam.id ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.01] z-10' : 'border-slate-800 opacity-80 hover:opacity-100'}`}
                    onClick={() => setActiveCamId(cam.id)}
                  >
                    {/* Visual Header */}
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-3 flex justify-between items-start z-20">
                      <span className="text-[10px] font-bold text-white uppercase bg-slate-800/80 px-2 py-0.5 rounded border border-slate-600 shadow-sm">
                        {cam.label || "Unnamed Cam"}
                      </span>
                      {isRunning && (
                        <span className="text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded animate-pulse shadow-sm">LIVE AI</span>
                      )}
                    </div>

                    {/* Video Logic */}
                    {videoSrc ? (
                      <img 
                        src={videoSrc}
                        alt={`Feed ${cam.label}`} 
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          // Fix for black screens: Retry loading the stream if it drops
                          const target = e.target as HTMLImageElement;
                          setTimeout(() => {
                            if (isRunning) {
                              target.src = `${API_BASE}/video_feed?id=${cam.id}&session=${Date.now()}`;
                            }
                          }, 2000);
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-700">
                        <Monitor size={32} className="mb-2 opacity-20" />
                        <span className="text-xs font-medium">System Offline</span>
                      </div>
                    )}
                    
                    {/* Role Badge */}
                    <div className="absolute bottom-2 right-2 z-20">
                      <span className="text-[9px] bg-black/50 text-slate-400 px-1.5 rounded uppercase font-mono">{cam.role}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Analytics Graph */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 mt-6">
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <BarChart3 size={18} className="text-purple-500" /> Automated Violation Analytics
                </h3>
             </div>
             <div className="h-32 flex items-end justify-around gap-4 px-4">
                <Bar label="Speeding" value={stats.speeding} total={violations.length} color="bg-orange-500" />
                <Bar label="No Helmet" value={stats.helmet} total={violations.length} color="bg-red-500" />
                <Bar label="Lane Cross" value={stats.lane} total={violations.length} color="bg-yellow-500" />
             </div>
          </div>
        </div>

        {/* RIGHT COL: Alerts Sidebar */}
        <div className="space-y-6">
           <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-[800px]">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 rounded-t-xl">
              <h3 className="font-bold text-white flex items-center gap-2">
                <FileWarning size={18} className="text-red-500" /> Recorded Violations
              </h3>
              <a href="/violations" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition">
                View All <ChevronRight size={12} />
              </a>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {violations.slice(0, 10).map((v) => (
                <div key={v.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 hover:border-slate-700 transition group relative overflow-hidden">
                  <div className="flex justify-between items-start gap-3">
                    <div className="w-16 h-16 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex-shrink-0">
                      <img 
                         src={`${API_BASE}${v.evidence_path}`} 
                         onError={(e) => e.currentTarget.src = 'https://placehold.co/100x100/1e293b/475569?text=No+Img'}
                         alt="Evidence" 
                         className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          v.violation_type === 'SPEEDING' ? 'bg-orange-950 text-orange-400 border-orange-900' : 
                          v.violation_type === 'NO_HELMET' ? 'bg-red-950 text-red-400 border-red-900' :
                          'bg-yellow-950 text-yellow-400 border-yellow-900'
                        }`}>
                          {v.violation_type.replace('_', ' ')}
                        </span>
                        <span className="text-slate-500 text-[10px]">{new Date(v.detected_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-sm font-mono text-white font-bold truncate">{v.license_plate || "UNKNOWN"}</div>
                      <div className="text-xs text-slate-400 capitalize">{v.vehicle_type}</div>
                    </div>
                    
                    <div className="text-right">
                        <span className="block text-xl font-bold text-slate-200">{v.speed_kph.toFixed(0)}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">KM/H</span>
                    </div>
                  </div>
                </div>
              ))}
              {violations.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                  <Activity size={32} className="mb-2" />
                  <p className="text-sm text-center">Monitoring Traffic...<br/>Waiting for violations.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Simple Bar component for the analytics graph
function Bar({ label, value, total, color }: any) {
  const height = total > 0 ? Math.max(10, (value / total) * 100) : 5;
  return (
    <div className="flex flex-col items-center justify-end h-full w-full group cursor-default">
      <div className="mb-2 font-bold text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity transform -translate-y-2">
         {value}
      </div>
      <div 
        className={`w-full max-w-[60px] rounded-t-lg transition-all duration-1000 ${color} opacity-80 group-hover:opacity-100`} 
        style={{ height: `${height}%` }}
      />
      <div className="mt-2 text-xs text-slate-400 font-medium">{label}</div>
    </div>
  )
}