# Performance Profiling Guide

This guide explains how to use the before/after profiling scripts to measure the performance impact of migration 001.

## Overview

The profiling scripts help you:
1. **Establish baseline metrics** before the migration
2. **Measure improvements** after the migration
3. **Verify success** with concrete numbers
4. **Troubleshoot** if performance doesn't improve as expected

## Files

- `001_add_performance_indexes_perf_before.sql` - Run BEFORE migration
- `001_add_performance_indexes_perf_after.sql` - Run AFTER migration

## Step-by-Step Process

### Step 1: Capture Baseline (BEFORE)

Run this to establish baseline performance:

```bash
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes_perf_before.sql > before_results.txt
```

**What it measures:**
- Current table/index sizes
- Existing indexes
- Dead row statistics
- Query execution times (EXPLAIN ANALYZE)
- Scan types (Sequential vs Index)
- Cache hit ratios
- Buffer usage

**Expected baseline results:**
- ❌ Sequential (Seq Scan) table scans
- ❌ Execution time: 5,000-10,000 ms
- ❌ High buffer reads
- ❌ Dead rows: ~13%

**Save the output!** You'll compare it with the after results.

### Step 2: Run Migrations

```bash
# Create indexes (2-5 minutes)
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes.sql

# Clean up dead rows (1-3 minutes)
psql $DATABASE_URL -f db/migrations/002_vacuum_and_analyze.sql
```

### Step 3: Measure Improvements (AFTER)

Run this to measure the performance improvements:

```bash
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes_perf_after.sql > after_results.txt
```

**What it verifies:**
- 5 new indexes created
- Queries using indexes (not sequential scans)
- Execution times dramatically reduced
- Dead rows cleaned up
- Index usage statistics

**Expected results:**
- ✅ Index Scan or Bitmap Index Scan
- ✅ Execution time: 50-200 ms (was 5,000-10,000 ms)
- ✅ Dead rows: < 1%
- ✅ Cache hit ratio: > 99%

### Step 4: Compare Results

```bash
# View side-by-side comparison
diff -y before_results.txt after_results.txt | less

# Or use a diff tool
code --diff before_results.txt after_results.txt
```

## Key Metrics to Compare

### 1. Execution Time

**Before:**
```
Execution Time: 6920.089 ms
```

**After:**
```
Execution Time: 87.234 ms
```

**Improvement:** ~79x faster (6,920ms → 87ms)

### 2. Scan Type

**Before:**
```
->  Seq Scan on metrics_page_views
```

**After:**
```
->  Index Scan using idx_metrics_timestamp_device_domain
```

**Improvement:** Eliminated full table scan

### 3. Rows Scanned

**Before:**
```
Rows Removed by Filter: 201800
```

**After:**
```
Rows: 1234
```

**Improvement:** Scanning only matching rows (not entire table)

### 4. Index Size

**Before:**
```
indexes_size: 47 MB
```

**After:**
```
indexes_size: 127 MB
```

**Change:** +80 MB (expected cost for performance gain)

### 5. Dead Rows

**Before:**
```
dead_row_pct: 13.15%
```

**After:**
```
dead_row_pct: 0.12%
```

**Improvement:** Table bloat removed

## Understanding EXPLAIN ANALYZE Output

### Key Terms

**Seq Scan (Sequential Scan):**
- ❌ BAD: Reads entire table row-by-row
- Slow for large tables
- Happens when no suitable index exists

**Index Scan:**
- ✅ GOOD: Uses index to find matching rows
- Fast even for large tables
- Only reads matching rows

**Bitmap Index Scan:**
- ✅ GOOD: Uses index to build bitmap of matching rows
- Efficient for multiple conditions
- Good for large result sets

**Buffers:**
- `shared hit`: Data found in cache (fast)
- `shared read`: Data read from disk (slow)
- Goal: High hit ratio (> 99%)

### Example Output Explained

```
Index Scan using idx_metrics_timestamp_device_domain
  (cost=0.42..8234.56 rows=1234 width=26)
  (actual time=0.123..45.678 rows=1234 loops=1)
  Index Cond: ((timestamp >= '2025-11-08') AND (timestamp <= '2025-11-15'))
  Filter: (device_normalized <> 'Bot'::text)
  Rows Removed by Filter: 23
  Buffers: shared hit=456 read=12
Planning Time: 1.234 ms
Execution Time: 87.234 ms
```

**What this means:**
- ✅ Using index (not sequential scan)
- ✅ Found 1,234 matching rows
- ✅ Filtered only 23 rows (vs 201k before)
- ✅ 456 blocks from cache, only 12 from disk
- ✅ Total time: 87ms (vs 6,920ms before)

## Success Criteria

After running the migrations, verify:

