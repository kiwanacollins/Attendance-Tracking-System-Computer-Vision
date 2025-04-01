import React, { createContext, useContext, useState, useEffect, useCallback, useReducer, ReactNode } from 'react';
import type { LogEntry, SystemStatus, LocationData, EntryExitRecord } from '../types';
import apiService from '../services/api';

// Define reducer for more efficient state management
type CountState = {
  count: number;
  logs: LogEntry[];
  entryExitData: EntryExitRecord[];
  locations: LocationData[];
  activeLocation: string;
  isOnline: boolean;
};

type CountAction = 
  | { type: 'SET_COUNT'; payload: number }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'SET_LOGS'; payload: LogEntry[] }
  | { type: 'CLEAR_LOGS' }
  | { type: 'ADD_ENTRY_EXIT'; payload: EntryExitRecord }
  | { type: 'SET_ENTRY_EXIT_DATA'; payload: EntryExitRecord[] }
  | { type: 'SET_LOCATION'; payload: string }
  | { type: 'SET_LOCATIONS'; payload: LocationData[] }
  | { type: 'ADD_LOCATION'; payload: LocationData }
  | { type: 'UPDATE_LOCATION'; payload: LocationData }
  | { type: 'REMOVE_LOCATION'; payload: string }
  | { type: 'SET_ONLINE_STATUS'; payload: boolean };

// Create reducer function for better performance
const countReducer = (state: CountState, action: CountAction): CountState => {
  switch (action.type) {
    case 'SET_COUNT': {
      const updatedLogs = [action.payload, ...state.logs.slice(0, 499)];
      return { ...state, count: action.payload, logs: updatedLogs };
    }
    case 'SET_LOGS':
      return { ...state, logs: action.payload };
    case 'CLEAR_LOGS':
      return { ...state, logs: [] };
    case 'ADD_ENTRY_EXIT':
      return { 
        ...state, 
        entryExitData: [action.payload, ...state.entryExitData.slice(0, 999)]
      };
    case 'SET_ENTRY_EXIT_DATA':
      return { ...state, entryExitData: action.payload };
    case 'SET_LOCATION':
      return { ...state, activeLocation: action.payload };
    case 'SET_LOCATIONS':
      return { ...state, locations: action.payload };
    case 'ADD_LOCATION':
      return { 
        ...state, 
        locations: [...state.locations, action.payload]
      };
    case 'UPDATE_LOCATION':
      return { 
        ...state, 
        locations: state.locations.map(loc => 
          loc.id === action.payload.id ? action.payload : loc
        )
      };
    case 'REMOVE_LOCATION':
      return { 
        ...state, 
        locations: state.locations.filter(loc => loc.id !== action.payload)
      };
    case 'SET_ONLINE_STATUS':
      return { ...state, isOnline: action.payload };
    default:
      return state;
  }
};

interface PeopleCountContextType {
  count: number;
  setCount: (count: number) => void;
  logs: LogEntry[];
  clearLogs: () => void;
  entryExitData: EntryExitRecord[];
  recordEntryExit: (type: 'entry' | 'exit', count?: number) => void;
  locations: LocationData[];
  activeLocation: string;
  setActiveLocation: (locationId: string) => void;
  addLocation: (location: LocationData) => void;
  updateLocation: (location: LocationData) => void;
  removeLocation: (locationId: string) => void;
  isOnline: boolean;
  refreshData: () => Promise<void>;
}

const PeopleCountContext = createContext<PeopleCountContextType | undefined>(undefined);

// Initial state with sensible defaults
const initialState: CountState = {
  count: 0,
  logs: [],
  entryExitData: [],
  locations: [{ id: 'default', name: 'Default Location', capacity: 50 }],
  activeLocation: 'default',
  isOnline: true,
};

