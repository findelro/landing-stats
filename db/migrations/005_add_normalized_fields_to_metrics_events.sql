-- Migration 005: Add normalized fields to metrics_events
--
-- Context: The metrics_events table tracks user actions/events on the site
-- (button clicks, form submissions, etc.) but lacks the normalized fields that
-- metrics_page_views has for analysis by country, browser, OS, and device.
--
-- This migration adds the same normalized fields that are populated by:
-- - Bulk IP Geolocation workflow (country)
-- - Bulk User Agent Normalization workflow (browser, OS, device)
--
-- Note: We do NOT add domain_normalized because domain is a server-side
-- parameter that can be validated/normalized at insertion time.
--
-- Date: 2025-11-16
-- Author: Database optimization

-- Add country field (populated by IP geolocation)
ALTER TABLE metrics_events ADD COLUMN IF NOT EXISTS country TEXT;

-- Add browser, OS, and device fields (populated by user agent normalization)
ALTER TABLE metrics_events ADD COLUMN IF NOT EXISTS browser_normalized TEXT;
ALTER TABLE metrics_events ADD COLUMN IF NOT EXISTS os_normalized TEXT;
ALTER TABLE metrics_events ADD COLUMN IF NOT EXISTS device_normalized TEXT;

-- Add comments to document the columns
COMMENT ON COLUMN metrics_events.country IS 'ISO 3166-1 alpha-2 country code (e.g., US, GB, ZZ for unknown). Populated by bulk IP geolocation workflow.';
COMMENT ON COLUMN metrics_events.browser_normalized IS 'Normalized browser name (e.g., Chrome, Firefox, Safari, Bot). Populated by bulk user agent normalization workflow.';
COMMENT ON COLUMN metrics_events.os_normalized IS 'Normalized operating system name (e.g., Windows, macOS, Linux, Android, iOS). Populated by bulk user agent normalization workflow.';
COMMENT ON COLUMN metrics_events.device_normalized IS 'Normalized device type (Desktop, Mobile, Tablet, Bot). Populated by bulk user agent normalization workflow.';

-- Verify columns were added
DO $$
DECLARE
    missing_columns TEXT[];
    required_columns TEXT[] := ARRAY['country', 'browser_normalized', 'os_normalized', 'device_normalized'];
    col TEXT;
BEGIN
    FOREACH col IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'metrics_events'
            AND column_name = col
        ) THEN
            missing_columns := array_append(missing_columns, col);
        END IF;
    END LOOP;

    IF array_length(missing_columns, 1) > 0 THEN
        RAISE EXCEPTION 'Failed to add columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE 'Successfully added normalized fields to metrics_events: %', array_to_string(required_columns, ', ');
    END IF;
END $$;
