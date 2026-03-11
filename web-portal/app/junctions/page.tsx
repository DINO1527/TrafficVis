/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/purity */
'use client';

import React, { useState, useEffect } from 'react';
import { Network, Video, Zap, Clock, Car } from 'lucide-react';

const API_BASE = 'http://localhost:8000';

interface JunctionLightState {
  light: 'GREEN' | 'RED';
  density: number;
  waiting_time_sec: number;
}

export default function JunctionsView() {
  const [sources, setSources] = useState<any[]>([]);
  const [liveData, setLiveData] = useState<Record<string, JunctionLightState>>({});
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    // 1. Get configuration
    const savedData = localStorage.getItem('trafficVis_data_v4');
    if (savedData) {
      const parsed = JSON.parse(savedData);
      // Filter only cameras acting as traffic lights
      setSources((parsed.sources || []).filter((s: any) => s.enabled && s.enable_traffic_light));
    }

    // 2. Poll Backend for Live Light Timings
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/`);
        if (res.ok) {
          const data = await res.json();
          setLiveData(data.health?.corridor_status?.junctions || {});
        }
      } catch (e) {
        // Ignore errors to prevent log spam if backend is off
      }
      setTimestamp(Date.now());
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper to render a traffic light block
  const TrafficLightNode = ({ camId, label }: { camId: string, label: string }) => {
    const state = liveData[camId] || { light: 'RED', density: 0, waiting_time_sec: 0 };
    const isGreen = state.light === 'GREEN';

    return (
      <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col items-center shadow-2xl relative z-10 w-48">
        <h4 className="text-white font-bold text-sm mb-3 text-center w-full truncate">{label}</h4>
        
        {/* The Traffic Light Graphic */}
        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 space-y-2 mb-4">
          <div className={`w-8 h-8 rounded-full border-2 ${!isGreen ? 'bg-red-500 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-red-950 border-red-900'}`} />
          <div className={`w-8 h-8 rounded-full border-2 ${isGreen ? 'bg-green-500 border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.6)]' : 'bg-green-950 border-green-900'}`} />
        </div>

        {/* Stats */}
        <div className="w-full space-y-1">
          <div className="flex justify-between items-center bg-slate-950 px-2 py-1 rounded text-xs">
            <span className="text-slate-500 flex items-center gap-1"><Car size={12}/> Queue</span>
            <span className="text-white font-mono font-bold">{state.density}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-950 px-2 py-1 rounded text-xs">
            <span className="text-slate-500 flex items-center gap-1"><Clock size={12}/> Wait</span>
            <span className="text-yellow-400 font-mono font-bold">{state.waiting_time_sec}s</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8 pl-72">
      <div className="max-w-[1600px] mx-auto space-y-8 pb-20">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b border-slate-800 pb-6">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Network className="text-purple-500" /> AI Junction Optimizer
            </h2>
            <p className="text-slate-400 mt-1">Live traffic light distribution based on AI queue detection.</p>
          </div>
        </div>

        {sources.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-10 rounded-xl text-center">
            <Zap className="mx-auto h-12 w-12 text-yellow-500 mb-4 opacity-50" />
            <h3 className="text-white text-lg font-bold">No Junctions Configured</h3>
            <p className="text-slate-400 text-sm mt-2">Go to Settings and enable the Junction Optimizer&quot; on your video sources.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Col: Live Previews */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <Video className="text-blue-500" size={20} /> Approach Feeds
              </h3>
              {sources.map(cam => (
                <div key={cam.id} className="bg-slate-900 border border-slate-800 p-2 rounded-xl relative">
                  <span className="absolute top-4 left-4 z-10 bg-black/70 px-2 py-1 rounded text-xs font-bold text-white backdrop-blur">
                    {cam.label}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={`${API_BASE}/video_feed?id=${cam.id}&type=raw&fps=1&q=low&t=${timestamp}`} 
                    alt={cam.label}
                    className="w-full h-40 object-cover rounded-lg bg-black"
                    onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwZjE3MmEiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2NDc0OGIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiPk5PIFNJR05BTDwvdGV4dD48L3N2Zz4='; }}
                  />
                </div>
              ))}
            </div>

            {/* Right Col: Graphical Junction Representation */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-8 flex items-center justify-center relative overflow-hidden min-h-[600px]">
              
              {/* Decorative Background Grid */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>

              {/* Graphical Roads */}
              <div className="absolute w-full h-40 bg-slate-800 flex flex-col justify-center items-center">
                <div className="w-full h-1 border-t-2 border-dashed border-yellow-500/50"></div>
              </div>
              <div className="absolute h-full w-40 bg-slate-800 flex justify-center items-center">
                <div className="h-full w-1 border-l-2 border-dashed border-yellow-500/50"></div>
              </div>
              
              {/* Center Intersection Block */}
              <div className="absolute w-40 h-40 bg-slate-800 z-0"></div>

              {/* Dynamic Traffic Light Nodes Positioned around the junction */}
              <div className="relative w-full h-full flex items-center justify-center">
                {sources.map((cam, idx) => {
                  // Position them clockwise based on index (Top, Right, Bottom, Left)
                  let positionClasses = "";
                  if (idx === 0) positionClasses = "absolute -top-10 left-1/2 -translate-x-1/2"; // North
                  else if (idx === 1) positionClasses = "absolute top-1/2 -right-10 -translate-y-1/2"; // East
                  else if (idx === 2) positionClasses = "absolute -bottom-10 left-1/2 -translate-x-1/2"; // South
                  else positionClasses = "absolute top-1/2 -left-10 -translate-y-1/2"; // West

                  return (
                    <div key={cam.id} className={positionClasses}>
                      <TrafficLightNode camId={cam.id} label={cam.label} />
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}