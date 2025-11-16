#!/usr/bin/env python
"""
Bulk User Agent Normalization Utility

This script processes user agent normalization in bulk for maximum performance:
1. Exports all records (id, user_agent, referrer, domain) to memory/file
2. Processes all records offline (no database locks)
3. Creates temporary table with normalized data
4. Single bulk UPDATE from temp table to live table

Bot Detection:
- Uses 711 Matomo bot patterns from resources/matomo/bots.yml (traditional crawlers)
- PLUS custom patterns for programmatic clients (curl, axios, python-requests, etc.)
- Custom patterns checked FIRST (19 patterns - fast), then Matomo (711 patterns)
- For bots: Sets is_bot=true, browser/os/device set to NULL (don't store bot lies)
- For users: Sets is_bot=false, populates browser/os/device with actual values
- Original user_agent string always preserved for reference

Performance: ~10-100x faster than row-by-row processing
Estimated time: 400K records in 5-15 minutes (vs 6-7 hours)

Usage:
    python scripts/bulk_normalize_user_agents.py              # Full run
    python scripts/bulk_normalize_user_agents.py --limit 10000  # Test run
    python scripts/bulk_normalize_user_agents.py --dry-run     # Preview only
"""

import os
import sys
import time
import argparse
import re
import yaml
import csv
from pathlib import Path
from loguru import logger
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from ua_parser import user_agent_parser
from tld import get_fld
from tld.exceptions import TldDomainNotFound, TldBadUrl

# Load environment variables from .env.local (preferred) or .env (fallback)
env_local = Path('.env.local')
if env_local.exists():
    load_dotenv('.env.local')
else:
    load_dotenv()

# Configure logger
logger.add("logs/bulk_normalize_user_agents.log", rotation="10 MB", retention="1 month")


def load_matomo_bot_patterns():
    """Load bot detection patterns from Matomo's bots.yml file."""
    script_dir = Path(__file__).parent
    possible_paths = [
        script_dir.parent / "resources" / "matomo" / "bots.yml",
        script_dir / "resources" / "matomo" / "bots.yml",
        Path("resources") / "matomo" / "bots.yml",
    ]

    bots_yml_path = None
    for path in possible_paths:
        if path.exists():
            bots_yml_path = path
            break

    if not bots_yml_path:
        logger.error(f"Matomo bots.yml not found!")
        return [re.compile(r'bot', re.IGNORECASE)]

    try:
        with open(bots_yml_path, 'r', encoding='utf-8') as f:
            bots_data = yaml.safe_load(f)

        bot_patterns = []
        for bot in bots_data:
            if 'regex' in bot:
                try:
                    pattern = re.compile(bot['regex'], re.IGNORECASE)
                    bot_patterns.append(pattern)
                except re.error:
                    continue

        logger.info(f"Loaded {len(bot_patterns)} bot patterns from Matomo")
        return bot_patterns

    except Exception as e:
        logger.error(f"Error loading Matomo bot patterns: {e}")
        return [re.compile(r'bot', re.IGNORECASE)]


BOT_PATTERNS = load_matomo_bot_patterns()

# Custom patterns for programmatic clients that Matomo doesn't catch
# These are clearly automated tools/bots, not real users
PROGRAMMATIC_CLIENT_PATTERNS = [
    re.compile(r'\bcurl/', re.IGNORECASE),
    re.compile(r'\bwget/', re.IGNORECASE),
    re.compile(r'\bpython-requests/', re.IGNORECASE),
    re.compile(r'\baxios/', re.IGNORECASE),
    re.compile(r'\bokhttp/', re.IGNORECASE),
    re.compile(r'\bGo-http-client/', re.IGNORECASE),
    re.compile(r'\bJava/\d', re.IGNORECASE),
    re.compile(r'\bDart/\d', re.IGNORECASE),
    re.compile(r'\bnode-fetch/', re.IGNORECASE),
    re.compile(r'\bApache-HttpClient/', re.IGNORECASE),
    re.compile(r'\bPython-urllib/', re.IGNORECASE),
    re.compile(r'\bPython/\d.*aiohttp/', re.IGNORECASE),
    re.compile(r'\bAnyConnect', re.IGNORECASE),
    re.compile(r'\bOpenVAS', re.IGNORECASE),
    re.compile(r'\bDalvik/', re.IGNORECASE),  # Android system client, not real user
    re.compile(r'\bScanner\b', re.IGNORECASE),
    re.compile(r'\bScraper\b', re.IGNORECASE),
    re.compile(r'\bEmailAutodiscovery', re.IGNORECASE),
    re.compile(r'\bWinRM', re.IGNORECASE),
]


