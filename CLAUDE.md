# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js analytics dashboard similar to Umami that displays and compares analytics across multiple domains. It uses Supabase as the backend database to store page views and metrics data.

The project serves a dual purpose:
1. **Analytics Dashboard** - Track and visualize pageviews and custom events across a portfolio of landing page domains
2. **Domain Portfolio Management** - The database also contains domain inventory, contracts, WHOIS data, and other portfolio management tables (not directly used by the analytics UI)

### Current Focus Areas
- Optimizing data processing and presentation on the web interface
- Creating new presentation pages for custom event analytics (`metrics_events` table)
- Implementing archiving mechanisms for domains that are expired or sold
- Building GitHub workflow scripts for server-side bulk data manipulation

## Core Architecture

### Frontend Stack
- **Next.js 15** with TypeScript and App Router
- **Tailwind CSS** for styling  
- **React 18** with client-side components for interactive features
- **Dynamic imports** for map components to prevent SSR hydration issues

### Backend Integration
- **Supabase** (PostgreSQL) for database operations
- **Supabase RPC functions** - Database queries use stored procedures (e.g., `get_dashboard_data`) for efficient data aggregation
- **API Routes** in `app/api/` handle data fetching with parameterized queries
- **Server-side rendering** for initial page loads with client-side data fetching
- **MCP Server** - Supabase MCP server available for direct database operations during development

### Key Data Flow
1. Client components fetch data from Next.js API routes
2. API routes query Supabase using the service key
3. Database queries use SQL functions for normalization and COALESCE for null handling
4. All "null" values display as "Other" across the UI for consistency

## Common Commands

### Development
```bash
npm run dev          # Start development server on localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint with Next.js config
```

### Installation
```bash
npm install                    # Standard install
npm install --legacy-peer-deps  # For Vercel deployment (use if install fails)
```

## Project Structure

### Core Directories
- `app/` - Next.js 13+ App Router pages and API routes
- `components/` - Reusable React components
- `lib/` - Utilities, types, configuration, and database client
- `scripts/` - Server-side scripts for data processing, archiving, and GitHub workflow automation

### Key Files
- `app/page.tsx` - Main dashboard with all analytics sections
- `app/domain/page.tsx` - Domain-specific detailed view
- `lib/supabase.ts` - Database client with 30s statement timeout
- `lib/types.ts` - TypeScript interfaces for all data structures
- `lib/config.ts` - Application configuration constants
- `middleware.ts` - Next.js middleware for request handling

### Components Architecture
- **StatsCard** - Container wrapper for all data sections
- **TableWithPercentage** - Main data display component with pagination
- **DateRangePicker** - Date filtering with bot inclusion toggle
- **VectorMap** - Interactive world map (dynamically imported, no SSR)
- **Header** - Navigation component

## Database Schema

### Analytics Tables

**`metrics_page_views`** (403K+ rows, RLS enabled) - Primary analytics table for pageview tracking:
- `id` - bigint (primary key, auto-increment)
- `domain`, `path` - URL components
- `domain_normalized` - Standardized domain name
- `referrer`, `referrer_normalized` - Traffic sources
- `browser_normalized`, `os_normalized`, `device_normalized` - User agent data
- `country`, `city`, `ip` - Geographic data
- `timestamp` - Event time (timestamptz)
- `user_agent` - Raw browser string
- `from_backend` - Boolean flag for bot detection

**`metrics_events`** (60 rows) - Custom event tracking:
- `id` - bigint (primary key, auto-increment)
- `domain` - Domain where event occurred
- `event_type` - Type of custom event tracked
- `timestamp` - Event time (timestamptz)
- `user_agent` - Browser information
- `ip` - Visitor IP address

### Domain Portfolio Tables

The database also contains domain portfolio management tables:
- `domains_on_afternic` (663 rows) - Domain listings with pricing, status, expiration dates
- `domain_contracts` / `domain_contract_payments` - Sales and lease tracking
- `domain_audit` - DNS provider and IP address tracking
- `whois_data` - Domain registration information
- `site_verification_google` - Google Search Console verification
- And others for checkout links, comparables, estimates, etc.

**Note:** Portfolio tables are not directly used by the analytics dashboard but share the same Supabase instance.

## Environment Variables

Required in `.env.local`:
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_SERVICE_KEY}
```

## Planned Features & Roadmap

### Event Analytics Dashboard
- Create new UI pages to visualize `metrics_events` data
- Display event types, frequencies, and trends over time
- Enable filtering and drill-down by domain and event type

### Data Archiving Strategy
- Implement archiving for metrics from domains that are no longer controlled (expired or sold)
- Archive criteria: domains marked as expired or found in `domains_under_contract` with status 'completed'
- Preserve historical data while keeping active metrics table performant
- Design archive table structure and migration scripts

### GitHub Workflow Automation
- Create server-side scripts for bulk data operations
- Schedule automated archiving jobs
- Data cleanup and optimization tasks
- Integration with domain portfolio status changes

## Development Notes

### Git Commit Best Practices
- **NEVER use `git add -A` or `git add .`** - This is unprofessional and adds unrelated files
- **ALWAYS add specific files only**: `git add path/to/file1 path/to/file2`
- **Example**: `git add components/BrowserIcon.tsx lib/api.ts` (NOT `git add -A`)
- Review what files are being committed with `git status` before committing

### Data Consistency
- All unknown/null values display as "Other" throughout the UI
- Database queries use COALESCE to standardize null handling
- Percentage calculations are done server-side in SQL

### Performance Considerations
- API routes include query timeouts (30s) to prevent hanging requests
- Map components use dynamic imports to avoid SSR issues
- Table pagination limits initial data loads for performance

### Code Patterns
- Client components use `'use client'` directive for interactivity
- API routes follow REST patterns with type query parameters
- Error boundaries and loading states are implemented consistently
- TypeScript interfaces define all data structures in `lib/types.ts`

## Working with Database Operations

### MCP Server Tools
The Supabase MCP server provides direct database access with these key operations:
- `mcp__supabase__list_tables` - View all tables and their schemas
- `mcp__supabase__execute_sql` - Run SELECT queries for data analysis
- `mcp__supabase__apply_migration` - Create database migrations for DDL changes
- `mcp__supabase__get_advisors` - Check for security/performance issues

### Scripts Directory
Server-side scripts in `scripts/` are designed to:
- Run via GitHub Actions workflows for scheduled tasks
- Perform bulk data operations (archiving, cleanup, aggregation)
- Integrate with domain portfolio status changes
- Should use environment variables for Supabase credentials
- Include error handling and logging for automated execution