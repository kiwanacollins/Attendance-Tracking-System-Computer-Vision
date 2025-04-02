export interface Detection {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface SystemStatus {
  status: 'active' | 'error' | 'warning';
  message: string;
}

export interface LogEntry {
  timestamp: string;
  count: number;
  location?: string; // Optional for backward compatibility
  status: SystemStatus;
}

export interface SystemConfig {
  camera: string;
  sensitivity: number;
  enableLogging: boolean;
  logFrequency: number;
  lowPowerMode?: boolean; // Added for Raspberry Pi optimization
  optimizeForEdge?: boolean; // Added for edge computing optimization
}

export interface LocationData {
  id: string;
  name: string;
  capacity: number;
  description?: string;
}

export interface EntryExitRecord {
  timestamp: string;
  location: string;
  type: 'entry' | 'exit';
  count: number;
  currentOccupancy: number;
}

export interface OccupancyData {
  timestamp: string;
  location: string;
  count: number;
}

// Performance metrics for system monitoring
export interface PerformanceMetrics {
  fps: number;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: string;
}