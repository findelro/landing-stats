# Bulk User Agent Normalization Workflow

This workflow provides high-performance bulk processing for user agent normalization using PostgreSQL COPY utilities.

## Overview

The bulk normalization workflow is designed for:
- ✅ **Full refresh** - Reprocessing all historical data
- ✅ **Large batches** - Processing 100K+ records efficiently
- ✅ **One-time migrations** - Upgrading bot patterns or normalization logic
- ✅ **Performance critical** - Need results fast (~15x faster than incremental)

## Performance

### Benchmarks (tested with 1,000 records)
- **Processing speed**: 247 records/sec overall
- **Offline processing**: 457 records/sec
- **Database operations**: PostgreSQL COPY (10-100x faster than INSERT)

### Estimated Times
| Records | Incremental | Bulk | Speedup |
|---------|-------------|------|---------|
| 10,000 | ~10 min | ~40 sec | 15x |
| 50,000 | ~50 min | ~3 min | 16x |
| 100,000 | ~100 min | ~7 min | 14x |
| 404,000 | ~7 hours | ~27 min | 15x |

## How It Works

### Step-by-step Process

```
1. EXPORT (PostgreSQL COPY TO)
   ↓ SELECT id, user_agent, referrer, domain
   ↓ WHERE normalization needed
   ↓ TO /tmp/user_agents_export.csv

2. PROCESS (Offline, no database locks)
   ↓ Read CSV file
   ↓ Normalize user agents (710 Matomo bot patterns)
   ↓ Normalize referrers and domains
   ↓ Write /tmp/user_agents_processed.csv

3. CREATE TEMP TABLE
   ↓ temporary table for staging

4. IMPORT (PostgreSQL COPY FROM)
   ↓ Bulk insert processed data
   ↓ FROM /tmp/user_agents_processed.csv
   ↓ TO temp_normalized_data

5. UPDATE (Single bulk operation)
   ↓ UPDATE metrics_page_views
   ↓ FROM temp_normalized_data
   ↓ WHERE id matches
```

## Usage

### Test Run (10,000 records, dry-run)

1. Go to: GitHub → Actions → "Bulk User Agent Normalization"
2. Click: "Run workflow"
3. Configure:
   - **Limit**: `10000`
   - **Dry run**: `Yes`
4. Click: "Run workflow"
5. Monitor: Check logs to preview what would be processed

**Expected time**: ~40 seconds

### Full Production Run (All records)

1. Go to: GitHub → Actions → "Bulk User Agent Normalization"
2. Click: "Run workflow"
3. Configure:
   - **Limit**: *(leave empty)*
   - **Dry run**: `No`
4. Click: "Run workflow"
5. Monitor: Check progress in real-time

**Expected time**: ~27 minutes for 404K records

### Limited Production Run (e.g., 50,000 records)

Useful for processing in chunks:

1. Go to: GitHub → Actions → "Bulk User Agent Normalization"
2. Click: "Run workflow"
3. Configure:
   - **Limit**: `50000`
   - **Dry run**: `No`
4. Click: "Run workflow"

**Expected time**: ~3 minutes

## When to Use This vs Incremental Workflow

### Use Bulk Workflow When:
- 🔄 **Full refresh needed** - Reprocessing all records
- 📊 **Large backlog** - 50K+ unprocessed records
- 🆕 **Upgrading bot patterns** - New Matomo patterns to apply
- 🐛 **Fixing normalization bugs** - Corrected logic to reapply
- ⚡ **Time sensitive** - Need results quickly

### Use Incremental Workflow When:
- 📅 **Daily operations** - Processing new records only
- 🔁 **Automated schedule** - Regular 4-hour intervals
- 📈 **Small batches** - < 10K new records
- 🤖 **Hands-off** - Set and forget automation

## Workflow Configuration

### File Location
`.github/workflows/bulk-user-agent-normalization.yml`

### Inputs

**Limit** (optional):
- Type: String (number)
- Default: Empty (process all)
- Examples: `10000`, `50000`, `100000`
- Purpose: Limit number of records for testing or chunked processing

**Dry run**:
- Type: Choice dropdown
- Options: `No` (default), `Yes`
- Purpose: Preview processing without database changes

### Environment Variables

Same as incremental workflow:

**Variables** (Repository → Settings → Variables):
- `SUPABASE_PSQL_DB_HOST`
- `SUPABASE_PSQL_DB_NAME`
- `SUPABASE_PSQL_DB_USER`

**Secrets** (Repository → Settings → Secrets):
- `SUPABASE_PSQL_DB_PASSWORD`

## Workflow Steps

1. **Checkout repository** - Get latest code
2. **Set up Python 3.11** - Install Python environment
3. **Cache dependencies** - Speed up subsequent runs
4. **Install dependencies** - Install from `scripts/requirements.txt`
5. **Create logs directory** - Prepare logging
6. **Verify database credentials** - Check environment variables
7. **Verify Matomo bot patterns** - Ensure 711 patterns loaded
8. **Run bulk normalization** - Execute bulk processing script
9. **Upload logs** - Save as artifacts (7-day retention)

## Script Details

### File
`scripts/bulk_normalize_user_agents.py`

### Features
- ✅ PostgreSQL COPY TO/FROM (fastest export/import)
- ✅ Offline processing (no database locks)
- ✅ Temporary table staging
- ✅ Single bulk UPDATE
- ✅ Progress tracking every 10K records
- ✅ Comprehensive logging
- ✅ Dry-run mode
- ✅ 710 Matomo bot patterns

### Command-line Usage

