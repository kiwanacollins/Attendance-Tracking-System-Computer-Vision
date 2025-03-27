import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AttendanceRecord, AttendanceSession } from '../types';

interface AttendanceContextType {
  sessions: AttendanceSession[];
  createSession: (courseId: string) => AttendanceSession;
  endSession: (sessionId: string) => void;
  markAttendance: (sessionId: string, studentId: string, status: 'present' | 'late') => void;
  getSessionsByDate: (date: string) => AttendanceSession[];
  getSessionsByCourse: (courseId: string) => AttendanceSession[];
  getAttendanceByStudent: (studentId: string) => AttendanceRecord[];
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);

  // Load attendance data from localStorage on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem('attendance-sessions');
    if (savedSessions) {
      try {
        setSessions(JSON.parse(savedSessions));
      } catch (error) {
        console.error('Error loading attendance sessions from localStorage:', error);
      }
    }
  }, []);

  // Save attendance data to localStorage when changed
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('attendance-sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const createSession = (courseId: string) => {
    const now = new Date();
    const newSession: AttendanceSession = {
      id: uuidv4(),
      courseId,
      date: now.toISOString().split('T')[0],
      startTime: now.toISOString(),
      endTime: '', // Will be set when the session ends
      records: []
    };

    setSessions(prev => [...prev, newSession]);
    setCurrentSession(newSession);
    return newSession;
  };

  const endSession = (sessionId: string) => {
    setSessions(prev => 
      prev.map(session => 
        session.id === sessionId 
          ? { ...session, endTime: new Date().toISOString() } 
          : session
      )
    );
    
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
    }
  };

  const markAttendance = (sessionId: string, studentId: string, status: 'present' | 'late') => {
    // Check if student is already marked for this session
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    
    if (sessionIndex === -1) return;
    
    const existingRecordIndex = sessions[sessionIndex].records.findIndex(
      r => r.studentId === studentId
    );
    
    // If student already has a record, don't add another one
    if (existingRecordIndex !== -1) return;
    
    const newRecord: AttendanceRecord = {
      id: uuidv4(),
      courseId: sessions[sessionIndex].courseId,
      studentId,
      timestamp: new Date().toISOString(),
      status
    };
    
    setSessions(prev => 
      prev.map(session => 
        session.id === sessionId 
          ? { ...session, records: [...session.records, newRecord] } 
          : session
      )
    );
  };

  const getSessionsByDate = (date: string) => {
    return sessions.filter(session => session.date === date);
  };

  const getSessionsByCourse = (courseId: string) => {
    return sessions.filter(session => session.courseId === courseId);
  };

  const getAttendanceByStudent = (studentId: string) => {
    return sessions.flatMap(session => 
      session.records.filter(record => record.studentId === studentId)
    );
  };

  return (
    <AttendanceContext.Provider value={{ 
      sessions,
      createSession,
      endSession,
      markAttendance,
      getSessionsByDate,
      getSessionsByCourse,
      getAttendanceByStudent
    }}>
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance() {
  const context = useContext(AttendanceContext);
  if (context === undefined) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
}
