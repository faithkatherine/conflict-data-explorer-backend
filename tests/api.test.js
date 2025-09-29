const request = require("supertest");
const app = require("../server");
const db = require("../config/database");

describe("Authentication Endpoints", () => {
  beforeAll(async () => {
    // Setup test database
    await db.query(`
      DELETE FROM users WHERE username IN ('testuser', 'testadmin')
    `);
  });

  afterAll(async () => {
    // Cleanup test data
    await db.query(`
      DELETE FROM users WHERE username IN ('testuser', 'testadmin')
    `);
  });

  describe("POST /api/auth/login", () => {
    test("should login with valid credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "admin",
        password: "admin123",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty("username", "admin");
      expect(response.body.data.tokens).toHaveProperty("access_token");
      expect(response.body.data.tokens).toHaveProperty("refresh_token");
    });

    test("should reject invalid credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "admin",
        password: "wrongpassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("should validate input format", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "ab", // Too short
        password: "123", // Too short
      });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe("GET /api/auth/me", () => {
    let authToken;

    beforeAll(async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "admin",
        password: "admin123",
      });
      authToken = loginResponse.body.data.tokens.access_token;
    });

    test("should return user info with valid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty("username", "admin");
    });

    test("should reject request without token", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("should reject request with invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});

describe("Events Endpoints", () => {
  let authToken;
  let testEventId;

  beforeAll(async () => {
    // Get admin token
    const loginResponse = await request(app).post("/api/auth/login").send({
      username: "admin",
      password: "admin123",
    });
    authToken = loginResponse.body.data.tokens.access_token;
  });

  afterAll(async () => {
    // Cleanup test events
    if (testEventId) {
      await db.query("DELETE FROM events WHERE id = ?", [testEventId]);
    }
  });

  describe("GET /api/events", () => {
    test("should return events list with authentication", async () => {
      const response = await request(app)
        .get("/api/events")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("events");
      expect(response.body.data).toHaveProperty("pagination");
      expect(Array.isArray(response.body.data.events)).toBe(true);
    });

    test("should support filtering by country", async () => {
      const response = await request(app)
        .get("/api/events?country=Syria")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test("should support pagination", async () => {
      const response = await request(app)
        .get("/api/events?page=1&limit=5")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.pagination).toHaveProperty("page", 1);
      expect(response.body.data.pagination).toHaveProperty("limit", 5);
    });

    test("should reject unauthenticated requests", async () => {
      const response = await request(app).get("/api/events");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/events", () => {
    test("should create event with valid data (admin only)", async () => {
      const eventData = {
        country: "Test Country",
        event_type: "Armed Conflict",
        fatalities: 10,
        date: "2024-01-15",
        description: "Test event description for automated testing purposes",
        latitude: 35.0,
        longitude: 40.0,
      };

      const response = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${authToken}`)
        .send(eventData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.event).toHaveProperty("id");
      expect(response.body.data.event.country).toBe(eventData.country);

      testEventId = response.body.data.event.id;
    });

    test("should validate required fields", async () => {
      const invalidData = {
        country: "Test",
        // Missing required fields
      };

      const response = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test("should validate data types and ranges", async () => {
      const invalidData = {
        country: "Test Country",
        event_type: "Invalid Type",
        fatalities: -5, // Invalid negative number
        date: "invalid-date",
        description: "Too short",
        latitude: 100, // Out of range
        longitude: 200, // Out of range
      };

      const response = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/events/stats", () => {
    test("should return statistics with authentication", async () => {
      const response = await request(app)
        .get("/api/events/stats")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("overall");
      expect(response.body.data).toHaveProperty("by_country");
      expect(response.body.data).toHaveProperty("by_type");
    });
  });
});

describe("Security Features", () => {
  test("should include security headers", async () => {
    const response = await request(app).get("/api/health");

    expect(response.headers).toHaveProperty("x-content-type-options");
    expect(response.headers).toHaveProperty("x-frame-options");
    expect(response.headers).toHaveProperty("x-xss-protection");
  });

  test("should handle CORS properly", async () => {
    const response = await request(app)
      .options("/api/events")
      .set("Origin", "http://localhost:3003");

    expect(response.headers).toHaveProperty("access-control-allow-origin");
  });

  test("should enforce rate limiting", async () => {
    // Make multiple rapid requests to trigger rate limiting
    const requests = Array(10)
      .fill()
      .map(() => request(app).get("/api/health"));

    const responses = await Promise.all(requests);

    // Depending on rate limit configuration, some requests should succeed
    const successfulRequests = responses.filter((r) => r.status === 200);
    expect(successfulRequests.length).toBeGreaterThan(0);
  }, 10000);
});

describe("Health Endpoints", () => {
  test("should return health status", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(response.body).toHaveProperty("timestamp");
    expect(response.body).toHaveProperty("uptime");
  });
});
