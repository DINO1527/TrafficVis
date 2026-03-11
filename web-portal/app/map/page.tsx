/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Activity, MapPin, AlertTriangle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// --- Types ---
interface CamLocation {
  id: string;
  label: string;
  lat: number;
  lng: number;
  status: 'LOW' | 'MEDIUM' | 'HIGH' | 'OFFLINE';
  density: number;
}

// Dynamically import the map components to avoid Next.js SSR "window is not defined" errors
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// Leaflet custom icon logic (Needs to be separated for SSR)
const createCustomIcon = (status: string) => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  
  let colorClass = 'bg-slate-500'; // OFFLINE
  if (status === 'LOW') colorClass = 'bg-green-500';
  if (status === 'MEDIUM') colorClass = 'bg-yellow-500';
  if (status === 'HIGH') colorClass = 'bg-red-500';

  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `<div class="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center ${colorClass} animate-pulse"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

export default function MapView() {
  const [cameras, setCameras] = useState<CamLocation[]>([]);
  const [isClient, setIsClient] = useState(false);

  // Default Center: Colombo, Sri Lanka
  const defaultCenter: [number, number] = [6.9271, 79.8612];

  useEffect(() => {
    setIsClient(true);
    
    const fetchMapData = async () => {
      // 1. Get saved camera configs
      const savedData = localStorage.getItem('trafficVis_data_v4');
      if (!savedData) return;
      const parsed = JSON.parse(savedData);
      const sources = parsed.sources || [];

      // 2. Try to get live status from Backend
      let liveStatus: any = {};
      try {
        const res = await fetch('http://localhost:8000/');
        if (res.ok) {
          const data = await res.json();
          liveStatus = data.health?.corridor_status?.junctions || {};
        }
      } catch (e) {
        console.warn("Backend offline, showing offline map markers.");
      }

      // 3. Merge data
      const mappedCameras: CamLocation[] = sources
        .filter((s: any) => s.enabled && s.location)
        .map((s: any) => ({
          id: s.id,
          label: s.label,
          lat: s.location.lat,
          lng: s.location.lng,
          status: liveStatus[s.id]?.congestion_level || 'OFFLINE',
          density: liveStatus[s.id]?.density || 0,
        }));

      setCameras(mappedCameras);
    };

    fetchMapData();
    const interval = setInterval(fetchMapData, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, []);

  if (!isClient) return <div className="p-8 text-white text-center">Loading Map...</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-8 pl-72">
      <div className="max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b border-slate-800 pb-6 shrink-0">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <MapPin className="text-blue-500" /> Live Traffic Map
            </h2>
            <p className="text-slate-400 mt-1">Real-time geographical density overview.</p>
          </div>
          <div className="flex gap-4 bg-slate-900 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold"><div className="w-3 h-3 rounded-full bg-green-500"></div> LOW</div>
            <div className="flex items-center gap-2 text-xs font-bold"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> MEDIUM</div>
            <div className="flex items-center gap-2 text-xs font-bold"><div className="w-3 h-3 rounded-full bg-red-500"></div> HIGH</div>
            <div className="flex items-center gap-2 text-xs font-bold"><div className="w-3 h-3 rounded-full bg-slate-500"></div> OFFLINE</div>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative z-0">
          <MapContainer 
            center={defaultCenter} 
            zoom={12} 
            style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}
          >
            {/* Free OpenStreetMap Tiles (Dark mode aesthetic via CSS filters if desired, but default used here) */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {cameras.map((cam) => {
              const icon = createCustomIcon(cam.status);
              if (!icon) return null;
              
              return (
                <Marker key={cam.id} position={[cam.lat, cam.lng]} icon={icon}>
                  <Popup>
                    <div className="p-1 min-w-[150px]">
                      <h4 className="font-bold text-slate-800 border-b pb-1 mb-2">{cam.label}</h4>
                      <div className="text-sm">
                        <p><strong>Status:</strong> <span className={`font-bold ${cam.status === 'HIGH' ? 'text-red-500' : cam.status === 'MEDIUM' ? 'text-yellow-500' : 'text-green-500'}`}>{cam.status}</span></p>
                        <p><strong>Vehicles:</strong> {cam.density}</p>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

      </div>
    </div>
  );
}