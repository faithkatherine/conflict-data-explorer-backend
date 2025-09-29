const db = require("./database");
const bcrypt = require("bcryptjs");

async function initializeDatabase() {
  try {
    const isPostgreSQL = db.type === "postgresql";

    // Create users table
    const createUsersTable = isPostgreSQL
      ? `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
      : `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await db.query(createUsersTable);

    // Create events table
    const createEventsTable = isPostgreSQL
      ? `
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        country VARCHAR(255) NOT NULL,
        event_type VARCHAR(255) NOT NULL,
        fatalities INTEGER DEFAULT 0,
        date DATE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `
      : `
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        country TEXT NOT NULL,
        event_type TEXT NOT NULL,
        fatalities INTEGER DEFAULT 0,
        date DATE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `;

    await db.query(createEventsTable);

    // Create indexes for better performance
    if (isPostgreSQL) {
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_events_country ON events(country)`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`
      );
    } else {
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_events_country ON events(country)`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`
      );
    }

    // Insert default admin user if not exists
    const adminPassword = await bcrypt.hash(
      "admin123",
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    if (isPostgreSQL) {
      await db.query(
        `
        INSERT INTO users (username, password_hash, role) 
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING
      `,
        ["admin", adminPassword, "admin"]
      );
    } else {
      await db.query(
        `
        INSERT OR IGNORE INTO users (username, password_hash, role) 
        VALUES (?, ?, ?)
      `,
        ["admin", adminPassword, "admin"]
      );
    }

    // Insert default regular user if not exists
    const userPassword = await bcrypt.hash(
      "user123",
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    if (isPostgreSQL) {
      await db.query(
        `
        INSERT INTO users (username, password_hash, role) 
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING
      `,
        ["user", userPassword, "user"]
      );
    } else {
      await db.query(
        `
        INSERT OR IGNORE INTO users (username, password_hash, role) 
        VALUES (?, ?, ?)
      `,
        ["user", userPassword, "user"]
      );
    }

    // Insert sample events data
    const sampleEvents = [
      {
        country: "Syria",
        event_type: "Armed Conflict",
        fatalities: 25,
        date: "2024-01-15",
        description:
          "Armed clash between government forces and opposition groups in rural Damascus",
      },
      {
        country: "Ukraine",
        event_type: "Military Action",
        fatalities: 12,
        date: "2024-02-20",
        description:
          "Artillery strike on civilian infrastructure in eastern Ukraine",
      },
      {
        country: "Myanmar",
        event_type: "Civil Unrest",
        fatalities: 8,
        date: "2024-03-10",
        description: "Violent crackdown on pro-democracy protesters in Yangon",
      },
      {
        country: "Afghanistan",
        event_type: "Terrorist Attack",
        fatalities: 45,
        date: "2024-04-05",
        description: "Bomb explosion at a religious gathering in Kabul",
      },
      {
        country: "Somalia",
        event_type: "Armed Conflict",
        fatalities: 18,
        date: "2024-05-12",
        description: "Fighting between clan militias over territorial control",
      },
    ];

    for (const event of sampleEvents) {
      if (isPostgreSQL) {
        await db.query(
          `
          INSERT INTO events (country, event_type, fatalities, date, description, created_by)
          SELECT $1, $2, $3, $4, $5, u.id
          FROM users u WHERE u.username = 'admin'
          ON CONFLICT DO NOTHING
        `,
          [
            event.country,
            event.event_type,
            event.fatalities,
            event.date,
            event.description,
          ]
        );
      } else {
        // For SQLite, first get the admin user ID
        const adminResult = await db.query(
          "SELECT id FROM users WHERE username = ?",
          ["admin"]
        );
        if (adminResult.rows.length > 0) {
          const adminId = adminResult.rows[0].id;
          await db.query(
            `
            INSERT OR IGNORE INTO events (country, event_type, fatalities, date, description, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
            [
              event.country,
              event.event_type,
              event.fatalities,
              event.date,
              event.description,
              adminId,
            ]
          );
        }
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `Database initialized successfully using ${db.type.toUpperCase()}`
      );
      console.log("Default users created:");
      console.log("  Admin: username=admin, password=admin123");
      console.log("  User: username=user, password=user123");
    }
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

module.exports = { initializeDatabase };
