# GitHub Actions Workflows

This directory contains automated workflows for processing analytics data.

## Workflows

### `process-ip-geolocation.yml`

Automatically enriches pageview records with geographic data (country and city) based on IP addresses.

**Schedule:** Manual only (automated schedule disabled until testing is complete)

**What it does:**
1. Downloads/caches GeoIP databases from MaxMind
2. Processes records with missing country/city data
3. Updates the database with geographic information

**Manual trigger:** Go to Actions tab → "Process IP Geolocation" → "Run workflow"

**After testing:** Uncomment the schedule section in the workflow to run every 2 hours automatically

## Setup Instructions

### 1. Create GitHub Secret

Go to your repository → **Settings** → **Secrets and variables** → **Actions** → **Secrets** tab

Create:
- **Name:** `SUPABASE_PSQL_DB_PASSWORD`
- **Value:** Your Supabase database password

### 2. Create GitHub Variables

Go to your repository → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab

Create these 4 variables:

| Variable Name | Value | Where to Find |
|---------------|-------|---------------|
| `SUPABASE_PSQL_DB_HOST` | `aws-0-us-east-1.pooler.supabase.com` | Supabase Dashboard → Project Settings → Database → Connection pooling host |
| `SUPABASE_PSQL_DB_NAME` | `postgres` | Usually `postgres` |
| `SUPABASE_PSQL_DB_USER` | `postgres.your-project-ref` | Supabase Dashboard → Connection string |
| `MAXMIND_LICENSE_KEY` | Your MaxMind license key | Sign up at https://www.maxmind.com/en/geolite2/signup |

### 3. Get MaxMind License Key

1. Go to https://www.maxmind.com/en/geolite2/signup
2. Create a free account
3. Log in and go to **Account** → **Manage License Keys**
4. Click **Generate new license key**
5. Name it `github-actions`
6. Select **No** for "Will this key be used for GeoIP Update?"
7. Copy the license key and add it as a GitHub variable

### 4. Enable Workflows

Workflows are automatically enabled when you push this directory to GitHub.

You can also manually trigger them:
1. Go to the **Actions** tab in your GitHub repository
2. Select the workflow you want to run
3. Click **Run workflow**

## Monitoring

### View Workflow Runs

1. Go to the **Actions** tab in your GitHub repository
2. Click on a workflow name to see all runs
3. Click on a specific run to see detailed logs

### Download Logs

Workflow logs are automatically uploaded as artifacts and kept for 7 days:
1. Go to a workflow run
2. Scroll to **Artifacts** section at the bottom
3. Download `ip-geolocation-logs-<run-number>`

## Troubleshooting

### Workflow fails with "Cache miss"

This is normal on the first run. The workflow will download the GeoIP databases (~70 MB) and cache them for future runs.

### Workflow fails with "Database connection error"

Check that your GitHub secrets and variables are set correctly:
- Secret: `SUPABASE_PSQL_DB_PASSWORD`
- Variables: `SUPABASE_PSQL_DB_HOST`, `SUPABASE_PSQL_DB_NAME`, `SUPABASE_PSQL_DB_USER`

### Workflow fails with "MaxMind download error"

Check that `MAXMIND_LICENSE_KEY` variable is set correctly and the license key is still valid.

### Update GeoIP Databases

MaxMind releases new databases monthly. To force a refresh:

1. Edit `.github/workflows/process-ip-geolocation.yml`
2. Change the cache key (line 37): `geoip-2024-12` → `geoip-2025-01`
3. Commit and push

The next run will download fresh databases.

## Testing Process

### Phase 1: Manual Testing

1. Set up GitHub secrets and variables (see Setup Instructions above)
2. Push the workflow to GitHub
3. Manually trigger the workflow from the Actions tab
4. Check the logs to verify it runs successfully
5. Verify that IP addresses in your database now have country/city data
6. Check your analytics dashboard to confirm geographic data appears correctly

### Phase 2: Enable Automation

Once testing is successful:

1. Edit `.github/workflows/process-ip-geolocation.yml`
2. Uncomment lines 4-7:
   ```yaml
   schedule:
     # Run every 2 hours
     - cron: '0 */2 * * *'
   ```
3. Commit and push
4. The workflow will now run automatically every 2 hours

## Cost

GitHub Actions provides:
- **Public repositories:** Unlimited minutes
- **Private repositories:** 2,000 minutes/month free

Each workflow run takes ~15-30 seconds (after first run with cache).

**With 2-hour schedule:**
- Runs: 12 per day × 30 days = 360 runs/month
- Time: ~30 seconds per run = 180 minutes/month
- **Usage: ~9% of the free tier** ✅

**With 30-minute schedule (if needed later):**
- Runs: 48 per day × 30 days = 1,440 runs/month
- Time: ~30 seconds per run = 720 minutes/month
- **Usage: ~36% of the free tier**
