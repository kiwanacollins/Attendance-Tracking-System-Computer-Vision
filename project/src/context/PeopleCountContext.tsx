import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { LogEntry } from '../types';

interface PeopleCountContextType {
  count: number;
  setCount: (count: number) => void;
  logs: LogEntry[];
  clearLogs: () => void;
}

const PeopleCountContext = createContext<PeopleCountContextType | undefined>(undefined);

export function PeopleCountProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Load logs from localStorage on mount
  useEffect(() => {
    const savedLogs = localStorage.getItem('surveillance-logs');
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    }
  }, []);

  // Update logs when count changes
  useEffect(() => {
    const getStatus = (count: number): SystemStatus => {
      if (count === 0) {
        return {
          status: 'warning',
          message: 'No individuals detected in frame'
        };
      }
      
      if (count > 20) {
        return {
          status: 'warning',
          message: 'High occupancy detected'
        };
      }

      // Simulate occasional errors (you might want to remove this in production)
      if (Math.random() < 0.05) {  // 5% chance of error
        return {
          status: 'error',
          message: 'Camera feed interruption detected'
        };
      }

      return {
        status: 'active',
        message: 'Normal operation'
      };
    };

    const newLog: LogEntry = {
      timestamp: new Date().toISOString(),
      count,
      status: getStatus(count)
    };

    setLogs(prevLogs => {
      const updatedLogs = [newLog, ...prevLogs.slice(0, 999)]; // Keep last 1000 logs
      localStorage.setItem('surveillance-logs', JSON.stringify(updatedLogs));
      return updatedLogs;
    });
  }, [count]);

  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem('surveillance-logs');
  };

  return (
    <PeopleCountContext.Provider value={{ count, setCount, logs, clearLogs }}>
      {children}
    </PeopleCountContext.Provider>
  );
}

export function usePeopleCount() {
  const context = useContext(PeopleCountContext);
  if (context === undefined) {
    throw new Error('usePeopleCount must be used within a PeopleCountProvider');
  }
  return context;
}
