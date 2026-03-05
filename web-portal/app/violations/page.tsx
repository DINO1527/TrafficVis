'use client';

import React, { useState, useEffect } from 'react';
import { trafficAPI, Violation } from '@/lib/api';
import { Search, Filter, Download } from 'lucide-react';

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await trafficAPI.getViolations();
        setViolations(data);
      } catch (e) {
        console.error("Failed to load violations");
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const filteredData = violations.filter(v => 
    v.license_plate?.toLowerCase().includes(filter.toLowerCase()) || 
    v.violation_type.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Violation Log</h2>
          <p className="text-slate-400 text-sm">Comprehensive record of all detected traffic incidents.</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search Plate or Type..." 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Evidence</th>
              <th className="px-6 py-4">Timestamp</th>
              <th className="px-6 py-4">Details</th>
              <th className="px-6 py-4">Speed</th>
              <th className="px-6 py-4">Vehicle</th>
              <th className="px-6 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredData.map((v) => (
              <tr key={v.id} className="hover:bg-slate-800/50 transition">
                <td className="px-6 py-4">
                  <div className="w-24 h-16 bg-black rounded-lg overflow-hidden border border-slate-700 group relative">
                    <img 
                      src={`http://localhost:8000${v.evidence_path}`} 
                      onError={(e) => e.currentTarget.src = 'https://placehold.co/100x100/1e293b/475569?text=Error'}
                      alt="Violation" 
                      className="w-full h-full object-cover transition group-hover:scale-110"
                    />
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-300">
                  <div className="font-mono">{new Date(v.detected_at).toLocaleDateString()}</div>
                  <div className="text-xs text-slate-500">{new Date(v.detected_at).toLocaleTimeString()}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-white mb-1">{v.license_plate || "UNKNOWN"}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    v.violation_type === 'SPEEDING' ? 'bg-orange-900/30 text-orange-400 border-orange-900/50' : 
                    v.violation_type === 'NO_HELMET' ? 'bg-red-900/30 text-red-400 border-red-900/50' :
                    'bg-yellow-900/30 text-yellow-400 border-yellow-900/50'
                  }`}>
                    {v.violation_type.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-slate-300">
                  {v.speed_kph.toFixed(1)} km/h
                </td>
                <td className="px-6 py-4 capitalize text-slate-400">
                  {v.vehicle_type}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-xs bg-green-900/20 text-green-400 px-2 py-1 rounded border border-green-900/30">
                    Logged
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredData.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No violations found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}