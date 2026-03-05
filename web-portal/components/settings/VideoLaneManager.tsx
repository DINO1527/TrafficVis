'use client';

import React, { useState, useRef } from 'react';
import { VideoSourceConfig } from '@/lib/api';
import { Video, Plus, Trash2, Power, MousePointer2, RefreshCw, AlertCircle, Settings2 } from 'lucide-react';

interface Props {
  sources: VideoSourceConfig[];
  setSources: React.Dispatch<React.SetStateAction<VideoSourceConfig[]>>;
}

export default function VideoLaneManager({ sources, setSources }: Props) {
  const [selectedCamId, setSelectedCamId] = useState<string>(sources[0]?.id);
  const videoRef = useRef<HTMLDivElement>(null);

  // --- Actions ---
  const addSource = () => {
    if (sources.length >= 4) return;
    const newId = `cam_${Date.now()}`;
    setSources([...sources, { id: newId, label: "New Camera", url: "", enabled: true, role: 'none', lane_data: [] }]);
    setSelectedCamId(newId);
  };

  const removeSource = (id: string) => {
    setSources(sources.filter(s => s.id !== id));
    if (selectedCamId === id) setSelectedCamId(sources[0]?.id);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateSource = (id: string, field: keyof VideoSourceConfig, value: any) => {
    setSources(sources.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // --- Lane Logic ---
  const activeSource = sources.find(s => s.id === selectedCamId);
  const isMain = activeSource?.role === 'main';

  const handleVideoClick = (e: React.MouseEvent) => {
    if (!videoRef.current || !activeSource || !isMain) return;
    
    const rect = videoRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const currentPoints = activeSource.lane_data || [];
    if (currentPoints.length >= 2) return;

    updateSource(activeSource.id, 'lane_data', [...currentPoints, [x, y]]);
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

        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
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
                
                <div className="flex items-center gap-2">
                   <span className="text-xs text-slate-500">Role:</span>
                   <select value={cam.role} onChange={(e) => updateSource(cam.id, 'role', e.target.value)} className="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 flex-1 outline-none">
                      <option value="none">Monitoring Only</option>
                      <option value="main">Main (Violation + PID)</option>
                      <option value="pre">Previous (PID Flow)</option>
                      <option value="post">Next (PID Flow)</option>
                   </select>
                </div>
              </div>

              <button onClick={() => setSelectedCamId(cam.id)} className={`w-full mt-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-2 transition ${selectedCamId === cam.id ? 'bg-blue-600/20 text-blue-400 cursor-default' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                <Settings2 size={12}/> {selectedCamId === cam.id ? 'Calibrating...' : 'Calibrate'}
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
              <h3 className="text-lg font-semibold text-white">Lane Editor</h3>
            </div>
            <div className="text-xs text-slate-400">Target: <span className="text-blue-400 font-bold">{activeSource?.label}</span></div>
         </div>

         <div className={`bg-slate-900 rounded-xl border border-slate-800 p-1 flex-1 flex flex-col min-h-[300px] relative ${!isMain ? 'opacity-70' : ''}`}>
            {!isMain && (
               <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm">
                 <div className="text-center p-4">
                   <AlertCircle size={32} className="text-yellow-500 mx-auto mb-2" />
                   <h4 className="text-white font-bold">Unavailable</h4>
                   <p className="text-slate-300 text-xs">Set role to Main&apos; to enable violation lines.</p>
                 </div>
               </div>
            )}

            <div ref={videoRef} onClick={handleVideoClick} className={`relative bg-black rounded-lg overflow-hidden flex-1 w-full ${isMain ? 'cursor-crosshair' : ''}`}>
               {/* Low Quality Settings Stream */}
               <img src={`http://localhost:8000/video_feed?id=${selectedCamId}&type=raw&fps=1&q=low`} alt="Calibration" className="w-full h-full object-contain pointer-events-none opacity-80"/>
               
               <svg className="absolute inset-0 w-full h-full pointer-events-none">
                 {(activeSource?.lane_data || []).map((p, i) => (
                   <circle key={i} cx={`${p[0]*100}%`} cy={`${p[1]*100}%`} r="6" fill="#ef4444" stroke="white" strokeWidth="2"/>
                 ))}
                 {(activeSource?.lane_data || []).length === 2 && (
                   <line x1={`${activeSource!.lane_data![0][0]*100}%`} y1={`${activeSource!.lane_data![0][1]*100}%`} x2={`${activeSource!.lane_data![1][0]*100}%`} y2={`${activeSource!.lane_data![1][1]*100}%`} stroke="#ef4444" strokeWidth="4" strokeDasharray="5,5"/>
                 )}
               </svg>
            </div>
            <div className="p-3 bg-slate-950/50 flex justify-between items-center rounded-b-lg">
                <span className="text-xs text-slate-500">Click 2 points to set lane.</span>
                <button onClick={() => {
                  if (!activeSource) return;
                  updateSource(activeSource.id, 'lane_data', []);
                }} disabled={!isMain} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw size={12}/> Reset
                </button>
            </div>
         </div>
      </div>
    </div>
  );
}