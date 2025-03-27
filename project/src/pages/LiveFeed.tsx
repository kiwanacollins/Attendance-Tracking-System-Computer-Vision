import React, { useEffect, useRef, useState } from 'react';
import { Detection } from '../types';
import { Pause, Play, Maximize, Clock, UserCheck, Users } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { usePeopleCount } from '../context/PeopleCountContext';
import { useStudents } from '../context/StudentContext';
import { useCourses } from '../context/CourseContext';
import { useAttendance } from '../context/AttendanceContext';
import faceRecognitionService from '../services/FaceRecognitionService';
import StatusBadge from '../components/StatusBadge';

export default function LiveFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [model, setModel] = useState<cocossd.ObjectDetection | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryTimeoutRef = useRef<number>();
  const animationFrameRef = useRef<number>();
  const faceRecognitionIntervalRef = useRef<NodeJS.Timeout>();

  // Context hooks
  const { setCount } = usePeopleCount();
  const { students } = useStudents();
  const { courses } = useCourses();
  const { sessions, createSession, markAttendance, endSession } = useAttendance();

  // Attendance tracking state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [recognizedStudents, setRecognizedStudents] = useState<{
    id: string;
    name: string;
    timestamp: string;
    status: 'present' | 'late';
  }[]>([]);
  const [isAttendanceActive, setIsAttendanceActive] = useState(false);
  const [faceDetectionStatus, setFaceDetectionStatus] = useState('');
  const recognizedStudentIdsRef = useRef<Set<string>>(new Set());

  // Load object detection model on mount
  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedModel = await cocossd.load();
        setModel(loadedModel);
        setError(null);
      } catch (err) {
        setError('Failed to load AI model. Please refresh the page.');
        console.error('Model loading error:', err);
      }
    };
    loadModel();
    return () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Initialize camera
  useEffect(() => {
    if (!videoRef.current) return;
    const constraints = {
      video: {
        width: 1280,
        height: 720,
      },
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setError(null);
        }
      })
      .catch((err) => {
        setError('Camera access denied. Please check your permissions.');
        console.error('Error accessing camera:', err);
      });
    const handleVideoReady = () => {
      setIsVideoReady(true);
      if (canvasRef.current && videoRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
      }
    };
    videoRef.current.addEventListener('loadeddata', handleVideoReady);
    return () => {
      if (videoRef.current) {
        const stream = videoRef.current.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        videoRef.current.removeEventListener('loadeddata', handleVideoReady);
      }
    };
  }, []);

  // Load face recognition models
  useEffect(() => {
    faceRecognitionService.loadModels().catch(error => {
      console.error('Error loading face recognition models:', error);
      setError('Failed to load face recognition models. Attendance tracking may not work.');
    });

    return () => {
      if (faceRecognitionIntervalRef.current) {
        clearInterval(faceRecognitionIntervalRef.current);
      }
    };
  }, []);

  // Start/stop face recognition when attendance tracking is toggled
  useEffect(() => {
    if (isAttendanceActive && videoRef.current) {
      // Start face recognition every 3 seconds to not overload the browser
      faceRecognitionIntervalRef.current = setInterval(() => {
        if (!isPaused && videoRef.current) {
          performFaceRecognition();
        }
      }, 3000);
    } else {
      if (faceRecognitionIntervalRef.current) {
        clearInterval(faceRecognitionIntervalRef.current);
      }
    }

    return () => {
      if (faceRecognitionIntervalRef.current) {
        clearInterval(faceRecognitionIntervalRef.current);
      }
    };
  }, [isAttendanceActive, isPaused, students, activeSessionId, selectedCourseId]);

  // Object detection frame by frame
  const detectFrame = async () => {
    if (!model || !videoRef.current || !canvasRef.current || !isVideoReady) return;
    if (isPaused) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }
    try {
      // Ensure video is playing and ready
      if (videoRef.current.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(detectFrame);
        return;
      }
      const predictions = await model.detect(videoRef.current);
      setDetections(predictions);
      const peopleCount = predictions.filter(d => d.class === 'person').length;
      setCount(peopleCount); // Update the shared count
      setError(null);
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      
      predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(x, y - 20, 100, 20);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.fillText(
          `${prediction.class}: ${Math.round(prediction.score * 100)}%`,
          x,
          y - 5
        );
      });
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    } catch (error) {
      console.error('Detection error:', error);
      // Only set error if it's persistent
      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = window.setTimeout(() => {
          setError('Detection error occurred. Attempting to recover...');
          retryTimeoutRef.current = undefined;
        }, 5000);
      }
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    }
  };

  // Perform face recognition on current video frame
  const performFaceRecognition = async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4) return;
    
    setFaceDetectionStatus('Analyzing faces...');
    
    try {
      // Get the current session
      const currentSession = sessions.find(s => s.id === activeSessionId);
      if (!currentSession) {
        setFaceDetectionStatus('No active session found');
        return;
      }

      // Identify faces in the current frame
      const identificationResults = await faceRecognitionService.identifyFaces(
        videoRef.current,
        students
      );
      
      if (identificationResults.length === 0) {
        setFaceDetectionStatus('No faces detected');
        return;
      }
      
      // Check for identified students
      const currentDate = new Date();
      let newRecognitions = false;
      
      identificationResults.forEach(result => {
        if (result.studentId && !recognizedStudentIdsRef.current.has(result.studentId)) {
          // Find student details
          const student = students.find(s => s.id === result.studentId);
          if (student) {
            // Determine if student is late
            const courseStartTime = getCourseStartTimeForToday(selectedCourseId);
            const isLate = courseStartTime && currentDate.toTimeString().slice(0, 5) > courseStartTime;
            
            // Mark attendance in the system with a valid status (present or late)
            if (activeSessionId) {
              markAttendance(
                activeSessionId,
                student.id,
                isLate ? 'late' : 'present'
              );
            }
            
            // Add to recognized students list
            setRecognizedStudents(prev => [
              ...prev,
              {
                id: student.id,
                name: student.name,
                timestamp: currentDate.toISOString(),
                status: isLate ? 'late' : 'present'
              }
            ]);
            
            // Add to recognized set to avoid duplicates
            recognizedStudentIdsRef.current.add(student.id);
            newRecognitions = true;
          }
        }
      });
      
      if (newRecognitions) {
        setFaceDetectionStatus('Students recognized and attendance marked!');
      } else {
        setFaceDetectionStatus('Scanning for new students...');
      }
    } catch (error) {
      console.error('Face recognition error:', error);
      setFaceDetectionStatus('Error during face recognition. Retrying...');
    }
  };

  // Get course start time for today
  const getCourseStartTimeForToday = (courseId: string): string | null => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return null;
    
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const schedule = course.schedule.find(s => s.day === today);
    
    return schedule?.startTime || null;
  };

  // Start attendance tracking session
  const startAttendanceTracking = () => {
    if (!selectedCourseId) {
      setError('Please select a course to track attendance');
      return;
    }
    
    // Create a new attendance session
    const session = createSession(selectedCourseId);
    setActiveSessionId(session.id);
    setIsAttendanceActive(true);
    recognizedStudentIdsRef.current.clear();
    setRecognizedStudents([]);
    setFaceDetectionStatus('Attendance tracking started. Waiting for students...');
  };

  // Stop attendance tracking
  const stopAttendanceTracking = () => {
    if (activeSessionId) {
      // End the attendance session
      endSession(activeSessionId);
      setIsAttendanceActive(false);
      setActiveSessionId(null);
      setFaceDetectionStatus('Attendance tracking stopped');
    }
  };

  useEffect(() => {
    if (isVideoReady) {
      detectFrame();
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [model, isPaused, isVideoReady]);

  const togglePause = () => {
    setIsPaused(!isPaused);
    if (!isPaused) { // If we're about to pause
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else { // If we're about to resume
      detectFrame();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center justify-between p-4 bg-gray-800">
        <h1 className="text-xl font-bold text-white">Live Attendance Tracking</h1>
        
        {!isAttendanceActive ? (
          <div className="flex items-center space-x-4">
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="">Select a course</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
            
            <button
              onClick={startAttendanceTracking}
              disabled={!selectedCourseId}
              className={`flex items-center px-4 py-2 rounded ${
                !selectedCourseId 
                  ? 'bg-gray-600 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Clock size={18} className="mr-2" />
              Start Attendance Tracking
            </button>
          </div>
        ) : (
          <div className="flex items-center">
            <StatusBadge status="active" text="Attendance Tracking Active" />
            <button
              onClick={stopAttendanceTracking}
              className="ml-4 flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
            >
              Stop Tracking
            </button>
          </div>
        )}
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 bg-black">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <button
              onClick={togglePause}
              className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
            >
              {isPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
            >
              <Maximize size={20} />
            </button>
          </div>
          
          <div className="absolute top-4 left-4 z-10 bg-gray-800 text-white px-3 py-1 rounded">
            People detected: {detections.filter(d => d.class === 'person').length}
          </div>
          
          {error && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-red-500 text-white px-4 py-2 rounded shadow-lg">
              {error}
            </div>
          )}
          
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute w-full h-full object-contain"
            />
            <canvas
              ref={canvasRef}
              className="absolute w-full h-full"
            />
          </div>
        </div>
        
        {isAttendanceActive && (
          <div className="w-80 bg-gray-800 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-bold text-white flex items-center">
                <Users size={18} className="mr-2" /> 
                Recognized Students
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {faceDetectionStatus}
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {recognizedStudents.length === 0 ? (
                <div className="p-4 text-center text-gray-400">
                  No students recognized yet. Students will appear here as they are detected.
                </div>
              ) : (
                <ul className="divide-y divide-gray-700">
                  {recognizedStudents.map((student) => (
                    <li key={student.id} className="p-4 hover:bg-gray-700">
                      <div className="flex items-center">
                        <div className="flex-1">
                          <div className="font-medium text-white">{student.name}</div>
                          <div className="text-sm text-gray-400">
                            {new Date(student.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        <div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            student.status === 'present' 
                              ? 'bg-green-600 text-white' 
                              : 'bg-yellow-600 text-white'
                          }`}>
                            <UserCheck size={12} className="mr-1" />
                            {student.status === 'present' ? 'Present' : 'Late'}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}