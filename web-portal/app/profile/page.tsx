'use client';

import React, { useState, useEffect } from 'react';
import { User, Shield, MapPin, Save, CheckCircle2, LogOut } from 'lucide-react';

export default function ProfilePage() {
  const [isClient, setIsClient] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [profile, setProfile] = useState({
    name: "Traffic Officer",
    badgeId: "T-800",
    division: "Colombo Central",
    email: "admin@police.lk"
  });

  useEffect(() => {
    setIsClient(true);
    const saved = localStorage.getItem('trafficVis_profile');
    if (saved) setProfile(JSON.parse(saved));
  }, []);

  const handleSave = () => {
    localStorage.setItem('trafficVis_profile', JSON.stringify(profile));
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  if (!isClient) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white">Officer Profile</h2>
        <p className="text-slate-400 mt-1">Manage system access and duty reporting details.</p>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 space-y-6">
        <div className="flex items-center gap-6 pb-6 border-b border-slate-800">
           <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center border-2 border-slate-700">
             <User size={32} className="text-slate-400" />
           </div>
           <div>
             <h3 className="text-xl font-bold text-white">{profile.name}</h3>
             <span className="text-blue-400 text-sm font-medium bg-blue-900/20 px-2 py-0.5 rounded border border-blue-800">
               SYSTEM ADMIN
             </span>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="space-y-2">
             <label className="text-sm font-medium text-slate-400">Officer Name</label>
             <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  value={profile.name}
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
             </div>
           </div>

           <div className="space-y-2">
             <label className="text-sm font-medium text-slate-400">Badge ID</label>
             <div className="relative">
                <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  value={profile.badgeId}
                  onChange={(e) => setProfile({...profile, badgeId: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                />
             </div>
           </div>

           <div className="space-y-2">
             <label className="text-sm font-medium text-slate-400">Division / Zone</label>
             <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  value={profile.division}
                  onChange={(e) => setProfile({...profile, division: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
             </div>
           </div>

           <div className="space-y-2">
             <label className="text-sm font-medium text-slate-400">System Email</label>
             <input 
               type="email" 
               value={profile.email}
               onChange={(e) => setProfile({...profile, email: e.target.value})}
               className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
             />
           </div>
        </div>

        <div className="pt-4 flex justify-between items-center">
           <button className="text-red-400 text-sm hover:text-red-300 flex items-center gap-2 px-3 py-2 rounded hover:bg-red-900/10 transition">
             <LogOut size={16} /> Sign Out
           </button>
           
           <button 
             onClick={handleSave}
             className={`px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition ${
               success ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
             }`}
           >
             {success ? <CheckCircle2 size={18} /> : <Save size={18} />}
             {success ? "Saved!" : "Update Profile"}
           </button>
        </div>
      </div>
    </div>
  );
}