import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as tf from '@tensorflow/tfjs';
// Import both model types for flexibility
import * as cocossd from '@tensorflow-models/coco-ssd';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as blazeface from '@tensorflow-models/blazeface';
import { usePeopleCount } from '../context/PeopleCountContext';
import { Loader2, Camera, CameraOff, UserCheck } from 'lucide-react';

// Raspberry Pi 4B specific detection - MUST BE DEFINED FIRST
const IS_RASPBERRY_PI = navigator.userAgent.toLowerCase().includes('linux') && 
                        navigator.hardwareConcurrency <= 4;

// Model confidence threshold (0-1) - LOWER FOR RASPBERRY PI
const CONFIDENCE_THRESHOLD = IS_RASPBERRY_PI ? 0.2 : 0.35; 

// Detection model types
type DetectionModelType = 'cocossd' | 'blazeface' | 'mobilenet';
// ALWAYS USE BLAZEFACE FOR RASPBERRY PI - it's much lighter
const DETECTION_MODEL: DetectionModelType = 'blazeface'; 

// Performance optimization flags for Raspberry Pi
let model: any = null; // Use any type to accommodate different model types
let modelType: DetectionModelType = DETECTION_MODEL;
let isModelLoading = false;
let frameProcessingEnabled = true;
// Add memory tracking
let lastMemoryCleanup = 0;
let frameSkipCounter = 0;  // Added missing variable declaration

