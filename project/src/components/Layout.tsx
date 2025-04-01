import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Camera, BarChart2, Settings, List, AlertTriangle } from 'lucide-react';
import OfflineIndicator from './OfflineIndicator';

// Navigation items
const navItems = [
  { path: '/', label: 'Live Feed', icon: Camera },
  { path: '/dashboard', label: 'Dashboard', icon: BarChart2 },
  { path: '/config', label: 'Settings', icon: Settings },
  { path: '/logs', label: 'Logs', icon: List },
  { path: '/errors', label: 'System Alerts', icon: AlertTriangle }
];

export default function Layout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <aside className="w-16 md:w-64 bg-gray-800 border-r border-gray-700">
        <div className="px-4 py-6 text-center hidden md:block">
          <h1 className="text-xl font-bold">Attendance Tracker</h1>
        </div>
        <div className="md:hidden p-4 flex justify-center">
          <Camera size={28} />
        </div>
        <nav className="mt-6">
          <ul>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path));
                
              return (
                <li key={item.path} className="mb-2">
                  <Link
                    to={item.path}
                    className={`
                      flex items-center px-4 py-3 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors rounded-lg
                      ${isActive ? 'bg-gray-700 text-blue-400' : ''}
                    `}
                  >
                    <Icon size={20} className="flex-shrink-0" />
                    <span className="ml-3 hidden md:block">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
        <OfflineIndicator />
      </div>
    </div>
  );
}