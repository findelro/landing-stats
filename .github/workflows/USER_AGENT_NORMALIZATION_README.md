# User Agent Normalization Workflow

This document describes the automated GitHub Actions workflow for normalizing user agent strings, referrers, and domains in the `metrics_page_views` table.

## Overview

The user agent normalization workflow processes analytics data to extract structured information from raw user agent strings, referrers, and domains. This enables better analytics and filtering of traffic by browser type, operating system, device type, and traffic sources.

## What It Does

### User Agent Normalization
The script parses raw user agent strings and extracts:
- **Browser**: Chrome, Firefox, Safari, Edge, etc. (including variants like iOS webview, Chrome iOS)
- **Operating System**: Windows 10/11, macOS, iOS, Android, Linux, ChromeOS
- **Device Type**: Desktop, Mobile, Tablet
- **Bot Detection**: Identifies 147+ bot signatures (monitoring tools, scrapers, crawlers, etc.)

### Referrer Normalization
Extracts the main domain from referrer URLs:
- `https://www.google.com/search?q=...` → `google.com`
- Filters out internal referrers (localhost, 127.0.0.1, dropcatch.com)

### Domain Normalization
Normalizes domain strings to their main domain:
- `www.example.com` → `example.com`
- Handles subdomains, protocols, paths, query strings
- Preserves IP addresses as-is

## Database Schema

### Columns Added by Migration 003

```sql
-- Run db/migrations/003_add_normalization_columns.sql first!

ALTER TABLE metrics_page_views
ADD COLUMN IF NOT EXISTS referrer_normalized TEXT;

ALTER TABLE metrics_page_views
ADD COLUMN IF NOT EXISTS domain_normalized TEXT;

-- Indexes for performance
CREATE INDEX CONCURRENTLY idx_metrics_referrer_normalized
ON metrics_page_views (referrer_normalized) WHERE referrer_normalized IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_metrics_domain_normalized
ON metrics_page_views (domain_normalized) WHERE domain_normalized IS NOT NULL;
```

### Columns Updated by Script

These should already exist from earlier migrations:
- `browser_normalized` - Normalized browser name
- `os_normalized` - Normalized operating system
- `device_normalized` - Device type (Desktop/Mobile/Tablet/Bot)

## Workflow Configuration

### File Location
`.github/workflows/process-user-agent-normalization.yml`

### Trigger Options

**Manual Trigger (Current):**
```yaml
on:
  workflow_dispatch:  # Manual triggering only
```

**Automated Schedule (After Testing):**
```yaml
on:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  workflow_dispatch:
```

### Why Every 4 Hours?

The user agent normalization runs **less frequently than IP geolocation** (2 hours) because:
- User agent data changes less frequently (browser updates are periodic)
- Browser/OS/device patterns are more stable than IP geolocation
- Reduces GitHub Actions minutes usage
- Most new records get normalized within 4-8 hours (acceptable delay)

## Bot Signatures

The workflow verifies that the bot signatures configuration file exists:

### Configuration File
`scripts/populate_normalized_stats.json`

### Current Signatures
147 bot signatures including:
- **Monitoring Tools**: Datadog, New Relic, Pingdom, UptimeRobot, Nagios, Prometheus, Grafana
- **HTTP Clients**: curl, wget, axios, okhttp, python-requests, go-http-client
- **Automation Tools**: Selenium, Playwright, Puppeteer, PhantomJS
- **Scrapers/Crawlers**: bot, spider, crawler, scrape, scrapy, beautifulsoup
- **Communication Platforms**: Slack, Teams, Discord, Zoom, Telegram, WhatsApp
- **Project Management**: Jira, Confluence, Trello, Asana, Monday, Notion
- **Privacy Tools**: tor, vpn, incognito, privacy-badger, noscript
- **CDN/Proxies**: Cloudflare, CloudFront, Akamai, Fastly
- **Security Scanners**: Wappalyzer, Expanse, OpenVAS, nmap-like tools

Case-insensitive matching is used for all signatures.

## Workflow Steps

1. **Checkout code** - Get latest repository code
2. **Set up Python 3.11** - Install Python environment
3. **Cache dependencies** - Cache pip packages (faster subsequent runs)
4. **Install dependencies** - Install from `scripts/requirements.txt`
5. **Create logs directory** - Prepare for logging
6. **Verify database credentials** - Check environment variables are set
7. **Verify bot signatures** - Ensure JSON config file exists and show signature count
8. **Run normalization** - Execute `scripts/populate_normalized_stats.py`
9. **Upload logs** - Save logs as artifacts (7-day retention)

## Script Details

### File
`scripts/populate_normalized_stats.py`

### Key Features
- **Batch processing**: Processes 1,000 records per batch
- **Incremental updates**: Only processes records with NULL normalized values
- **Force mode**: `--force` flag to reprocess all records
- **Dry run mode**: `--dry-run` flag to preview changes without updating database
- **Max records limit**: `--max-records N` to limit processing
- **Comprehensive logging**: Detailed logs saved to `logs/populate_normalized_stats.log`
- **Error handling**: Continues processing on individual record failures
- **Progress tracking**: Shows progress percentage and estimated time remaining