def is_bot(user_agent_string):
    """Check if user agent is a bot using both custom programmatic client detection and Matomo patterns.

    Performance optimization: Check our 19 targeted patterns first (fast!), then fall back to
    Matomo's 711 patterns only if needed. Our patterns catch common programmatic clients
    (curl, axios, python-requests) that Matomo misses.
    """
    if not user_agent_string:
        return False

    # Check programmatic clients FIRST (19 patterns - fast!)
    # These catch curl, axios, python-requests, etc. that Matomo misses
    if any(pattern.search(user_agent_string) for pattern in PROGRAMMATIC_CLIENT_PATTERNS):
        return True

    # Fall back to Matomo patterns (711 patterns - comprehensive)
    # These catch traditional crawlers like Googlebot, Bingbot, etc.
    if any(pattern.search(user_agent_string) for pattern in BOT_PATTERNS):
        return True

    return False


def normalize_user_agent(user_agent_string):
    """Normalize user agent to browser, OS, device, and bot flag.

    Returns:
        tuple: (browser, os, device, is_bot)
        - For bots: (None, None, None, True) - browser/os/device set to NULL (don't store bot lies)
        - For users: (browser, os, device, False) - populated values
        - For empty: (None, None, None, False)

    Note: We don't store browser/os/device for bots because:
    - Bots can lie about their browser/OS
    - We filter out bots anyway (include_bots=false by default)
    - Storing 3 TEXT fields with potentially fake data is wasteful
    - The is_bot flag is sufficient to identify bots
    """
    if not user_agent_string:
        return None, None, None, False

    # Check if bot FIRST (before parsing)
    bot_detected = is_bot(user_agent_string)

    # For bots, return NULLs immediately (don't waste time parsing)
    if bot_detected:
        return None, None, None, True

    try:
        parsed_ua = user_agent_parser.Parse(user_agent_string)

        # Extract and normalize (simplified version - use full logic from populate_normalized_stats.py)
        browser_family = parsed_ua['user_agent']['family']
        os_family = parsed_ua['os']['family']
        device_family = parsed_ua['device']['family']

        # Basic normalization (TODO: copy full logic from populate_normalized_stats.py)
        browser = browser_family if browser_family and browser_family != 'Other' else None
        os_name = os_family if os_family and os_family != 'Other' else None

        # Simple device detection
        ua_lower = user_agent_string.lower()
        if 'mobile' in ua_lower or 'phone' in ua_lower:
            device = 'Mobile'
        elif 'tablet' in ua_lower or 'ipad' in ua_lower:
            device = 'Tablet'
        else:
            device = 'Desktop'

        # Return parsed values for real users
        return browser, os_name, device, False

    except Exception as e:
        logger.error(f"Error normalizing UA: {e}")
        return None, None, None, False


def normalize_referrer(referrer):
    """Normalize referrer to domain."""
    if not referrer:
        return None
    try:
        domain = get_fld(referrer, fail_silently=True)
        if domain and domain not in {'localhost', '127.0.0.1', 'dropcatch.com'}:
            return domain.lower()
    except:
        pass
    return None


def normalize_domain(domain):
    """Normalize domain string."""
    if not domain:
        return None

    domain = domain.strip().lower()
    for prefix in ['http://', 'https://', 'ftp://']:
        if domain.startswith(prefix):
            domain = domain[len(prefix):]

    domain = domain.split('/')[0].split('?')[0].split('#')[0]

    try:
        normalized = get_fld('http://' + domain, fail_silently=True)
        return normalized.lower() if normalized else domain
    except:
        return domain