export function PeopleCountProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(countReducer, initialState);
  const [previousCount, setPreviousCount] = useState(0);
  
  // Generate status based on count and location capacity
  const getStatus = useCallback((count: number): SystemStatus => {
    const activeLocationData = state.locations.find(loc => loc.id === state.activeLocation);
    const capacity = activeLocationData?.capacity || 50;
    
    if (count === 0) {
      return {
        status: 'warning',
        message: 'No individuals detected in frame'
      };
    }
    
    if (count > capacity * 0.9) {
      return {
        status: 'warning',
        message: `Near capacity (${count}/${capacity})`
      };
    }
    
    if (count > capacity) {
      return {
        status: 'error',
        message: `Over capacity (${count}/${capacity})`
      };
    }

    return {
      status: 'active',
      message: 'Normal operation'
    };
  }, [state.locations, state.activeLocation]);

  // Record an entry or exit event
  const recordEntryExit = useCallback(async (type: 'entry' | 'exit', count: number = 1) => {
    // Calculate current occupancy (total entries - total exits)
    const currentOccupancy = state.entryExitData.reduce((acc, record) => {
      if (record.location === state.activeLocation) {
        if (record.type === 'entry') return acc + record.count;
        if (record.type === 'exit') return acc - record.count;
      }
      return acc;
    }, 0) + (type === 'entry' ? count : -count);

    const record: EntryExitRecord = {
      timestamp: new Date().toISOString(),
      location: state.activeLocation,
      type,
      count,
      currentOccupancy: Math.max(0, currentOccupancy) // Ensure we don't go below 0
    };

    dispatch({ type: 'ADD_ENTRY_EXIT', payload: record });
    
    try {
      if (state.isOnline) {
        // Send to API if online
        await apiService.counts.recordEntryExit(
          state.activeLocation,
          type,
          count,
          Math.max(0, currentOccupancy)
        );
      } else {
        // Save to localStorage as backup
        const dataToSave = [record, ...state.entryExitData.slice(0, 999)];
        localStorage.setItem('entry-exit-data', JSON.stringify(dataToSave));
      }
    } catch (error) {
      console.error('Error recording entry/exit:', error);
      dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
      
      // Fallback to localStorage
      const dataToSave = [record, ...state.entryExitData.slice(0, 999)];
      localStorage.setItem('entry-exit-data', JSON.stringify(dataToSave));
    }
  }, [state.entryExitData, state.activeLocation, state.isOnline]);

  // Function to reload all data from API - moved up before it's used
  const refreshData = useCallback(async () => {
    try {
      // Load locations
      const locations = await apiService.locations.getAll();
      dispatch({ type: 'SET_LOCATIONS', payload: locations });
      
      // Load logs and entry/exit data for active location
      const locationId = state.activeLocation || 'default';
      
      // Load recent logs (last 100)
      const logs = await apiService.counts.getCounts(locationId, 100);
      dispatch({ type: 'SET_LOGS', payload: logs });
      
      // Load recent entry/exit data (last 500)
      const entryExitData = await apiService.counts.getEntryExit(locationId, 500);
      dispatch({ type: 'SET_ENTRY_EXIT_DATA', payload: entryExitData });
      
      // Set online status to true as we successfully loaded data
      dispatch({ type: 'SET_ONLINE_STATUS', payload: true });
      return true; // Signal success
    } catch (error) {
      console.error('Error loading initial data:', error);
      dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
      
      // Fallback to local storage if API fails
      try {
        const savedLogs = localStorage.getItem('surveillance-logs');
        if (savedLogs) {
          const parsedLogs = JSON.parse(savedLogs);
          dispatch({ type: 'SET_LOGS', payload: parsedLogs });
        }
        
        const savedEntryExit = localStorage.getItem('entry-exit-data');
        if (savedEntryExit) {
          const parsedEntryExit = JSON.parse(savedEntryExit);
          dispatch({ type: 'SET_ENTRY_EXIT_DATA', payload: parsedEntryExit });
        }
        
        const savedLocations = localStorage.getItem('locations');
        if (savedLocations) {
          const parsedLocations = JSON.parse(savedLocations);
          dispatch({ type: 'SET_LOCATIONS', payload: parsedLocations });
        }
        
        const savedActiveLocation = localStorage.getItem('active-location');
        if (savedActiveLocation) {
          dispatch({ type: 'SET_LOCATION', payload: savedActiveLocation });
        }
      } catch (localError) {
        console.error('Error loading data from localStorage:', localError);
      }
      return false; // Signal failure
    }
  }, [state.activeLocation]);
  
  // Initialize socket connection for real-time updates
  useEffect(() => {
    // Initialize socket connection with a timeout and retry logic
    let connectionTimeoutId: number;
    let retryCount = 0;
    const maxRetries = 3;
    const timeoutPeriod = 15000; // Increase to 15 seconds
    
    const attemptConnection = () => {
      try {
        // Clear any existing timeout
        if (connectionTimeoutId) {
          window.clearTimeout(connectionTimeoutId);
        }
        
        // Set a new timeout
        connectionTimeoutId = window.setTimeout(() => {
          if (retryCount < maxRetries) {
            console.warn(`Socket connection timeout - retrying (${retryCount + 1}/${maxRetries})...`);
            retryCount++;
            attemptConnection();
          } else {
            console.warn('Socket connection timeout - falling back to offline mode');
            dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
            // Try to load data from localStorage
            loadFromLocalStorage();
          }
        }, timeoutPeriod);
        
        const socket = apiService.socket.initialize(() => {
          // On successful connection set online status to true
          window.clearTimeout(connectionTimeoutId);
          dispatch({ type: 'SET_ONLINE_STATUS', payload: true });
          console.log('Socket connection established successfully');
          
          // Reset retry count on successful connection
          retryCount = 0;
        });
        
        // Set up real-time listeners
        socket.on('count_updated', (countData) => {
          const logEntry: LogEntry = {
            timestamp: countData.timestamp,
            count: countData.count,
            location: countData.location_id,
            status: {
              status: countData.status,
              message: countData.message
            }
          };
          dispatch({ type: 'ADD_LOG', payload: logEntry });
        });
        
        socket.on('entry_exit_recorded', (record) => {
          const entryExitRecord: EntryExitRecord = {
            timestamp: record.timestamp,
            location: record.location_id,
            type: record.type as 'entry' | 'exit',
            count: record.count,
            currentOccupancy: record.current_occupancy
          };
          dispatch({ type: 'ADD_ENTRY_EXIT', payload: entryExitRecord });
        });
        
        socket.on('location:created', (location) => {
          dispatch({ type: 'ADD_LOCATION', payload: location });
        });
        
        socket.on('location:updated', (location) => {
          dispatch({ type: 'UPDATE_LOCATION', payload: location });
        });
        
        socket.on('location:deleted', (data) => {
          dispatch({ type: 'REMOVE_LOCATION', payload: data.id });
        });
        
        socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
          
          // Only retry if under max retry count
          if (retryCount < maxRetries) {
            console.warn(`Socket connection error - retrying (${retryCount + 1}/${maxRetries})...`);
            retryCount++;
            setTimeout(() => {
              socket.connect();
            }, 3000); // Wait 3 seconds before retry
          } else {
            loadFromLocalStorage();
          }
        });
        
        socket.on('disconnect', (reason) => {
          console.warn('Socket disconnected:', reason);
          dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
          
          // Attempt to reconnect if disconnect was not intentional
          if (reason !== 'io client disconnect') {
            setTimeout(() => {
              socket.connect();
            }, 3000); // Wait 3 seconds before reconnect
          }
        });
        
        return () => {
          if (connectionTimeoutId) {
            window.clearTimeout(connectionTimeoutId);
          }
          apiService.socket.disconnect();
        };
      } catch (error) {
        console.error('Error initializing socket connection:', error);
        dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
        loadFromLocalStorage();
      }
    };
    
    // Helper function to load data from localStorage
    const loadFromLocalStorage = () => {
      try {
        const savedLogs = localStorage.getItem('surveillance-logs');
        if (savedLogs) {
          const parsedLogs = JSON.parse(savedLogs);
          dispatch({ type: 'SET_LOGS', payload: parsedLogs });
        }
        
        const savedEntryExit = localStorage.getItem('entry-exit-data');
        if (savedEntryExit) {
          const parsedEntryExit = JSON.parse(savedEntryExit);
          dispatch({ type: 'SET_ENTRY_EXIT_DATA', payload: parsedEntryExit });
        }
        
        const savedLocations = localStorage.getItem('locations');
        if (savedLocations) {
          const parsedLocations = JSON.parse(savedLocations);
          dispatch({ type: 'SET_LOCATIONS', payload: parsedLocations });
        }
        
        const savedActiveLocation = localStorage.getItem('active-location');
        if (savedActiveLocation) {
          dispatch({ type: 'SET_LOCATION', payload: savedActiveLocation });
        }
      } catch (localError) {
        console.error('Error loading data from localStorage:', localError);
      }
    };
    
    // Start connection attempt
    attemptConnection();
  }, []);
  
  // Initial data loading from API
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Set count and detect entries/exits
  const setCount = useCallback(async (newCount: number) => {
    dispatch({ type: 'SET_COUNT', payload: newCount });
    
    // Entry/exit detection - only log significant changes to reduce API calls
    if (Math.abs(newCount - previousCount) > 1) {
      if (newCount > previousCount) {
        // Entry detected
        await recordEntryExit('entry', newCount - previousCount);
      } else if (newCount < previousCount) {
        // Exit detected
        await recordEntryExit('exit', previousCount - newCount);
      }
    }
    
    setPreviousCount(newCount);
    
    // Generate log with status
    const status = getStatus(newCount);
    
    const newLog: LogEntry = {
      timestamp: new Date().toISOString(),
      count: newCount,
      location: state.activeLocation,
      status
    };

    dispatch({ type: 'ADD_LOG', payload: newLog });
    
    try {
      if (state.isOnline) {
        // Send to API if online
        await apiService.counts.addCount(
          state.activeLocation,
          newCount,
          status.status,
          status.message
        );
      } else {
        // Save logs to localStorage as backup
        const logsToSave = [newLog, ...state.logs.slice(0, 499)]; // Keep last 500 logs
        localStorage.setItem('surveillance-logs', JSON.stringify(logsToSave));
      }
    } catch (error) {
      console.error('Error saving count data:', error);
      dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
      
      // Fallback to localStorage
      const logsToSave = [newLog, ...state.logs.slice(0, 499)]; // Keep last 500 logs
      localStorage.setItem('surveillance-logs', JSON.stringify(logsToSave));
    }
  }, [state.logs, state.activeLocation, state.isOnline, previousCount, getStatus, recordEntryExit]);

  const clearLogs = useCallback(async () => {
    dispatch({ type: 'CLEAR_LOGS' });
    localStorage.removeItem('surveillance-logs');
  }, []);

  // Location management functions
  const setActiveLocation = useCallback(async (locationId: string) => {
    dispatch({ type: 'SET_LOCATION', payload: locationId });
    localStorage.setItem('active-location', locationId);
    
    try {
      // Load logs and entry/exit data for the new active location
      if (state.isOnline) {
        const logs = await apiService.counts.getCounts(locationId, 100);
        dispatch({ type: 'SET_LOGS', payload: logs });
        
        const entryExitData = await apiService.counts.getEntryExit(locationId, 500);
        dispatch({ type: 'SET_ENTRY_EXIT_DATA', payload: entryExitData });
      }
    } catch (error) {
      console.error('Error loading data for new location:', error);
    }
  }, [state.isOnline]);

  const addLocation = useCallback(async (location: LocationData) => {
    try {
      if (state.isOnline) {
        // Add via API if online
        const savedLocation = await apiService.locations.create(location);
        dispatch({ type: 'ADD_LOCATION', payload: savedLocation });
      } else {
        // Add locally if offline
        dispatch({ type: 'ADD_LOCATION', payload: location });
        localStorage.setItem('locations', JSON.stringify([...state.locations, location]));
      }
    } catch (error) {
      console.error('Error adding location:', error);
      
      // Fallback to local operation
      dispatch({ type: 'ADD_LOCATION', payload: location });
      localStorage.setItem('locations', JSON.stringify([...state.locations, location]));
    }
  }, [state.locations, state.isOnline]);

  const updateLocation = useCallback(async (location: LocationData) => {
    try {
      if (state.isOnline) {
        // Update via API if online
        const updatedLocation = await apiService.locations.update(location.id, location);
        dispatch({ type: 'UPDATE_LOCATION', payload: updatedLocation });
      } else {
        // Update locally if offline
        dispatch({ type: 'UPDATE_LOCATION', payload: location });
        const updatedLocations = state.locations.map(loc => 
          loc.id === location.id ? location : loc
        );
        localStorage.setItem('locations', JSON.stringify(updatedLocations));
      }
    } catch (error) {
      console.error('Error updating location:', error);
      
      // Fallback to local operation
      dispatch({ type: 'UPDATE_LOCATION', payload: location });
      const updatedLocations = state.locations.map(loc => 
        loc.id === location.id ? location : loc
      );
      localStorage.setItem('locations', JSON.stringify(updatedLocations));
    }
  }, [state.locations, state.isOnline]);

  const removeLocation = useCallback(async (locationId: string) => {
    try {
      if (state.isOnline) {
        // Delete via API if online
        await apiService.locations.delete(locationId);
        dispatch({ type: 'REMOVE_LOCATION', payload: locationId });
      } else {
        // Delete locally if offline
        dispatch({ type: 'REMOVE_LOCATION', payload: locationId });
        const updatedLocations = state.locations.filter(loc => loc.id !== locationId);
        localStorage.setItem('locations', JSON.stringify(updatedLocations));
      }
    } catch (error) {
      console.error('Error removing location:', error);
      
      // Fallback to local operation
      dispatch({ type: 'REMOVE_LOCATION', payload: locationId });
      const updatedLocations = state.locations.filter(loc => loc.id !== locationId);
      localStorage.setItem('locations', JSON.stringify(updatedLocations));
    }
  }, [state.locations, state.isOnline]);

  return (
    <PeopleCountContext.Provider value={{ 
      count: state.count, 
      setCount, 
      logs: state.logs, 
      clearLogs,
      entryExitData: state.entryExitData,
      recordEntryExit,
      locations: state.locations,
      activeLocation: state.activeLocation,
      setActiveLocation,
      addLocation,
      updateLocation,
      removeLocation,
      isOnline: state.isOnline,
      refreshData
    }}>
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
