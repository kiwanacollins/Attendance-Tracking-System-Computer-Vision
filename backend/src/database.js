import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import logger from './logger.js';

// Set up dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database setup function
function setupDatabase() {
  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Create and initialize the database
  const dbPath = path.join(dataDir, 'attendance.db');
  try {
    const db = new Database(dbPath, {
      verbose: (message) => logger.debug(`[Database] ${message}`)
    });
    
    // Enable WAL mode for better concurrency and performance
    db.pragma('journal_mode = WAL');
    
    // Create tables if they don't exist
    initTables(db);
    
    logger.info(`Connected to database at ${dbPath}`);
    return db;
  } catch (err) {
    logger.error(`Database connection error: ${err.message}`);
    process.exit(1);
  }
}

// Initialize database tables
function initTables(db) {
  // Locations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Counts table (for logging counts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE
    )
  `);

  // Entry/Exit events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS entry_exit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('entry', 'exit')),
      count INTEGER NOT NULL,
      current_occupancy INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE
    )
  `);

  // Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create a Maximum Count if none exists
  const locationCount = db.prepare('SELECT COUNT(*) as count FROM locations').get();
  if (locationCount.count === 0) {
    db.prepare(`
      INSERT INTO locations (id, name, capacity)
      VALUES ('default', 'Main Room', 50)
    `).run();
    logger.info('Created Maximum Count');
  }
}

export { setupDatabase };