def bulk_process(limit=None, dry_run=False, force=False):
    """
    Bulk process user agent normalization.

    Args:
        limit: Maximum number of records to process
        dry_run: If True, process but don't update database
        force: If True, reprocess ALL records (not just NULL values)

    Steps:
    1. Extract all records to process
    2. Process in memory (fast!)
    3. Create temp table
    4. Bulk UPDATE from temp table
    """

    start_time = time.time()

    # Connect to database
    conn = psycopg2.connect(
        host=os.getenv('SUPABASE_PSQL_DB_HOST'),
        dbname=os.getenv('SUPABASE_PSQL_DB_NAME'),
        user=os.getenv('SUPABASE_PSQL_DB_USER'),
        password=os.getenv('SUPABASE_PSQL_DB_PASSWORD'),
        port=5432,
        sslmode='require'
    )

    try:
        cur = conn.cursor()

        # Step 1: Extract records to CSV using PostgreSQL COPY (fastest export)
        logger.info("Step 1: Extracting records using PostgreSQL COPY TO...")

        export_file = "/tmp/user_agents_export.csv"

        # Build WHERE clause based on force flag
        if force:
            # Force mode: process ALL records
            where_clause = "WHERE 1=1"
        else:
            # Incremental mode: only process records with NULL normalized values
            where_clause = """WHERE (
                    (user_agent IS NOT NULL AND (
                        browser_normalized IS NULL OR
                        os_normalized IS NULL OR
                        device_normalized IS NULL
                    )) OR
                    (referrer IS NOT NULL AND referrer_normalized IS NULL) OR
                    (domain IS NOT NULL AND domain_normalized IS NULL)
                )"""

        copy_query = f"""
            COPY (
                SELECT id, user_agent, referrer, domain
                FROM metrics_page_views
                {where_clause}
                ORDER BY timestamp DESC
                {f'LIMIT {limit}' if limit else ''}
            ) TO STDOUT WITH CSV HEADER
        """

        with open(export_file, 'w', encoding='utf-8') as f:
            cur.copy_expert(copy_query, f)

        logger.info(f"Exported data to {export_file}")

        # Count records
        with open(export_file, 'r', encoding='utf-8') as f:
            total_records = sum(1 for line in f) - 1  # Subtract header

        logger.info(f"Found {total_records} records to process")

        if total_records == 0:
            logger.info("No records to process!")
            return

        # Step 2: Process CSV file and write results to new CSV
        logger.info("Step 2: Processing CSV file...")

        import csv as csv_module
        processed_file = "/tmp/user_agents_processed.csv"

        batch_size = 10000
        processed_count = 0

        with open(export_file, 'r', encoding='utf-8') as infile, \
             open(processed_file, 'w', encoding='utf-8', newline='') as outfile:

            reader = csv_module.reader(infile)
            writer = csv_module.writer(outfile)

            # Skip header from input, write header to output
            next(reader)
            writer.writerow(['id', 'browser_normalized', 'os_normalized', 'device_normalized',
                           'referrer_normalized', 'domain_normalized', 'is_bot'])

            for i, row in enumerate(reader):
                record_id, user_agent, referrer, domain = row

                # Process user agent
                if user_agent:
                    browser, os_name, device, is_bot_flag = normalize_user_agent(user_agent)
                else:
                    browser, os_name, device, is_bot_flag = None, None, None, False

                # Process referrer
                referrer_norm = normalize_referrer(referrer) if referrer else None

                # Process domain
                domain_norm = normalize_domain(domain) if domain else None

                # Write processed row
                writer.writerow([
                    record_id,
                    browser or '',
                    os_name or '',
                    device or '',
                    referrer_norm or '',
                    domain_norm or '',
                    'true' if is_bot_flag else 'false'  # PostgreSQL boolean format
                ])

                processed_count += 1

                # Progress logging
                if processed_count % batch_size == 0:
                    elapsed = time.time() - start_time
                    progress = processed_count / total_records
                    estimated_total = elapsed / progress
                    remaining = estimated_total - elapsed
                    logger.info(f"Processed {processed_count}/{total_records} ({progress:.1%}) - {remaining/60:.1f} min remaining")

        processing_time = time.time() - start_time
        logger.info(f"Processing completed in {processing_time:.1f}s ({processed_count/processing_time:.0f} records/sec)")

        if dry_run:
            logger.info("DRY RUN: Skipping database update")
            logger.info(f"Processed file: {processed_file}")
            # Show first few lines
            with open(processed_file, 'r') as f:
                lines = [next(f) for _ in range(min(4, processed_count + 1))]
                logger.info(f"Sample data:\n{''.join(lines)}")
            return

        # Close connection after offline processing to prevent timeout
        logger.info("Closing connection (offline processing complete)...")
        conn.close()

        # Reconnect for database update phase
        logger.info("Reconnecting to database for update phase...")
        conn = psycopg2.connect(
            host=os.getenv('SUPABASE_PSQL_DB_HOST'),
            dbname=os.getenv('SUPABASE_PSQL_DB_NAME'),
            user=os.getenv('SUPABASE_PSQL_DB_USER'),
            password=os.getenv('SUPABASE_PSQL_DB_PASSWORD'),
            port=5432,
            sslmode='require'
        )
        cur = conn.cursor()

        # Step 3: Create temporary table
        logger.info("Step 3: Creating temporary table...")

        cur.execute("""
            CREATE TEMPORARY TABLE temp_normalized_data (
                id BIGINT PRIMARY KEY,
                browser_normalized TEXT,
                os_normalized TEXT,
                device_normalized TEXT,
                referrer_normalized TEXT,
                domain_normalized TEXT,
                is_bot BOOLEAN
            )
        """)

        # Step 4: Bulk insert using PostgreSQL COPY FROM (fastest method)
        logger.info("Step 4: Bulk inserting using PostgreSQL COPY FROM...")

        with open(processed_file, 'r', encoding='utf-8') as f:
            # Skip header
            next(f)
            # Use COPY FROM - PostgreSQL's fastest bulk insert
            cur.copy_from(
                f,
                'temp_normalized_data',
                sep=',',
                null='',
                columns=['id', 'browser_normalized', 'os_normalized', 'device_normalized',
                        'referrer_normalized', 'domain_normalized', 'is_bot']
            )

        logger.info(f"Inserted {processed_count} records into temp table using COPY FROM")

        # Step 5: Bulk UPDATE from temp table
        logger.info("Step 5: Bulk updating main table...")

        update_start = time.time()

        cur.execute("""
            UPDATE metrics_page_views AS m
            SET
                browser_normalized = CASE WHEN t.is_bot THEN NULL ELSE COALESCE(t.browser_normalized, m.browser_normalized) END,
                os_normalized = CASE WHEN t.is_bot THEN NULL ELSE COALESCE(t.os_normalized, m.os_normalized) END,
                device_normalized = CASE WHEN t.is_bot THEN NULL ELSE COALESCE(t.device_normalized, m.device_normalized) END,
                referrer_normalized = COALESCE(t.referrer_normalized, m.referrer_normalized),
                domain_normalized = COALESCE(t.domain_normalized, m.domain_normalized),
                is_bot = COALESCE(t.is_bot, m.is_bot)
            FROM temp_normalized_data AS t
            WHERE m.id = t.id
        """)

        conn.commit()

        update_time = time.time() - update_start
        total_time = time.time() - start_time

        logger.info(f"Bulk update completed in {update_time:.1f}s")
        logger.info(f"TOTAL TIME: {total_time:.1f}s ({total_records/total_time:.0f} records/sec)")
        logger.info(f"Successfully processed {total_records} records!")

    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='Bulk user agent normalization for maximum performance',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    parser.add_argument('--limit', type=int,
                       help='Limit number of records to process (for testing)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Process but do not update database')
    parser.add_argument('--force', action='store_true',
                       help='Force reprocess ALL records (not just NULL values)')

    args = parser.parse_args()

    try:
        logger.info("=" * 60)
        logger.info("BULK USER AGENT NORMALIZATION")
        logger.info("=" * 60)

        if args.dry_run:
            logger.info("DRY RUN MODE: No database changes will be made")

        if args.force:
            logger.info("FORCE MODE: Reprocessing ALL records (including already normalized)")

        bulk_process(limit=args.limit, dry_run=args.dry_run, force=args.force)

        return 0

    except KeyboardInterrupt:
        logger.warning("Process interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
