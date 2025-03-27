import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit, Camera, Check, X } from 'lucide-react';
import { useStudents } from '../context/StudentContext';
import faceRecognitionService from '../services/FaceRecognitionService';
import { Student } from '../types';

export default function Students() {
  const { students, addStudent, updateStudent, deleteStudent } = useStudents();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    hasConsentedToFaceRecognition: false,
    faceDescriptors: [] as Float32Array[]
  });
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceEnrollmentStatus, setFaceEnrollmentStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  // Create a video element manually to ensure it's always available
  useEffect(() => {
    // Only create the video element if it doesn't exist yet
    if (!videoRef.current) {
      const videoElement = document.createElement('video');
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.width = 640;
      videoElement.height = 480;
      videoElement.className = "w-full h-48 object-contain rounded";
      videoElement.style.backgroundColor = "#1f2937";
      
      // Set the ref value manually
      videoRef.current = videoElement;
      
      // Append to container if available
      if (videoContainerRef.current) {
        videoContainerRef.current.appendChild(videoElement);
      }
    }
    
    return () => {
      // Clean up the stream when component unmounts
      stopCamera();
    };
  }, []);

  useEffect(() => {
    // Load face recognition models when component mounts
    faceRecognitionService.loadModels().catch(error => {
      console.error('Error loading face recognition models:', error);
      setFaceEnrollmentStatus('Failed to load face recognition models. Please refresh and try again.');
    });

    return () => {
      stopCamera();
    };
  }, []);

  // Enumerate available camera devices
  const getAvailableCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      
      // Set first camera as default if available
      if (videoDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
      
      console.log('Available cameras:', videoDevices);
    } catch (error) {
      console.error('Error getting camera devices:', error);
    }
  };

  // Call getAvailableCameras when component mounts
  useEffect(() => {
    getAvailableCameras();
  }, []);

  const startCamera = async () => {
    try {
      console.log('Attempting to access camera with ID:', selectedCameraId);
      
      // First try to stop any existing streams
      stopCamera();
      
      // Request less restrictive constraints for better compatibility
      const constraints = { 
        video: selectedCameraId 
          ? { deviceId: { exact: selectedCameraId } }
          : true,
        audio: false
      };
      
      console.log('Using camera constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Camera access granted!', stream);
      
      if (videoRef.current) {
        // Set the stream to the video element
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Ensure video is muted to avoid feedback
        
        // Add debugging for track info
        stream.getVideoTracks().forEach(track => {
          console.log('Video track info:', {
            label: track.label,
            enabled: track.enabled,
            readonly: track.readonly,
            id: track.id
          });
        });
        
        // Use both event types for better browser compatibility
        videoRef.current.onloadeddata = () => {
          console.log('Video data loaded');
          setIsCameraActive(true);
          setFaceEnrollmentStatus('Camera active. Position your face and click Capture');
        };
        
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded:', {
            width: videoRef.current?.videoWidth,
            height: videoRef.current?.videoHeight,
            readyState: videoRef.current?.readyState
          });
          
          // Force the video to play
          videoRef.current?.play().catch(err => {
            console.error('Play error:', err);
          });
        };
        
        // Start playing immediately (don't wait for metadata)
        try {
          videoRef.current.play();
          setIsCameraActive(true);
        } catch (playError) {
          console.error('Initial play attempt failed:', playError);
        }
      } else {
        console.error('Video reference is not available');
        setFaceEnrollmentStatus('Video element not available. Please try refreshing the page.');
      }
    } catch (error) {
      console.error('Camera access error:', error);
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setFaceEnrollmentStatus('Camera access denied. Please grant camera permission in your browser settings.');
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setFaceEnrollmentStatus('No camera found. Please connect a camera and try again.');
      } else if (error instanceof DOMException && error.name === 'NotReadableError') {
        setFaceEnrollmentStatus('Camera is in use by another application. Please close other applications using the camera.');
      } else if (error instanceof DOMException && error.name === 'OverconstrainedError') {
        setFaceEnrollmentStatus('Camera constraints not satisfiable. Please select a different camera.');
        // Fall back to any camera
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.play();
            setIsCameraActive(true);
          }
        } catch (fallbackError) {
          console.error('Fallback camera error:', fallbackError);
        }
      } else {
        setFaceEnrollmentStatus(`Error accessing camera: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null as unknown as MediaStream;
      setIsCameraActive(false);
    }
  };

  const captureFace = async () => {
    if (!videoRef.current) {
      setFaceEnrollmentStatus('Video element not available.');
      return;
    }
    
    console.log('Video readyState:', videoRef.current.readyState);
    
    // Add a small delay to give the video time to initialize
    if (videoRef.current.readyState === 0) {
      setFaceEnrollmentStatus('Video is initializing, please wait...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Make the check more lenient - accept any state where we have data
    // HAVE_NOTHING = 0, HAVE_METADATA = 1, HAVE_CURRENT_DATA = 2, HAVE_FUTURE_DATA = 3, HAVE_ENOUGH_DATA = 4
    if (videoRef.current.readyState === 0) {
      setFaceEnrollmentStatus('Video stream not ready. Please try again in a few seconds.');
      return;
    }
    
    try {
      setFaceEnrollmentStatus('Processing...');
      
      // Force a play attempt if paused for any reason
      if (videoRef.current.paused) {
        await videoRef.current.play();
      }
      
      const faceDescriptor = await faceRecognitionService.captureFaceFromVideo(videoRef.current);
      
      if (editingStudent) {
        // Add to existing descriptors if editing
        const updatedDescriptors = [...(editingStudent.faceDescriptors || []), faceDescriptor];
        updateStudent(editingStudent.id, {
          faceDescriptors: updatedDescriptors
        });
      } else {
        // Set as first descriptor if new student
        setNewStudent(prev => ({
          ...prev,
          faceDescriptors: [...prev.faceDescriptors, faceDescriptor]
        }));
      }
      
      setFaceEnrollmentStatus('Face captured successfully!');
    } catch (error) {
      console.error('Error capturing face:', error);
      setFaceEnrollmentStatus(
        error instanceof Error 
          ? `Error: ${error.message}` 
          : 'Error capturing face. Please try again.'
      );
    }
  };

  const handleAddStudent = () => {
    if (!newStudent.name || !newStudent.email) {
      setFaceEnrollmentStatus('Please enter a name and email');
      return;
    }
    
    addStudent({
      name: newStudent.name,
      email: newStudent.email,
      faceDescriptors: newStudent.faceDescriptors || [],
      hasConsentedToFaceRecognition: newStudent.hasConsentedToFaceRecognition
    });
    
    setNewStudent({
      name: '',
      email: '',
      hasConsentedToFaceRecognition: false,
      faceDescriptors: []
    });
    
    stopCamera();
    setIsAddModalOpen(false);
  };

  const handleUpdateStudent = () => {
    if (!editingStudent || !editingStudent.name || !editingStudent.email) {
      setFaceEnrollmentStatus('Please enter a name and email');
      return;
    }
    
    updateStudent(editingStudent.id, editingStudent);
    setEditingStudent(null);
    stopCamera();
    setIsEditModalOpen(false);
  };

  const handleEditClick = (student: Student) => {
    setEditingStudent({
      ...student,
      // Ensure faceDescriptors is an array even if it's undefined
      faceDescriptors: student.faceDescriptors || []
    });
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    stopCamera();
    setNewStudent({
      name: '',
      email: '',
      hasConsentedToFaceRecognition: false,
      faceDescriptors: []
    });
    setFaceEnrollmentStatus('');
  };

  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Student Management</h1>
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Add Student
          </button>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Face Data</th>
                <th className="px-6 py-3 text-left">Consent</th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                    No students found. Add a student to get started.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="border-t border-gray-700">
                    <td className="px-6 py-4">{student.name}</td>
                    <td className="px-6 py-4">{student.email}</td>
                    <td className="px-6 py-4">
                      {student.faceDescriptors && student.faceDescriptors.length > 0 
                        ? `${student.faceDescriptors.length} samples` 
                        : 'No face data'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        student.hasConsentedToFaceRecognition 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {student.hasConsentedToFaceRecognition ? 'Consented' : 'Not consented'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditClick(student)}
                          className="p-1 text-blue-400 hover:text-blue-300"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => deleteStudent(student.id)}
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New Student</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={newStudent.email}
                  onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="consent"
                  checked={newStudent.hasConsentedToFaceRecognition}
                  onChange={(e) => setNewStudent({ ...newStudent, hasConsentedToFaceRecognition: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="consent">
                  Student has consented to facial recognition
                </label>
              </div>
              
              {newStudent.hasConsentedToFaceRecognition && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium">
                      Face Enrollment 
                      {newStudent.faceDescriptors.length > 0 && 
                        ` (${newStudent.faceDescriptors.length} samples)`}
                    </label>
                    {!isCameraActive ? (
                      <button
                        onClick={startCamera}
                        className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
                      >
                        <Camera size={16} className="mr-1" />
                        Start Camera
                      </button>
                    ) : (
                      <button
                        onClick={stopCamera}
                        className="flex items-center px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm"
                      >
                        <X size={16} className="mr-1" />
                        Stop Camera
                      </button>
                    )}
                  </div>
                  
                  <div className="bg-gray-900 rounded-lg overflow-hidden mb-2" ref={videoContainerRef}>
                    {isCameraActive ? (
                      <div id="active-video-container"></div>
                    ) : (
                      <div className="w-full h-48 flex items-center justify-center text-gray-500">
                        Camera inactive
                      </div>
                    )}
                  </div>
                  
                  {isCameraActive && (
                    <button
                      onClick={captureFace}
                      className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg mb-2"
                    >
                      Capture Face
                    </button>
                  )}
                  
                  {faceEnrollmentStatus && (
                    <p className="text-sm text-center text-gray-300">
                      {faceEnrollmentStatus}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col mb-4">
                    <label className="block text-sm font-medium mb-1">Select Camera</label>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    >
                      {availableCameras.length === 0 ? (
                        <option value="">No cameras detected</option>
                      ) : (
                        availableCameras.map((camera) => (
                          <option key={camera.deviceId} value={camera.deviceId}>
                            {camera.label || `Camera ${camera.deviceId.slice(0, 5)}...`}
                          </option>
                        ))
                      )}
                    </select>
                    <button 
                      onClick={getAvailableCameras}
                      className="mt-1 text-sm text-blue-400 hover:text-blue-300 self-end"
                    >
                      Refresh Camera List
                    </button>
                  </div>
            </div>
            
            <div className="flex justify-end mt-6 space-x-2">
              <button
                onClick={() => {
                  resetForm();
                  setIsAddModalOpen(false);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStudent}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Add Student
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Student Modal */}
      {isEditModalOpen && editingStudent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Edit Student</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={editingStudent.email}
                  onChange={(e) => setEditingStudent({ ...editingStudent, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editConsent"
                  checked={editingStudent.hasConsentedToFaceRecognition}
                  onChange={(e) => setEditingStudent({ 
                    ...editingStudent, 
                    hasConsentedToFaceRecognition: e.target.checked 
                  })}
                  className="mr-2"
                />
                <label htmlFor="editConsent">
                  Student has consented to facial recognition
                </label>
              </div>
              
              {editingStudent.hasConsentedToFaceRecognition && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium">
                      Face Samples: {editingStudent.faceDescriptors?.length || 0}
                    </label>
                    {!isCameraActive ? (
                      <button
                        onClick={startCamera}
                        className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
                      >
                        <Camera size={16} className="mr-1" />
                        Add Sample
                      </button>
                    ) : (
                      <button
                        onClick={stopCamera}
                        className="flex items-center px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm"
                      >
                        <X size={16} className="mr-1" />
                        Stop Camera
                      </button>
                    )}
                  </div>
                  
                  {isCameraActive && (
                    <>
                      <div className="bg-gray-900 rounded-lg overflow-hidden mb-2" ref={videoContainerRef}>
                        <div id="active-video-container"></div>
                      </div>
                      
                      <button
                        onClick={captureFace}
                        className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg mb-2"
                      >
                        Capture Face
                      </button>
                    </>
                  )}
                  
                  {faceEnrollmentStatus && (
                    <p className="text-sm text-center text-gray-300">
                      {faceEnrollmentStatus}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col mb-4">
                    <label className="block text-sm font-medium mb-1">Select Camera</label>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    >
                      {availableCameras.length === 0 ? (
                        <option value="">No cameras detected</option>
                      ) : (
                        availableCameras.map((camera) => (
                          <option key={camera.deviceId} value={camera.deviceId}>
                            {camera.label || `Camera ${camera.deviceId.slice(0, 5)}...`}
                          </option>
                        ))
                      )}
                    </select>
                    <button 
                      onClick={getAvailableCameras}
                      className="mt-1 text-sm text-blue-400 hover:text-blue-300 self-end"
                    >
                      Refresh Camera List
                    </button>
                  </div>
            </div>
            
            <div className="flex justify-end mt-6 space-x-2">
              <button
                onClick={() => {
                  stopCamera();
                  setIsEditModalOpen(false);
                  setEditingStudent(null);
                  setFaceEnrollmentStatus('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStudent}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