// Function to reset state when component unmounts
function resetModuleState() {
  // Ensure all tensors are disposed when component unmounts
  try {
    if (tf.engine().numTensors > 0) {
      console.log(`Cleaning up ${tf.engine().numTensors} tensors`);
      tf.engine().disposeVariables();
      tf.engine().endScope();
      tf.engine().startScope();
    }
  } catch (e) {
    console.error("Error cleaning tensors:", e);
  }
  
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

      console.log('Loading optimized TensorFlow.js model for Raspberry Pi...');

      // Raspberry Pi specific setup - FORCE CPU BACKEND to avoid WebGL context loss
      if (IS_RASPBERRY_PI || navigator.hardwareConcurrency <= 4) {
        console.log('Setting up TensorFlow.js for Raspberry Pi 4B - FORCING CPU MODE');
        
        try {
          // Make sure TensorFlow is ready
          await tf.ready();
          
          // CRITICAL: COMPLETELY DISABLE WEBGL FOR RASPBERRY PI
          tf.env().set('WEBGL_VERSION', 0);
          await tf.setBackend('cpu');
          console.log('Successfully set CPU backend for Raspberry Pi');
          
          // Aggressive memory management for Raspberry Pi
          tf.env().set('KEEP_INTERMEDIATE_TENSORS', false);
          tf.env().set('WEBGL_CPU_FORWARD', false);
          tf.env().set('CHECK_COMPUTATION_FOR_ERRORS', false);
          tf.ENV.set('WEBGL_FORCE_F16_TEXTURES', false);
          tf.ENV.set('WEBGL_PACK', false);
        } catch (e) {
          console.error('CPU backend setup failed:', e);
        }
      } else {
        console.log('Using WebGL backend for powerful devices');
        await tf.setBackend('webgl');
        
        // Optimize WebGL for higher-end devices
        tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
        tf.env().set('WEBGL_PACK', true);
      }
      
      // For Raspberry Pi 4B, ALWAYS force to BlazeFace and use minimal config
      if (IS_RASPBERRY_PI) {
        console.log('Raspberry Pi detected: Forcing BlazeFace model with minimal config');
        modelType = 'blazeface';
        
        // Load the most lightweight version of BlazeFace
        model = await blazeface.load({
          maxFaces: 6,  // Allow for multiple faces but limit
          inputWidth: 128,  // Use smallest possible input dimensions
          inputHeight: 128,
          iouThreshold: 0.3,  // Lower threshold for faster processing
          scoreThreshold: 0.5  // More lenient threshold for Raspberry Pi
        });
        console.log('BlazeFace model loaded successfully with Raspberry Pi optimizations');
      } else {
        // Regular loading for other devices
        console.log(`Loading ${modelType} model optimized for Raspberry Pi`);
        
        switch (modelType) {
          case 'blazeface':
            // Special loading approach for Raspberry Pi
            if (IS_RASPBERRY_PI) {
              console.log('Loading BlazeFace with special Pi settings');
              // Set a timeout to prevent blocking the main thread for too long
              const modelPromise = new Promise<any>((resolve, reject) => {
                setTimeout(async () => {
                  try {
                    // Use the most basic model configuration for Raspberry Pi
                    const loadedModel = await blazeface.load({
                      maxFaces: 4,  // Limit detection to reduce computational load
                      inputWidth: 128,  // Use smallest possible input dimensions
                      inputHeight: 128,
                      iouThreshold: 0.3,  // Lower threshold for faster processing
                      scoreThreshold: 0.75  // Higher score threshold to reduce false positives
                    });
                    resolve(loadedModel);
                  } catch (err) {
                    reject(err);
                  }
                }, 100);
              });
              
              model = await modelPromise;
            } else {
              // Regular loading for other devices
              console.log('Loading BlazeFace - optimized for face detection');
              model = await blazeface.load();
            }
            console.log('BlazeFace model loaded successfully');
            break;
            
          case 'mobilenet':
            // MobileNet is good for general classification
            console.log('Loading MobileNet model - good balance of speed and accuracy');
            model = await mobilenet.load({
              version: 2,
              alpha: IS_RASPBERRY_PI ? 0.25 : 0.5  // Use smallest version for Pi
            });
            console.log('MobileNet model loaded successfully');
            break;
            
          case 'cocossd':
          default:
            // Adjust COCO-SSD loading based on device capability
            if (IS_RASPBERRY_PI) {
              console.log('Loading lite_mobilenet_v2 COCO-SSD model for Pi');
              model = await cocossd.load({
                base: 'lite_mobilenet_v2',
              });
            } else {
              // Try to load the optimal model for the device
              console.log('Loading COCO-SSD model');
              
              try {
                // First try the lite model
                model = await cocossd.load({
                  base: 'lite_mobilenet_v2',
                });
                console.log('lite_mobilenet_v2 model loaded successfully');
              } catch (firstError) {
                console.error('Error loading lite model:', firstError);
                
                try {
                  console.log('Trying mobilenet_v2 as fallback...');
                  model = await cocossd.load({
                    base: 'mobilenet_v2',
                  });
                  console.log('mobilenet_v2 model loaded successfully');
                } catch (secondError) {
                  console.error('Error loading fallback model:', secondError);
                  
                  // Last resort: Load the simplest model
                  console.log('Loading base model as last resort...');
                  model = await cocossd.load();
                  console.log('Base model loaded successfully');
                }
              }
            }
            break;
        }
      }
      
      // Pre-warm the model with a dummy tensor to avoid lag on first detection
      console.log('Pre-warming model for Raspberry Pi 4B...');
      try {
        // Use tidy to ensure proper tensor cleanup
        await tf.ready(); // Ensure TensorFlow backend is ready
        
        tf.tidy(() => {
          // Create simple dummy tensor with minimal dimensions to reduce memory usage
          const dummyTensor = tf.zeros([160, 120, 3]);
          
          // Handle different model types safely
          if (modelType === 'cocossd' && model) {
            (model as cocossd.ObjectDetection).detect(dummyTensor as tf.Tensor3D);
          } else if (modelType === 'blazeface' && model) {
            (model as any).estimateFaces(dummyTensor as tf.Tensor3D);
          } else if (modelType === 'mobilenet' && model) {
            (model as any).classify(dummyTensor as tf.Tensor3D);
          }
          // No need to manually dispose the tensor, tidy does this automatically
        });
      } catch (warmingError) {
        console.warn('Model pre-warming failed, but we can continue:', warmingError);
        // Pre-warming is optional - failure here shouldn\'t stop the whole process
      } finally {
        // Clean up safely - no need to check if scope is active
        // The tf.tidy above handles tensor cleanup automatically
      }
      
      if (isMounted.current) {
        setIsModelReady(true);
      }
      
      return model;
    } catch (err) {
      console.error('All model loading attempts failed:', err);
      
      // Last fallback attempt - try the absolute most basic model
      try {
        console.log('Attempting emergency fallback to basic BlazeFace...');
        model = await blazeface.load();
        modelType = 'blazeface';
        console.log('Emergency fallback to BlazeFace successful');
        
        if (isMounted.current) {
          setIsModelReady(true);
        }
        
        return model;
      } catch (finalError) {
        console.error('Emergency fallback failed:', finalError);
        // Instead of re-throwing, handle the error here directly
        if (isMounted.current) {
          setError('Failed to load detection model after all attempts. Please refresh and try again.');
        }
        return null;
      }
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
      
      // SIGNIFICANTLY REDUCE RESOLUTION FOR RASPBERRY PI
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: IS_RASPBERRY_PI ? 320 : (lowPowerMode ? 640 : 1280) },
        height: { ideal: IS_RASPBERRY_PI ? 240 : (lowPowerMode ? 480 : 720) },
        frameRate: { ideal: IS_RASPBERRY_PI ? 5 : (lowPowerMode ? 15 : 30) }
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
            frameRate: { max: IS_RASPBERRY_PI ? 5 : (lowPowerMode ? 15 : 30) },
            // Reduce resolution drastically for Raspberry Pi
            ...(IS_RASPBERRY_PI && {
              width: { ideal: 320, max: 480 },
              height: { ideal: 240, max: 360 }
            })
          });
          console.log("Applied aggressive constraints for Raspberry Pi 4B");
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
    
    // Skip processing if model isn't ready
    if (!model || !isModelReady) {
      console.log("Model not ready yet, skipping frame processing");
      return;
    }
    
    try {
      // Always use the resolution from our state
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
      if (canvas.width >= 16 && canvas.height >= 16 && isModelReady && !isPaused && model) {
        try {
          // Create a smaller detection canvas - MUCH smaller for Raspberry Pi
          const tempCanvas = document.createElement('canvas');
          // Use extremely small input for Raspberry Pi detection
          const scaleFactor = IS_RASPBERRY_PI ? 0.35 : (lowPowerMode ? 0.6 : 0.85);
          
          tempCanvas.width = Math.floor(canvas.width * scaleFactor);
          tempCanvas.height = Math.floor(canvas.height * scaleFactor);
          
          const tempCtx = tempCanvas.getContext('2d', { alpha: false });
          if (tempCtx) {
            // Draw the video at reduced size
            tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
            
            // Create tensor and ensure it's properly managed
            tf.tidy(() => {
              // Convert image to tensor and normalize
              const imageTensor = tf.browser.fromPixels(tempCanvas);
              const normalizedTensor = imageTensor.toFloat().div(tf.scalar(255)) as tf.Tensor3D;
              
              // For Raspberry Pi, use simplified detection approach
              if (IS_RASPBERRY_PI && modelType === 'blazeface') {
                blazefaceDetection(normalizedTensor, ctx, tempCanvas.width, tempCanvas.height);
              } else {
                // Regular detection for other devices
                regularDetection(normalizedTensor, ctx, tempCanvas.width, tempCanvas.height);
              }
              
              // Automatically cleaned up by tf.tidy
            });
          }
          
          // Force cleanup extra frequently on Raspberry Pi
          if (IS_RASPBERRY_PI && Date.now() - lastMemoryCleanup > 5000) {
            console.log("Running scheduled tensor cleanup");
            tf.engine().endScope();
            tf.engine().startScope();
            lastMemoryCleanup = Date.now();
          }
        } catch (err) {
          console.error('Error in detection:', err);
          // Don't update count on error to prevent showing incorrect data
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
  
  // Add specialized BlazeFace detection function for Raspberry Pi
  const blazefaceDetection = async (tensor: tf.Tensor3D, ctx: CanvasRenderingContext2D, 
                                   inputWidth: number, inputHeight: number) => {
    try {
      // Use a more direct and simplified detection approach
      const predictions = await model.estimateFaces(tensor);
      
      if (predictions && predictions.length > 0) {
        console.log(`BlazeFace detected ${predictions.length} faces`);
        
        // Update count
        setCount(predictions.length);
        
        // Draw minimalistic UI for Raspberry Pi
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00FF00'; // Green for all detections
        
        predictions.forEach((prediction: any) => {
          // Get face bounding box
          let [x, y] = prediction.topLeft;
          let [x2, y2] = prediction.bottomRight;
          let width = x2 - x;
          let height = y2 - y;
          
          // Scale coordinates back up based on our smaller detection canvas
          const scaleFactor = IS_RASPBERRY_PI ? 2.85 : (lowPowerMode ? 1.67 : 1.18);
          x *= scaleFactor;
          y *= scaleFactor;
          width *= scaleFactor;
          height *= scaleFactor;
        
          // Draw simple bounding box
          ctx.beginPath();
          ctx.rect(x, y, width, height);
          ctx.stroke();
        });
        
        // Simple count display
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 100, 30);
        
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.fillText(`Count: ${predictions.length}`, 20, 30);
      } else {
        // If no predictions, update count to zero
        setCount(0);
      }
    } catch (err) {
      console.error("BlazeFace detection error:", err);
      // Keep the last count on error
    }
  };
  
  // Add specialized regular detection function for more powerful devices
  const regularDetection = async (tensor: tf.Tensor3D, ctx: CanvasRenderingContext2D, 
                                 inputWidth: number, inputHeight: number) => {
    // Implementation similar to existing detection code but more organized
    // ...existing detection code...
  };

  // Setup animation frame loop with more reliable rendering
  useEffect(() => {
    let frameId: number;
    let lastProcessTime = 0;
    
    // Much longer detection intervals for Raspberry Pi
    const DETECTION_INTERVAL = IS_RASPBERRY_PI ? 3000 : 
                              (lowPowerMode ? 2000 : 1000); // 3 sec for Pi
    
    // Set max frame rate based on device capability - much lower for Pi
    const MAX_FPS = IS_RASPBERRY_PI ? 3 : (lowPowerMode ? 10 : 30);
    
    // Minimum time between frames in ms
    const FRAME_INTERVAL = 1000 / MAX_FPS;
    
    console.log(`Using detection interval: ${DETECTION_INTERVAL}ms, max FPS: ${MAX_FPS}`);
    
    // Monitor and release memory periodically for Raspberry Pi
    if (IS_RASPBERRY_PI) {
      const memoryCleanupInterval = setInterval(() => {
        if (isMounted.current) {
          try {
            console.log(`Before cleanup: ${tf.engine().numTensors} tensors`);
            // Manually dispose any unused tensors
            tf.engine().endScope();
            tf.engine().startScope();
            console.log(`After cleanup: ${tf.engine().numTensors} tensors`);
          } catch (e) {
            // Ignore errors in cleanup
          }
        }
      }, 5000); // Every 5 seconds
      
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
            if (!lowPowerMode && IS_RASPBERRY_PI) {
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