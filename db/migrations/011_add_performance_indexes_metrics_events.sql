-- Migration: Add performance indexes to metrics_events table
-- Purpose: Optimize /actions page queries by adding critical indexes on timestamp and common query patterns
-- Issue: Sequential scans causing 300-400ms queries, causing page timeouts
-- Expected improvement: 95% reduction in query time (300ms -> 10-20ms per CTE)
-- Created: 2025-11-27

-- NOTE: Removed CONCURRENTLY for compatibility with transaction-based migration tools
-- Table locks will be brief due to small table size (~10K rows)

-- 1. CRITICAL: Add composite index on timestamp and is_bot
-- This is the primary filter used in ALL queries on /actions page
-- DESC order matches typical query patterns (most recent data first)
CREATE INDEX IF NOT EXISTS idx_metrics_events_timestamp_is_bot
ON metrics_events(timestamp DESC, is_bot);

-- 2. HIGH IMPACT: Add covering index for event_type aggregations
-- INCLUDE clause adds columns needed for the query without being part of the index key
-- Allows index-only scans (no table access needed)
CREATE INDEX IF NOT EXISTS idx_metrics_events_timestamp_event_type_covering
ON metrics_events(timestamp DESC, event_type)
INCLUDE (ip, is_bot);

-- 3. HIGH IMPACT: Add covering index for country aggregations
-- Optimizes country grouping queries with all needed columns
CREATE INDEX IF NOT EXISTS idx_metrics_events_timestamp_country_covering
ON metrics_events(timestamp DESC, country)
INCLUDE (ip, is_bot);

-- 4. MEDIUM IMPACT: Add covering index for browser aggregations
CREATE INDEX IF NOT EXISTS idx_metrics_events_timestamp_browser_covering
ON metrics_events(timestamp DESC, browser_normalized)
INCLUDE (ip, is_bot);

-- 5. MEDIUM IMPACT: Add covering index for OS aggregations
CREATE INDEX IF NOT EXISTS idx_metrics_events_timestamp_os_covering
ON metrics_events(timestamp DESC, os_normalized)
INCLUDE (ip, is_bot);

-- 6. MEDIUM IMPACT: Add covering index for device aggregations
CREATE INDEX IF NOT EXISTS idx_metrics_events_timestamp_device_covering
ON metrics_events(timestamp DESC, device_normalized)
INCLUDE (ip, is_bot);

-- 7. OPTIONAL: Partial index for most common query pattern (non-bot events)
-- This index is smaller and faster for the most common use case
CREATE INDEX IF NOT EXISTS idx_metrics_events_non_bot_events
ON metrics_events(timestamp DESC, event_type, country, browser_normalized, os_normalized, device_normalized)
WHERE is_bot = false OR is_bot IS NULL;

-- Run ANALYZE to update statistics after creating indexes
ANALYZE metrics_events;

-- Add comments for documentation
COMMENT ON INDEX idx_metrics_events_timestamp_is_bot IS 'Primary index for time-range queries with bot filtering';
COMMENT ON INDEX idx_metrics_events_timestamp_event_type_covering IS 'Covering index for event_type aggregations (index-only scan)';
COMMENT ON INDEX idx_metrics_events_timestamp_country_covering IS 'Covering index for country aggregations (index-only scan)';
COMMENT ON INDEX idx_metrics_events_timestamp_browser_covering IS 'Covering index for browser aggregations (index-only scan)';
COMMENT ON INDEX idx_metrics_events_timestamp_os_covering IS 'Covering index for OS aggregations (index-only scan)';
COMMENT ON INDEX idx_metrics_events_timestamp_device_covering IS 'Covering index for device aggregations (index-only scan)';
COMMENT ON INDEX idx_metrics_events_non_bot_events IS 'Partial index optimized for non-bot event queries';
