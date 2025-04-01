import express from 'express';
import logger from '../logger.js';
import os from 'os';

export default function(db, io) {
  const router = express.Router();

  // Get all config values
  router.get('/', (req, res) => {
    try {
      const configs = db.prepare('SELECT * FROM config').all();
      
      // Convert to object format
      const configObj = {};
      configs.forEach(config => {
        try {
          configObj[config.key] = JSON.parse(config.value);
        } catch (e) {
          configObj[config.key] = config.value;
        }
      });
      
      res.json(configObj);
    } catch (err) {
      logger.error(`Error getting all configs: ${err.message}`);
      res.status(500).json({ error: 'Failed to get configurations' });
    }
  });

  // Get config by key
  router.get('/:key', (req, res) => {
    try {
      const { key } = req.params;
      const config = db.prepare('SELECT * FROM config WHERE key = ?').get(key);
      
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      
      // Try to parse as JSON
      try {
        const value = JSON.parse(config.value);
        res.json({ key: config.key, value });
      } catch (e) {
        res.json({ key: config.key, value: config.value });
      }
    } catch (err) {
      logger.error(`Error getting config ${req.params.key}: ${err.message}`);
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  // Set config value
  router.put('/:key', (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ error: 'Value is required' });
      }
      
      // Stringify objects
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const timestamp = new Date().toISOString();
      
      // Upsert config
      db.prepare(`
        INSERT INTO config (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
        value = ?, updated_at = ?
      `).run(key, stringValue, timestamp, stringValue, timestamp);
      
      // Emit via Socket.IO for real-time updates
      io.emit('config_updated', { key, value });
      
      res.json({ key, value });
    } catch (err) {
      logger.error(`Error setting config ${req.params.key}: ${err.message}`);
      res.status(500).json({ error: 'Failed to set configuration' });
    }
  });

  // Delete config
  router.delete('/:key', (req, res) => {
    try {
      const { key } = req.params;
      
      const result = db.prepare('DELETE FROM config WHERE key = ?').run(key);
      
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      
      // Emit via Socket.IO for real-time updates
      io.emit('config_deleted', { key });
      
      res.status(204).send();
    } catch (err) {
      logger.error(`Error deleting config ${req.params.key}: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete configuration' });
    }
  });

  // System maintenance - optimize database
  router.post('/optimize', (req, res) => {
    try {
      // Run database optimizations
      db.pragma('optimize');
      
      // Run VACUUM to reclaim space
      db.exec('VACUUM');
      
      res.json({ message: 'Database optimization complete' });
    } catch (err) {
      logger.error(`Error optimizing database: ${err.message}`);
      res.status(500).json({ error: 'Failed to optimize database' });
    }
  });

  // System diagnostics
  router.get('/diagnostics', (req, res) => {
    try {
      // Collect system diagnostics
      const diagnostics = {
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          memory: {
            total: os.totalmem(),
            free: os.freemem(),
            usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%'
          },
          uptime: os.uptime()
        },
        database: {
          size: db.pragma('page_count * page_size'),
          tables: {
            locations: db.prepare('SELECT COUNT(*) as count FROM locations').get().count,
            counts: db.prepare('SELECT COUNT(*) as count FROM counts').get().count,
            entryExit: db.prepare('SELECT COUNT(*) as count FROM entry_exit').get().count,
            configs: db.prepare('SELECT COUNT(*) as count FROM config').get().count
          }
        },
        timestamp: new Date().toISOString()
      };
      
      res.json(diagnostics);
    } catch (err) {
      logger.error(`Error getting diagnostics: ${err.message}`);
      res.status(500).json({ error: 'Failed to get system diagnostics' });
    }
  });

  return router;
};