### ✅ Indexes Created
```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'metrics_page_views'
  AND indexname LIKE 'idx_metrics_%';
```

Should return 5 new indexes:
- idx_metrics_timestamp_device_domain
- idx_metrics_timestamp_country
- idx_metrics_timestamp_referrer
- idx_metrics_ip
- idx_metrics_timestamp_browser_os

### ✅ Queries Use Indexes
All test queries should show:
- "Index Scan" or "Bitmap Index Scan"
- NOT "Seq Scan"

### ✅ Performance Improved
- Execution time reduced by 25-100x
- Under 200ms for dashboard queries

### ✅ Dead Rows Cleaned
- dead_row_pct < 1%

### ✅ Cache Hit Ratio
- cache_hit_ratio_pct > 99%

## Troubleshooting

### Issue: Queries still show "Seq Scan"

**Possible causes:**
1. Indexes not created successfully
2. ANALYZE not run (query planner doesn't know about indexes)
3. Query planner thinks Seq Scan is faster (small result set)

**Solutions:**
```sql
-- Verify indexes exist
\d metrics_page_views

-- Update statistics
ANALYZE metrics_page_views;

-- Force index usage (for testing)
SET enable_seqscan = off;
-- Run query
-- Then reset:
SET enable_seqscan = on;
```

### Issue: Performance not improved

**Possible causes:**
1. Not enough data in date range
2. Database still has high load
3. Indexes not yet in cache (first run after creation)

**Solutions:**
- Run query multiple times (first run may be slower)
- Check `pg_stat_activity` for blocking queries
- Verify date range has data: `SELECT COUNT(*) FROM metrics_page_views WHERE timestamp >= NOW() - INTERVAL '7 days'`

### Issue: Out of disk space

**Problem:** Index creation failed due to insufficient space

**Solution:**
1. Check disk usage: `df -h`
2. Free up space or increase volume size
3. Re-run migration (it's idempotent)

## Example: Reading the Results

Here's what good results look like:

### Before Migration (Baseline)
```
1. Table and Index Sizes
   total_size   | 183 MB
   indexes_size | 47 MB
   total_rows   | 403599

4. Query Performance Test #1: Domain Statistics
   Seq Scan on metrics_page_views
   Rows Removed by Filter: 201800
   Execution Time: 6920.089 ms

7. Cache Hit Ratio
   cache_hit_ratio_pct | 87.23
```

### After Migration (Improved)
```
1. Table and Index Sizes (After)
   total_size   | 263 MB
   indexes_size | 127 MB  ← +80 MB for new indexes
   total_rows   | 403599

4. Query Performance Test #1: Domain Statistics
   Index Scan using idx_metrics_timestamp_device_domain
   Rows Removed by Filter: 23  ← was 201,800!
   Execution Time: 87.234 ms   ← was 6,920 ms!

7. Cache Hit Ratio (After)
   cache_hit_ratio_pct | 99.84  ← improved from 87%

10. Scan Type Verification
    Domain Query:  ✓ Index Scan (GOOD)
    Country Query: ✓ Index Scan (GOOD)
    Referrer Query: ✓ Index Scan (GOOD)
```

**Summary:**
- ⚡ 79x faster (6,920ms → 87ms)
- 📊 Scanned 99.9% fewer rows (201k → 23)
- 💾 Cache hit improved (87% → 99.8%)
- ✅ All queries using indexes

## Saving Results for Documentation

```bash
# Create results directory
mkdir -p db/profiling_results

# Run before
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes_perf_before.sql \
  > db/profiling_results/before_$(date +%Y%m%d_%H%M%S).txt

# Run migrations
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes.sql
psql $DATABASE_URL -f db/migrations/002_vacuum_and_analyze.sql

# Run after
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes_perf_after.sql \
  > db/profiling_results/after_$(date +%Y%m%d_%H%M%S).txt

# Compare
diff -y db/profiling_results/before_*.txt db/profiling_results/after_*.txt | less
```

## Production Monitoring

After deploying to production, monitor these metrics over 24 hours:

```sql
-- Daily index usage check
SELECT
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE relname = 'metrics_page_views'
  AND indexrelname LIKE 'idx_metrics_%'
ORDER BY idx_scan DESC;

-- Daily dead row check
SELECT
  n_dead_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct
FROM pg_stat_user_tables
WHERE relname = 'metrics_page_views';
```

If dead_pct > 10%, run VACUUM again.

## Next Steps

1. ✅ Run before script and save output
2. ✅ Run migrations 001 and 002
3. ✅ Run after script and save output
4. ✅ Compare results
5. ✅ Verify success criteria met
6. ✅ Test dashboard in browser
7. ✅ Monitor production for 24 hours
8. ✅ Document results in git commit

Happy profiling! 🚀
