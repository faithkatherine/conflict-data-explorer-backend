const express = require("express");
const db = require("../config/database");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/events - Fetch conflict events with filters
router.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      country,
      event_type,
      start_date,
      end_date,
      page = 1,
      limit = 10,
    } = req.query;

    // Build dynamic query - use ? placeholders for SQLite compatibility
    let query = `
      SELECT e.*, u.username as created_by_username 
      FROM events e 
      LEFT JOIN users u ON e.created_by = u.id 
      WHERE 1=1
    `;
    const queryParams = [];

    // Add filters
    if (country) {
      query += ` AND LOWER(e.country) LIKE LOWER(?)`;
      queryParams.push(`%${country}%`);
    }

    if (event_type) {
      query += ` AND LOWER(e.event_type) LIKE LOWER(?)`;
      queryParams.push(`%${event_type}%`);
    }

    if (start_date) {
      query += ` AND e.date >= ?`;
      queryParams.push(start_date);
    }

    if (end_date) {
      query += ` AND e.date <= ?`;
      queryParams.push(end_date);
    }

    // Add ordering
    query += ` ORDER BY e.date DESC, e.created_at DESC`;

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), parseInt(offset));

    // Execute main query
    const result = await db.query(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM events e 
      WHERE 1=1
    `;
    const countParams = [];

    if (country) {
      countQuery += ` AND LOWER(e.country) LIKE LOWER(?)`;
      countParams.push(`%${country}%`);
    }

    if (event_type) {
      countQuery += ` AND LOWER(e.event_type) LIKE LOWER(?)`;
      countParams.push(`%${event_type}%`);
    }

    if (start_date) {
      countQuery += ` AND e.date >= ?`;
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ` AND e.date <= ?`;
      countParams.push(end_date);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        events: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get events error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// POST /api/events - Create new event (admin only)
router.post("/", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { country, event_type, fatalities, date, description } = req.body;

    // Validate required fields
    if (!country || !event_type || !date) {
      return res.status(400).json({
        success: false,
        message: "Country, event_type, and date are required",
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Date must be in YYYY-MM-DD format",
      });
    }

    // Validate fatalities is a positive number
    const fatalitiesNum = fatalities ? parseInt(fatalities) : 0;
    if (isNaN(fatalitiesNum) || fatalitiesNum < 0) {
      return res.status(400).json({
        success: false,
        message: "Fatalities must be a non-negative number",
      });
    }

    // Insert new event
    if (db.type === "postgresql") {
      const result = await db.query(
        `
        INSERT INTO events (country, event_type, fatalities, date, description, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
        [country, event_type, fatalitiesNum, date, description, req.user.id]
      );

      const newEvent = result.rows[0];

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: { event: newEvent },
      });
    } else {
      // SQLite
      const result = await db.query(
        `
        INSERT INTO events (country, event_type, fatalities, date, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [country, event_type, fatalitiesNum, date, description, req.user.id]
      );

      // Get the inserted event
      const newEventResult = await db.query(
        "SELECT * FROM events WHERE id = ?",
        [result.insertId]
      );

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: { event: newEventResult.rows[0] },
      });
    }
  } catch (error) {
    console.error("Create event error:", error);

    // Handle specific database errors
    if (error.code === "23505" || error.code === "SQLITE_CONSTRAINT") {
      return res.status(400).json({
        success: false,
        message: "Event with these details already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// GET /api/events/stats - Get events statistics
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_events,
        SUM(fatalities) as total_fatalities,
        COUNT(DISTINCT country) as countries_affected,
        COUNT(DISTINCT event_type) as event_types
      FROM events
    `);

    const countryStatsResult = await db.query(`
      SELECT 
        country,
        COUNT(*) as event_count,
        SUM(fatalities) as total_fatalities
      FROM events 
      GROUP BY country 
      ORDER BY event_count DESC 
      LIMIT 10
    `);

    const typeStatsResult = await db.query(`
      SELECT 
        event_type,
        COUNT(*) as event_count,
        SUM(fatalities) as total_fatalities
      FROM events 
      GROUP BY event_type 
      ORDER BY event_count DESC
    `);

    res.json({
      success: true,
      data: {
        overall: statsResult.rows[0],
        by_country: countryStatsResult.rows,
        by_type: typeStatsResult.rows,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
