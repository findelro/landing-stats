-- Performance Profiling: BEFORE Migration 001
-- Run this BEFORE executing 001_add_performance_indexes.sql
-- Purpose: Establish baseline performance metrics
-- Save the output to compare with perf_after.sql results

\echo '========================================='
\echo 'PERFORMANCE BASELINE - BEFORE MIGRATION'
\echo '========================================='
\echo ''

-- ===========================================================================
-- 1. Current Table and Index Sizes
-- ===========================================================================
\echo '1. Table and Index Sizes'
\echo '------------------------'

SELECT
  pg_size_pretty(pg_total_relation_size('metrics_page_views')) as total_size,
  pg_size_pretty(pg_relation_size('metrics_page_views')) as table_size,
  pg_size_pretty(pg_total_relation_size('metrics_page_views') - pg_relation_size('metrics_page_views')) as indexes_size,
  (SELECT COUNT(*) FROM metrics_page_views) as total_rows;

\echo ''

-- ===========================================================================
-- 2. Current Indexes
-- ===========================================================================
\echo '2. Existing Indexes'
\echo '-------------------'

SELECT
  schemaname,
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname = 'metrics_page_views'
ORDER BY indexrelname;

\echo ''

-- ===========================================================================
-- 3. Table Statistics (Dead Rows)
-- ===========================================================================
\echo '3. Table Statistics'
\echo '-------------------'

SELECT
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_row_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'metrics_page_views';

\echo ''

-- ===========================================================================
-- 4. Test Query 1: Domain Stats (Most Common Query)
-- ===========================================================================
\echo '4. Query Performance Test #1: Domain Statistics'
\echo '------------------------------------------------'
\echo 'Query: Date range + bot filtering + domain grouping'
\echo ''

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  domain_normalized AS domain,
  COUNT(*) AS views,
  COUNT(DISTINCT ip) AS visitors
FROM metrics_page_views
WHERE
  timestamp >= NOW() - INTERVAL '7 days'
  AND timestamp <= NOW()
  AND device_normalized != 'Bot'
GROUP BY domain_normalized
ORDER BY COUNT(*) DESC
LIMIT 50;

\echo ''
\echo 'Look for: Seq Scan (bad), execution time'
\echo ''

-- ===========================================================================
-- 5. Test Query 2: Country Stats
-- ===========================================================================
\echo '5. Query Performance Test #2: Country Statistics'
\echo '-------------------------------------------------'
\echo 'Query: Date range + country grouping'
\echo ''

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  country,
  COUNT(*) AS views,
  COUNT(DISTINCT ip) AS visitors
FROM metrics_page_views
WHERE
  timestamp >= NOW() - INTERVAL '7 days'
  AND timestamp <= NOW()
  AND country IS NOT NULL
GROUP BY country
ORDER BY COUNT(*) DESC
LIMIT 50;

\echo ''
\echo 'Look for: Seq Scan (bad), execution time'
\echo ''

-- ===========================================================================
-- 6. Test Query 3: Referrer Stats
-- ===========================================================================
\echo '6. Query Performance Test #3: Referrer Statistics'
\echo '--------------------------------------------------'
\echo 'Query: Date range + referrer grouping'
\echo ''

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  referrer_normalized AS referrer,
  COUNT(*) AS views,
  COUNT(DISTINCT ip) AS visitors
FROM metrics_page_views
WHERE
  timestamp >= NOW() - INTERVAL '7 days'
  AND timestamp <= NOW()
  AND referrer_normalized IS NOT NULL
GROUP BY referrer_normalized
ORDER BY COUNT(*) DESC
LIMIT 50;

\echo ''
\echo 'Look for: Seq Scan (bad), execution time'
\echo ''

-- ===========================================================================
-- 7. Cache Hit Ratio
-- ===========================================================================
\echo '7. Cache Hit Ratio'
\echo '------------------'
\echo 'Target: >99% (higher is better)'
\echo ''

SELECT
  'metrics_page_views' as table_name,
  heap_blks_read as heap_reads,
  heap_blks_hit as heap_hits,
  round(
    (heap_blks_hit::numeric / NULLIF(heap_blks_hit + heap_blks_read, 0)) * 100,
    2
  ) as cache_hit_ratio_pct
FROM pg_statio_user_tables
WHERE relname = 'metrics_page_views';

\echo ''

-- ===========================================================================
-- 8. Summary Statistics
-- ===========================================================================
\echo '8. Performance Summary'
\echo '----------------------'

WITH query_stats AS (
  SELECT
    'Domain Stats (7 days)' as query_type,
    (SELECT COUNT(*) FROM metrics_page_views
     WHERE timestamp >= NOW() - INTERVAL '7 days'
       AND device_normalized != 'Bot') as rows_scanned
  UNION ALL
  SELECT
    'Country Stats (7 days)',
    (SELECT COUNT(*) FROM metrics_page_views
     WHERE timestamp >= NOW() - INTERVAL '7 days'
       AND country IS NOT NULL)
  UNION ALL
  SELECT
    'Referrer Stats (7 days)',
    (SELECT COUNT(*) FROM metrics_page_views
     WHERE timestamp >= NOW() - INTERVAL '7 days'
       AND referrer_normalized IS NOT NULL)
)
SELECT
  query_type,
  rows_scanned,
  pg_size_pretty(rows_scanned * 100) as estimated_scan_size
FROM query_stats;

\echo ''
\echo '========================================='
\echo 'BASELINE METRICS CAPTURED'
\echo '========================================='
\echo ''
\echo 'Expected issues:'
\echo '  - Sequential (Seq Scan) table scans'
\echo '  - Execution time: 5,000-10,000 ms'
\echo '  - High buffer reads'
\echo '  - Rows scanned >> Rows returned'
\echo ''
\echo 'Next steps:'
\echo '  1. Run: 001_add_performance_indexes.sql'
\echo '  2. Run: 002_vacuum_and_analyze.sql'
\echo '  3. Run: 001_add_performance_indexes_perf_after.sql'
\echo '  4. Compare results!'
\echo ''
