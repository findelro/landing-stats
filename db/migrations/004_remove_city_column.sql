-- Migration 004: Remove city column (YAGNI cleanup)
--
-- Context: The city column was being populated from GeoIP lookups but never
-- used anywhere in the application (no queries, no API endpoints, no UI display).
-- Only country-level geolocation is actually used.
--
-- Benefits:
-- - Reduced storage usage
-- - Faster IP geolocation processing (no city lookups needed)
-- - Smaller GeoIP database cache (~61MB saved by removing City database)
-- - Cleaner codebase (YAGNI principle)
--
-- Related files changed:
-- - scripts/bulk_ip_geolocation.py (removed city lookups)
-- - scripts/populate_ip_geolocation.py (removed city lookups)
-- - lib/types.ts (removed city from PageView interface)
-- - .github/actions/setup-geoip/action.yml (removed City database handling)
--
-- Date: 2025-11-16
-- Author: Database optimization

-- Drop the city column from metrics_page_views table
ALTER TABLE metrics_page_views DROP COLUMN IF EXISTS city;

-- Verify the column was removed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'metrics_page_views'
        AND column_name = 'city'
    ) THEN
        RAISE EXCEPTION 'Failed to drop city column';
    ELSE
        RAISE NOTICE 'City column successfully removed from metrics_page_views';
    END IF;
END $$;
