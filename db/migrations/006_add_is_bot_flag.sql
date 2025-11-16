-- Migration 006: Add is_bot flag to metrics tables
--
-- Context: Currently we identify bots by checking if normalized fields equal "Bot".
-- This is inefficient and stores redundant data. A boolean flag is cleaner, faster,
-- and allows us to preserve actual bot information in normalized fields.
--
-- Changes:
-- - Add is_bot BOOLEAN column to metrics_page_views
-- - Add is_bot BOOLEAN column to metrics_events
-- - Default to false for existing records (data migration happens separately)
--
-- Benefits:
-- - Cleaner queries: WHERE NOT is_bot vs WHERE device_normalized != 'Bot'
-- - More efficient: BOOLEAN (1 byte) vs TEXT comparison
-- - Better data: Can store actual bot info (e.g., "Googlebot") in normalized fields
-- - Universal: Single flag works for all filtering scenarios
--
-- Date: 2025-11-16
-- Author: Database optimization

-- Add is_bot flag to metrics_page_views
ALTER TABLE metrics_page_views
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false NOT NULL;

-- Add is_bot flag to metrics_events
ALTER TABLE metrics_events
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false NOT NULL;

-- Add comments to document the columns
COMMENT ON COLUMN metrics_page_views.is_bot IS 'True if this page view was from a bot/crawler. Populated by bulk user agent normalization workflow. Use for filtering: WHERE NOT is_bot.';
COMMENT ON COLUMN metrics_events.is_bot IS 'True if this event was from a bot/crawler. Populated by bulk user agent normalization workflow. Use for filtering: WHERE NOT is_bot.';

-- Create indexes for efficient bot filtering
CREATE INDEX IF NOT EXISTS idx_metrics_page_views_is_bot
ON metrics_page_views(is_bot)
WHERE is_bot = true;

CREATE INDEX IF NOT EXISTS idx_metrics_events_is_bot
ON metrics_events(is_bot)
WHERE is_bot = true;

-- Verify columns were added
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    -- Check metrics_page_views
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'metrics_page_views'
        AND column_name = 'is_bot'
    ) THEN
        missing_columns := array_append(missing_columns, 'metrics_page_views.is_bot');
    END IF;

    -- Check metrics_events
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'metrics_events'
        AND column_name = 'is_bot'
    ) THEN
        missing_columns := array_append(missing_columns, 'metrics_events.is_bot');
    END IF;

    IF array_length(missing_columns, 1) > 0 THEN
        RAISE EXCEPTION 'Failed to add is_bot columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE 'Successfully added is_bot flag to metrics_page_views and metrics_events';
        RAISE NOTICE 'Indexes created for efficient bot filtering';
    END IF;
END $$;
