const express = require("express");
const { logger, performance, database } = require("../config/logger");
const db = require("../config/database");
const router = express.Router();

// Health check endpoint
router.get("/health", async (req, res) => {
  const timer = performance.startTimer("Health Check");

  try {
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      services: {},
    };

    // Check database connectivity
    try {
      const dbTimer = performance.startTimer("Database Health Check");
      await db.query("SELECT 1");
      health.services.database = {
        status: "ok",
        response_time: dbTimer.end(),
      };
    } catch (dbError) {
      health.services.database = {
        status: "error",
        error: dbError.message,
      };
      health.status = "degraded";
    }

    // Check Redis connectivity if configured
    if (process.env.REDIS_URL) {
      try {
        // Add Redis health check here
        health.services.redis = {
          status: "ok",
        };
      } catch (redisError) {
        health.services.redis = {
          status: "error",
          error: redisError.message,
        };
        if (health.status === "ok") health.status = "degraded";
      }
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    health.memory = {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
    };

    // CPU usage
    const cpuUsage = process.cpuUsage();
    health.cpu = {
      user: cpuUsage.user,
      system: cpuUsage.system,
    };

    timer.end();

    const statusCode =
      health.status === "ok" ? 200 : health.status === "degraded" ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    timer.end();
    logger.error("Health check failed:", error);

    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Health check failed",
    });
  }
});

// Detailed health check with database statistics
router.get("/health/detailed", async (req, res) => {
  try {
    const detailed = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {},
      metrics: {},
    };

    // Database health and statistics
    try {
      const dbTimer = performance.startTimer("Detailed Database Check");

      // Basic connectivity
      await db.query("SELECT 1");

      // Get database statistics
      const stats = await Promise.all([
        db.query("SELECT COUNT(*) as count FROM users"),
        db.query("SELECT COUNT(*) as count FROM events"),
        db.query("SELECT MAX(date) as latest_date FROM events"),
      ]);

      detailed.services.database = {
        status: "ok",
        response_time: dbTimer.end(),
        statistics: {
          total_users: parseInt(stats[0].rows[0].count),
          total_events: parseInt(stats[1].rows[0].count),
          latest_event_date: stats[2].rows[0].latest_date,
        },
      };
    } catch (dbError) {
      detailed.services.database = {
        status: "error",
        error: dbError.message,
      };
      detailed.status = "error";
    }

    // Performance metrics
    detailed.metrics = {
      uptime: {
        seconds: process.uptime(),
        human: formatUptime(process.uptime()),
      },
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      load_average: require("os").loadavg(),
      platform: {
        arch: process.arch,
        platform: process.platform,
        node_version: process.version,
      },
    };

    res.json(detailed);
  } catch (error) {
    logger.error("Detailed health check failed:", error);
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Detailed health check failed",
    });
  }
});

// Readiness probe (for Kubernetes)
router.get("/ready", async (req, res) => {
  try {
    // Check if application is ready to serve traffic
    await db.query("SELECT 1");

    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not ready",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Liveness probe (for Kubernetes)
router.get("/live", (req, res) => {
  // Simple liveness check - if the process is running, it's alive
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Metrics endpoint (for monitoring systems like Prometheus)
router.get("/metrics", async (req, res) => {
  try {
    const metrics = await collectMetrics();

    // Return in Prometheus format
    res.set("Content-Type", "text/plain");
    res.send(formatPrometheusMetrics(metrics));
  } catch (error) {
    logger.error("Metrics collection failed:", error);
    res.status(500).json({
      error: "Failed to collect metrics",
    });
  }
});

// Performance metrics collection
async function collectMetrics() {
  const metrics = {
    timestamp: Date.now(),
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
    system: {
      load_average: require("os").loadavg(),
      free_memory: require("os").freemem(),
      total_memory: require("os").totalmem(),
    },
    application: {},
  };

  // Collect application-specific metrics
  try {
    const dbStats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM events) as total_events,
        (SELECT COUNT(*) FROM events WHERE date >= CURRENT_DATE - INTERVAL '24 hours') as events_last_24h
    `);

    metrics.application = dbStats.rows[0];
  } catch (error) {
    logger.error("Failed to collect application metrics:", error);
  }

  return metrics;
}

// Format metrics for Prometheus
function formatPrometheusMetrics(metrics) {
  const lines = [];

  // Process metrics
  lines.push(`# HELP process_uptime_seconds Process uptime in seconds`);
  lines.push(`# TYPE process_uptime_seconds gauge`);
  lines.push(`process_uptime_seconds ${metrics.process.uptime}`);

  lines.push(`# HELP process_memory_rss_bytes Process resident memory size`);
  lines.push(`# TYPE process_memory_rss_bytes gauge`);
  lines.push(`process_memory_rss_bytes ${metrics.process.memory.rss}`);

  lines.push(`# HELP process_memory_heap_used_bytes Process heap memory used`);
  lines.push(`# TYPE process_memory_heap_used_bytes gauge`);
  lines.push(
    `process_memory_heap_used_bytes ${metrics.process.memory.heapUsed}`
  );

  // System metrics
  lines.push(`# HELP system_load_average System load average`);
  lines.push(`# TYPE system_load_average gauge`);
  lines.push(
    `system_load_average{period="1m"} ${metrics.system.load_average[0]}`
  );
  lines.push(
    `system_load_average{period="5m"} ${metrics.system.load_average[1]}`
  );
  lines.push(
    `system_load_average{period="15m"} ${metrics.system.load_average[2]}`
  );

  // Application metrics
  if (metrics.application.total_users) {
    lines.push(`# HELP app_users_total Total number of users`);
    lines.push(`# TYPE app_users_total gauge`);
    lines.push(`app_users_total ${metrics.application.total_users}`);
  }

  if (metrics.application.total_events) {
    lines.push(`# HELP app_events_total Total number of events`);
    lines.push(`# TYPE app_events_total gauge`);
    lines.push(`app_events_total ${metrics.application.total_events}`);
  }

  if (metrics.application.events_last_24h) {
    lines.push(`# HELP app_events_last_24h Number of events in last 24 hours`);
    lines.push(`# TYPE app_events_last_24h gauge`);
    lines.push(`app_events_last_24h ${metrics.application.events_last_24h}`);
  }

  return lines.join("\n") + "\n";
}

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

module.exports = router;
