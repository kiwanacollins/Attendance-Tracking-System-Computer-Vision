import { io, Socket } from 'socket.io-client';
import type { LocationData, EntryExitRecord, LogEntry } from '../types';

// API configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// Socket.io connection
let socket: Socket | null = null;

// Initialize socket connection
const initializeSocket = (onConnect?: () => void): Socket => {
  if (socket) return socket;

  console.log('Attempting to connect to Socket.IO server at:', SOCKET_URL);

  socket = io(SOCKET_URL, {
    reconnectionAttempts: 5,
    timeout: 15000,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
    if (onConnect) onConnect();
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    if (socket && socket.io && socket.io.attempts === 5) {
      console.warn('Multiple failed connection attempts. Backend server may be unavailable.');
    }
  });

  return socket;
};

// Improved API request function with better error handling and offline fallback
const apiRequest = async <T>(
  endpoint: string, 
  options: RequestInit = {}, 
  retries = 2
): Promise<T> => {
  const url = `${API_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      // Try to parse error as JSON, but don't fail if it's HTML or other format
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        console.warn('Received non-JSON error response:', errorText.substring(0, 100) + '...');
      }
      throw new Error(errorData.error || `API request failed with status ${response.status}`);
    }
    
    // If the response is empty (like for DELETE requests)
    if (response.status === 204) {
      return {} as T;
    }
    
    // Handle JSON parsing safely
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      console.error('Error parsing JSON response:', e);
      console.warn('Received non-JSON response:', text.substring(0, 100) + '...');
      throw new Error('Invalid JSON response from server');
    }
  } catch (error) {
    if (retries > 0) {
      console.warn(`API request to ${endpoint} failed, retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      return apiRequest<T>(endpoint, options, retries - 1);
    }
    throw error;
  }
};

// Locations API
export const locationsApi = {
  getAll: async (): Promise<LocationData[]> => {
    return apiRequest<LocationData[]>('/locations');
  },
  
  getById: async (id: string): Promise<LocationData> => {
    return apiRequest<LocationData>(`/locations/${id}`);
  },
  
  create: async (location: LocationData): Promise<LocationData> => {
    return apiRequest<LocationData>('/locations', {
      method: 'POST',
      body: JSON.stringify(location),
    });
  },
  
  update: async (id: string, location: Partial<LocationData>): Promise<LocationData> => {
    return apiRequest<LocationData>(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(location),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/locations/${id}`, {
      method: 'DELETE',
    });
  },
  
  // Socket event subscriptions for real-time updates
  onLocationCreated: (callback: (location: LocationData) => void): void => {
    const s = initializeSocket();
    s.on('location_created', callback);
  },
  
  onLocationUpdated: (callback: (location: LocationData) => void): void => {
    const s = initializeSocket();
    s.on('location_updated', callback);
  },
  
  onLocationDeleted: (callback: (data: { id: string }) => void): void => {
    const s = initializeSocket();
    s.on('location_deleted', callback);
  },
};

// Counts and Entry/Exit API
export const countsApi = {
  getCounts: async (locationId: string, limit = 100): Promise<LogEntry[]> => {
    return apiRequest<LogEntry[]>(`/counts/${locationId}?limit=${limit}`);
  },
  
  getCountsInRange: async (locationId: string, start: string, end: string): Promise<LogEntry[]> => {
    return apiRequest<LogEntry[]>(`/counts/${locationId}/range?start=${start}&end=${end}`);
  },
  
  addCount: async (locationId: string, count: number, status: string, message?: string): Promise<LogEntry> => {
    return apiRequest<LogEntry>(`/counts/${locationId}`, {
      method: 'POST',
      body: JSON.stringify({
        count,
        status,
        message,
        timestamp: new Date().toISOString(),
      }),
    });
  },
  
  getEntryExit: async (locationId: string, limit = 100): Promise<EntryExitRecord[]> => {
    return apiRequest<EntryExitRecord[]>(`/counts/${locationId}/entry-exit?limit=${limit}`);
  },
  
  getEntryExitInRange: async (locationId: string, start: string, end: string): Promise<EntryExitRecord[]> => {
    return apiRequest<EntryExitRecord[]>(`/counts/${locationId}/entry-exit/range?start=${start}&end=${end}`);
  },
  
  recordEntryExit: async (
    locationId: string, 
    type: 'entry' | 'exit', 
    count: number, 
    currentOccupancy: number
  ): Promise<EntryExitRecord> => {
    return apiRequest<EntryExitRecord>(`/counts/${locationId}/entry-exit`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        count,
        currentOccupancy,
        timestamp: new Date().toISOString(),
      }),
    });
  },
  
  // Socket event subscriptions
  onCountUpdated: (callback: (count: LogEntry) => void): void => {
    const s = initializeSocket();
    s.on('count_updated', callback);
  },
  
  onEntryExitRecorded: (callback: (record: EntryExitRecord) => void): void => {
    const s = initializeSocket();
    s.on('entry_exit_recorded', callback);
  },
};

// Reports API
export const reportsApi = {
  getHourlyReport: async (locationId: string, start: string, end: string): Promise<OccupancyData[]> => {
    return apiRequest<OccupancyData[]>(`/reports/${locationId}/hourly?start=${start}&end=${end}`);
  },
  
  getDailyReport: async (locationId: string, start: string, end: string): Promise<OccupancyData[]> => {
    return apiRequest<OccupancyData[]>(`/reports/${locationId}/daily?start=${start}&end=${end}`);
  },
  
  getSummaryReport: async (locationId: string, start: string, end: string): Promise<OccupancyData> => {
    return apiRequest<OccupancyData>(`/reports/${locationId}/summary?start=${start}&end=${end}`);
  },
  
  // Get CSV report URL (for direct download)
  getCSVReportUrl: (locationId: string, start: string, end: string, type: 'counts' | 'entry-exit'): string => {
    return `${API_URL}/reports/${locationId}/csv?start=${start}&end=${end}&type=${type}`;
  },
};

// Config API
export const configApi = {
  getAll: async (): Promise<Record<string, any>> => {
    return apiRequest<Record<string, any>>('/config');
  },
  
  get: async (key: string): Promise<any> => {
    return apiRequest<any>(`/config/${key}`);
  },
  
  set: async (key: string, value: any): Promise<any> => {
    return apiRequest<any>(`/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  },
  
  delete: async (key: string): Promise<void> => {
    return apiRequest<void>(`/config/${key}`, {
      method: 'DELETE',
    });
  },
  
  // Maintenance operations
  optimizeDatabase: async (): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>('/config/optimize', {
      method: 'POST',
    });
  },
  
  getDiagnostics: async (): Promise<any> => {
    return apiRequest<any>('/config/diagnostics');
  },
  
  // Socket event subscriptions
  onConfigUpdated: (callback: (data: { key: string, value: any }) => void): void => {
    const s = initializeSocket();
    s.on('config_updated', callback);
  },
};

// Combined API service for convenience
const apiService = {
  locations: locationsApi,
  counts: countsApi,
  reports: reportsApi,
  config: configApi,
  socket: {
    initialize: initializeSocket,
    getInstance: (): Socket | null => socket,
    disconnect: (): void => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    },
  },
};

export default apiService;