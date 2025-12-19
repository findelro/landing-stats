#!/usr/bin/env python
"""
Bulk User Agent Normalization Utility

This script processes user agent normalization in bulk for maximum performance:
1. Exports all records (id, user_agent, referrer, domain) to memory/file
2. Processes all records offline (no database locks)
3. Creates temporary table with normalized data
4. Single bulk UPDATE from temp table to live table

Bot Detection:
- Uses 149 custom bot signatures from resources/custom_bots.yml
  (programmatic clients, monitoring tools, automation frameworks, etc.)
- PLUS 711 Matomo bot patterns from resources/matomo/bots.yml (traditional crawlers)
- Custom signatures checked FIRST (fast substring matching), then Matomo (regex patterns)
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


def load_custom_bot_signatures():
    """Load custom bot signatures from custom_bots.yml file.

    Returns list of lowercase signature strings for case-insensitive substring matching.
    """
    script_dir = Path(__file__).parent
    possible_paths = [
        script_dir.parent / "resources" / "custom_bots.yml",
        script_dir / "resources" / "custom_bots.yml",
        Path("resources") / "custom_bots.yml",
    ]

    custom_bots_path = None
    for path in possible_paths:
        if path.exists():
            custom_bots_path = path
            break

    if not custom_bots_path:
        logger.error(f"Custom bots.yml not found!")
        return ['bot']  # Fallback to basic 'bot' signature

    try:
        with open(custom_bots_path, 'r', encoding='utf-8') as f:
            custom_data = yaml.safe_load(f)

        signatures = custom_data.get('bot_signatures', [])
        # Convert to lowercase for case-insensitive matching
        signatures_lower = [sig.lower() for sig in signatures]

        logger.info(f"Loaded {len(signatures_lower)} custom bot signatures")
        return signatures_lower

    except Exception as e:
        logger.error(f"Error loading custom bot signatures: {e}")
        return ['bot']  # Fallback


# Load bot detection data at module initialization
MATOMO_BOT_PATTERNS = load_matomo_bot_patterns()
CUSTOM_BOT_SIGNATURES = load_custom_bot_signatures()


def is_bot(user_agent_string):
    """Check if user agent is a bot using custom signatures and Matomo patterns.

    Performance optimization: Check our 149 custom signatures first (fast substring matching),
    then fall back to Matomo's 711 regex patterns only if needed.

    Custom signatures catch programmatic clients (curl, axios, python-requests),
    monitoring tools (datadog, prometheus), automation (playwright, puppeteer),
    and other non-human traffic that Matomo patterns may miss.
    """
    if not user_agent_string:
        return False

    # Convert to lowercase once for case-insensitive matching
    ua_lower = user_agent_string.lower()

    # Check custom signatures FIRST (149 signatures - fast substring matching!)
    # These catch programmatic clients, monitoring tools, automation, etc.
    for signature in CUSTOM_BOT_SIGNATURES:
        if signature in ua_lower:
            return True

    # Fall back to Matomo patterns (711 regex patterns - comprehensive)
    # These catch traditional crawlers like Googlebot, Bingbot, etc.
    for pattern in MATOMO_BOT_PATTERNS:
        if pattern.search(user_agent_string):
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

        # Consolidate Chrome variants into single "Chrome" entry
        if browser in ['Chrome Mobile', 'Chrome Mobile iOS', 'Chrome Mobile WebView', 'Google', 'Chromium']:
            browser = 'Chrome'

        # Consolidate Safari variants into single "Safari" entry
        if browser in ['Mobile Safari', 'Safari Mobile', 'Mobile Safari UI/WKWebView']:
            browser = 'Safari'

        # Consolidate Opera variants into single "Opera" entry
        if browser in ['Opera Mini', 'Opera Mobile']:
            browser = 'Opera'

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


def get_table_columns(conn, table_name):
    """Query database to get list of columns in a table."""
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = %s
        ORDER BY ordinal_position
    """, (table_name,))
    columns = [row[0] for row in cur.fetchall()]
    cur.close()
    return columns


