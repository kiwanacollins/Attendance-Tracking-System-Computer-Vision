import express from 'express';
import logger from '../logger.js';

export default function(db, io) {
  const router = express.Router();

  // Get counts for a location
  router.get('/:locationId', (req, res) => {
    try {
      const { locationId } = req.params;
      const limit = parseInt(req.query.limit) || 100;

      // Verify location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const counts = db.prepare(`
        SELECT * FROM counts 
        WHERE location_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(locationId, limit);

      res.json(counts);
    } catch (err) {
      logger.error(`Error getting counts: ${err.message}`);
      res.status(500).json({ error: 'Failed to get counts' });
    }
  });

  // Get counts in date range
  router.get('/:locationId/range', (req, res) => {
    try {
      const { locationId } = req.params;
      const { start, end } = req.query;

      if (!start || !end) {
        return res.status(400).json({ error: 'Start and end dates are required' });
      }

      // Verify location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const counts = db.prepare(`
        SELECT * FROM counts 
        WHERE location_id = ? AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
      `).all(locationId, start, end);

      res.json(counts);
    } catch (err) {
      logger.error(`Error getting counts in range: ${err.message}`);
      res.status(500).json({ error: 'Failed to get counts in range' });
    }
  });

  // Add a new count
  router.post('/:locationId', (req, res) => {
    try {
      const { locationId } = req.params;
      const { count, status, message, timestamp = new Date().toISOString() } = req.body;

      if (count === undefined || !status) {
        return res.status(400).json({ error: 'Count and status are required' });
      }

      // Verify location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const result = db.prepare(`
        INSERT INTO counts (location_id, count, status, message, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(locationId, count, status, message || null, timestamp);

      const newCount = db.prepare('SELECT * FROM counts WHERE id = ?').get(result.lastInsertRowid);

      // Emit via Socket.IO for real-time updates
      io.emit('count_updated', {
        ...newCount,
        location_id: locationId
      });

      res.status(201).json(newCount);
    } catch (err) {
      logger.error(`Error adding count: ${err.message}`);
      res.status(500).json({ error: 'Failed to add count' });
    }
  });

  // Get entry/exit records for a location
  router.get('/:locationId/entry-exit', (req, res) => {
    try {
      const { locationId } = req.params;
      const limit = parseInt(req.query.limit) || 100;

      // Verify location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const records = db.prepare(`
        SELECT * FROM entry_exit
        WHERE location_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(locationId, limit);

      res.json(records);
    } catch (err) {
      logger.error(`Error getting entry/exit records: ${err.message}`);
      res.status(500).json({ error: 'Failed to get entry/exit records' });
    }
  });

  // Get entry/exit records in date range
  router.get('/:locationId/entry-exit/range', (req, res) => {
    try {
      const { locationId } = req.params;
      const { start, end } = req.query;

      if (!start || !end) {
        return res.status(400).json({ error: 'Start and end dates are required' });
      }

      // Verify location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const records = db.prepare(`
        SELECT * FROM entry_exit
        WHERE location_id = ? AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
      `).all(locationId, start, end);

      res.json(records);
    } catch (err) {
      logger.error(`Error getting entry/exit records in range: ${err.message}`);
      res.status(500).json({ error: 'Failed to get entry/exit records in range' });
    }
  });

  // Record a new entry or exit
  router.post('/:locationId/entry-exit', (req, res) => {
    try {
      const { locationId } = req.params;
      const { type, count = 1, currentOccupancy, timestamp = new Date().toISOString() } = req.body;

      if (!type || currentOccupancy === undefined) {
        return res.status(400).json({ error: 'Type and currentOccupancy are required' });
      }

      if (type !== 'entry' && type !== 'exit') {
        return res.status(400).json({ error: 'Type must be "entry" or "exit"' });
      }

      // Verify location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      const result = db.prepare(`
        INSERT INTO entry_exit (location_id, type, count, current_occupancy, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(locationId, type, count, currentOccupancy, timestamp);

      const newRecord = db.prepare('SELECT * FROM entry_exit WHERE id = ?').get(result.lastInsertRowid);

      // Emit via Socket.IO for real-time updates
      io.emit('entry_exit_recorded', {
        ...newRecord,
        location_id: locationId
      });

      res.status(201).json(newRecord);
    } catch (err) {
      logger.error(`Error recording entry/exit: ${err.message}`);
      res.status(500).json({ error: 'Failed to record entry/exit' });
    }
  });

  return router;
};