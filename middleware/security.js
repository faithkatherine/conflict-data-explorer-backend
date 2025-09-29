const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const { body, validationResult } = require("express-validator");

// Enhanced Rate Limiting with Redis support
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Add Redis store if available
    ...(process.env.REDIS_URL && {
      store: require("rate-limit-redis")({
        sendCommand: (...args) => redisClient.call(...args),
      }),
    }),
  };

  return rateLimit({ ...defaultOptions, ...options });
};

// Security Headers with enhanced CSP
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [
      "http://localhost:3003",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Input Validation Middleware
const validateInput = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const extractedErrors = [];
    errors.array().map((err) => extractedErrors.push({ [err.path]: err.msg }));

    return res.status(422).json({
      success: false,
      message: "Validation errors",
      errors: extractedErrors,
    });
  };
};

// Common validation rules
const validationRules = {
  login: [
    body("username")
      .isLength({ min: 3, max: 50 })
      .withMessage("Username must be between 3 and 50 characters")
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage(
        "Username can only contain letters, numbers, and underscores"
      ),
    body("password")
      .isLength({ min: 6, max: 128 })
      .withMessage("Password must be between 6 and 128 characters"),
  ],
  createEvent: [
    body("country")
      .isLength({ min: 2, max: 100 })
      .withMessage("Country name must be between 2 and 100 characters")
      .escape(),
    body("event_type")
      .isIn([
        "Armed Conflict",
        "Civil Unrest",
        "Terrorism",
        "Border Dispute",
        "Other",
      ])
      .withMessage("Invalid event type"),
    body("fatalities")
      .isInt({ min: 0, max: 1000000 })
      .withMessage("Fatalities must be a non-negative integer"),
    body("date")
      .isISO8601()
      .withMessage("Date must be in ISO format (YYYY-MM-DD)"),
    body("description")
      .isLength({ min: 10, max: 1000 })
      .withMessage("Description must be between 10 and 1000 characters")
      .escape(),
    body("latitude")
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage("Latitude must be between -90 and 90"),
    body("longitude")
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage("Longitude must be between -180 and 180"),
  ],
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      timestamp: new Date().toISOString(),
    };

    // Log to Winston logger if available
    if (global.logger) {
      global.logger.info("HTTP Request", logData);
    } else {
      console.log("HTTP Request:", logData);
    }
  });

  next();
};

// API Response wrapper
const apiResponse = (req, res, next) => {
  res.success = (data, message = "Success", statusCode = 200) => {
    res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  };

  res.error = (message = "Error", statusCode = 500, errors = null) => {
    res.status(statusCode).json({
      success: false,
      message,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
    });
  };

  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log error
  if (global.logger) {
    global.logger.error("Unhandled Error", {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
  }

  // Don't leak error details in production
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;

  res.status(err.status || 500).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

module.exports = {
  createRateLimiter,
  securityHeaders,
  corsOptions,
  validateInput,
  validationRules,
  requestLogger,
  apiResponse,
  errorHandler,
  compression: compression(),
};
