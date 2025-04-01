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
let previousPixels: ImageData | null = null;
let motionDetectedFrames = 0;

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
  const safePlay = useCallback(async (video: HTMLVideoElement, maxRetries = 5): Promise<void> => {
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Check if component is still mounted and video element still exists
        if (!isMounted.current) {
          console.log('Component unmounted, aborting video play');
          return;
        }
        
        if (!video || !document.body.contains(video)) {
          throw new Error('Video element no longer in DOM');
        }
        
        // Try to play
        await video.play();
        
        // Only update state if still mounted
        if (isMounted.current) {
          setWaitingForUserInteraction(false);
        }
        return;
      } catch (err) {
        retryCount++;
        console.log(`Retry ${retryCount} of ${maxRetries} for video play:`, err);
        
        // Don't retry if component is unmounted
        if (!isMounted.current) {
          return;
        }
        
        if (retryCount >= maxRetries) {
          if (isMounted.current) {
            setWaitingForUserInteraction(true);
          }
          throw err;
        }
        
        // Wait a bit longer between retries
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }, []);

  // Start the camera stream with optimized settings for Raspberry Pi
  const startStream = useCallback(async () => {
    if (!videoRef.current || !isMounted.current) return;
    
    try {
      setIsLoadingStream(true);
      setError(null);
      
      // Get user preferences from localStorage
      const streamConfig = JSON.parse(localStorage.getItem('stream-config') || '{}');
      const preferredDevice = streamConfig.deviceId || 'default';
      
      // Optimized constraints for Raspberry Pi performance
      const constraints = {
        video: {
          deviceId: preferredDevice !== 'default' ? preferredDevice : undefined,
          width: { ideal: lowPowerMode ? 640 : 1280 },
          height: { ideal: lowPowerMode ? 480 : 720 },
          frameRate: { ideal: lowPowerMode ? 15 : 30 }
        }
      };
      
      // Make sure any previous stream is properly stopped
      if (videoRef.current.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }

      // First check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }
      
      // Get camera devices
      await getVideoDevices();
      
      // Check if still mounted after async operation
      if (!isMounted.current) return;
      
      // Request camera access with a timeout to prevent hanging
      const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
      const timeoutPromise = new Promise<MediaStream>((_, reject) => {
        setTimeout(() => reject(new Error('Camera access timed out after 10 seconds')), 10000);
      });
      
      const stream = await Promise.race([streamPromise, timeoutPromise]);
      
      // Check if component is still mounted and video ref exists
      if (!isMounted.current || !videoRef.current) return;
      
      // Set the stream
      videoRef.current.srcObject = stream;
      
      // Set up proper event handlers
      videoRef.current.onloadedmetadata = () => {
        console.log('Video metadata loaded successfully');
        
        if (!videoRef.current || !isMounted.current) return;
        
        // Update resolution once metadata is loaded
        if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
          setResolution({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          });
        }
        
        // Try to play after metadata is loaded
        safePlay(videoRef.current)
          .then(() => {
            if (isMounted.current) {
              console.log('Video playing successfully');
              setIsStreaming(true);
              setWaitingForUserInteraction(false);
            }
          })
          .catch((playError) => {
            if (isMounted.current) {
              console.error('Error playing video:', playError);
              console.warn('Auto-play may be blocked by browser. User interaction may be required.');
              setWaitingForUserInteraction(true);
            }
          });
      };
      
      // Handle errors
      videoRef.current.onerror = (e) => {
        if (isMounted.current) {
          console.error('Video element error:', e);
          setError('Error with video playback. Please reload the page.');
        }
      };
      
      // Make sure model is loaded regardless of stream success
      if (!isModelReady && !isModelLoading) {
        loadModel();
      }
      
    } catch (streamError) {
      if (isMounted.current) {
        console.error('Error starting video stream:', streamError);
        setError(`Failed to access camera: ${streamError.message || 'Unknown error'}. Please check permissions and try again.`);
        await getVideoDevices();
      }
    } finally {
      if (isMounted.current) {
        setIsLoadingStream(false);
      }
    }
  }, [isModelReady, loadModel, lowPowerMode, getVideoDevices, safePlay]);

  // Manual play when autoplay is blocked
  const handleManualPlay = useCallback(() => {
    if (!videoRef.current || !isMounted.current) return;
    
    try {
      videoRef.current.play()
        .then(() => {
          if (isMounted.current) {
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

  // Process video frames for object detection
  const processVideoFrame = useCallback(async () => {
    // Add additional checks to ensure we have everything we need
    if (!isModelReady || !isStreaming || isPaused || !model || !videoRef.current || !canvasRef.current || !isMounted.current) {
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    try {
      // Safety check for video dimensions
      if (!video.videoWidth || !video.videoHeight) {
        console.warn('Video dimensions not available yet');
        return;
      }
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Motion detection for performance optimization
      const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let motionLevel = 0;
      
      if (previousPixels) {
        motionLevel = detectMotion(currentImageData, previousPixels);
        
        if (isMounted.current) {
          setMotionLevel(motionLevel);
        }
        
        // Only process frames with sufficient motion in low power mode
        if (lowPowerMode && motionLevel < MOTION_THRESHOLD) {
          motionDetectedFrames = 0;
          
          if (isMounted.current) {
            setIsMotionDetected(false);
          }
          
          previousPixels = currentImageData;
          
          // Still draw the video but skip detection
          ctx.font = '16px Arial';
          ctx.fillStyle = 'green';
          ctx.fillText(`Standby - No Motion Detected`, 10, 30);
          return;
        } else if (lowPowerMode) {
          // Count motion frames
          motionDetectedFrames++;
          
          // Only process after consecutive motion frames to avoid false triggers
          if (motionDetectedFrames < MOTION_FRAMES_REQUIRED) {
            if (isMounted.current) {
              setIsMotionDetected(true);
            }
            
            previousPixels = currentImageData;
            
            ctx.font = '16px Arial';
            ctx.fillStyle = 'yellow';
            ctx.fillText(`Motion Detected - Preparing...`, 10, 30);
            return;
          }
          
          if (isMounted.current) {
            setIsMotionDetected(true);
          }
        }
      }
      
      previousPixels = currentImageData;
      
      // Record start time for performance monitoring
      const startTime = performance.now();
      
      // Check again if component is still mounted
      if (!isMounted.current) return;
      
      // Perform detection
      const predictions = await model.detect(video);
      
      // Check again if component is still mounted after async operation
      if (!isMounted.current) return;
      
      // Record processing time
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // Update performance metrics
      const newProcessingTimes = [...processingTimes, processingTime].slice(-10); // Keep last 10
      setProcessingTimes(newProcessingTimes);
      
      // Calculate FPS based on frame interval and processing time
      const currentFps = 1000 / (processingTime + (performance.now() - lastFrameTime));
      setFps(Math.round(currentFps));
      
      // Draw bounding boxes
      const peopleDetected = predictions.filter(prediction => 
        prediction.class === 'person' && prediction.score > CONFIDENCE_THRESHOLD
      );
      
      // Draw boxes and labels
      ctx.font = '16px Arial';
      ctx.lineWidth = 2;
      
      // Update global count
      setCount(peopleDetected.length);
      
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
      ctx.fillText(`Process Time: ${Math.round(processingTime)}ms`, 20, 70);
      ctx.fillText(`Motion: ${Math.round(motionLevel * 100)}%`, 20, 90);
      
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
      
      // Update last frame time for better FPS calculation
      if (isMounted.current) {
        setLastFrameTime(performance.now());
      }
    } catch (err) {
      console.error('Error processing video frame:', err);
    }
  }, [
    isModelReady, 
    isStreaming, 
    isPaused, 
    detectMotion, 
    lowPowerMode, 
    processingTimes, 
    lastFrameTime, 
    fps, 
    setCount, 
    currentLocation
  ]);
  
  // Setup the detection loop
  useEffect(() => {
    let frameId: number;
    let lastProcessTime = 0;
    
    const processFrame = async (timestamp: number) => {
      // Check if component is still mounted
      if (!isMounted.current) return;
      
      if (timestamp - lastProcessTime > FRAME_INTERVAL) {
        await processVideoFrame();
        lastProcessTime = timestamp;
      }
      
      // Only continue the animation loop if component is still mounted
      if (isMounted.current) {
        frameId = requestAnimationFrame(processFrame);
      }
    };
    
    if (isModelReady && isStreaming && !isPaused) {
      frameId = requestAnimationFrame(processFrame);
    }
    
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isModelReady, isStreaming, isPaused, processVideoFrame]);
  
  // Initialize camera stream on component mount
  useEffect(() => {
    isMounted.current = true;
    
    loadModel();
    startStream();
    
    return () => {
      isMounted.current = false;
      stopStream();
    };
  }, [loadModel, startStream, stopStream]);
  
  // Effect to restart the stream when lowPowerMode changes
  useEffect(() => {
    if (isStreaming && isMounted.current) {
      stopStream();
      
      // Use a timeout to ensure the previous stream is fully stopped
      const timeoutId = setTimeout(() => {
        if (isMounted.current) {
          startStream();
        }
      }, 500);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [lowPowerMode, stopStream, startStream, isStreaming]);
  
  return (
    <div className="h-full flex flex-col">
      <div className="py-4 px-6 bg-gray-800 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Live Video Feed</h1>
        <div className="flex space-x-4">
          <StatusBadge count={count} capacity={currentLocation?.capacity || 0} />
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
        
        <div className="relative w-full max-w-4xl mx-auto">
          {/* Hidden Video Element */}
          <video
            ref={videoRef}
            className={`${isStreaming ? 'hidden' : 'block'} w-full h-auto mx-auto bg-black`}
            playsInline
            muted
          />
          
          {/* Canvas for drawing detection */}
          <canvas
            ref={canvasRef}
            className={`${isStreaming ? 'block' : 'hidden'} w-full h-auto mx-auto bg-black`}
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
              onClick={isStreaming ? stopStream : startStream}
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