import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Camera, BarChart2, Settings, List, AlertTriangle, LogOut, User } from 'lucide-react';
import OfflineIndicator from './OfflineIndicator';
import { useAuth } from '../context/AuthContext';

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
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  
  // Handle logout with navigation
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <aside className="w-16 md:w-64 bg-gray-800 border-r border-gray-700">
        <div className="px-4 py-6 text-center hidden md:block">
          <h1 className="text-xl font-bold">Automated Counting Camera</h1>
        </div>
        <div className="md:hidden p-4 flex justify-center">
          <Camera size={28} />
        </div>
        
        {/* User info - visible only on desktop */}
        <div className="hidden md:block px-4 py-2 mt-2 mb-6">
          <div className="flex items-center p-2 bg-gray-700 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <User size={16} />
            </div>
            <div className="ml-2 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user || 'Admin'}</p>
              <p className="text-xs text-gray-400">Administrator</p>
            </div>
          </div>
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
            
            {/* Logout button */}
            <li className="mt-6">
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-4 py-3 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors rounded-lg"
              >
                <LogOut size={20} className="flex-shrink-0" />
                <span className="ml-3 hidden md:block">Logout</span>
              </button>
            </li>
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