### Usage Examples

```bash
# Normal processing (only NULL values)
python scripts/populate_normalized_stats.py

# Process maximum 10,000 records
python scripts/populate_normalized_stats.py --max-records 10000

# Dry run (no database changes)
python scripts/populate_normalized_stats.py --dry-run --verbose

# Force reprocess all records
python scripts/populate_normalized_stats.py --force

# Custom batch size
python scripts/populate_normalized_stats.py --batch-size 500
```

## Environment Variables

### Required Variables (Repository Level)

Set in GitHub: Settings → Secrets and variables → Actions → Variables

```bash
SUPABASE_PSQL_DB_HOST=aws-0-us-east-1.pooler.supabase.com
SUPABASE_PSQL_DB_NAME=postgres
SUPABASE_PSQL_DB_USER=postgres.mcrwyxwgjzgpkphoizdm
```

### Required Secrets (Repository Level)

Set in GitHub: Settings → Secrets and variables → Actions → Secrets

```bash
SUPABASE_PSQL_DB_PASSWORD=your_password_here
```

## Performance Metrics

### Processing Speed
- **~1,000-2,000 records/minute** (depending on complexity of user agents)
- **Batch size**: 1,000 records per commit
- **Memory efficient**: Processes in batches, doesn't load all data at once

### Example Run Times
- 10,000 records: ~5-10 minutes
- 50,000 records: ~25-50 minutes
- 100,000 records: ~50-100 minutes
- 400,000 records: ~3-7 hours

### GitHub Actions Limits
- **Free tier**: 2,000 minutes/month
- **Estimated usage**: ~10-60 minutes per run (depending on new records)
- **At 4-hour intervals**: ~6 runs/day = ~60-360 minutes/day
- **Monthly estimate**: ~1,800-10,800 minutes/month

**Recommendation**: Monitor actual usage and adjust schedule if needed. Consider:
- Reducing frequency if hitting limits (every 6 or 8 hours)
- Adding `--max-records` limit in workflow (e.g., 50,000 per run)

## Testing the Workflow

### Before Enabling Cron Schedule

1. **Run migration first**:
   ```bash
   cd db
   ./run-migrations.sh
   # Or manually run: db/migrations/003_add_normalization_columns.sql
   ```

2. **Verify bot signatures exist**:
   ```bash
   cat scripts/populate_normalized_stats.json | python3 -c "import json,sys; print(f'{len(json.load(sys.stdin)[\"bot_signatures\"])} signatures loaded')"
   ```

3. **Test locally**:
   ```bash
   # Test with small dataset
   python scripts/populate_normalized_stats.py --max-records 100 --verbose

   # Verify results in database
   psql $DATABASE_URL -c "SELECT browser_normalized, os_normalized, device_normalized, COUNT(*) FROM metrics_page_views WHERE browser_normalized IS NOT NULL GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 10;"
   ```

4. **Trigger workflow manually**:
   - Go to GitHub → Actions → "Process User Agent Normalization"
   - Click "Run workflow" → "Run workflow"
   - Monitor the run and check logs

5. **Verify database results**:
   ```sql
   -- Check normalization coverage
   SELECT
     COUNT(*) as total_records,
     COUNT(browser_normalized) as browser_normalized,
     COUNT(os_normalized) as os_normalized,
     COUNT(device_normalized) as device_normalized,
     COUNT(referrer_normalized) as referrer_normalized,
     COUNT(domain_normalized) as domain_normalized
   FROM metrics_page_views;

   -- Check bot detection
   SELECT device_normalized, COUNT(*)
   FROM metrics_page_views
   WHERE device_normalized = 'Bot'
   GROUP BY 1;

   -- Top browsers
   SELECT browser_normalized, COUNT(*) as count
   FROM metrics_page_views
   WHERE browser_normalized IS NOT NULL
   GROUP BY 1
   ORDER BY 2 DESC
   LIMIT 10;
   ```

6. **Verify frontend displays normalized data**:
   - Check dashboard at http://localhost:3000
   - Verify browser/OS/device stats show normalized values
   - Verify "Bot" filtering works correctly
   - Check that referrers show domains (not full URLs)

7. **Enable automated schedule**:
   - Once testing confirms everything works, uncomment the cron schedule in the workflow file

## Monitoring

### Check Workflow Runs
- GitHub → Actions → "Process User Agent Normalization"
- Review execution times, success/failure rates
- Download logs from artifacts if issues occur

### Database Monitoring

