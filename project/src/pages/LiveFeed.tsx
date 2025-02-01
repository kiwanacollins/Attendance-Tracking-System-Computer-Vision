import React, { useEffect, useRef, useState } from 'react';
import { Detection } from '../types';
import { Pause, Play, Maximize } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';

export default function LiveFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [model, setModel] = useState<cocossd.ObjectDetection | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryTimeoutRef = useRef<number>();

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

  const detectFrame = async () => {
    if (!model || !videoRef.current || !canvasRef.current || isPaused || !isVideoReady) return;

    try {
      // Ensure video is playing and ready
      if (videoRef.current.readyState !== 4) {
        requestAnimationFrame(detectFrame);
        return;
      }

      const predictions = await model.detect(videoRef.current);
      setDetections(predictions);
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

      requestAnimationFrame(detectFrame);
    } catch (error) {
      console.error('Detection error:', error);
      // Only set error if it's persistent
      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = window.setTimeout(() => {
          setError('Detection error occurred. Attempting to recover...');
          retryTimeoutRef.current = undefined;
        }, 5000);
      }
      requestAnimationFrame(detectFrame);
    }
  };

  useEffect(() => {
    if (isVideoReady) {
      detectFrame();
    }
  }, [model, isPaused, isVideoReady]);

  const togglePause = () => setIsPaused(!isPaused);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="relative h-full bg-black">
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
  );
}