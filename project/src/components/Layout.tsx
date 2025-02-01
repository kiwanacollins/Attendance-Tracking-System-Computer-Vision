import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Camera, BarChart2, Settings, AlertCircle, ClipboardList } from 'lucide-react';

const navItems = [
  { path: '/', icon: Camera, label: 'Live Feed' },
  { path: '/dashboard', icon: BarChart2, label: 'Dashboard' },
  { path: '/config', icon: Settings, label: 'Configuration' },
  { path: '/logs', icon: ClipboardList, label: 'Logs' },
  { path: '/errors', icon: AlertCircle, label: 'Errors' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-gray-900">
      <nav className="w-64 bg-gray-800">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-center h-16 bg-gray-900">
            <Camera className="w-8 h-8 text-blue-500" />
            <span className="ml-2 text-xl font-bold text-white">Automated Counting Camera</span>
          </div>
          <div className="flex-1 px-4 py-6">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center px-4 py-3 mb-2 rounded-lg transition-colors ${
                  location.pathname === path
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}