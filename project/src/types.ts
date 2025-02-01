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
  status: SystemStatus;
}

export interface SystemConfig {
  camera: string;
  sensitivity: number;
  enableLogging: boolean;
  logFrequency: number;
}