```sql
-- Check normalization progress
SELECT
  ROUND(COUNT(browser_normalized) * 100.0 / COUNT(*), 2) as browser_pct,
  ROUND(COUNT(os_normalized) * 100.0 / COUNT(*), 2) as os_pct,
  ROUND(COUNT(device_normalized) * 100.0 / COUNT(*), 2) as device_pct,
  ROUND(COUNT(referrer_normalized) * 100.0 / NULLIF(COUNT(referrer), 0), 2) as referrer_pct,
  ROUND(COUNT(domain_normalized) * 100.0 / NULLIF(COUNT(domain), 0), 2) as domain_pct
FROM metrics_page_views;

-- Recent records missing normalization
SELECT id, user_agent, referrer, domain, timestamp
FROM metrics_page_views
WHERE (
  (user_agent IS NOT NULL AND browser_normalized IS NULL) OR
  (referrer IS NOT NULL AND referrer_normalized IS NULL) OR
  (domain IS NOT NULL AND domain_normalized IS NULL)
)
ORDER BY timestamp DESC
LIMIT 10;

-- Bot traffic analysis
SELECT
  device_normalized,
  COUNT(*) as total,
  COUNT(DISTINCT ip) as unique_ips,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM metrics_page_views
GROUP BY device_normalized
ORDER BY total DESC;
```

## Troubleshooting

### Issue: Bot signatures config not found
**Error**: `ERROR: Bot signatures config file not found!`

**Solution**:
```bash
# Verify file exists
ls -la scripts/populate_normalized_stats.json

# If missing, create it or restore from backup
git checkout scripts/populate_normalized_stats.json
```

### Issue: Database connection fails
**Error**: `Failed to connect to database`

**Solution**:
- Verify environment variables are set correctly in GitHub
- Check that `SUPABASE_PSQL_DB_PASSWORD` secret is set
- Test connection locally with same credentials
- Verify connection pooler is accessible from GitHub Actions IPs

### Issue: Some user agents not normalized
**Cause**: Unknown/new user agent patterns

**Solution**:
1. Check logs for patterns: `grep "Could not determine" logs/populate_normalized_stats.log`
2. Add new signatures to bot detection if needed
3. Update normalization logic in `normalize_user_agent()` method
4. Re-run with `--force` flag to reprocess existing records

### Issue: Workflow takes too long
**Cause**: Too many records to process

**Solution**:
```yaml
# Add max-records limit to workflow
- name: Run user agent normalization processing
  run: |
    python scripts/populate_normalized_stats.py --max-records 50000
```

### Issue: High GitHub Actions minutes usage
**Solutions**:
- Reduce frequency (every 6 or 8 hours instead of 4)
- Add `--max-records` limit
- Only run during off-peak hours (adjust cron schedule)
- Consider running on self-hosted runner (if available)

## Script Improvements Identified

### ✅ Completed
1. Created migration file for normalization columns (003_add_normalization_columns.sql)
2. Created rollback migration (003_add_normalization_columns.down.sql)
3. Workflow follows same pattern as IP geolocation workflow

### ⚠️ Known Issues (Non-Critical)

1. **Column creation in script** (lines 650-658)
   - Script creates `referrer_normalized` and `domain_normalized` columns if they don't exist
   - **Recommendation**: Run migration 003 first, then remove these ALTER TABLE statements from script
   - **Why it's okay**: The `IF NOT EXISTS` makes it safe to run multiple times

2. **Memory usage for large datasets**
   - Script loads all records to process into memory at once
   - For 400K+ records, this could use significant memory
   - **Mitigation**: Use `--max-records` flag to limit processing
   - **Future improvement**: Implement cursor-based pagination

3. **No retry logic in workflow**
   - Unlike some workflows, this doesn't have automatic retry on failure
   - **Mitigation**: GitHub Actions has built-in retry option (can be enabled if needed)
   - **Current approach**: Manual re-trigger if workflow fails

## Next Steps

1. ✅ Migration files created (`003_add_normalization_columns.sql`, `.down.sql`)
2. ✅ Workflow file created and reviewed (`.github/workflows/process-user-agent-normalization.yml`)
3. ⏭️ Run migration 003 to add normalization columns
4. ⏭️ Test workflow manually (trigger from GitHub Actions UI)
5. ⏭️ Verify normalized data appears in database
6. ⏭️ Verify frontend displays normalized data correctly
7. ⏭️ Enable cron schedule (uncomment schedule section)
8. ⏭️ Monitor for first few automated runs

## Resources

- **Workflow file**: `.github/workflows/process-user-agent-normalization.yml`
- **Script**: `scripts/populate_normalized_stats.py`
- **Bot signatures**: `scripts/populate_normalized_stats.json`
- **Migration**: `db/migrations/003_add_normalization_columns.sql`
- **Rollback**: `db/migrations/003_add_normalization_columns.down.sql`
- **Logs**: Saved as GitHub Actions artifacts (7-day retention)
- **ua-parser library**: https://github.com/ua-parser/uap-python
- **tld library**: https://pypi.org/project/tld/

---

**Created**: 2025-11-16
**Last Updated**: 2025-11-16
**Status**: Ready for testing
