-- Performance Profiling: AFTER Migration 001
-- Run this AFTER executing 001_add_performance_indexes.sql and 002_vacuum_and_analyze.sql
-- Purpose: Measure performance improvements
-- Compare with perf_before.sql output to see improvements

\echo '========================================='
\echo 'PERFORMANCE RESULTS - AFTER MIGRATION'
\echo '========================================='
\echo ''

-- ===========================================================================
-- 1. Table and Index Sizes (After)
-- ===========================================================================
\echo '1. Table and Index Sizes (After)'
\echo '--------------------------------'

SELECT
  pg_size_pretty(pg_total_relation_size('metrics_page_views')) as total_size,
  pg_size_pretty(pg_relation_size('metrics_page_views')) as table_size,
  pg_size_pretty(pg_total_relation_size('metrics_page_views') - pg_relation_size('metrics_page_views')) as indexes_size,
  (SELECT COUNT(*) FROM metrics_page_views) as total_rows;

\echo ''
\echo 'Expected change: indexes_size should increase by ~80-100 MB'
\echo ''

-- ===========================================================================
-- 2. New Indexes Created
-- ===========================================================================
\echo '2. All Indexes (Should see 5 new idx_metrics_* indexes)'
\echo '--------------------------------------------------------'

SELECT
  schemaname,
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as times_used
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname = 'metrics_page_views'
ORDER BY indexrelname;

\echo ''

-- ===========================================================================
-- 3. Table Statistics (After VACUUM)
-- ===========================================================================
\echo '3. Table Statistics (After VACUUM)'
\echo '----------------------------------'

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
\echo 'Expected: dead_row_pct should be < 1%'
\echo ''

-- ===========================================================================
-- 4. Test Query 1: Domain Stats (Should use index now)
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
\echo 'Expected: Index Scan using idx_metrics_timestamp_device_domain'
\echo 'Expected: Execution time < 200 ms (was 5,000-10,000 ms)'
\echo ''

-- ===========================================================================
-- 5. Test Query 2: Country Stats (Should use index now)
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
\echo 'Expected: Index Scan using idx_metrics_timestamp_country'
\echo 'Expected: Execution time < 200 ms'
\echo ''

-- ===========================================================================
-- 6. Test Query 3: Referrer Stats (Should use index now)
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
\echo 'Expected: Index Scan using idx_metrics_timestamp_referrer'
\echo 'Expected: Execution time < 200 ms'
\echo ''

-- ===========================================================================
-- 7. Cache Hit Ratio (After)
-- ===========================================================================
\echo '7. Cache Hit Ratio (After)'
\echo '--------------------------'
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
-- 8. Index Usage Statistics
-- ===========================================================================
\echo '8. Index Usage Statistics'
\echo '-------------------------'
\echo 'Shows how many times each index has been used'
\echo ''

SELECT
  indexrelname as index_name,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname = 'metrics_page_views'
  AND indexrelname LIKE 'idx_metrics_%'
ORDER BY idx_scan DESC;

\echo ''
\echo 'Note: If times_used is 0, indexes may need time to be used in production'
\echo ''

-- ===========================================================================
-- 9. Performance Comparison Summary
-- ===========================================================================
\echo '9. Performance Improvement Summary'
\echo '-----------------------------------'

WITH query_stats AS (
  SELECT
    'Domain Stats (7 days)' as query_type,
    (SELECT COUNT(*) FROM metrics_page_views
     WHERE timestamp >= NOW() - INTERVAL '7 days'
       AND device_normalized != 'Bot') as rows_matching
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
  rows_matching,
  '< 200 ms' as expected_execution_time,
  'Index Scan' as expected_scan_type
FROM query_stats;

\echo ''

-- ===========================================================================
-- FINAL SUMMARY
-- ===========================================================================
\echo '========================================='
\echo 'MIGRATION SUCCESS CRITERIA'
\echo '========================================='
\echo ''
\echo 'Check the following:'
\echo ''
\echo '✓ 5 new indexes created (idx_metrics_*)'
\echo '✓ Dead row percentage < 1%'
\echo '✓ All queries show "Index Scan" or "Bitmap Index Scan"'
\echo '✓ Execution times < 200 ms (down from 5,000-10,000 ms)'
\echo '✓ Cache hit ratio > 99%'
\echo '✓ Index sizes total ~80-100 MB'
\echo ''
\echo 'Expected Performance Improvement:'
\echo '  Before: 5,000-10,000 ms (Sequential Scans)'
\echo '  After:  50-200 ms (Index Scans)'
\echo '  Speedup: 25-100x faster'
\echo ''
\echo 'If any criteria failed, review the output above for details.'
\echo ''
