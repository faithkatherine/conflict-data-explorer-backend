require("dotenv").config();

let db;

// Try PostgreSQL first, fallback to SQLite
const usePostgreSQL = process.env.DB_TYPE !== "sqlite";

if (usePostgreSQL) {
  try {
    const { Pool } = require("pg");

    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });

    // Test the connection
    pool.on("connect", () => {
      if (process.env.NODE_ENV !== "production") {
        console.log("Connected to PostgreSQL database");
      }
    });

    pool.on("error", (err) => {
      console.error("PostgreSQL connection error:", err);
    });

    db = {
      pool,
      type: "postgresql",
      query: (text, params) => pool.query(text, params),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.log("PostgreSQL not available, falling back to SQLite");
    }
    db = null;
  }
}

// Fallback to SQLite
if (!db) {
  const sqlite3 = require("sqlite3").verbose();
  const path = require("path");

  const dbPath = path.join(__dirname, "..", "data", "database.sqlite");

  // Ensure data directory exists
  const fs = require("fs");
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("SQLite connection error:", err);
    } else if (process.env.NODE_ENV !== "production") {
      console.log("Connected to SQLite database");
    }
  });

  // Enable foreign keys
  sqliteDb.run("PRAGMA foreign_keys = ON");

  db = {
    pool: sqliteDb,
    type: "sqlite",
    query: (text, params = []) => {
      return new Promise((resolve, reject) => {
        // Convert PostgreSQL-style $1, $2 to SQLite-style ?, ?
        const sqliteQuery = text.replace(/\$(\d+)/g, "?");

        if (
          text.trim().toUpperCase().startsWith("SELECT") ||
          text.trim().toUpperCase().startsWith("WITH")
        ) {
          sqliteDb.all(sqliteQuery, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows });
          });
        } else {
          sqliteDb.run(sqliteQuery, params, function (err) {
            if (err) reject(err);
            else
              resolve({
                rows: [],
                rowCount: this.changes,
                insertId: this.lastID,
              });
          });
        }
      });
    },
  };
}

module.exports = db;
