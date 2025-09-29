const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Conflict Data Explorer API",
      version: "1.0.0",
      description:
        "A comprehensive API for managing conflict event data with advanced security and analytics capabilities",
      contact: {
        name: "API Support",
        email: "support@conflictdata.org",
      },
      license: {
        name: "ISC",
        url: "https://opensource.org/licenses/ISC",
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || "http://localhost:3002",
        description: "Development server",
      },
      {
        url: "https://api.conflictdata.org",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "User ID",
            },
            username: {
              type: "string",
              description: "Username",
            },
            role: {
              type: "string",
              enum: ["user", "admin"],
              description: "User role",
            },
          },
        },
        Event: {
          type: "object",
          required: [
            "country",
            "event_type",
            "fatalities",
            "date",
            "description",
          ],
          properties: {
            id: {
              type: "integer",
              description: "Event ID",
            },
            country: {
              type: "string",
              description: "Country where the event occurred",
              minLength: 2,
              maxLength: 100,
            },
            event_type: {
              type: "string",
              enum: [
                "Armed Conflict",
                "Civil Unrest",
                "Terrorism",
                "Border Dispute",
                "Other",
              ],
              description: "Type of conflict event",
            },
            fatalities: {
              type: "integer",
              minimum: 0,
              description: "Number of fatalities",
            },
            date: {
              type: "string",
              format: "date",
              description: "Date of the event (YYYY-MM-DD)",
            },
            description: {
              type: "string",
              minLength: 10,
              maxLength: 1000,
              description: "Detailed description of the event",
            },
            latitude: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description: "Latitude coordinate",
            },
            longitude: {
              type: "number",
              minimum: -180,
              maximum: 180,
              description: "Longitude coordinate",
            },
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
              description: "Event severity level",
            },
            source: {
              type: "string",
              description: "Source of the information",
            },
            created_by: {
              type: "integer",
              description: "ID of the user who created the event",
            },
            created_at: {
              type: "string",
              format: "date-time",
              description: "Creation timestamp",
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: {
              type: "string",
              minLength: 3,
              maxLength: 50,
              description: "Username for authentication",
            },
            password: {
              type: "string",
              minLength: 6,
              maxLength: 128,
              description: "Password for authentication",
            },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            message: {
              type: "string",
            },
            data: {
              type: "object",
              properties: {
                user: {
                  $ref: "#/components/schemas/User",
                },
                tokens: {
                  type: "object",
                  properties: {
                    access_token: {
                      type: "string",
                      description: "JWT access token",
                    },
                    refresh_token: {
                      type: "string",
                      description: "JWT refresh token",
                    },
                  },
                },
              },
            },
          },
        },
        EventsResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            message: {
              type: "string",
            },
            data: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Event",
                  },
                },
                pagination: {
                  type: "object",
                  properties: {
                    page: {
                      type: "integer",
                    },
                    limit: {
                      type: "integer",
                    },
                    total: {
                      type: "integer",
                    },
                    pages: {
                      type: "integer",
                    },
                  },
                },
              },
            },
          },
        },
        StatsResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            data: {
              type: "object",
              properties: {
                overall: {
                  type: "object",
                  properties: {
                    total_events: {
                      type: "integer",
                    },
                    total_fatalities: {
                      type: "integer",
                    },
                    countries_affected: {
                      type: "integer",
                    },
                    event_types: {
                      type: "integer",
                    },
                  },
                },
                by_country: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      country: {
                        type: "string",
                      },
                      event_count: {
                        type: "integer",
                      },
                      total_fatalities: {
                        type: "integer",
                      },
                    },
                  },
                },
                by_type: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      event_type: {
                        type: "string",
                      },
                      event_count: {
                        type: "integer",
                      },
                      total_fatalities: {
                        type: "integer",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              description: "Error message",
            },
            errors: {
              type: "array",
              items: {
                type: "object",
              },
              description: "Detailed validation errors",
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./routes/*.js", "./server.js"], // paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);

const swaggerOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .scheme-container { background: #fafafa; padding: 20px; }
  `,
  customSiteTitle: "Conflict Data Explorer API Documentation",
};

module.exports = {
  specs,
  swaggerUi,
  swaggerOptions,
};
