/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable react-hooks/purity */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { 
  Save, CheckCircle2, AlertTriangle, Video, Plus, Trash2, Power, 
  MousePointer2, RefreshCw, AlertCircle, Settings2,
  Cpu, Gauge, Zap, MapPin, BoxSelect, Map
} from 'lucide-react';

// --- DYNAMIC LEAFLET IMPORTS (SSR SAFE) ---
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

// Helper to fix missing default icons in react-leaflet
const getCustomIcon = () => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  return L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });
};

// --- SHARED TYPES ---

export interface VideoSourceConfig {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  role: 'main' | 'pre' | 'post' | 'none'; 
  lane_data?: number[][]; 
  location?: { lat: number; lng: number };
  roi_polygon?: number[][]; 
  enable_traffic_light?: boolean;
  min_green_time?: number;
  max_green_time?: number;
  junction_type?: 't_junction' | 'four_way';
  turn_type?: 'two_turn' | 'three_turn';
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

// --- API LAYER ---

const API_BASE = 'http://localhost:8000';

const handleAPIError = async (res: Response): Promise<string> => {
  try {
    const data = await res.json();
    return data?.message || "Unexpected server error";
  } catch {
    return "Backend unreachable";
  }
};

export const trafficAPI = {
  getStatus: async () => {
    const res = await fetch(`${API_BASE}/`);
    if (!res.ok) throw new Error(await handleAPIError(res));
    return res.json();
  },
  updateConfig: async (config: Partial<SystemConfig>) => {
    const res = await fetch(`${API_BASE}/config/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) throw new Error(await handleAPIError(res));
    return res.json();
  }
};

// --- SUB-COMPONENT: Location Picker Map ---

function LocationPicker({ lat, lng, onChange }: { lat: number, lng: number, onChange: (lat: number, lng: number) => void }) {
  const icon = getCustomIcon();
  
  return (
    <div className="h-48 w-full rounded-lg overflow-hidden border border-slate-700 mt-2 relative z-0">
      <MapContainer center={[lat, lng]} zoom={13} style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {icon && (
          <Marker 
            position={[lat, lng]} 
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                onChange(position.lat, position.lng);
              }
            }}
            icon={icon}
          />
        )}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[400] bg-black/70 backdrop-blur text-[10px] text-white px-2 py-1 rounded pointer-events-none">
        Drag marker to update
      </div>
    </div>
  );
}

// --- SUB-COMPONENT 1: PerformancePanel ---

function PerformancePanel({ config, setConfig }: { config: SystemConfig; setConfig: React.Dispatch<React.SetStateAction<SystemConfig>> }) {
  const handleChange = (field: keyof SystemConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-2">
        <Cpu className="text-blue-500" />
        <h3 className="text-lg font-semibold text-white">System Performance</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <label className="text-xs text-slate-400 block mb-2">Video Quality</label>
          <select 
            value={config.video_quality} 
            onChange={(e) => handleChange('video_quality', e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="low">Low (Fastest)</option>
            <option value="medium">Medium (Balanced)</option>
            <option value="high">High (Best Accuracy)</option>
          </select>
        </div>

        <div>
           <label className="text-xs text-slate-400 block mb-2">Latency Mode</label>
           <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-700">
             {['ultra_low', 'balanced', 'smooth'].map((mode) => (
               <button
                 key={mode}
                 onClick={() => handleChange('latency_mode', mode)}
                 className={`flex-1 text-[10px] uppercase font-bold py-1.5 rounded transition ${config.latency_mode === mode ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
               >
                 {mode.replace('_', ' ')}
               </button>
             ))}
           </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-2 flex justify-between">
            <span>Process Every N Frames</span>
            <span className="text-white font-mono">{config.process_every_n_frames}</span>
          </label>
          <input 
            type="range" min="1" max="10" step="1"
            value={config.process_every_n_frames}
            onChange={(e) => handleChange('process_every_n_frames', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-2 flex justify-between">
             <span>Smoothing Factor</span>
             <span className="text-white font-mono">{config.smoothing_factor}</span>
          </label>
          <input 
            type="range" min="0" max="1" step="0.1"
            value={config.smoothing_factor}
            onChange={(e) => handleChange('smoothing_factor', parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENT 2: VideoLaneManager ---

function VideoLaneManager({ sources, setSources }: { sources: VideoSourceConfig[]; setSources: React.Dispatch<React.SetStateAction<VideoSourceConfig[]>> }) {
  const [selectedCamId, setSelectedCamId] = useState<string>(sources[0]?.id);
  const [drawMode, setDrawMode] = useState<'lane' | 'roi'>('lane');
  const [showMapForId, setShowMapForId] = useState<string | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const [previewTimestamp, setPreviewTimestamp] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
        setPreviewTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (sources.length > 0 && !sources.find(s => s.id === selectedCamId)) {
        setSelectedCamId(sources[0].id);
    }
  }, [sources, selectedCamId]);

  const addSource = () => {
    if (sources.length >= 4) return;
    const newId = `cam_${Date.now()}`;
    setSources([...sources, { 
      id: newId, label: "New Camera", url: "", enabled: true, role: 'none', 
      lane_data: [], roi_polygon: [], 
      enable_traffic_light: false, junction_type: 'four_way', turn_type: 'two_turn',
      location: { lat: 6.9271, lng: 79.8612 } // Default Colombo
    }]);
    setSelectedCamId(newId);
  };

  const removeSource = (id: string) => {
    setSources(sources.filter(s => s.id !== id));
  };

  const updateSource = (id: string, field: keyof VideoSourceConfig, value: any) => {
    setSources(sources.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const updateLocation = (id: string, lat: number, lng: number) => {
    setSources(sources.map(s => s.id === id ? { ...s, location: { lat, lng } } : s));
  };

  const activeSource = sources.find(s => s.id === selectedCamId);
  const isMain = activeSource?.role === 'main';

  const handleVideoClick = (e: React.MouseEvent) => {
    if (!videoRef.current || !activeSource) return;
    
    const rect = videoRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    if (drawMode === 'lane' && isMain) {
      const currentPoints = activeSource.lane_data || [];
      if (currentPoints.length >= 2) return;
      updateSource(activeSource.id, 'lane_data', [...currentPoints, [x, y]]);
    } else if (drawMode === 'roi') {
      const currentPoints = activeSource.roi_polygon || [];
      if (currentPoints.length >= 4) return;
      updateSource(activeSource.id, 'roi_polygon', [...currentPoints, [x, y]]);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      {/* 1. Source List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Video className="text-blue-500" />
            <h3 className="text-lg font-semibold text-white">Video Sources</h3>
          </div>
          <button onClick={addSource} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded flex items-center gap-1 transition">
            <Plus size={14} /> Add Input
          </button>
        </div>

        <div className="space-y-4 max-h-[750px] overflow-y-auto pr-2 custom-scrollbar">
          {sources.map((cam, idx) => (
            <div key={cam.id} className={`bg-slate-900 p-4 rounded-xl border transition ${selectedCamId === cam.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-800'}`}>
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase">Input {idx + 1}</span>
                <div className="flex gap-2">
                   <button onClick={() => updateSource(cam.id, 'enabled', !cam.enabled)} className={`p-1.5 rounded ${cam.enabled ? 'text-green-400 bg-green-900/20' : 'text-slate-500 bg-slate-800'}`}><Power size={12}/></button>
                   <button onClick={() => removeSource(cam.id)} className="p-1.5 rounded text-red-400 bg-red-900/20"><Trash2 size={12}/></button>
                </div>
              </div>
              
              <div className="space-y-3">
                <input type="text" value={cam.label} onChange={(e) => updateSource(cam.id, 'label', e.target.value)} className="w-full bg-slate-950 border-b border-slate-700 text-white text-sm pb-1 outline-none focus:border-blue-500" placeholder="Label"/>
                <input type="text" value={cam.url} onChange={(e) => updateSource(cam.id, 'url', e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none focus:border-blue-500" placeholder="File Path or URL"/>
                
                {/* Location Settings with Map Toggle */}
                <div>
                  <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded p-2">
                    <div className="flex items-center gap-2 w-full">
                      <MapPin size={14} className="text-blue-400" />
                      <input type="number" step="0.000001" value={cam.location?.lat || 0} onChange={(e) => updateLocation(cam.id, parseFloat(e.target.value), cam.location?.lng || 0)} className="bg-transparent text-xs text-slate-300 w-full outline-none" placeholder="Latitude"/>
                      <span className="text-slate-600">,</span>
                      <input type="number" step="0.000001" value={cam.location?.lng || 0} onChange={(e) => updateLocation(cam.id, cam.location?.lat || 0, parseFloat(e.target.value))} className="bg-transparent text-xs text-slate-300 w-full outline-none" placeholder="Longitude"/>
                    </div>
                    <button 
                      onClick={() => setShowMapForId(showMapForId === cam.id ? null : cam.id)} 
                      className={`p-1 ml-2 rounded transition ${showMapForId === cam.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                      title="Select on Map"
                    >
                      <Map size={16} />
                    </button>
                  </div>
                  {/* Interactive Leaflet Map Preview */}
                  {showMapForId === cam.id && (
                    <LocationPicker 
                      lat={cam.location?.lat || 6.9271} 
                      lng={cam.location?.lng || 79.8612} 
                      onChange={(lat, lng) => updateLocation(cam.id, lat, lng)} 
                    />
                  )}
                </div>

                <div className="flex items-center gap-2">
                   <span className="text-xs text-slate-500">Role:</span>
                   <select value={cam.role} onChange={(e) => updateSource(cam.id, 'role', e.target.value)} className="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 flex-1 outline-none">
                     <option value="none">Monitoring Only</option>
                     <option value="main">Main (Violation + PID)</option>
                     <option value="pre">Previous (PID Flow)</option>
                     <option value="post">Next (PID Flow)</option>
                   </select>
                </div>

                {/* --- TRAFFIC LIGHT CONFIGURATION BLOCK --- */}
                <div className="mt-4 p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-300 flex items-center gap-1">
                            <Zap size={12} className="text-yellow-500"/> Junction Optimizer
                        </span>
                        <button 
                            onClick={() => updateSource(cam.id, 'enable_traffic_light', !cam.enable_traffic_light)}
                            className={`w-8 h-4 rounded-full relative transition-colors ${cam.enable_traffic_light ? 'bg-green-600' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${cam.enable_traffic_light ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                    </div>

                    {cam.enable_traffic_light && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Junction Type</label>
                                    <select value={cam.junction_type || 'four_way'} onChange={(e) => updateSource(cam.id, 'junction_type', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none">
                                        <option value="four_way">4-Way Intersection</option>
                                        <option value="t_junction">T-Junction</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Road Rules</label>
                                    <select value={cam.turn_type || 'two_turn'} onChange={(e) => updateSource(cam.id, 'turn_type', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none">
                                        <option value="two_turn">2-Turn Road</option>
                                        <option value="three_turn">3-Turn Road</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Min Green (sec)</label>
                                    <input type="number" value={cam.min_green_time || 15} onChange={(e) => updateSource(cam.id, 'min_green_time', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-yellow-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Max Green (sec)</label>
                                    <input type="number" value={cam.max_green_time || 60} onChange={(e) => updateSource(cam.id, 'max_green_time', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-yellow-500" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* --- END TRAFFIC LIGHT BLOCK --- */}
              </div>

              <button onClick={() => setSelectedCamId(cam.id)} className={`w-full mt-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-2 transition ${selectedCamId === cam.id ? 'bg-blue-600/20 text-blue-400 cursor-default' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                <Settings2 size={12}/> {selectedCamId === cam.id ? 'Calibrating...' : 'Calibrate Region'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Visual Calibrator */}
      <div className="space-y-6 flex flex-col">
         <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <MousePointer2 className="text-purple-500" />
              <h3 className="text-lg font-semibold text-white">AI Zone Editor</h3>
            </div>
            <div className="text-xs text-slate-400">Target: <span className="text-blue-400 font-bold">{activeSource?.label}</span></div>
         </div>

         <div className={`bg-slate-900 rounded-xl border border-slate-800 p-1 flex-1 flex flex-col min-h-[400px] relative`}>
            
            <div className="flex gap-2 p-2 border-b border-slate-800 bg-slate-950/50">
               <button onClick={() => setDrawMode('lane')} className={`flex-1 py-1.5 text-xs font-bold rounded flex items-center justify-center gap-2 transition ${drawMode === 'lane' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                  Draw Lane Line
               </button>
               <button onClick={() => setDrawMode('roi')} className={`flex-1 py-1.5 text-xs font-bold rounded flex items-center justify-center gap-2 transition ${drawMode === 'roi' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                  <BoxSelect size={14} /> Draw AI Waiting ROI
               </button>
            </div>

            <div ref={videoRef} onClick={handleVideoClick} className={`relative bg-black rounded-b-lg overflow-hidden flex-1 w-full cursor-crosshair`}>
               {activeSource?.url ? (
                   // eslint-disable-next-line @next/next/no-img-element
                   <img 
                    src={`${API_BASE}/video_feed?id=${selectedCamId}&type=raw&fps=1&q=low&t=${previewTimestamp}`} 
                    alt="Calibration" 
                    className="w-full h-full object-contain opacity-80"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                   />
               ) : (
                   <div className="w-full h-full flex items-center justify-center text-slate-500">
                       <p>No video source URL provided</p>
                   </div>
               )}
               
               <svg className="absolute inset-0 w-full h-full pointer-events-none">
                 {/* Draw Lane Line */}
                 {(activeSource?.lane_data || []).map((p, i) => (
                   <circle key={`lane_${i}`} cx={`${p[0]*100}%`} cy={`${p[1]*100}%`} r="6" fill="#ef4444" stroke="white" strokeWidth="2"/>
                 ))}
                 {(activeSource?.lane_data || []).length === 2 && (
                   <line x1={`${activeSource!.lane_data![0][0]*100}%`} y1={`${activeSource!.lane_data![0][1]*100}%`} x2={`${activeSource!.lane_data![1][0]*100}%`} y2={`${activeSource!.lane_data![1][1]*100}%`} stroke="#ef4444" strokeWidth="4" strokeDasharray="5,5"/>
                 )}

                 {/* Draw ROI Polygon */}
                 {(activeSource?.roi_polygon || []).map((p, i) => (
                   <circle key={`roi_${i}`} cx={`${p[0]*100}%`} cy={`${p[1]*100}%`} r="6" fill="#f97316" stroke="white" strokeWidth="2"/>
                 ))}
                 {(activeSource?.roi_polygon || []).length >= 2 && (
                    <polygon 
                      points={activeSource!.roi_polygon!.map(p => `${p[0]*100},${p[1]*100}`).join(' ')} 
                      fill="rgba(249, 115, 22, 0.2)" 
                      stroke="#f97316" 
                      strokeWidth="2"
                    />
                 )}
               </svg>
            </div>
            
            <div className="p-3 bg-slate-950/50 flex justify-between items-center rounded-b-lg">
                <span className="text-xs text-slate-500">
                  {drawMode === 'lane' ? "Click 2 points to set violation line." : "Click 4 points to draw the vehicle waiting area."}
                </span>
                <button onClick={() => {
                  if (!activeSource) return;
                  updateSource(activeSource.id, drawMode === 'lane' ? 'lane_data' : 'roi_polygon', []);
                }} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw size={12}/> Reset Current Shape
                </button>
            </div>
         </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENT 3: FeatureConfig ---

function FeatureConfig({ config, setConfig }: { config: SystemConfig; setConfig: React.Dispatch<React.SetStateAction<SystemConfig>> }) {
    
    const toggleFeature = (key: keyof SystemConfig) => {
        setConfig(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const updateSpeedLimit = (vehicle: keyof SpeedLimitConfig, value: number) => {
        setConfig(prev => ({
            ...prev,
            speed_limits: { ...prev.speed_limits, [vehicle]: value }
        }));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                 <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-2">
                    <Zap className="text-yellow-500" />
                    <h3 className="text-lg font-semibold text-white">AI Detection Modules</h3>
                </div>
                <div className="space-y-4">
                    {[
                        { key: 'enable_helmet_detection', label: "Helmet Detection", desc: "Identify riders without helmets." },
                        { key: 'enable_speed_detection', label: "Speed Analysis", desc: "Calculate vehicle velocity between points." },
                        { key: 'enable_lane_violation', label: "Lane Discipline", desc: "Detect vehicles crossing solid lines." },
                        { key: 'enable_traffic_optimization', label: "Flow Optimization", desc: "Adjust signal timing based on density." },
                    ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                             <div>
                                 <div className="text-sm font-bold text-white">{item.label}</div>
                                 <div className="text-xs text-slate-500">{item.desc}</div>
                             </div>
                             <button 
                                onClick={() => toggleFeature(item.key as keyof SystemConfig)}
                                className={`w-12 h-6 rounded-full relative transition-colors ${config[item.key as keyof SystemConfig] ? 'bg-green-600' : 'bg-slate-700'}`}
                             >
                                 <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config[item.key as keyof SystemConfig] ? 'left-7' : 'left-1'}`} />
                             </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                 <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-2">
                    <Gauge className="text-red-500" />
                    <h3 className="text-lg font-semibold text-white">Speed Limits (km/h)</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {Object.entries(config.speed_limits).map(([vehicle, limit]) => (
                        <div key={vehicle} className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{vehicle}</label>
                            <input 
                                type="number"
                                value={limit}
                                onChange={(e) => updateSpeedLimit(vehicle as keyof SpeedLimitConfig, parseInt(e.target.value))}
                                className="w-full bg-transparent text-2xl font-mono text-white font-bold outline-none border-b border-slate-800 focus:border-red-500"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- MAIN SETTINGS PAGE COMPONENT ---

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<SystemConfig>({
    enable_helmet_detection: false,
    enable_speed_detection: false,
    enable_lane_violation: false,
    enable_traffic_optimization: false,
    frame_rate_limit: 15,
    video_quality: 'medium',
    process_every_n_frames: 3,
    latency_mode: 'balanced',
    smoothing_factor: 0.5,
    speed_limits: { car: 60, motorbike: 50, tuktuk: 40, bus: 40, truck: 40 },
  });

  const [sources, setSources] = useState<VideoSourceConfig[]>([
    { id: 'cam_1', label: "Main Feed", url: "C:/videos/main.mp4", enabled: true, role: 'main', lane_data: [], roi_polygon: [], enable_traffic_light: true, min_green_time: 15, max_green_time: 60, junction_type: 'four_way', turn_type: 'two_turn', location: { lat: 6.9271, lng: 79.8612 } },
    { id: 'cam_2', label: "Left Road", url: "", enabled: true, role: 'pre', lane_data: [], roi_polygon: [], enable_traffic_light: false, junction_type: 'four_way', turn_type: 'two_turn', location: { lat: 6.9271, lng: 79.8612 } },
    { id: 'cam_3', label: "Right Road", url: "", enabled: true, role: 'post', lane_data: [], roi_polygon: [], enable_traffic_light: false, junction_type: 'four_way', turn_type: 'two_turn', location: { lat: 6.9271, lng: 79.8612 } },
  ]);

  useEffect(() => {
    setIsClient(true);
    const savedData = localStorage.getItem('trafficVis_data_v4');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if(parsed.config) setConfig(prev => ({...prev, ...parsed.config}));
        if(parsed.sources && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
            setSources(parsed.sources);
        }
      } catch (e) {
        console.error("Error parsing settings:", e);
      }
    }
  }, []);

  const saveAll = async () => {
    setLoading(true);
    try {
      const payload: SystemConfig = {
        ...config,
        video_sources: sources 
      };

      try {
        setError(null);
        await trafficAPI.updateConfig(payload);
      } catch(e: any){ 
        console.error(e);
        setError(`Backend Sync Failed: ${e.message}`);
      }

      const fullState = { config, sources };
      localStorage.setItem('trafficVis_data_v4', JSON.stringify(fullState));
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error(e);
      setError("Critical Error Saving Settings");
    }
    setLoading(false);
  };

  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-slate-950 p-8 font-sans">
      <div className="max-w-[1600px] mx-auto space-y-10 pb-20">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b border-slate-800 pb-6">
          <div>
            <h2 className="text-3xl font-bold text-white">System Settings</h2>
            <p className="text-slate-400 mt-1">Configure inputs, regions, and optimization variables.</p>
          </div>
          <button 
            onClick={saveAll}
            disabled={loading}
            className={`px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition shadow-lg ${
              success ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {success ? <CheckCircle2 size={20} /> : <Save size={20} />} 
            {success ? "Settings Saved" : loading ? "Syncing..." : "Save All Changes"}
          </button>
        </div>
        
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
             <AlertTriangle size={16} /> {error}
          </div>
        )}

        <PerformancePanel config={config} setConfig={setConfig} />
        <VideoLaneManager sources={sources} setSources={setSources} />
        <FeatureConfig config={config} setConfig={setConfig} />

      </div>
    </div>
  );
}