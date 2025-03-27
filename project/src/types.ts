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

export interface Student {
  id: string;
  name: string;
  email: string;
  faceDescriptors: Float32Array[];
  hasConsentedToFaceRecognition: boolean;
}

export interface Course {
  id: string;
  name: string;
  schedule: {
    day: string;
    startTime: string;
    endTime: string;
  }[];
}

export interface AttendanceRecord {
  id: string;
  courseId: string;
  studentId: string;
  timestamp: string;
  status: 'present' | 'absent' | 'late';
}

export interface AttendanceSession {
  id: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  records: AttendanceRecord[];
}