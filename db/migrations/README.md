# Database Migrations

This directory contains SQL migration files for the landing-stats database.

## Migration Files

Migrations are numbered sequentially and follow this naming convention:
- `NNN_description.sql` - Forward migration
- `NNN_description.down.sql` - Rollback migration (if applicable)

## Current Migrations

### 001_add_performance_indexes.sql
**Purpose:** Add critical indexes to optimize dashboard query performance

**Impact:**
- Reduces query time from ~7 seconds to ~100ms (estimated 70x improvement)
- Adds ~80-100 MB of index storage
- Zero downtime (uses `CREATE INDEX CONCURRENTLY`)

**Indexes created:**
1. `idx_metrics_timestamp_device_domain` - Primary composite for date range + bot filtering
2. `idx_metrics_timestamp_country` - Country statistics (partial index)
3. `idx_metrics_timestamp_referrer` - Referrer statistics (partial index)
4. `idx_metrics_ip` - Visitor counting (DISTINCT ip)
5. `idx_metrics_timestamp_browser_os` - Browser/OS statistics

**Execution time:** 2-5 minutes

**Rollback:** `001_add_performance_indexes.down.sql`

### 002_vacuum_and_analyze.sql
**Purpose:** Clean up dead rows and update query planner statistics

**Impact:**
- Reclaims ~10-20 MB from dead row cleanup
- Updates statistics for optimal query planning
- Improves performance of newly created indexes

**Execution time:** 1-3 minutes

**Prerequisites:** Run after migration 001

**Rollback:** Not needed (VACUUM/ANALYZE are maintenance operations)

## How to Run Migrations

### Option 1: Using psql (Recommended for CONCURRENTLY operations)

```bash
# Set your database connection string
export DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"

# Run migration 001 (indexes)
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes.sql

# Run migration 002 (vacuum)
psql $DATABASE_URL -f db/migrations/002_vacuum_and_analyze.sql
```

### Option 2: Using Supabase CLI

```bash
# Migration 001
supabase db execute --file db/migrations/001_add_performance_indexes.sql

# Migration 002
supabase db execute --file db/migrations/002_vacuum_and_analyze.sql
```

### Option 3: Using node-postgres or MCP tool

```javascript
const { Client } = require('pg');
const fs = require('fs');

async function runMigration(filePath) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sql = fs.readFileSync(filePath, 'utf8');
  await client.query(sql);

  await client.end();
}

await runMigration('db/migrations/001_add_performance_indexes.sql');
await runMigration('db/migrations/002_vacuum_and_analyze.sql');
```

## Rolling Back Migrations

If you need to rollback migration 001 (remove indexes):

```bash
psql $DATABASE_URL -f db/migrations/001_add_performance_indexes.down.sql
```

**Warning:** Rolling back will significantly degrade query performance!

## Verifying Migrations

### Check that indexes were created:

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'metrics_page_views'
ORDER BY indexname;
```

### Check dead rows after VACUUM:

```sql
SELECT
  relname,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as dead_pct,
  pg_size_pretty(pg_total_relation_size('public.' || relname)) as total_size,
  last_vacuum,
  last_analyze
FROM pg_stat_user_tables
WHERE relname = 'metrics_page_views';
```

### Test query performance:

```sql
-- Before migration: ~6,900ms
-- After migration: ~100ms (expected)

EXPLAIN ANALYZE
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
```

Look for:
- ✅ "Index Scan" or "Bitmap Index Scan" (good - using indexes)
- ❌ "Seq Scan" (bad - full table scan)
- Execution time should be < 200ms

## Production Best Practices

### Before Running in Production:

1. **Backup your database**
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Check database load**
   - Run during low-traffic periods
   - Monitor CPU/memory during index creation

3. **Monitor progress**
   ```sql
   -- Check index creation progress
   SELECT
     now()::time,
     query,
     state,
     wait_event_type,
     wait_event
   FROM pg_stat_activity
   WHERE query LIKE '%CREATE INDEX%';
   ```

4. **Verify disk space**
   - Ensure ~100 MB free space for indexes
   - Check: `SELECT pg_size_pretty(pg_database_size(current_database()));`

### After Running:

1. **Monitor query performance**
   - Check dashboard load times
   - Review slow query logs
   - Use `EXPLAIN ANALYZE` on critical queries

2. **Monitor index usage**
   ```sql
   SELECT
     schemaname,
     tablename,
     indexname,
     idx_scan as index_scans,
     idx_tup_read as tuples_read,
     idx_tup_fetch as tuples_fetched
   FROM pg_stat_user_indexes
   WHERE tablename = 'metrics_page_views'
   ORDER BY idx_scan DESC;
   ```

3. **Watch for index bloat**
   - Run VACUUM regularly
   - Monitor dead tuple percentage
   - Consider autovacuum tuning if needed

## Troubleshooting

### Index creation fails or hangs:
- Check for blocking queries: `SELECT * FROM pg_stat_activity WHERE state != 'idle';`
- Check for locks: `SELECT * FROM pg_locks WHERE NOT granted;`
- Cancel if needed: `SELECT pg_cancel_backend(pid);`

### Out of disk space:
- Check space: `df -h`
- Free space: Drop old indexes first before creating new ones
- Consider running indexes one at a time

### VACUUM takes too long:
- Normal for large tables (1-3 minutes for 400k rows)
- Can be interrupted safely if needed
- Autovacuum will complete it later

## Migration History

| Migration | Applied | By | Notes |
|-----------|---------|----|----|
| 001 | TBD | - | Initial performance indexes |
| 002 | TBD | - | Initial vacuum/analyze |

## Future Migrations

To create a new migration:

1. Determine next number (e.g., 003)
2. Create forward migration: `003_description.sql`
3. Create rollback if applicable: `003_description.down.sql`
4. Update this README
5. Test locally before production
6. Update migration history table after applying
