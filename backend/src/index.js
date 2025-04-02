import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import { setupDatabase } from './database.js';
import logger from './logger.js';

// Import route handlers
import locationsRoutes from './routes/locations.js';
import countsRoutes from './routes/counts.js';
import reportsRoutes from './routes/reports.js';
import configRoutes from './routes/config.js';

// Set up dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Set up Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Initialize database
const db = setupDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API routes
app.use('/api/locations', locationsRoutes(db, io));
app.use('/api/counts', countsRoutes(db, io));
app.use('/api/reports', reportsRoutes(db));
app.use('/api/config', configRoutes(db, io));

// API root endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'Attendance Tracking System API' });
});

// Root endpoint for Socket.IO
app.get('/', (req, res) => {
  res.json({ message: 'Attendance Tracking System API - Socket.IO Server' });
});

// Default route for any other requests
app.get('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Start the server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info('Press Ctrl+C to quit');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});