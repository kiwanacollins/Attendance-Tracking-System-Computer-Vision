import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { usePeopleCount } from '../context/PeopleCountContext';
import { Loader2, Camera, CameraOff, UserCheck } from 'lucide-react';

// Model confidence threshold (0-1)
const CONFIDENCE_THRESHOLD = 0.40; // Lowered threshold to improve detection sensitivity

// Performance optimization flags for Raspberry Pi
let model: cocossd.ObjectDetection | null = null;
let isModelLoading = false;
let frameProcessingEnabled = true;  // Control flag for frame processing on low-power devices

// Raspberry Pi 4B specific optimizations
const IS_RASPBERRY_PI = navigator.userAgent.toLowerCase().includes('linux') && 
                        navigator.hardwareConcurrency <= 4;

// Function to reset state when component unmounts (moved to module-level implementation)
function resetModuleState() {
  model = null;
  isModelLoading = false;
  frameProcessingEnabled = true;
}

export default function LiveFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Add a ref to track component mounted state
  const isMounted = useRef<boolean>(true);
  const { count, setCount, activeLocation, locations } = usePeopleCount();
  
  // Necessary state variables for Raspberry Pi optimized implementation
  const [isModelReady, setIsModelReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<{width: number, height: number}>({ width: 0, height: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(() => {
    // Always default to true for Raspberry Pi 4B
    if (IS_RASPBERRY_PI) return true;
    return localStorage.getItem('low-power-mode') !== 'false';
  });
  
  // Track when user interaction is needed
  const [waitingForUserInteraction, setWaitingForUserInteraction] = useState(false);
  
  // Get current location for capacity information
  const currentLocation = useMemo(() => {
    return locations.find(l => l.id === activeLocation) || locations[0];
  }, [locations, activeLocation]);
  
  // Load the TensorFlow.js model optimized for Raspberry Pi
  const loadModel = useCallback(async () => {
    // Always attempt to reload model if we're freshly mounting the component after navigation
    if (isModelLoading) return model;

    try {
      isModelLoading = true;
      setIsModelReady(false);

      console.log('Loading TensorFlow.js model...');

      // ALWAYS force CPU backend on Raspberry Pi 4B for consistent performance
      if (IS_RASPBERRY_PI || navigator.hardwareConcurrency <= 4) {
        console.log('Using CPU backend for Raspberry Pi 4B');
        
        // Hard disable WebGL on Raspberry Pi 4B - critical fix
        tf.ENV.set('WEBGL_VERSION', 0);
        
        // Force CPU backend
        await tf.setBackend('cpu');
        
        // Enable memory conservation mode for Raspberry Pi 4B
        tf.ENV.set('KEEP_INTERMEDIATE_TENSORS', false);
        
        // Reduce WebGL memory usage
        tf.ENV.set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
        
        // Set smaller tensors as default
        tf.ENV.set('WEBGL_FORCE_F16_TEXTURES', true);
        
        // Purge all WebGL memory if it was previously used
        try {
          if (tf.getBackend() === 'webgl') {
            const gl = await tf.backend().getGPGPUContext().gl;
            if (gl) {
              gl.finish();
              gl.getExtension('WEBGL_lose_context')?.loseContext();
            }
          }
        } catch (e) {
          // Ignore errors if WebGL backend wasn't initialized
        }
        
        // Manually run garbage collection if available
        if (window.gc) {
          try {
            window.gc();
          } catch (e) {
            // Ignore if not available
          }
        }
      } else {
        console.log('Using WebGL backend for powerful devices');
        await tf.setBackend('webgl');
        
        // Optimize WebGL for higher-end devices
        tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
        tf.env().set('WEBGL_PACK', false);
      }
      
      // Load the model (don't use tf.tidy for async operations)
      console.log('Loading lite_mobilenet_v2 model for Raspberry Pi');
      
      try {
        // First attempt to load the model from the specified path
        const loadedModel = await cocossd.load({
          base: 'lite_mobilenet_v2',
          // Don't specify modelUrl first to use the default URL from TensorFlow.js CDN
        });
        
        model = loadedModel;
        console.log('Model loaded successfully from TensorFlow.js CDN');
      } catch (modelError) {
        console.error('Error loading model from primary source:', modelError);
        
        // If first attempt fails, try alternative paths
        try {
          console.log('Attempting to load model from alternative source...');
          const loadedModel = await cocossd.load({
            base: 'lite_mobilenet_v2',
            modelUrl: 'https://tfhub.dev/tensorflow/lite-model/ssd_mobilenet_v2/1/default/1'
          });
          
          model = loadedModel;
          console.log('Model loaded successfully from alternative source');
        } catch (fallbackError) {
          console.error('Error loading model from alternative source:', fallbackError);
          
          // Last resort: Load base model without custom path
          console.log('Loading base model as last resort...');
          const loadedModel = await cocossd.load();
          
          model = loadedModel;
          console.log('Base model loaded successfully');
        }
      }
      
      // Pre-warm the model with a dummy tensor to avoid lag on first detection
      if (IS_RASPBERRY_PI) {
        console.log('Pre-warming model for Raspberry Pi 4B...');
        tf.tidy(() => {
          const dummyTensor = tf.zeros([320, 240, 3]);
          model?.detect(dummyTensor);
        });
      }
      
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
      const externalWebcams = videoDevices.filter(device => {
        const label = device.label.toLowerCase();
        return label && 
              !label.includes('built-in') && 
              !label.includes('facetime') && 
              !label.includes('internal');
      });
      
      console.log(`Identified ${externalWebcams.length} potential external webcams`);
      
      // Use lower resolution for Raspberry Pi
      // Check if we're likely on a Raspberry Pi or low-powered device
      const isLowPoweredDevice = navigator.hardwareConcurrency <= 4;
      
      // Set up video constraints based on available devices
      // Use much lower resolution on Raspberry Pi 4B specifically
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: IS_RASPBERRY_PI ? 480 : (lowPowerMode ? 640 : 1280) },
        height: { ideal: IS_RASPBERRY_PI ? 360 : (lowPowerMode ? 480 : 720) },
        frameRate: { ideal: IS_RASPBERRY_PI ? 10 : (lowPowerMode ? 15 : 30) }
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
      
      // Apply aggressive track constraints for Raspberry Pi 4B to reduce CPU usage
      if (videoTrack.applyConstraints) {
        try {
          await videoTrack.applyConstraints({
            frameRate: { max: IS_RASPBERRY_PI ? 8 : (lowPowerMode ? 15 : 30) },
            // Reduce resolution even further on actual Raspberry Pi hardware
            ...(IS_RASPBERRY_PI && {
              width: { ideal: 480, max: 640 },
              height: { ideal: 360, max: 480 }
            })
          });
          console.log("Applied aggressive constraints for Raspberry Pi 4B to reduce CPU usage");
        } catch (constraintsErr) {
          console.warn("Could not apply additional constraints:", constraintsErr);
        }
      }
      
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
            .catch(() => {
              console.log("Could not autoplay from canplay event");
            });
        }
      };
      
    } catch (error) {
      console.error("Camera access failed:", error);
      
      // Type check the error to ensure it has the expected properties
      const cameraError = error as { name?: string; message?: string };
      
      if (cameraError.name === "NotReadableError") {
        setError("Camera is in use by another application. Please close other apps using the camera and try again.");
      } else if (cameraError.name === "NotAllowedError") {
        setError("Camera access denied. Please allow camera access in your browser settings.");
      } else {
        setError(`Could not access camera: ${cameraError.message || 'Unknown error'}. Please check permissions and try again.`);
      }
    } finally {
      setIsLoadingStream(false);
    }
  }, [isStreaming, lowPowerMode]);

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

  // Simple function to render video frame without detection processing
  const renderVideoOnly = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    
    if (ctx && video.readyState >= 2) { // HAVE_CURRENT_DATA or better
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        // Silently handle errors to prevent console spam
      }
    }
  }, []);

  // Directly render video from constraints rather than using DOM dimensions
  const processVideoFrame = useCallback(async () => {
    // Add additional checks to ensure we have everything we need
    if (!videoRef.current || !canvasRef.current || !isMounted.current) {
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { 
      alpha: false, // Use false for better performance
      willReadFrequently: false // Set to false for Raspberry Pi optimization
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
      }          // Only attempt detection if we have valid dimensions and model is ready
          if (canvas.width >= 16 && canvas.height >= 16 && isModelReady && !isPaused && model) {
            try {
              // On Raspberry Pi, use a smaller area for detection to improve performance
              const isLowPoweredDevice = navigator.hardwareConcurrency <= 4;
              
              let detectionInput: HTMLVideoElement | HTMLCanvasElement = video;
              
              // For low-powered devices, create a smaller detection canvas
              if (isLowPoweredDevice || lowPowerMode) {
                // Use a larger detection area than before to improve detection accuracy
                const tempCanvas = document.createElement('canvas');
                // Increased scale factor for better detection while still optimizing for performance
                const scaleFactor = lowPowerMode && isLowPoweredDevice ? 0.6 : 
                                   lowPowerMode ? 0.7 : 0.85;
                
                tempCanvas.width = Math.floor(canvas.width * scaleFactor);
                tempCanvas.height = Math.floor(canvas.height * scaleFactor);
                
                const tempCtx = tempCanvas.getContext('2d', { alpha: false });
                if (tempCtx) {
                  // Draw the video at reduced size
                  tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
                  detectionInput = tempCanvas;
                }
              }
          
          // Run detection on the possibly downscaled input
          // Don't use tf.tidy for the actual detection to avoid tensor disposal issues
          const predictions = await model!.detect(detectionInput, 20); // Increased max detections from default 10 to 20
          
          // Clean up tensors after detection (safer than wrapping in tidy)
          tf.engine().endScope();
          
          // Only clear and redraw if we have detections to show
          if (predictions && predictions.length > 0) {
            console.log("Raw predictions:", predictions); // Log raw predictions for debugging
            
            // Filter for people with confidence threshold
            const peopleDetected = predictions.filter(prediction => 
              prediction.class === 'person' && prediction.score > CONFIDENCE_THRESHOLD
            );
            
            // Log filtered results for debugging
            console.log(`Detected ${peopleDetected.length} people above threshold ${CONFIDENCE_THRESHOLD}`);
            
            // Update count and skip drawing if no people detected
            if (peopleDetected.length === 0) {
              setCount(0);
              return;
            }
            
            // Update count
            setCount(peopleDetected.length);
            
            // Super simplified drawing for Raspberry Pi in low power mode
            const simplifiedUI = isLowPoweredDevice && lowPowerMode;
            
            // Draw minimalistic UI for Raspberry Pi
            if (simplifiedUI) {
              // Just draw simple rectangles without text
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#00FF00'; // Green for all detections
              
              peopleDetected.forEach(prediction => {
                let [x, y, width, height] = prediction.bbox;
                
                // Scale coordinates back up
                const scaleFactor = 1 / (lowPowerMode && isLowPoweredDevice ? 0.4 : 
                                        lowPowerMode ? 0.5 : 0.75);
                x *= scaleFactor;
                y *= scaleFactor;
                width *= scaleFactor;
                height *= scaleFactor;
                
                // Draw simple bounding box without labels
                ctx.beginPath();
                ctx.rect(x, y, width, height);
                ctx.stroke();
              });
              
              // Simple count display
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(10, 10, 100, 30);
              
              ctx.fillStyle = 'white';
              ctx.font = '16px Arial';
              ctx.fillText(`Count: ${peopleDetected.length}`, 20, 30);
            } else {
              // Full UI for more powerful devices
              ctx.font = '16px Arial';
              ctx.lineWidth = 2;
              
              // Draw each detection box, scaling coordinates if needed
              peopleDetected.forEach((prediction, index) => {
                let [x, y, width, height] = prediction.bbox;
                
                // Scale coordinates back up if we used a downscaled detection
                if ((isLowPoweredDevice || lowPowerMode) && detectionInput !== video) {
                  const scaleFactor = lowPowerMode && isLowPoweredDevice ? 2.5 : 
                                     lowPowerMode ? 2 : 1.33;
                  x *= scaleFactor;
                  y *= scaleFactor;
                  width *= scaleFactor;
                  height *= scaleFactor;
                }
                
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
                
                // In low power mode, simplify the UI by drawing less
                if (!lowPowerMode) {
                  // Draw label background
                  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                  ctx.fillRect(x, y - 25, 120, 25);
                  
                  // Draw label text
                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillText(`Person ${index + 1}: ${Math.round(prediction.score * 100)}%`, x + 5, y - 7);
                }
              });
              
              // Display UI information on canvas - simpler in low power mode
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(10, 10, 200, 30);
              
              ctx.fillStyle = 'white';
              ctx.fillText(`Count: ${peopleDetected.length}`, 20, 30);
              
              // Only show capacity in regular mode
              if (currentLocation && !lowPowerMode) {
                const capacityPercentage = (peopleDetected.length / currentLocation.capacity) * 100;
                let capacityColor = '#00FF00'; // Green by default
                
                if (capacityPercentage > 90) {
                  capacityColor = '#FF0000'; // Red when near capacity
                } else if (capacityPercentage > 70) {
                  capacityColor = '#FFFF00'; // Yellow when getting full
                }
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(canvas.width - 210, 10, 200, 30);
                
                ctx.fillStyle = capacityColor;
                ctx.fillText(`Capacity: ${peopleDetected.length}/${currentLocation.capacity}`, canvas.width - 200, 30);
              }
            }
          } else {
            // If no predictions at all, update count to zero
            setCount(0);
          }
        } catch (detectErr) {
          console.error("Detection error:", detectErr);
        }
      }
    } catch (err) {
      console.error('Error processing video frame:', err);
    }
  }, [
    resolution, 
    setCount, 
    currentLocation,
    isModelReady,
    isPaused,
    lowPowerMode
  ]);
  
  // Setup animation frame loop with more reliable rendering
  useEffect(() => {
    let frameId: number;
    let lastProcessTime = 0;
    let frameSkipCounter = 0;
    
    // Adaptive detection interval based on device capabilities
    // For Raspberry Pi, use longer intervals to reduce CPU load
    const isLowPoweredDevice = navigator.hardwareConcurrency <= 4;
    const BASE_INTERVAL = isLowPoweredDevice ? 2500 : 1000; // 2.5 sec for low-power, 1 sec for higher-end
    const DETECTION_INTERVAL = lowPowerMode ? BASE_INTERVAL * 2 : BASE_INTERVAL; // Even longer in low power mode
    
    // Set max frame rate based on device capability
    const MAX_FPS = isLowPoweredDevice 
      ? (lowPowerMode ? 5 : 10)  // 5-10 FPS for Raspberry Pi 
      : (lowPowerMode ? 15 : 30); // 15-30 FPS for higher-end devices
    
    // Minimum time between frames in ms
    const FRAME_INTERVAL = 1000 / MAX_FPS;
    
    console.log(`Using detection interval: ${DETECTION_INTERVAL}ms, max FPS: ${MAX_FPS}`);
    
    // Monitor and release memory periodically
    if (isLowPoweredDevice) {
      // For Raspberry Pi, aggressively clean up tensors to prevent memory issues
      const memoryCleanupInterval = setInterval(() => {
        if (isMounted.current) {
          try {
            // Manually dispose any unused tensors
            tf.engine().endScope();
            tf.engine().startScope();
            
            // Attempt to force garbage collection
            if (window.gc) {
              window.gc();
            }
          } catch (e) {
            // Ignore errors in cleanup
          }
        }
      }, 10000); // Every 10 seconds
      
      // Cleanup interval on unmount
      return () => clearInterval(memoryCleanupInterval);
    }
    
    const processFrame = async (timestamp: number) => {
      // Always request next frame FIRST to ensure smooth display
      frameId = requestAnimationFrame(processFrame);
      
      // Skip processing if component unmounted
      if (!isMounted.current || !videoRef.current) return;
      
      // Control frame rate by skipping frames based on device capability
      const timeSinceLastFrame = timestamp - lastProcessTime;
      if (timeSinceLastFrame < FRAME_INTERVAL) {
        return; // Skip this frame to maintain target FPS
      }
      
      // Skip rendering if paused to save resources
      if (isStreaming && !isPaused) {
        // In low power mode, only render video every few frames to save CPU
        frameSkipCounter++;
        if (!lowPowerMode || frameSkipCounter % 2 === 0) {
          renderVideoOnly();
        }
      }
      
      // Only run object detection at specified intervals if dimensions are valid
      if (timestamp - lastProcessTime > DETECTION_INTERVAL && 
          isModelReady && 
          !isPaused && 
          videoRef.current.videoWidth > 10 && 
          videoRef.current.videoHeight > 10 &&
          frameProcessingEnabled) { // Use global processing flag
        try {
          // Disable further processing until this one completes (prevent overlapping)
          frameProcessingEnabled = false;
          
          // Track performance
          const startTime = performance.now();
          
          // Process inside try-finally to ensure flag is reset
          try {
            await processVideoFrame();
          } finally {
            // Re-enable processing for next frame
            frameProcessingEnabled = true;
          }
          
          // Calculate processing time and adjust if necessary
          const processingTime = performance.now() - startTime;
          
          // If detection is taking too long, force low power mode
          if (processingTime > 500) {
            if (!lowPowerMode && isLowPoweredDevice) {
              console.log(`Processing taking too long (${processingTime.toFixed(0)}ms), switching to low power mode`);
              setLowPowerMode(true);
            }
          }
          
          lastProcessTime = timestamp;
        } catch (err) {
          console.error("Error in detection loop:", err);
          // Don't update lastProcessTime on error to allow retry on next interval
          frameProcessingEnabled = true; // Re-enable processing on error
        }
      }
    };
    
    if (isStreaming) {
      // Start the animation loop
      frameId = requestAnimationFrame(processFrame);
      console.log("Started animation frame loop with optimized settings for Raspberry Pi");
    }
    
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isModelReady, isStreaming, isPaused, processVideoFrame, renderVideoOnly, lowPowerMode]);
  
  // Initialize camera stream on component mount with error handling
  useEffect(() => {
    isMounted.current = true;
    
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
      resetModuleState(); // Reset module-level state on unmount
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
      {/* <div className="py-4 px-6 bg-gray-800 flex items-center justify-between">
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
      </div> */}
      
      <div className="flex-grow flex flex-col items-center justify-center bg-gray-900 p-4 relative">
        {error && (
          <div className="absolute top-4 left-0 right-0 mx-auto w-11/12 max-w-2xl bg-red-500 text-white p-3 rounded-md shadow-lg">
            <p className="font-medium">{error}</p>
          </div>
        )}
        
        <div className="relative w-full max-w-4xl mx-auto bg-black" style={{ minHeight: "612px" }}>
          {/* Video Element - Always visible and correctly sized */}
          <video
            ref={videoRef}
            className="block w-full mx-auto" 
            playsInline
            muted
            style={{ 
              minHeight: '612px',  // Reduced height by 30% from 874px
              minWidth: '896px',   // Keep the increased width
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
            width="896"
            height="612"
            className="absolute top-0 left-0 w-full"
            style={{ 
              display: isStreaming ? 'block' : 'none',
              pointerEvents: 'none',
              zIndex: 2,
              minHeight: '612px',
              minWidth: '896px',
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
          
          <div className="flex items-center space-x-6 text-white">
            <div className="flex items-center">
              <UserCheck className="w-5 h-5 mr-1 text-blue-400" />
              <span className="font-semibold">{count} detected</span>
            </div>
            
            {/* FPS indicator - uncomment when implemented
            <div className="flex items-center">
              <RefreshCw className={`w-5 h-5 mr-1 ${fps > 10 ? 'text-green-400' : 'text-yellow-400'}`} />
              <span className="font-semibold">{fps} FPS</span>
            </div>
            */}
            
            {/* Motion detection indicator - uncomment when implemented
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${
                isMotionDetected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
              }`} />
              <span className="font-semibold">
                {isMotionDetected ? 'Motion' : 'Standby'}
              </span>
            </div>
            */}
          </div>
          
          <div className="mt-2 text-sm text-gray-400">
            <p>Resolution: {resolution.width}x{resolution.height}</p>
            <p>Mode: {lowPowerMode ? 'Low Power' : 'High Performance'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}