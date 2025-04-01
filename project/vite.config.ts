import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isPiOptimized = mode === 'production';
  
  return {
    plugins: [
      react(),
      compression({
        // Enable gzip compression for deployment
        algorithm: 'gzip',
        ext: '.gz',
      })
    ],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: {
      // Optimize chunk sizes for Raspberry Pi
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'tensorflow': ['@tensorflow/tfjs', '@tensorflow-models/coco-ssd'],
            'chart': ['chart.js', 'react-chartjs-2'],
          }
        }
      },
      // Additional optimizations for production builds
      minify: isPiOptimized ? 'terser' : 'esbuild',
      terserOptions: isPiOptimized ? {
        compress: {
          // Raspberry Pi optimizations
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.info'],
        },
      } : undefined,
      // Create smaller chunks for better performance on Pi
      chunkSizeWarningLimit: 800,
    },
    // Add useful feature for development
    server: {
      // Enable HMR over network for development across devices
      host: true,
      port: 3000,
    }
  };
});
