import React from 'react';
import { WifiOff, RefreshCcw } from 'lucide-react';
import { usePeopleCount } from '../context/PeopleCountContext';

const OfflineIndicator = () => {
  const { isOnline, refreshData } = usePeopleCount();
  
  if (isOnline) {
    return null; // Don't show anything when online
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-yellow-600 text-white px-3 py-2 rounded-lg shadow-lg">
      <WifiOff size={18} />
      <span>Offline Mode</span>
      <button 
        onClick={() => refreshData()} 
        className="ml-2 p-1 bg-yellow-700 rounded hover:bg-yellow-800 transition-colors"
        title="Try reconnecting"
      >
        <RefreshCcw size={16} />
      </button>
    </div>
  );
};

export default OfflineIndicator;