import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger.js';

export default function(db, io) {
  const router = express.Router();

  // Get all locations
  router.get('/', (req, res) => {
    try {
      const locations = db.prepare('SELECT * FROM locations ORDER BY name').all();
      res.json(locations);
    } catch (err) {
      logger.error(`Error fetching locations: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  // Get location by ID
  router.get('/:id', (req, res) => {
    try {
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
      
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      res.json(location);
    } catch (err) {
      logger.error(`Error fetching location ${req.params.id}: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  });

  // Create a new location
  router.post('/', (req, res) => {
    try {
      const { name, capacity, description } = req.body;
      
      if (!name || !capacity) {
        return res.status(400).json({ error: 'Name and capacity are required' });
      }
      
      const id = req.body.id || uuidv4();
      const timestamp = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO locations (id, name, capacity, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, capacity, description || null, timestamp, timestamp);
      
      const newLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
      
      // Emit Socket.IO event for real-time updates
      io.emit('location:created', newLocation);
      
      res.status(201).json(newLocation);
    } catch (err) {
      logger.error(`Error creating location: ${err.message}`);
      res.status(500).json({ error: 'Failed to create location' });
    }
  });

  // Update a location
  router.put('/:id', (req, res) => {
    try {
      const { name, capacity, description } = req.body;
      const { id } = req.params;
      
      // Check if location exists
      const existingLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
      if (!existingLocation) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      // Update the location
      const timestamp = new Date().toISOString();
      
      db.prepare(`
        UPDATE locations
        SET name = ?, capacity = ?, description = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name || existingLocation.name,
        capacity || existingLocation.capacity,
        description !== undefined ? description : existingLocation.description,
        timestamp,
        id
      );
      
      const updatedLocation = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
      
      // Emit Socket.IO event for real-time updates
      io.emit('location:updated', updatedLocation);
      
      res.json(updatedLocation);
    } catch (err) {
      logger.error(`Error updating location ${req.params.id}: ${err.message}`);
      res.status(500).json({ error: 'Failed to update location' });
    }
  });

  // Delete a location
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      // Delete the location (cascading delete will remove related records)
      db.prepare('DELETE FROM locations WHERE id = ?').run(id);
      
      // Emit Socket.IO event for real-time updates
      io.emit('location:deleted', { id });
      
      res.status(204).send();
    } catch (err) {
      logger.error(`Error deleting location ${req.params.id}: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete location' });
    }
  });

  // Get counts for a specific location
  router.get('/:id/counts', (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 100;
      
      // Check if location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      const counts = db.prepare(`
        SELECT * FROM counts
        WHERE location_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(id, limit);
      
      res.json(counts);
    } catch (err) {
      logger.error(`Error fetching counts for location ${req.params.id}: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch counts' });
    }
  });

  return router;
};