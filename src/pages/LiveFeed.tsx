import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { usePeopleCount } from '../context/PeopleCountContext';
import StatusBadge from '../components/StatusBadge';
import { Loader2, Camera, CameraOff, RefreshCw, UserCheck, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

// Motion detection threshold (0-1)
const MOTION_THRESHOLD = 0.05;
// Frame processing interval in milliseconds (lower = more CPU usage)
const FRAME_INTERVAL = 500;
// Model confidence threshold (0-1)
const CONFIDENCE_THRESHOLD = 0.5;
// Number of motion frames to detect before processing
const MOTION_FRAMES_REQUIRED = 3;

// Performance optimization flags for Raspberry Pi
let model: cocossd.ObjectDetection | null = null;
let isModelLoading = false;
const previousPixels: ImageData | null = null;
const motionDetectedFrames = 0;

export default function LiveFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Add a ref to track component mounted state
  const isMounted = useRef<boolean>(true);
  const { count, setCount, activeLocation, locations } = usePeopleCount();
  
  const [isModelReady, setIsModelReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState<{width: number, height: number}>({ width: 0, height: 0 });
  const [motionLevel, setMotionLevel] = useState(0);
  const [isMotionDetected, setIsMotionDetected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(() => {
    // Default to true for Raspberry Pi
    return localStorage.getItem('low-power-mode') !== 'false';
  });
  
  // Performance monitoring
  const [processingTimes, setProcessingTimes] = useState<number[]>([]);
  const [lastFrameTime, setLastFrameTime] = useState<number>(0);
  // Track available cameras
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [waitingForUserInteraction, setWaitingForUserInteraction] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(localStorage.getItem('offline-mode') === 'true');
  
  // Get current location for capacity information
  const currentLocation = useMemo(() => {
    return locations.find(l => l.id === activeLocation) || locations[0];
  }, [locations, activeLocation]);
  
  // Load the TensorFlow.js model optimized for Raspberry Pi
  const loadModel = useCallback(async () => {
    if (model || isModelLoading) return model;

    try {
      isModelLoading = true;
      setIsModelReady(false);

      console.log('Loading TensorFlow.js model...');

      await tf.setBackend('webgl');

      model = await cocossd.load({
        base: 'lite_mobilenet_v2'
      });

      console.log('Model loaded successfully');
      if (isMounted.current) {
        setIsModelReady(true);
      }
      return model;
    } catch (err) {
      console.error('Error loading model:', err);
      if (isMounted.current) {
        setError('Failed to load detection model. Please refresh and try again.');
      }
      return null;
    } finally {
      isModelLoading = false;
    }
  }, []);

  // Get available video devices
  const getVideoDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      if (isMounted.current) {
        setVideoDevices(cameras);
      }
      console.log('Available video devices:', cameras);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, []);

  // Create a safe play function with retry logic
  const safePlay = useCallback(async (video: HTMLVideoElement, maxRetries = 3): Promise<void | (() => void)> => {
    let retryCount = 0;
    
    const attemptPlay = async () => {
      try {
        console.log('Attempting to play video...');
        await video.play();
        console.log('Video playback started successfully');
        return true;
      } catch (err) {
        console.error('Video play error:', err);
        return false;
      }
    };
    
    // First direct attempt
    if (await attemptPlay()) {
      setWaitingForUserInteraction(false);
      return;
    }
    
    // If first attempt fails, try with user interaction or timeout
    console.log('First play attempt failed, showing user interaction prompt');
    setWaitingForUserInteraction(true);
    
    // Fallback: try at regular intervals (only in development mode)
    if (process.env.NODE_ENV === 'development') {
      const intervalId = setInterval(async () => {
        if (retryCount >= maxRetries) {
          clearInterval(intervalId);
          return;
        }
        
        retryCount++;
        console.log(`Auto-retry ${retryCount}/${maxRetries}...`);
        
        if (await attemptPlay()) {
          clearInterval(intervalId);
          setWaitingForUserInteraction(false);
        }
      }, 1000);
      
      // Clear interval on component unmount
      return () => {
        clearInterval(intervalId);
      };
    }
  }, []);

  // Always render video regardless of detection
  const renderVideoOnly = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { 
      alpha: false,
      willReadFrequently: true 
    });
    
    if (!ctx) return;
    
    // Ensure canvas has proper dimensions
    if (canvas.width < 10 || canvas.height < 10) {
      canvas.width = 640;
      canvas.height = 480;
    }
    
    // Always draw the video frame, even if dimensions not detected
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (error) {
      // This can happen if video element isn't fully initialized
      console.warn("Could not render video frame:", error);
    }
  }, []);

  // Minimal direct camera display function
  const startCamera = useCallback(async () => {
    console.clear(); // Clear previous logs
    console.log("=== Starting camera with webcam prioritization ===");
    
    if (!videoRef.current) {
      console.error("No video element found");
      return;
    }
    
    try {
      setIsLoadingStream(true);
      setError(null);
      
      // Stop any existing stream
      if (videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      
      // First, enumerate available devices to find webcams
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      console.log(`Found ${videoDevices.length} video input devices:`, videoDevices);
      
      // Attempt to identify external webcams (non-built-in)
      // External webcams typically don't have "Built-in" or "FaceTime" in their labels
      const externalWebcams = videoDevices.filter(device => {
        const label = device.label.toLowerCase();
        return label && 
              !label.includes('built-in') && 
              !label.includes('facetime') && 
              !label.includes('internal');
      });
      
      console.log(`Identified ${externalWebcams.length} potential external webcams`);
      
      // Set up video constraints based on available devices
      let videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
      
      // If we found external webcams, prioritize the first one
      if (externalWebcams.length > 0) {
        console.log("Prioritizing external webcam:", externalWebcams[0].label);
        videoConstraints.deviceId = { exact: externalWebcams[0].deviceId };
      } else if (videoDevices.length > 0) {
        // If no external webcam but we have at least one camera, use that
        console.log("No external webcam found, using:", videoDevices[0].label);
        videoConstraints.deviceId = { exact: videoDevices[0].deviceId };
      }
      
      console.log("Using video constraints:", videoConstraints);
      
      // Request camera access with our constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      
      console.log("Camera access granted");
      
      // Get track settings immediately
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      console.log("Track settings:", settings);
      
      // Get more information about the selected camera
      console.log("Using camera:", videoTrack.label);
      
      // Use track settings directly - they're more reliable than waiting for video.videoWidth/Height
      const finalWidth = settings.width || 640;
      const finalHeight = settings.height || 480;
      
      console.log(`Using dimensions from track: ${finalWidth}x${finalHeight}`);
      
      // Set canvas dimensions based on track settings
      if (canvasRef.current) {
        canvasRef.current.width = finalWidth;
        canvasRef.current.height = finalHeight;
      }
      
      // Update resolution state with track settings
      setResolution({
        width: finalWidth,
        height: finalHeight
      });
      
      // Attach stream to video element
      videoRef.current.srcObject = stream;
      setVideoDevices(videoDevices); // Update available devices in state
      
      // Set up event listeners with simpler approach
      videoRef.current.onloadedmetadata = () => {
        console.log("Video metadata loaded");
        
        // Play immediately without waiting for dimensions
        videoRef.current?.play()
          .then(() => {
            console.log("Video playing successfully");
            setIsStreaming(true);
          })
          .catch(error => {
            console.error("Error playing video:", error);
            setWaitingForUserInteraction(true);
          });
      };
      
      // Add fallback for play
      videoRef.current.oncanplay = () => {
        console.log("Video can play event fired");
        if (!isStreaming && videoRef.current) {
          videoRef.current.play()
            .then(() => {
              console.log("Video playing from canplay event");
              setIsStreaming(true);
            })
            .catch(err => {
              console.log("Could not autoplay from canplay event");
            });
        }
      };
      
    } catch (error: any) {
      console.error("Camera access failed:", error);
      
      if (error.name === "NotReadableError") {
        setError("Camera is in use by another application. Please close other apps using the camera and try again.");
      } else if (error.name === "NotAllowedError") {
        setError("Camera access denied. Please allow camera access in your browser settings.");
      } else {
        setError(`Could not access camera: ${error.message}. Please check permissions and try again.`);
      }
    } finally {
      setIsLoadingStream(false);
    }
  }, [isStreaming]);

  // Manual play when autoplay is blocked
  const handleManualPlay = useCallback(() => {
    if (!videoRef.current || !isMounted.current) return;
    
    console.log("Attempting manual play...");
    try {
      // Add a small delay before attempting to play
      setTimeout(() => {
        if (!videoRef.current) return;
        
        videoRef.current.play()
          .then(() => {
            if (isMounted.current) {
              console.log("Manual play successful");
              setIsStreaming(true);
              setWaitingForUserInteraction(false);
              
              // Set resolution after successful play - ensure values exist
              if (videoRef.current && videoRef.current.videoWidth && videoRef.current.videoHeight) {
                setResolution({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight
                });
              } else {
                // Fallback values if videoWidth/videoHeight aren't available yet
                setResolution({
                  width: 640,
                  height: 480
                });
              }
            }
          })
          .catch(err => {
            if (isMounted.current) {
              console.error('Manual play failed:', err);
              setError('Could not start video stream. Please check camera permissions.');
            }
          });
      }, 100);
    } catch (err) {
      if (isMounted.current) {
        console.error('Manual play exception:', err);
        setError('Error starting camera. Please refresh and try again.');
      }
    }
  }, []);

  // Stop the camera stream
  const stopStream = useCallback(() => {
    if (!videoRef.current?.srcObject) return;
    
    const stream = videoRef.current.srcObject as MediaStream;
    const tracks = stream.getTracks();
    
    tracks.forEach(track => track.stop());
    videoRef.current.srcObject = null;
    if (isMounted.current) {
      setIsStreaming(false);
    }
  }, []);

  // Toggle the low power mode
  const toggleLowPowerMode = useCallback(() => {
    setLowPowerMode(prev => {
      const newValue = !prev;
      localStorage.setItem('low-power-mode', String(newValue));
      return newValue;
    });
  }, []);

  // Detect motion in video frames for performance optimization
  const detectMotion = useCallback((currentImageData: ImageData, previousImageData: ImageData): number => {
    if (currentImageData.width !== previousImageData.width || currentImageData.height !== previousImageData.height) {
      return 1; // Consider as motion if dimensions changed
    }
    
    const currentPixels = currentImageData.data;
    const prevPixels = previousImageData.data;
    let diffCount = 0;
    const totalPixels = currentPixels.length / 4; // RGBA values for each pixel
    
    // Sample pixels for faster processing (check every Nth pixel)
    const samplingRate = lowPowerMode ? 8 : 4;
    const samplesToCheck = totalPixels / samplingRate;
    
    for (let i = 0; i < currentPixels.length; i += 4 * samplingRate) {
      // Check if the pixel has changed significantly
      const rDiff = Math.abs(currentPixels[i] - prevPixels[i]);
      const gDiff = Math.abs(currentPixels[i + 1] - prevPixels[i + 1]);
      const bDiff = Math.abs(currentPixels[i + 2] - prevPixels[i + 2]);
      
      // If any channel has changed significantly, count as motion
      if (rDiff > 25 || gDiff > 25 || bDiff > 25) {
        diffCount++;
      }
    }
    
    // Calculate motion level (0-1)
    return diffCount / samplesToCheck;
  }, [lowPowerMode]);

  // Directly render video from constraints rather than using DOM dimensions
  const processVideoFrame = useCallback(async () => {
    // Add additional checks to ensure we have everything we need
    if (!model || !videoRef.current || !canvasRef.current || !isMounted.current) {
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { 
      alpha: false, // Use false for better performance
      willReadFrequently: true
    });
    
    if (!ctx) return;
    
    try {
      // Always use the resolution from our state - don't rely on videoWidth/videoHeight
      const useWidth = resolution.width || 640;
      const useHeight = resolution.height || 480;
      
      // Ensure canvas has correct dimensions
      if (canvas.width !== useWidth || canvas.height !== useHeight) {
        console.log(`Updating canvas to match resolution: ${useWidth}x${useHeight}`);
        canvas.width = useWidth;
        canvas.height = useHeight;
      }
      
      // Always draw video first - this ensures something is displayed
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (drawErr) {
        console.error("Could not draw video frame:", drawErr);
        return;
      }
      
      // Only attempt detection if we have valid dimensions and model is ready
      if (canvas.width >= 16 && canvas.height >= 16 && isModelReady && !isPaused) {
        try {
          const predictions = await model.detect(video);
          
          // Only clear and redraw if we have detections to show
          if (predictions && predictions.length > 0) {
            // Filter for people
            const peopleDetected = predictions.filter(prediction => 
              prediction.class === 'person' && prediction.score > CONFIDENCE_THRESHOLD
            );
            
            // Update count
            setCount(peopleDetected.length);
            
            if (peopleDetected.length > 0) {
              // Draw boxes and labels over the existing frame
              ctx.font = '16px Arial';
              ctx.lineWidth = 2;
              
              // Draw each detection box
              peopleDetected.forEach((prediction, index) => {
                const [x, y, width, height] = prediction.bbox;
                
                // Different colors based on confidence
                if (prediction.score > 0.8) {
                  ctx.strokeStyle = '#00FF00'; // Green for high confidence
                } else if (prediction.score > 0.6) {
                  ctx.strokeStyle = '#FFFF00'; // Yellow for medium confidence
                } else {
                  ctx.strokeStyle = '#FF9900'; // Orange for lower confidence
                }
                
                // Draw bounding box
                ctx.beginPath();
                ctx.rect(x, y, width, height);
                ctx.stroke();
                
                // Draw label background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(x, y - 25, 120, 25);
                
                // Draw label text
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(`Person ${index + 1}: ${Math.round(prediction.score * 100)}%`, x + 5, y - 7);
              });
              
              // Display UI information on canvas
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(10, 10, 200, 90);
              
              ctx.fillStyle = 'white';
              ctx.fillText(`Count: ${peopleDetected.length}`, 20, 30);
              ctx.fillText(`FPS: ${Math.round(fps)}`, 20, 50);
              
              // Display capacity information
              if (currentLocation) {
                const capacityPercentage = (peopleDetected.length / currentLocation.capacity) * 100;
                let capacityColor = '#00FF00'; // Green by default
                
                if (capacityPercentage > 90) {
                  capacityColor = '#FF0000'; // Red when near capacity
                } else if (capacityPercentage > 70) {
                  capacityColor = '#FFFF00'; // Yellow when getting full
                }
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(canvas.width - 210, 10, 200, 50);
                
                ctx.fillStyle = capacityColor;
                ctx.fillText(`Location: ${currentLocation.name}`, canvas.width - 200, 30);
                ctx.fillText(`Capacity: ${peopleDetected.length}/${currentLocation.capacity}`, canvas.width - 200, 50);
              }
            }
          }
        } catch (detectErr) {
          console.error("Detection error:", detectErr);
        }
      }
    } catch (err) {
      console.error('Error processing video frame:', err);
    }
  }, [
    model,
    resolution, 
    fps, 
    setCount, 
    currentLocation,
    isModelReady,
    isPaused
  ]);
  
  // Setup animation frame loop with more reliable rendering
  useEffect(() => {
    let frameId: number;
    let lastProcessTime = 0;
    const DETECTION_INTERVAL = 1000; // Process once per second to reduce performance impact
    
    const processFrame = async (timestamp: number) => {
      // Always request next frame FIRST to ensure smooth display
      frameId = requestAnimationFrame(processFrame);
      
      // Skip processing if component unmounted
      if (!isMounted.current || !videoRef.current) return;
      
      // Always try to render the video feed (even if dimensions are invalid)
      if (isStreaming && !isPaused) {
        renderVideoOnly();
      }
      
      // Only run object detection at specified intervals if dimensions are valid
      if (timestamp - lastProcessTime > DETECTION_INTERVAL && 
          isModelReady && 
          !isPaused && 
          videoRef.current.videoWidth > 10 && 
          videoRef.current.videoHeight > 10) {
        try {
          await processVideoFrame();
          lastProcessTime = timestamp;
        } catch (err) {
          console.error("Error in detection loop:", err);
          // Don't update lastProcessTime on error to allow retry on next interval
        }
      }
    };
    
    if (isStreaming) {
      // Start the animation loop
      frameId = requestAnimationFrame(processFrame);
      console.log("Started animation frame loop");
    }
    
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isModelReady, isStreaming, isPaused, processVideoFrame, renderVideoOnly]);
  
  // Initialize camera stream on component mount with error handling
  useEffect(() => {
    isMounted.current = true;
    
    // Check if we're in offline mode
    const offlineMode = localStorage.getItem('offline-mode') === 'true';
    setIsOfflineMode(offlineMode);
    
    // First load the model
    const init = async () => {
      try {
        await loadModel();
        console.log("Model loaded successfully");
        
        // Then start the camera with a delay to ensure model is ready
        setTimeout(() => {
          if (isMounted.current) {
            startCamera();
          }
        }, 500);
      } catch (error) {
        console.error("Error initializing:", error);
      }
    };
    
    // Start initialization
    init();
    
    return () => {
      isMounted.current = false;
      stopStream();
    };
  }, [loadModel, startCamera, stopStream]);
  
  // Effect to restart the stream when lowPowerMode changes
  useEffect(() => {
    if (isStreaming && isMounted.current) {
      stopStream();
      
      // Use a timeout to ensure the previous stream is fully stopped
      const timeoutId = setTimeout(() => {
        if (isMounted.current) {
          startCamera();
        }
      }, 500);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [lowPowerMode, stopStream, startCamera, isStreaming]);
  
  return (
    <div className="h-full flex flex-col">
      <div className="py-4 px-6 bg-gray-800 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Live Video Feed</h1>
        <div className="flex space-x-4">
          <StatusBadge count={count} capacity={currentLocation?.capacity || 0} />
          {isOfflineMode && (
            <div className="bg-yellow-600 text-white px-2 py-1 rounded text-xs">Offline Mode</div>
          )}
          <Link to="/config" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 text-white">
            <Settings size={20} />
          </Link>
        </div>
      </div>
      
      <div className="flex-grow flex flex-col items-center justify-center bg-gray-900 p-4 relative">
        {error && (
          <div className="absolute top-4 left-0 right-0 mx-auto w-11/12 max-w-2xl bg-red-500 text-white p-3 rounded-md shadow-lg">
            <p className="font-medium">{error}</p>
          </div>
        )}
        
        <div className="relative w-full max-w-4xl mx-auto bg-black" style={{ minHeight: "480px" }}>
          {/* Video Element - Always visible and correctly sized */}
          <video
            ref={videoRef}
            className="block w-full mx-auto" 
            playsInline
            muted
            style={{ 
              minHeight: '480px',
              minWidth: '640px',
              objectFit: 'contain',
              backgroundColor: 'black',
              position: 'relative',
              zIndex: 1,
              display: 'block' // Ensure video is always displayed
            }}
          />
          
          {/* Canvas element - Transparent overlay for detection drawing */}
          <canvas
            ref={canvasRef}
            width="640"
            height="480"
            className="absolute top-0 left-0 w-full"
            style={{ 
              display: isStreaming ? 'block' : 'none',
              pointerEvents: 'none',
              zIndex: 2,
              minHeight: '480px',
              minWidth: '640px',
              backgroundColor: 'transparent'
            }}
          />
          
          {/* Loading state */}
          {isLoadingStream && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
              <div className="text-center text-white">
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-500" />
                <p className="mt-2">Starting camera...</p>
              </div>
            </div>
          )}
          
          {/* User interaction required message */}
          {waitingForUserInteraction && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
              <div className="text-center text-white p-6 bg-gray-800 rounded-lg max-w-md">
                <UserCheck className="w-12 h-12 mx-auto text-blue-500 mb-4" />
                <h3 className="text-xl font-bold mb-2">Browser Autoplay Blocked</h3>
                <p className="mb-4">Your browser has blocked automatic video playback. Click the button below to start the camera feed.</p>
                <button 
                  onClick={handleManualPlay}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center justify-center mx-auto"
                >
                  <Camera className="w-5 h-5 mr-2" /> Start Camera
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-4 w-full max-w-4xl flex flex-wrap justify-between">
          <div className="flex gap-2 mb-3">
            <button
              onClick={isStreaming ? stopStream : startCamera}
              className={`px-4 py-2 rounded-md flex items-center ${
                isStreaming ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              } text-white`}
              disabled={isLoadingStream}
            >
              {isStreaming ? (
                <>
                  <CameraOff className="w-5 h-5 mr-2" /> Stop Camera
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5 mr-2" /> Start Camera
                </>
              )}
            </button>
            
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`px-4 py-2 rounded-md flex items-center ${
                isPaused ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
              } text-white`}
              disabled={!isStreaming || isLoadingStream}
            >
              {isPaused ? 'Resume Processing' : 'Pause Processing'}
            </button>
            
            <button
              onClick={toggleLowPowerMode}
              className={`px-4 py-2 rounded-md flex items-center ${
                lowPowerMode ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'
              } text-white`}
            >
              {lowPowerMode ? 'Switch to High Performance' : 'Switch to Low Power Mode'}
            </button>
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center space-x-6 text-white">
              <div className="flex items-center">
                <UserCheck className="w-5 h-5 mr-1 text-blue-400" />
                <span className="font-semibold">{count} detected</span>
              </div>
              
              <div className="flex items-center">
                <RefreshCw className={`w-5 h-5 mr-1 ${fps > 10 ? 'text-green-400' : 'text-yellow-400'}`} />
                <span className="font-semibold">{fps} FPS</span>
              </div>
              
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${
                  isMotionDetected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                }`} />
                <span className="font-semibold">
                  {isMotionDetected ? 'Motion' : 'Standby'}
                </span>
              </div>
            </div>
            
            <div className="mt-2 text-sm text-gray-400">
              <p>Resolution: {resolution.width}x{resolution.height}</p>
              <p>Mode: {lowPowerMode ? 'Low Power' : 'High Performance'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}