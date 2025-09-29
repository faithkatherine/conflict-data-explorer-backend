#!/bin/bash

# Database Setup Script for Conflict Data Explorer
# Usage: ./setup-db.sh [sqlite|postgres-docker|postgres-local]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

case "${1:-sqlite}" in
    "sqlite")
        echo "🗄️  Setting up SQLite database..."
        echo "NODE_ENV=development" > .env
        echo "DB_TYPE=sqlite" >> .env
        echo "PORT=3002" >> .env
        echo "✅ SQLite configured. Run: node server.js"
        ;;
        
    "postgres-docker")
        echo "🐳 Setting up PostgreSQL with Docker..."
        
        # Start PostgreSQL and pgAdmin containers
        docker-compose up postgres pgadmin redis -d
        
        # Wait for PostgreSQL to be ready
        echo "⏳ Waiting for PostgreSQL to start..."
        sleep 10
        
        # Create .env file
        cat > .env << EOF
NODE_ENV=development
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=conflict_data
DB_USER=postgres
DB_PASSWORD=password
REDIS_URL=redis://localhost:6379
PORT=3002
EOF
        
        echo "✅ PostgreSQL Docker setup complete!"
        echo "📊 pgAdmin available at: http://localhost:5050"
        echo "   Login: admin@admin.com / admin"
        echo "🚀 Run: node server.js"
        ;;
        
    "postgres-local")
        echo "🏠 Setting up local PostgreSQL..."
        
        # Check if PostgreSQL is installed
        if ! command -v psql &> /dev/null; then
            echo "Installing PostgreSQL..."
            brew install postgresql@15
            brew services start postgresql@15
        fi
        
        # Create database and user
        createdb conflict_data 2>/dev/null || echo "Database already exists"
        psql conflict_data -c "CREATE USER postgres WITH ENCRYPTED PASSWORD 'password';" 2>/dev/null || echo "User already exists"
        psql conflict_data -c "GRANT ALL PRIVILEGES ON DATABASE conflict_data TO postgres;" 2>/dev/null || true
        
        # Create .env file
        cat > .env << EOF
NODE_ENV=development
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=conflict_data
DB_USER=postgres
DB_PASSWORD=password
PORT=3002
EOF
        
        echo "✅ Local PostgreSQL setup complete!"
        echo "📊 Use pgAdmin 4 from Applications folder"
        echo "🚀 Run: node server.js"
        ;;
        
    *)
        echo "Usage: $0 [sqlite|postgres-docker|postgres-local]"
        echo ""
        echo "Options:"
        echo "  sqlite          - Use SQLite database (default, simplest)"
        echo "  postgres-docker - Use PostgreSQL in Docker with pgAdmin"
        echo "  postgres-local  - Use local PostgreSQL installation"
        exit 1
        ;;
esac

echo ""
echo "🎯 Next steps:"
echo "1. node server.js          # Start backend"
echo "2. cd ../cde && npm run dev # Start frontend"
echo ""
echo "📚 Documentation:"
echo "- Production Guide: ../PRODUCTION_GUIDE.md"
echo "- pgAdmin Guide: ../PGADMIN_SETUP_GUIDE.md"
