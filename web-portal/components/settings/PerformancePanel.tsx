/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from 'react';
import { trafficAPI, SystemConfig, SystemHealth } from '@/lib/api';
import { 
  Activity, Cpu, Layers, Gauge, Play, Square, Zap, 
  Thermometer, BarChart2
} from 'lucide-react';

interface Props {
  config: SystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
}

export default function PerformancePanel({ config, setConfig }: Props) {
  const [health, setHealth] = useState<SystemHealth>({
    cpu_usage: 0, memory_usage: 0, active_models: [], pid_status: 'Offline', fps_processed: 0
  });
  const [isRunning, setIsRunning] = useState(false);

  // Poll for Health Stats
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await trafficAPI.getStatus();
        setIsRunning(status.active);
        if (status.health) setHealth(status.health);
      } catch (e) {
        // Backend offline
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    try {
      await trafficAPI.startSystem();
      setIsRunning(true);
    } catch(e) { alert("Failed to start AI"); }
  };

  const handleStop = async () => {
    await trafficAPI.stopSystem();
    setIsRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2">
        <Activity className="text-green-500" />
        <h3 className="text-lg font-semibold text-white">System Performance</h3>
      </div>

      {/* 1. Health Dashboard */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HealthCard icon={<Cpu size={14}/>} label="CPU Load" value={`${health.cpu_usage}%`} color="text-blue-400" />
        <HealthCard icon={<Layers size={14}/>} label="RAM Usage" value={`${health.memory_usage}%`} color="text-purple-400" />
        <HealthCard icon={<Gauge size={14}/>} label="Processing FPS" value={health.fps_processed || 0} color="text-green-400" />
        <div className="bg-slate-950 p-3 rounded border border-slate-800 flex flex-col justify-between">
           <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
             <BarChart2 size={10}/> AI Engine
           </span>
           <div className="flex items-center gap-2 mt-1">
             {isRunning ? (
               <button onClick={handleStop} className="flex-1 bg-red-900/30 text-red-400 border border-red-800 rounded px-2 py-1 text-xs font-bold hover:bg-red-900/50 flex items-center justify-center gap-1">
                 <Square size={10} fill="currentColor"/> STOP
               </button>
             ) : (
               <button onClick={handleStart} className="flex-1 bg-green-900/30 text-green-400 border border-green-800 rounded px-2 py-1 text-xs font-bold hover:bg-green-900/50 flex items-center justify-center gap-1">
                 <Play size={10} fill="currentColor"/> START
               </button>
             )}
           </div>
        </div>
      </div>

      {/* 2. Active Models List */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
         <div className="text-xs text-slate-500 uppercase font-bold mb-2">Active Neural Networks</div>
         <div className="flex flex-wrap gap-2">
           {health.active_models.length > 0 ? health.active_models.map(m => (
             <span key={m} className="text-xs bg-slate-800 text-blue-300 px-2 py-1 rounded border border-slate-700">{m}</span>
           )) : <span className="text-xs text-slate-600">Engine Standby</span>}
         </div>
      </div>

      {/* 3. Anti-Lag & Smoothing */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4">
         <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2"><Zap size={16} className="text-yellow-500"/> Optimization</h4>
         </div>
         
         <div className="space-y-3">
            <div>
               <label className="text-xs text-slate-400 mb-1 block">Latency Mode</label>
               <div className="grid grid-cols-3 gap-2">
                  {['ultra_low', 'balanced', 'smooth'].map((mode) => (
                    <button 
                      key={mode}
                      onClick={() => setConfig({...config, latency_mode: mode as any})}
                      className={`text-[10px] uppercase py-1.5 rounded border ${config.latency_mode === mode ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-500'}`}
                    >
                      {mode.replace('_', ' ')}
                    </button>
                  ))}
               </div>
               <p className="text-[10px] text-slate-500 mt-1">
                 {config.latency_mode === 'ultra_low' ? 'Skips frames heavily to keep real-time.' : 
                  config.latency_mode === 'smooth' ? 'Buffers frames for better detection stability.' : 'Standard operation.'}
               </p>
            </div>

            <div>
               <label className="text-xs text-slate-400 mb-1 flex justify-between">
                 <span>Prediction Smoothing</span>
                 <span className="text-white font-mono">{config.smoothing_factor || 0.5}</span>
               </label>
               <input 
                 type="range" min="0" max="1" step="0.1"
                 value={config.smoothing_factor || 0.5}
                 onChange={(e) => setConfig({...config, smoothing_factor: parseFloat(e.target.value)})}
                 className="w-full accent-blue-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
               />
            </div>
         </div>
      </div>
    </div>
  );
}

function HealthCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-slate-950 p-3 rounded border border-slate-800">
       <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1 font-bold">{icon} {label}</div>
       <div className={`text-lg font-mono font-bold mt-1 ${color}`}>{value}</div>
    </div>
  )
}