'use client';

import React from 'react';
import { SystemConfig } from '@/lib/api';
import { Zap, Car } from 'lucide-react';

interface Props {
  config: SystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
}

export default function FeatureConfig({ config, setConfig }: Props) {
  
  const handleToggle = (key: keyof SystemConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key as keyof SystemConfig] }));
  };

  const handleSpeedChange = (vehicle: string, val: string) => {
    setConfig(prev => ({
      ...prev,
      speed_limits: { ...prev.speed_limits, [vehicle]: parseInt(val) || 0 }
    }));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
       {/* 1. Toggles */}
       <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Zap className="text-yellow-500" />
            <h3 className="text-lg font-semibold text-white">Detection Logic</h3>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
             {Object.entries({
               enable_helmet_detection: "Helmet Check",
               enable_speed_detection: "Speed Check",
               enable_lane_violation: "Lane Check",
               enable_traffic_optimization: "PID Control"
             }).map(([key, label]) => (
               <label key={key} className="flex items-center justify-between p-2 hover:bg-slate-800 rounded cursor-pointer group">
                  <span className="text-sm text-slate-300 group-hover:text-white transition">{label}</span>
                  <input 
                    type="checkbox" 
                    checked={!!config[key as keyof SystemConfig]}
                    onChange={() => handleToggle(key as keyof SystemConfig)}
                    className="accent-blue-600 w-4 h-4"
                  />
               </label>
             ))}
          </div>
       </div>

       {/* 2. Speed EQ */}
       <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Car className="text-red-500" />
            <h3 className="text-lg font-semibold text-white">Speed Limits</h3>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 flex justify-between items-end h-[200px]">
             {Object.entries(config.speed_limits).map(([vehicle, limit]) => (
               <div key={vehicle} className="flex flex-col items-center gap-3 h-full group w-full relative">
                  {/* Floating Label */}
                  <div 
                    className="bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded border border-slate-700 group-hover:border-blue-500 transition shadow-lg absolute -top-8"
                    style={{ bottom: `${(limit / 120) * 100}%` }} 
                  >
                    {limit}
                  </div>
                  
                  {/* Bar */}
                  <div className="relative w-3 bg-slate-800 h-full rounded-full overflow-hidden shadow-inner">
                     <div 
                       className="absolute bottom-0 w-full bg-gradient-to-t from-blue-700 to-cyan-400 group-hover:from-red-600 group-hover:to-orange-400 transition-all duration-150"
                       style={{ height: `${(limit / 120) * 100}%` }} 
                     />
                     <input 
                       type="range" min="0" max="120" step="5"
                       value={limit}
                       onChange={(e) => handleSpeedChange(vehicle, e.target.value)}
                       className="absolute inset-0 opacity-0 cursor-ns-resize z-10"
                       title={`Adjust ${vehicle}`}
                     />
                  </div>
                  
                  <div className="text-[10px] text-slate-500 uppercase font-bold -rotate-45 origin-left translate-y-3 truncate w-12">
                    {vehicle}
                  </div>
               </div>
             ))}
          </div>
       </div>
    </div>
  );
}