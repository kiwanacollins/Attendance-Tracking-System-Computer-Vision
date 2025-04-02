import express from 'express';
import logger from '../logger.js';

export default function(db) {
  const router = express.Router();

  // Get hourly occupancy report
  router.get('/:locationId/hourly', (req, res) => {
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

      // Get hourly average occupancy
      const hourlyData = db.prepare(`
        SELECT 
          strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
          ROUND(AVG(count)) as average_count,
          MAX(count) as max_count,
          MIN(count) as min_count,
          COUNT(*) as sample_count
        FROM counts
        WHERE location_id = ? AND timestamp BETWEEN ? AND ?
        GROUP BY hour
        ORDER BY hour
      `).all(locationId, start, end);

      res.json(hourlyData);
    } catch (err) {
      logger.error(`Error generating hourly report: ${err.message}`);
      res.status(500).json({ error: 'Failed to generate hourly report' });
    }
  });

  // Get daily occupancy report
  router.get('/:locationId/daily', (req, res) => {
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

      // Get daily average occupancy
      const dailyData = db.prepare(`
        SELECT 
          strftime('%Y-%m-%d', timestamp) as day,
          ROUND(AVG(count)) as average_count,
          MAX(count) as max_count,
          MIN(count) as min_count,
          COUNT(*) as sample_count
        FROM counts
        WHERE location_id = ? AND timestamp BETWEEN ? AND ?
        GROUP BY day
        ORDER BY day
      `).all(locationId, start, end);

      res.json(dailyData);
    } catch (err) {
      logger.error(`Error generating daily report: ${err.message}`);
      res.status(500).json({ error: 'Failed to generate daily report' });
    }
  });

  // Get summary report
  router.get('/:locationId/summary', (req, res) => {
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

      // Get overall summary data
      const summary = db.prepare(`
        SELECT 
          COUNT(*) as total_samples,
          ROUND(AVG(count)) as average_count,
          MAX(count) as max_count,
          MIN(count) as min_count,
          MIN(timestamp) as start_time,
          MAX(timestamp) as end_time
        FROM counts
        WHERE location_id = ? AND timestamp BETWEEN ? AND ?
      `).get(locationId, start, end);

      // Get entry/exit summary
      const entryExitSummary = db.prepare(`
        SELECT 
          type,
          SUM(count) as total_count,
          COUNT(*) as event_count
        FROM entry_exit
        WHERE location_id = ? AND timestamp BETWEEN ? AND ?
        GROUP BY type
      `).all(locationId, start, end);

      // Calculate occupancy percentage
      const utilizationData = db.prepare(`
        SELECT 
          CASE
            WHEN (count * 100.0 / ?) < 25 THEN 'low'
            WHEN (count * 100.0 / ?) < 50 THEN 'medium'
            WHEN (count * 100.0 / ?) < 75 THEN 'high'
            ELSE 'full'
          END as utilization_level,
          COUNT(*) as count
        FROM counts
        WHERE location_id = ? AND timestamp BETWEEN ? AND ?
        GROUP BY utilization_level
      `).all(
        location.capacity, 
        location.capacity, 
        location.capacity, 
        locationId, 
        start, 
        end
      );

      res.json({
        location: location,
        summary: summary,
        entryExit: entryExitSummary,
        utilization: utilizationData
      });
    } catch (err) {
      logger.error(`Error generating summary report: ${err.message}`);
      res.status(500).json({ error: 'Failed to generate summary report' });
    }
  });

  // Generate and download CSV report
  router.get('/:locationId/csv', (req, res) => {
    try {
      const { locationId } = req.params;
      const { start, end, type = 'counts' } = req.query;

      if (!start || !end) {
        return res.status(400).json({ error: 'Start and end dates are required' });
      }

      // Verify location exists
      const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      let data;
      let headers;

      if (type === 'counts') {
        headers = ['timestamp', 'count', 'status', 'message'];
        data = db.prepare(`
          SELECT timestamp, count, status, message
          FROM counts
          WHERE location_id = ? AND timestamp BETWEEN ? AND ?
          ORDER BY timestamp DESC
        `).all(locationId, start, end);
      } else if (type === 'entry-exit') {
        headers = ['timestamp', 'type', 'count', 'current_occupancy'];
        data = db.prepare(`
          SELECT timestamp, type, count, current_occupancy
          FROM entry_exit
          WHERE location_id = ? AND timestamp BETWEEN ? AND ?
          ORDER BY timestamp DESC
        `).all(locationId, start, end);
      } else {
        return res.status(400).json({ error: 'Invalid report type' });
      }

      // Generate CSV content
      const csvContent = [
        headers.join(','),
        ...data.map(row => {
          return headers.map(header => {
            const value = row[header];
            return value !== null ? `"${value}"` : '';
          }).join(',');
        })
      ].join('\n');

      // Send CSV file
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${location.name}-${type}-${start}-${end}.csv"`);
      res.send(csvContent);
    } catch (err) {
      logger.error(`Error generating CSV report: ${err.message}`);
      res.status(500).json({ error: 'Failed to generate CSV report' });
    }
  });

  return router;
};