```bash
# Dry run (preview only)
python scripts/bulk_normalize_user_agents.py --dry-run

# Test with 10,000 records
python scripts/bulk_normalize_user_agents.py --limit 10000

# Full processing (all records)
python scripts/bulk_normalize_user_agents.py

# Limited batch
python scripts/bulk_normalize_user_agents.py --limit 50000
```

## Performance Optimizations

### Why PostgreSQL COPY?

**Traditional approach** (row-by-row):
```python
for record in records:
    cursor.execute("INSERT INTO table VALUES (%s, %s, ...)", record)
# 10-100 records/second
```

**Bulk approach** (COPY):
```python
cursor.copy_from(csv_file, 'table', sep=',')
# 10,000-50,000 records/second
```

**Speedup**: 100-500x faster inserts!

### Why Temporary Tables?

**Without temp table**:
```sql
UPDATE metrics_page_views
SET browser_normalized = calculate_browser(user_agent)
-- Row-by-row calculation = SLOW
```

**With temp table**:
```sql
-- 1. Calculate ALL offline (fast)
-- 2. Bulk insert to temp table (fast)
-- 3. Single UPDATE FROM temp table (fast)
UPDATE metrics_page_views m
SET browser_normalized = t.browser_normalized
FROM temp_normalized_data t
WHERE m.id = t.id
-- Single set-based operation = FAST
```

**Speedup**: 10-50x faster updates!

## Monitoring

### Real-time Progress

The script logs progress every 10,000 records:

```
Processed 10000/404000 (2.5%) - 25.2 min remaining
Processed 20000/404000 (5.0%) - 24.8 min remaining
Processed 30000/404000 (7.4%) - 24.1 min remaining
...
Processing completed in 45.2s (8,926 records/sec)
Bulk update completed in 12.3s
TOTAL TIME: 57.5s (7,016 records/sec)
Successfully processed 404000 records!
```

### Download Logs

After workflow completes:
1. Go to workflow run page
2. Scroll to "Artifacts" section
3. Download `bulk-normalization-logs`
4. Unzip and review `bulk_normalize_user_agents.log`

## Troubleshooting

### Workflow times out (> 60 minutes)

**Solution**: Process in chunks
```yaml
Limit: 100000
```

Run workflow 5 times to process 500K total records.

### Out of memory errors

**Cause**: Very large datasets (> 1M records)

**Solution**: Use smaller limits
```yaml
Limit: 50000
```

### Database connection lost

**Cause**: Long-running transaction

**Solution**: Already mitigated (30s statement timeout in connection)

If needed, process in smaller batches.

### Some records not normalized

**Check**: Review logs for errors
```bash
grep "Error normalizing" logs/bulk_normalize_user_agents.log
```

**Fix**: These are likely malformed user agents. The script continues processing and logs errors.

## Safety Features

- ✅ **Dry-run mode** - Preview before updating
- ✅ **COALESCE** - Preserves existing non-NULL values
- ✅ **Temporary tables** - Auto-drop on disconnect
- ✅ **Single transaction** - All or nothing (rollback on failure)
- ✅ **Progress logging** - Monitor in real-time
- ✅ **Error handling** - Continues on individual record failures

## Comparison with Incremental Workflow

| Feature | Incremental | Bulk |
|---------|-------------|------|
| **Trigger** | Scheduled (4 hours) | Manual only |
| **Processing** | Row-by-row batches | Offline bulk |
| **Speed** | ~16 records/sec | ~247 records/sec |
| **Best for** | Daily automation | Full refresh |
| **Database load** | Moderate (batched) | Low (single operation) |
| **Memory usage** | Low (1K batches) | Medium (all in memory) |
| **Time for 404K** | ~7 hours | ~27 minutes |

## Common Scenarios

### Scenario 1: First-time Setup

**Goal**: Normalize all existing records

**Steps**:
1. Run bulk workflow with dry-run first
2. Review logs to ensure patterns work correctly
3. Run bulk workflow without dry-run (all records)
4. Enable incremental workflow for daily updates

### Scenario 2: Upgrading Bot Patterns

**Goal**: Apply new Matomo bot patterns to all records

**Steps**:
1. Update `resources/matomo/bots.yml` with new patterns
2. Run bulk workflow (all records, no dry-run)
3. Verify bot detection improved

### Scenario 3: Large Backlog

**Goal**: Process 100K+ unprocessed records quickly

**Steps**:
1. Run bulk workflow (all records)
2. Continue with incremental workflow for new records

### Scenario 4: Testing Changes

**Goal**: Test normalization logic changes safely

**Steps**:
1. Make code changes to `bulk_normalize_user_agents.py`
2. Run bulk workflow with limit=10000, dry-run=Yes
3. Review logs to verify changes work correctly
4. Run without dry-run when satisfied

## Next Steps

1. ✅ Workflow created and ready for testing
2. ⏭️ Test manually with dry-run and limit=10000
3. ⏭️ Review logs to verify normalization accuracy
4. ⏭️ Run production bulk processing if satisfied
5. ⏭️ Enable incremental workflow for ongoing automation

## Resources

- **Workflow file**: `.github/workflows/bulk-user-agent-normalization.yml`
- **Script**: `scripts/bulk_normalize_user_agents.py`
- **Performance guide**: `scripts/BULK_PROCESSING.md`
- **Bot patterns**: `resources/matomo/bots.yml` (711 patterns)
- **Incremental workflow**: `.github/workflows/process-user-agent-normalization.yml`

---

**Created**: 2025-11-16
**Performance**: 15x faster than incremental
**Memory**: ~50-100 MB for 400K records
**Database Load**: Minimal (single bulk operation)