def process_table(table_name, limit=None, dry_run=False, force=False):
    """
    Process user agent normalization for a single table.

    Args:
        table_name: Name of table to process (metrics_page_views or metrics_events)
        limit: Maximum number of records to process
        dry_run: If True, process but don't update database
        force: If True, reprocess ALL records (not just NULL values)

    Returns:
        Number of records processed
    """
    logger.info(f"\n{'='*60}")
    logger.info(f"Processing table: {table_name}")
    logger.info(f"{'='*60}")

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

        # Detect which columns exist in this table
        all_columns = get_table_columns(conn, table_name)
        has_referrer = 'referrer' in all_columns and 'referrer_normalized' in all_columns
        has_domain_normalized = 'domain' in all_columns and 'domain_normalized' in all_columns

        logger.info(f"Table schema detected:")
        logger.info(f"  - user_agent normalization: ✓ (always)")
        logger.info(f"  - referrer normalization: {'✓' if has_referrer else '✗ (skipping)'}")
        logger.info(f"  - domain normalization: {'✓' if has_domain_normalized else '✗ (skipping)'}")

        # Step 1: Extract records to CSV using PostgreSQL COPY (fastest export)
        logger.info("Step 1: Extracting records using PostgreSQL COPY TO...")

        export_file = f"/tmp/user_agents_export_{table_name}.csv"

        # Build SELECT columns based on available fields
        select_columns = ['id', 'user_agent']
        if has_referrer:
            select_columns.append('referrer')
        if has_domain_normalized:
            select_columns.append('domain')

        # Build WHERE clause based on force flag and available columns
        if force:
            # Force mode: process ALL records
            where_clause = "WHERE 1=1"
        else:
            # Incremental mode: only process records with NULL normalized values
            conditions = ["""(user_agent IS NOT NULL AND (
                        browser_normalized IS NULL OR
                        os_normalized IS NULL OR
                        device_normalized IS NULL
                    ))"""]

            if has_referrer:
                conditions.append("(referrer IS NOT NULL AND referrer_normalized IS NULL)")

            if has_domain_normalized:
                conditions.append("(domain IS NOT NULL AND domain_normalized IS NULL)")

            where_clause = f"WHERE ({' OR '.join(conditions)})"

        copy_query = f"""
            COPY (
                SELECT {', '.join(select_columns)}
                FROM {table_name}
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
            logger.info(f"No records to process for {table_name}!")
            return 0

        # Step 2: Process CSV file and write results to new CSV
        logger.info("Step 2: Processing CSV file...")

        import csv as csv_module
        processed_file = f"/tmp/user_agents_processed_{table_name}.csv"

        batch_size = 10000
        processed_count = 0

        with open(export_file, 'r', encoding='utf-8') as infile, \
             open(processed_file, 'w', encoding='utf-8', newline='') as outfile:

            reader = csv_module.reader(infile)
            writer = csv_module.writer(outfile)

            # Skip header from input, write header to output based on available columns
            next(reader)
            output_columns = ['id', 'browser_normalized', 'os_normalized', 'device_normalized']
            if has_referrer:
                output_columns.append('referrer_normalized')
            if has_domain_normalized:
                output_columns.append('domain_normalized')
            output_columns.append('is_bot')
            writer.writerow(output_columns)

            for i, row in enumerate(reader):
                # Parse row based on what columns were selected
                record_id = row[0]
                user_agent = row[1] if len(row) > 1 else None

                # Parse optional columns based on their presence
                col_idx = 2
                referrer = None
                domain = None

                if has_referrer and len(row) > col_idx:
                    referrer = row[col_idx]
                    col_idx += 1

                if has_domain_normalized and len(row) > col_idx:
                    domain = row[col_idx]
                    col_idx += 1

                # Process user agent
                if user_agent:
                    browser, os_name, device, is_bot_flag = normalize_user_agent(user_agent)
                else:
                    browser, os_name, device, is_bot_flag = None, None, None, False

                # Process referrer (only if column exists)
                referrer_norm = normalize_referrer(referrer) if has_referrer and referrer else None

                # Process domain (only if column exists)
                domain_norm = normalize_domain(domain) if has_domain_normalized and domain else None

                # Write processed row (dynamically based on available columns)
                output_row = [
                    record_id,
                    browser or '',
                    os_name or '',
                    device or ''
                ]

                if has_referrer:
                    output_row.append(referrer_norm or '')

                if has_domain_normalized:
                    output_row.append(domain_norm or '')

                output_row.append('true' if is_bot_flag else 'false')  # PostgreSQL boolean format

                writer.writerow(output_row)

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
            return processed_count

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

        # Step 3: Create temporary table (dynamically based on available columns)
        logger.info("Step 3: Creating temporary table...")

        temp_columns = [
            "id BIGINT PRIMARY KEY",
            "browser_normalized TEXT",
            "os_normalized TEXT",
            "device_normalized TEXT"
        ]

        if has_referrer:
            temp_columns.append("referrer_normalized TEXT")

        if has_domain_normalized:
            temp_columns.append("domain_normalized TEXT")

        temp_columns.append("is_bot BOOLEAN")

        cur.execute(f"""
            CREATE TEMPORARY TABLE temp_normalized_data (
                {', '.join(temp_columns)}
            )
        """)

        # Step 4: Bulk insert using PostgreSQL COPY FROM (fastest method)
        logger.info("Step 4: Bulk inserting using PostgreSQL COPY FROM...")

        # Build column list for COPY FROM
        copy_columns = ['id', 'browser_normalized', 'os_normalized', 'device_normalized']
        if has_referrer:
            copy_columns.append('referrer_normalized')
        if has_domain_normalized:
            copy_columns.append('domain_normalized')
        copy_columns.append('is_bot')

        with open(processed_file, 'r', encoding='utf-8') as f:
            # Skip header
            next(f)
            # Use COPY FROM - PostgreSQL's fastest bulk insert
            cur.copy_from(
                f,
                'temp_normalized_data',
                sep=',',
                null='',
                columns=copy_columns
            )

        logger.info(f"Inserted {processed_count} records into temp table using COPY FROM")

        # Step 5: Bulk UPDATE from temp table (dynamically based on available columns)
        logger.info("Step 5: Bulk updating main table...")

        update_start = time.time()

        # Build SET clause dynamically
        set_clauses = [
            "browser_normalized = CASE WHEN t.is_bot THEN NULL ELSE COALESCE(t.browser_normalized, m.browser_normalized) END",
            "os_normalized = CASE WHEN t.is_bot THEN NULL ELSE COALESCE(t.os_normalized, m.os_normalized) END",
            "device_normalized = CASE WHEN t.is_bot THEN NULL ELSE COALESCE(t.device_normalized, m.device_normalized) END"
        ]

        if has_referrer:
            set_clauses.append("referrer_normalized = COALESCE(t.referrer_normalized, m.referrer_normalized)")

        if has_domain_normalized:
            set_clauses.append("domain_normalized = COALESCE(t.domain_normalized, m.domain_normalized)")

        set_clauses.append("is_bot = COALESCE(t.is_bot, m.is_bot)")

        cur.execute(f"""
            UPDATE {table_name} AS m
            SET
                {', '.join(set_clauses)}
            FROM temp_normalized_data AS t
            WHERE m.id = t.id
        """)

        conn.commit()

        update_time = time.time() - update_start
        total_time = time.time() - start_time

        logger.info(f"Bulk update completed in {update_time:.1f}s")
        logger.info(f"Table {table_name} completed in {total_time:.1f}s ({total_records/total_time:.0f} records/sec)")
        logger.info(f"Successfully processed {total_records} records!")

        return processed_count

    finally:
        if conn and not conn.closed:
            conn.close()


def bulk_process(limit=None, dry_run=False, force=False):
    """
    Bulk process user agent normalization for ALL tables.

    Args:
        limit: Maximum number of records to process PER TABLE
        dry_run: If True, process but don't update database
        force: If True, reprocess ALL records (not just NULL values)

    Steps:
    1. Extract all records to process from each table
    2. Process in memory (fast!)
    3. Create temp table per table
    4. Bulk UPDATE from temp table per table
    """
    start_time = time.time()

    try:
        total_processed = 0

        # Process metrics_page_views table
        count = process_table('metrics_page_views', limit, dry_run, force)
        total_processed += count

        # Process metrics_events table
        count = process_table('metrics_events', limit, dry_run, force)
        total_processed += count

        total_time = time.time() - start_time
        logger.info(f"\n{'='*60}")
        logger.info(f"OVERALL SUMMARY")
        logger.info(f"{'='*60}")
        logger.info(f"Total records processed across all tables: {total_processed}")
        logger.info(f"Total time: {total_time:.1f}s")
        if total_processed > 0:
            logger.info(f"Average rate: {total_processed/total_time:.0f} records/sec")
        logger.info(f"{'='*60}")

        return True

    except Exception as e:
        logger.error(f"Error in bulk_process: {e}")
        import traceback
        traceback.print_exc()
        return False


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

        success = bulk_process(limit=args.limit, dry_run=args.dry_run, force=args.force)

        return 0 if success else 1

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
