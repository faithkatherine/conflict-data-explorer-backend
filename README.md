# Conflict Data Explorer Backend

A secure Node.js + Express API with JWT-based authentication and role-based access control for managing conflict event data.

## Features

- 🔐 JWT-based authentication
- 👥 Role-based access control (user/admin)
- 🛡️ Security best practices (Helmet, rate limiting, CORS)
- 📊 PostgreSQL database with query builder
- 🔍 Advanced filtering and pagination
- 📈 Statistics endpoints
- 🚀 Production-ready configuration

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

#### Option A: Local PostgreSQL

1. Install PostgreSQL on your system
2. Create a database named `conflict_data_explorer`
3. Update the `.env` file with your database credentials

#### Option B: Docker PostgreSQL

```bash
docker run --name postgres-cde \
  -e POSTGRES_DB=conflict_data_explorer \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:13
```

### 3. Environment Configuration

The `.env` file is already configured with default values. Update as needed:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=conflict_data_explorer
DB_USER=postgres
DB_PASSWORD=password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Security
BCRYPT_ROUNDS=12
```

**Important**: Change the `JWT_SECRET` in production!

### 4. Start the Server

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will automatically:

- Create database tables
- Insert default users
- Insert sample conflict data

## Default Users

The system creates two default users:

- **Admin**: username=`admin`, password=`admin123`
- **User**: username=`user`, password=`user123`

## API Endpoints

### Authentication

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

Response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

#### Get Current User

```http
GET /api/auth/me
Authorization: Bearer YOUR_JWT_TOKEN
```

### Events

#### Get Events (with filters)

```http
GET /api/events?country=Syria&event_type=Armed%20Conflict&start_date=2024-01-01&end_date=2024-12-31&page=1&limit=10
Authorization: Bearer YOUR_JWT_TOKEN
```

Query Parameters:

- `country`: Filter by country name (partial match)
- `event_type`: Filter by event type (partial match)
- `start_date`: Filter events after this date (YYYY-MM-DD)
- `end_date`: Filter events before this date (YYYY-MM-DD)
- `page`: Page number for pagination (default: 1)
- `limit`: Items per page (default: 10)

#### Create Event (Admin Only)

```http
POST /api/events
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "country": "Iraq",
  "event_type": "Terrorist Attack",
  "fatalities": 15,
  "date": "2024-06-15",
  "description": "Car bomb explosion in Baghdad market"
}
```

#### Get Statistics

```http
GET /api/events/stats
Authorization: Bearer YOUR_JWT_TOKEN
```

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Events Table

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  country VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  fatalities INTEGER DEFAULT 0,
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);
```

## Security Features

- **Helmet**: Sets various HTTP headers for security
- **Rate Limiting**: Prevents abuse (100 requests/15min general, 5 requests/15min for auth)
- **CORS**: Configured for specific origins
- **JWT**: Secure token-based authentication
- **bcrypt**: Password hashing with configurable rounds
- **SQL Injection Protection**: Parameterized queries
- **Input Validation**: Request body validation
- **Error Handling**: Secure error responses

## Testing with cURL

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### Get Events

```bash
curl -X GET "http://localhost:3001/api/events?country=Syria" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Create Event (Admin)

```bash
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "country": "Yemen",
    "event_type": "Armed Conflict",
    "fatalities": 20,
    "date": "2024-07-01",
    "description": "Fighting between government and rebel forces"
  }'
```

## Development

### Project Structure

```
backend/
├── config/
│   ├── database.js       # Database connection
│   └── initDb.js         # Database initialization
├── middleware/
│   └── auth.js           # Authentication middleware
├── routes/
│   ├── auth.js           # Authentication routes
│   └── events.js         # Events routes
├── .env                  # Environment variables
├── server.js             # Main server file
└── package.json          # Dependencies
```

### Adding New Features

1. **New Routes**: Add to `routes/` directory
2. **Middleware**: Add to `middleware/` directory
3. **Database Changes**: Update `config/initDb.js`
4. **Environment Variables**: Add to `.env` and document in README

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure proper database credentials
4. Set up SSL/TLS
5. Use a process manager like PM2
6. Set up monitoring and logging
7. Configure firewall and security groups

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure security best practices
