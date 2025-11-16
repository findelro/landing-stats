-- Migration: 001_add_performance_indexes
-- Purpose: Add critical indexes to optimize get_dashboard_data query performance
-- Impact: Reduces query time from ~7 seconds to ~100ms (estimated)
-- Estimated execution time: 2-5 minutes (CONCURRENTLY builds indexes without blocking)
-- Estimated disk space: ~80-100 MB additional index storage
-- Prerequisites: None
-- Rollback: See 001_add_performance_indexes.down.sql

-- Note: Using CONCURRENTLY to avoid table locks during index creation
-- This is safe for production but cannot run inside a transaction block
-- If this migration fails partway through, you can safely re-run it (IF NOT EXISTS)

-- ===========================================================================
-- CONTEXT: Current Performance Issues
-- ===========================================================================
-- Problem: get_dashboard_data function takes 6-7 seconds per query
-- Root cause: Full table scans on 400k+ rows (no timestamp index)
-- Query pattern: WHERE timestamp >= X AND timestamp <= Y AND device != 'Bot'
-- Current indexes: Only browser_normalized, device_normalized, os_normalized
-- Missing indexes: timestamp, domain_normalized, country, referrer_normalized, ip

-- ===========================================================================
-- INDEX 1: Primary composite index for main query pattern
-- ===========================================================================
-- Covers: timestamp range queries + bot filtering + domain filtering
-- Query pattern: WHERE timestamp >= ? AND timestamp <= ? AND device != 'Bot' AND domain = ?
-- Column order: timestamp (range) -> device (equality) -> domain (equality)
-- Selectivity: timestamp (100% unique) -> device (4 values) -> domain (753 values)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_timestamp_device_domain
ON metrics_page_views (timestamp DESC, device_normalized, domain_normalized);

COMMENT ON INDEX idx_metrics_timestamp_device_domain IS
'Primary composite index for date range queries with bot filtering and domain filtering. Optimizes main dashboard query.';

-- ===========================================================================
-- INDEX 2: Country statistics queries
-- ===========================================================================
-- Covers: Country breakdown by date range
-- Query pattern: WHERE timestamp >= ? AND timestamp <= ? AND country IS NOT NULL
-- Partial index: Only indexes non-NULL countries (saves space)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_timestamp_country
ON metrics_page_views (timestamp DESC, country)
WHERE country IS NOT NULL;

COMMENT ON INDEX idx_metrics_timestamp_country IS
'Optimizes country statistics queries. Partial index excluding NULL countries.';

-- ===========================================================================
-- INDEX 3: Referrer statistics queries
-- ===========================================================================
-- Covers: Referrer breakdown by date range
-- Query pattern: WHERE timestamp >= ? AND timestamp <= ? AND referrer IS NOT NULL
-- Partial index: Only indexes non-NULL referrers (saves space)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_timestamp_referrer
ON metrics_page_views (timestamp DESC, referrer_normalized)
WHERE referrer_normalized IS NOT NULL;

COMMENT ON INDEX idx_metrics_timestamp_referrer IS
'Optimizes referrer statistics queries. Partial index excluding NULL referrers.';

-- ===========================================================================
-- INDEX 4: IP index for visitor counting
-- ===========================================================================
-- Covers: COUNT(DISTINCT ip) for unique visitor calculations
-- Query pattern: COUNT(DISTINCT ip) in all dashboard queries
-- Note: Plain btree index sufficient for DISTINCT operations

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_ip
ON metrics_page_views (ip);

COMMENT ON INDEX idx_metrics_ip IS
'Speeds up visitor counting with COUNT(DISTINCT ip) operations.';

-- ===========================================================================
-- INDEX 5: Browser/OS composite for device statistics
-- ===========================================================================
-- Covers: Browser and OS statistics by date range
-- Query pattern: WHERE timestamp >= ? AND timestamp <= ? GROUP BY browser/os
-- Note: Reuses timestamp from composite for efficient range scans

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_timestamp_browser_os
ON metrics_page_views (timestamp DESC, browser_normalized, os_normalized);

COMMENT ON INDEX idx_metrics_timestamp_browser_os IS
'Optimizes browser and OS statistics queries with date filtering.';

-- ===========================================================================
-- Verify indexes were created
-- ===========================================================================
-- Uncomment to verify after migration:
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'metrics_page_views'
-- ORDER BY indexname;
