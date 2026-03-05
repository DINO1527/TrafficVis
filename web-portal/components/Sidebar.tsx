'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Settings, 
  AlertTriangle, 
  User, 
  FileWarning,
  Activity
} from 'lucide-react';

const menuItems = [
  { name: 'Live Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Violations', href: '/violations', icon: FileWarning },
  { name: 'Alerts', href: '/alerts', icon: AlertTriangle },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Profile', href: '/profile', icon: User },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="h-screen w-64 bg-slate-950 border-r border-slate-800 flex flex-col fixed left-0 top-0">
      {/* Brand */}
      <div className="p-6 flex items-center gap-3 border-b border-slate-800">
        <Activity className="text-blue-500 h-8 w-8" />
        <div>
          <h1 className="font-bold text-slate-100 text-lg">TrafficVis AI</h1>
          <span className="text-xs text-slate-500 block">ADMIN PORTAL</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-900 rounded p-3">
          <p className="text-xs text-slate-500 mb-1">System Status</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-mono text-green-400">ONLINE</span>
          </div>
        </div>
      </div>
    </div>
  );
}