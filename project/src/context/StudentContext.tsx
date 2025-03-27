import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Student } from '../types';

interface StudentContextType {
  students: Student[];
  addStudent: (student: Omit<Student, 'id'>) => void;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  getStudentById: (id: string) => Student | undefined;
}

const StudentContext = createContext<StudentContextType | undefined>(undefined);

export function StudentProvider({ children }: { children: ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);

  // Load students from localStorage on mount
  useEffect(() => {
    const savedStudents = localStorage.getItem('attendance-students');
    if (savedStudents) {
      try {
        // Need to convert the plain objects back to proper format with Float32Array
        const parsedStudents = JSON.parse(savedStudents, (key, value) => {
          if (key === 'faceDescriptors' && Array.isArray(value)) {
            return value.map(descriptor => 
              descriptor && typeof descriptor === 'object' 
                ? new Float32Array(Object.values(descriptor)) 
                : descriptor
            );
          }
          return value;
        });
        setStudents(parsedStudents);
      } catch (error) {
        console.error('Error loading students from localStorage:', error);
      }
    }
  }, []);

  // Save students to localStorage when changed
  useEffect(() => {
    if (students.length > 0) {
      localStorage.setItem('attendance-students', JSON.stringify(students));
    }
  }, [students]);

  const addStudent = (student: Omit<Student, 'id'>) => {
    const newStudent = { ...student, id: uuidv4() };
    setStudents(prev => [...prev, newStudent]);
  };

  const updateStudent = (id: string, updates: Partial<Student>) => {
    setStudents(prev => 
      prev.map(student => 
        student.id === id ? { ...student, ...updates } : student
      )
    );
  };

  const deleteStudent = (id: string) => {
    setStudents(prev => prev.filter(student => student.id !== id));
  };

  const getStudentById = (id: string) => {
    return students.find(student => student.id === id);
  };

  return (
    <StudentContext.Provider value={{ 
      students, 
      addStudent, 
      updateStudent, 
      deleteStudent,
      getStudentById
    }}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudents() {
  const context = useContext(StudentContext);
  if (context === undefined) {
    throw new Error('useStudents must be used within a StudentProvider');
  }
  return context;
}
