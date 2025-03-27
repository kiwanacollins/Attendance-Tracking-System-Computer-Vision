import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as faceapi from 'face-api.js';
import { Student } from '../types';

class FaceRecognitionService {
  private modelLoadingPromise: Promise<void> | null = null;
  private modelPath = '/models';
  private faceMatcherOptions = {
    distanceThreshold: 0.6
  };

  constructor() {
    this.initBackend();
  }

  private async initBackend() {
    try {
      await tf.ready();
      // Try WebGL first
      if (tf.getBackend() !== 'webgl') {
        try {
          await tf.setBackend('webgl');
          // Set memory growth to true to avoid OOM errors
          const webglBackend = tf.backend() as { gpgpu?: { gl: WebGLRenderingContext } };
          if (webglBackend?.gpgpu?.gl) {
            webglBackend.gpgpu.gl.getExtension('WEBGL_lose_context');
          }
          console.log('Using WebGL backend');
        } catch (webglError) {
          console.warn('WebGL backend failed:', webglError);
          throw webglError;
        }
      }
    } catch (initError) {
      console.warn('Falling back to CPU backend:', initError);
      try {
        await tf.setBackend('cpu');
        await tf.ready();
        console.log('Using CPU backend');
      } catch (cpuError) {
        console.error('Failed to initialize TensorFlow backend:', cpuError);
        throw new Error('Could not initialize any TensorFlow backend');
      }
    }
  }

  private async loadModels() {
    if (this.modelLoadingPromise) {
      return this.modelLoadingPromise;
    }

    this.modelLoadingPromise = (async () => {
      try {
        await this.initBackend();

        const models = [
          { net: faceapi.nets.ssdMobilenetv1, name: 'SSD MobileNet' },
          { net: faceapi.nets.faceLandmark68Net, name: 'Face Landmark 68' },
          { net: faceapi.nets.faceRecognitionNet, name: 'Face Recognition' }
        ];

        for (const { net, name } of models) {
          let retries = 3;
          while (retries > 0) {
            try {
              if (!net.isLoaded) {
                await net.loadFromUri(this.modelPath);
              }
              break;
            } catch (error: unknown) {
              retries--;
              if (retries === 0) {
                throw new Error(`Failed to load ${name} model after 3 attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
              console.warn(`Retrying ${name} model load, ${retries} attempts remaining`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      } catch (error) {
        this.modelLoadingPromise = null;
        throw error;
      }
    })();

    return this.modelLoadingPromise;
  }

  async getFaceDescriptors(image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
    await this.loadModels();
    
    try {
      // Run detection outside of tf.tidy since face-api.js handles its own memory
      const detections = await faceapi
        .detectAllFaces(image, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptors();
        
      return detections;
    } catch (error) {
      console.error('Error getting face descriptors:', error);
      throw error;
    }
  }
  
  async enrollFace(image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
    const detections = await this.getFaceDescriptors(image);
    
    if (detections.length === 0) {
      throw new Error('No face detected in the image');
    }
    
    if (detections.length > 1) {
      throw new Error('Multiple faces detected. Please use an image with only one face');
    }
    
    return detections[0].descriptor;
  }
  
  async identifyFaces(
    image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, 
    students: Student[]
  ) {
    await this.loadModels();
    
    const consentingStudents = students.filter(student => 
      student.hasConsentedToFaceRecognition && student.faceDescriptors.length > 0
    );
    
    if (consentingStudents.length === 0) {
      return [];
    }
    
    try {
      // Create face matchers for each student
      const labeledDescriptors = consentingStudents.map(student => {
        return new faceapi.LabeledFaceDescriptors(
          student.id,
          student.faceDescriptors.map(desc => new Float32Array(Object.values(desc)))
        );
      });
      
      const faceMatcher = new faceapi.FaceMatcher(
        labeledDescriptors, 
        this.faceMatcherOptions.distanceThreshold
      );
      
      // Detect faces in the current frame
      const detections = await faceapi
        .detectAllFaces(image, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptors();

      // Match detected faces with enrolled students
      return detections.map(detection => {
        const match = faceMatcher.findBestMatch(detection.descriptor);
        return {
          detection,
          match: match.label !== 'unknown' ? match : null,
          studentId: match.label !== 'unknown' ? match.label : null
        };
      });
    } catch (error) {
      console.error('Error identifying faces:', error);
      throw error;
    }
  }

  async captureFaceFromVideo(video: HTMLVideoElement) {
    await this.loadModels();
    
    try {
      // Create a canvas to capture the current frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      // Draw the current frame to the canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get face descriptor from the canvas
      return await this.enrollFace(canvas);
    } catch (error) {
      console.error('Error capturing face from video:', error);
      throw error;
    }
  }
}

export default new FaceRecognitionService();
