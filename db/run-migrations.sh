#!/bin/bash

# Migration runner script for landing-stats database
# Usage: ./db/run-migrations.sh [migration_number]
# Example: ./db/run-migrations.sh 001
#          ./db/run-migrations.sh all

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set (from .env.local or environment)
if [ -z "$DATABASE_URL" ]; then
    # Try to construct from individual env vars
    if [ -n "$SUPABASE_PSQL_DB_HOST" ] && [ -n "$SUPABASE_PSQL_DB_USER" ]; then
        DATABASE_URL="postgresql://${SUPABASE_PSQL_DB_USER}:${SUPABASE_PSQL_DB_PASSWORD}@${SUPABASE_PSQL_DB_HOST}:5432/${SUPABASE_PSQL_DB_NAME}?sslmode=require"
    else
        echo -e "${RED}Error: DATABASE_URL not set${NC}"
        echo "Set DATABASE_URL or configure SUPABASE_PSQL_DB_* variables in .env.local"
        exit 1
    fi
fi

# Function to run a single migration
run_migration() {
    local migration_file=$1
    local migration_name=$(basename "$migration_file" .sql)

    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Running migration: ${migration_name}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # Check if file exists
    if [ ! -f "$migration_file" ]; then
        echo -e "${RED}Error: Migration file not found: ${migration_file}${NC}"
        return 1
    fi

    # Run migration
    echo -e "${YELLOW}Executing SQL...${NC}"
    if psql "$DATABASE_URL" -f "$migration_file"; then
        echo ""
        echo -e "${GREEN}✓ Migration ${migration_name} completed successfully${NC}"
        return 0
    else
        echo ""
        echo -e "${RED}✗ Migration ${migration_name} failed${NC}"
        return 1
    fi
}

# Function to verify psql is installed
check_psql() {
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}Error: psql not found${NC}"
        echo "Install PostgreSQL client:"
        echo "  macOS: brew install postgresql"
        echo "  Linux: apt-get install postgresql-client"
        exit 1
    fi
}

# Function to test database connection
test_connection() {
    echo -e "${YELLOW}Testing database connection...${NC}"
    if psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Database connection successful${NC}"
        echo ""
    else
        echo -e "${RED}✗ Database connection failed${NC}"
        echo "Check your DATABASE_URL and network connection"
        exit 1
    fi
}

# Main script
main() {
    check_psql
    test_connection

    local migration_arg=${1:-all}
    local migrations_dir="db/migrations"

    if [ "$migration_arg" == "all" ]; then
        # Run all migrations in order
        echo -e "${BLUE}Running all migrations...${NC}"
        echo ""

        for migration_file in "$migrations_dir"/[0-9][0-9][0-9]_*.sql; do
            if [ -f "$migration_file" ]; then
                run_migration "$migration_file" || exit 1
                echo ""
            fi
        done

        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}All migrations completed successfully!${NC}"
        echo -e "${GREEN}========================================${NC}"

    elif [ "$migration_arg" == "rollback" ]; then
        # Run rollback for latest migration
        local latest_down=$(ls -r "$migrations_dir"/[0-9][0-9][0-9]_*.down.sql 2>/dev/null | head -1)
        if [ -z "$latest_down" ]; then
            echo -e "${RED}No rollback migrations found${NC}"
            exit 1
        fi

        echo -e "${YELLOW}Warning: Rolling back latest migration${NC}"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" == "yes" ]; then
            run_migration "$latest_down"
        else
            echo "Rollback cancelled"
        fi

    else
        # Run specific migration
        local migration_file="$migrations_dir/${migration_arg}_*.sql"

        # Find matching file
        local files=("$migrations_dir/${migration_arg}"_*.sql)
        if [ ! -f "${files[0]}" ]; then
            echo -e "${RED}Error: Migration ${migration_arg} not found${NC}"
            echo "Available migrations:"
            ls "$migrations_dir"/[0-9][0-9][0-9]_*.sql 2>/dev/null | sed 's|.*/||'
            exit 1
        fi

        run_migration "${files[0]}"
    fi
}

# Show usage if help requested
if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    echo "Usage: $0 [migration_number|all|rollback]"
    echo ""
    echo "Examples:"
    echo "  $0           # Run all migrations"
    echo "  $0 all       # Run all migrations"
    echo "  $0 001       # Run migration 001"
    echo "  $0 rollback  # Rollback latest migration"
    echo ""
    echo "Available migrations:"
    ls db/migrations/[0-9][0-9][0-9]_*.sql 2>/dev/null | sed 's|.*/||' || echo "  (none)"
    exit 0
fi

# Run main script
main "$@"
