const winston = require("winston");
const path = require("path");

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) =>
      `${info.timestamp} ${info.level}: ${info.message}${
        info.stack ? "\n" + info.stack : ""
      }`
  )
);

// Define format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define which files to write to for each level
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || "info",
    format: consoleFormat,
  }),

  // Error log file
  new winston.transports.File({
    filename: path.join(__dirname, "../logs/error.log"),
    level: "error",
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(__dirname, "../logs/combined.log"),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: "conflict-data-api",
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  },
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create logs directory if it doesn't exist
const fs = require("fs");
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// HTTP request logging stream for Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Performance monitoring logger
const performance = {
  startTimer: (label) => {
    const start = process.hrtime.bigint();
    return {
      end: () => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to milliseconds
        logger.info(`Performance: ${label} took ${duration.toFixed(2)}ms`);
        return duration;
      },
    };
  },

  logMemoryUsage: () => {
    const used = process.memoryUsage();
    const memoryInfo = {
      rss: `${Math.round((used.rss / 1024 / 1024) * 100) / 100} MB`,
      heapTotal: `${Math.round((used.heapTotal / 1024 / 1024) * 100) / 100} MB`,
      heapUsed: `${Math.round((used.heapUsed / 1024 / 1024) * 100) / 100} MB`,
      external: `${Math.round((used.external / 1024 / 1024) * 100) / 100} MB`,
    };
    logger.info("Memory Usage:", memoryInfo);
  },

  logSystemHealth: () => {
    const uptime = process.uptime();
    const load = process.cpuUsage();

    logger.info("System Health:", {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      cpuUsage: {
        user: load.user,
        system: load.system,
      },
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    });
  },
};

// Security event logger
const security = {
  logFailedLogin: (username, ip, userAgent) => {
    logger.warn("Security: Failed login attempt", {
      username,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
      event: "FAILED_LOGIN",
    });
  },

  logSuccessfulLogin: (username, ip, userAgent) => {
    logger.info("Security: Successful login", {
      username,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
      event: "SUCCESSFUL_LOGIN",
    });
  },

  logRateLimitExceeded: (ip, endpoint) => {
    logger.warn("Security: Rate limit exceeded", {
      ip,
      endpoint,
      timestamp: new Date().toISOString(),
      event: "RATE_LIMIT_EXCEEDED",
    });
  },

  logUnauthorizedAccess: (ip, endpoint, token) => {
    logger.warn("Security: Unauthorized access attempt", {
      ip,
      endpoint,
      token: token ? "present" : "missing",
      timestamp: new Date().toISOString(),
      event: "UNAUTHORIZED_ACCESS",
    });
  },

  logSuspiciousActivity: (details) => {
    logger.warn("Security: Suspicious activity detected", {
      ...details,
      timestamp: new Date().toISOString(),
      event: "SUSPICIOUS_ACTIVITY",
    });
  },
};

// Database query logger
const database = {
  logQuery: (query, duration, error = null) => {
    if (error) {
      logger.error("Database: Query failed", {
        query,
        duration,
        error: error.message,
        event: "DB_QUERY_FAILED",
      });
    } else {
      logger.debug("Database: Query executed", {
        query,
        duration,
        event: "DB_QUERY_SUCCESS",
      });
    }
  },

  logConnection: (status, details = {}) => {
    logger.info(`Database: Connection ${status}`, {
      ...details,
      event: `DB_CONNECTION_${status.toUpperCase()}`,
    });
  },
};

// API usage logger
const api = {
  logRequest: (req, res, duration) => {
    logger.http("API Request", {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      userId: req.user?.id,
      event: "API_REQUEST",
    });
  },

  logError: (req, error) => {
    logger.error("API Error", {
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userId: req.user?.id,
      event: "API_ERROR",
    });
  },
};

module.exports = {
  logger,
  performance,
  security,
  database,
  api,
};
