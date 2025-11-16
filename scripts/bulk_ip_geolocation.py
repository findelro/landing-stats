#!/usr/bin/env python
"""
Bulk IP Geolocation Utility

This script processes IP geolocation in bulk for maximum performance:
1. Exports all records (id, ip) to CSV using PostgreSQL COPY
2. Processes all records offline (MaxMind GeoIP lookups)
3. Creates temporary table with geolocation data
4. Single bulk UPDATE from temp table to live table

Performance: ~10-100x faster than row-by-row processing

Usage:
    python scripts/bulk_ip_geolocation.py              # Incremental (NULL values only)
    python scripts/bulk_ip_geolocation.py --force      # Full refresh (all records)
    python scripts/bulk_ip_geolocation.py --limit 10000  # Test run
    python scripts/bulk_ip_geolocation.py --dry-run     # Preview only
"""

import os
import sys
import time
import argparse
import csv
from pathlib import Path
from loguru import logger
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
import geoip2.database
from geoip2.errors import AddressNotFoundError
import ipaddress

# Load environment variables from .env.local (preferred) or .env (fallback)
env_local = Path('.env.local')
if env_local.exists():
    load_dotenv('.env.local')
else:
    load_dotenv()

# Configure logger
logger.add("logs/bulk_ip_geolocation.log", rotation="10 MB", retention="1 month")

# GeoLite2 database paths
DB_DIRECTORY = Path("resources/geoip")
COUNTRY_DB_PATH = DB_DIRECTORY / "GeoLite2-Country.mmdb"

# Standard codes for unknown values
UNKNOWN_COUNTRY = "ZZ"  # Reserved code for unknown or unspecified countries


def validate_databases():
    """Validate that GeoIP database exists."""
    if not COUNTRY_DB_PATH.exists():
        logger.error(f"GeoIP country database not found at {COUNTRY_DB_PATH}")
        logger.error("Please download from: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data")
        return False

    logger.info(f"GeoIP database validated: {COUNTRY_DB_PATH}")
    return True


def is_valid_ip(ip_str):
    """Check if the string is a valid IP address."""
    if not ip_str:
        return False
    try:
        ipaddress.ip_address(ip_str)
        return True
    except ValueError:
        return False


def lookup_ip_location(ip_str, country_reader):
    """Get country information for an IP address."""
    if not is_valid_ip(ip_str):
        return UNKNOWN_COUNTRY

    country = UNKNOWN_COUNTRY

    # Get country information
    try:
        response = country_reader.country(ip_str)
        country = response.country.iso_code if response.country.iso_code else UNKNOWN_COUNTRY
    except AddressNotFoundError:
        pass
    except Exception as e:
        logger.debug(f"Error looking up country for IP {ip_str}: {e}")

    return country


def bulk_process(limit=None, dry_run=False, force=False):
    """
    Bulk process IP geolocation.

    Args:
        limit: Maximum number of records to process
        dry_run: If True, process but don't update database
        force: If True, reprocess ALL records (not just NULL values)

    Steps:
    1. Extract all IPs to process
    2. Process in memory (MaxMind GeoIP lookups)
    3. Create temp table
    4. Bulk UPDATE from temp table
    """

    start_time = time.time()

    # Validate GeoIP databases
    if not validate_databases():
        logger.error("GeoIP database validation failed")
        return False

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

        export_file = "/tmp/ip_geolocation_export.csv"

        # Build WHERE clause based on force flag
        if force:
            # Force mode: process ALL records with IPs
            where_clause = "WHERE ip IS NOT NULL"
        else:
            # Incremental mode: only process records with NULL country values
            where_clause = "WHERE ip IS NOT NULL AND country IS NULL"

        copy_query = f"""
            COPY (
                SELECT id, ip
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
            return True

        # Close connection after export (will reconnect later)
        logger.info("Closing connection (offline processing starting)...")
        conn.close()

        # Step 2: Process CSV file and write results to new CSV
        logger.info("Step 2: Processing CSV file with GeoIP lookups...")

        # Open GeoIP reader
        country_reader = geoip2.database.Reader(str(COUNTRY_DB_PATH))

        processed_file = "/tmp/ip_geolocation_processed.csv"

        batch_size = 10000
        processed_count = 0
        unknown_country_count = 0

        with open(export_file, 'r', encoding='utf-8') as infile, \
             open(processed_file, 'w', encoding='utf-8', newline='') as outfile:

            reader = csv.reader(infile)
            writer = csv.writer(outfile)

            # Skip header from input, write header to output
            next(reader)
            writer.writerow(['id', 'country'])

            for i, row in enumerate(reader):
                record_id, ip = row

                # Lookup geolocation
                country = lookup_ip_location(ip, country_reader)

                # Track unknowns
                if country == UNKNOWN_COUNTRY:
                    unknown_country_count += 1

                # Write processed row
                writer.writerow([
                    record_id,
                    country or ''
                ])

                processed_count += 1

                # Progress logging
                if processed_count % batch_size == 0:
                    elapsed = time.time() - start_time
                    progress = processed_count / total_records
                    estimated_total = elapsed / progress
                    remaining = estimated_total - elapsed
                    logger.info(f"Processed {processed_count}/{total_records} ({progress:.1%}) - {remaining/60:.1f} min remaining")

        # Close GeoIP reader
        country_reader.close()

        processing_time = time.time() - start_time
        logger.info(f"Processing completed in {processing_time:.1f}s ({processed_count/processing_time:.0f} records/sec)")
        logger.info(f"Unknown countries: {unknown_country_count}")

        if dry_run:
            logger.info("DRY RUN: Skipping database update")
            logger.info(f"Processed file: {processed_file}")
            # Show first few lines
            with open(processed_file, 'r') as f:
                lines = [next(f) for _ in range(min(4, processed_count + 1))]
                logger.info(f"Sample data:\\n{''.join(lines)}")
            return True

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
            CREATE TEMPORARY TABLE temp_ip_geolocation (
                id BIGINT PRIMARY KEY,
                country TEXT
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
                'temp_ip_geolocation',
                sep=',',
                null='',
                columns=['id', 'country']
            )

        logger.info(f"Inserted {processed_count} records into temp table using COPY FROM")

        # Step 5: Bulk UPDATE from temp table
        logger.info("Step 5: Bulk updating main table...")

        update_start = time.time()

        cur.execute("""
            UPDATE metrics_page_views AS m
            SET country = COALESCE(NULLIF(t.country, ''), m.country)
            FROM temp_ip_geolocation AS t
            WHERE m.id = t.id
        """)

        conn.commit()

        update_time = time.time() - update_start
        total_time = time.time() - start_time

        logger.info(f"Bulk update completed in {update_time:.1f}s")
        logger.info(f"TOTAL TIME: {total_time:.1f}s ({total_records/total_time:.0f} records/sec)")
        logger.info(f"Successfully processed {total_records} records!")

        return True

    finally:
        if conn and not conn.closed:
            conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='Bulk IP geolocation for maximum performance',
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
        logger.info("BULK IP GEOLOCATION")
        logger.info("=" * 60)

        if args.dry_run:
            logger.info("DRY RUN MODE: No database changes will be made")

        if args.force:
            logger.info("FORCE MODE: Reprocessing ALL records (including already geolocated)")

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
