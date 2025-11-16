-- Migration: Add User Agent and Domain Normalization Columns
-- Created: 2025-11-16
-- Description: Adds normalized columns for user agent data (browser, OS, device)
--              and domain/referrer normalization for analytics processing

-- Add referrer_normalized column (stores normalized domain from referrer URLs)
ALTER TABLE metrics_page_views
ADD COLUMN IF NOT EXISTS referrer_normalized TEXT;

-- Add domain_normalized column (stores normalized/cleaned domain names)
ALTER TABLE metrics_page_views
ADD COLUMN IF NOT EXISTS domain_normalized TEXT;

-- Add comments to document column purposes
COMMENT ON COLUMN metrics_page_views.referrer_normalized IS
'Normalized referrer domain extracted from referrer URL (e.g., "google.com" from "https://www.google.com/search?q=...")';

COMMENT ON COLUMN metrics_page_views.domain_normalized IS
'Normalized domain name extracted from raw domain field using TLD extraction (e.g., "example.com" from "www.example.com")';

-- Note: The following columns should already exist from earlier schema:
--   - browser_normalized TEXT
--   - os_normalized TEXT
--   - device_normalized TEXT
-- If they don't exist, they will be created by the populate_normalized_stats.py script
-- (though ideally they should be in a migration too)

-- Create indexes for better query performance on normalized fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_referrer_normalized
ON metrics_page_views (referrer_normalized)
WHERE referrer_normalized IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_domain_normalized
ON metrics_page_views (domain_normalized)
WHERE domain_normalized IS NOT NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 003: Successfully added normalization columns';
  RAISE NOTICE '  - referrer_normalized (with index)';
  RAISE NOTICE '  - domain_normalized (with index)';
  RAISE NOTICE 'Next step: Run populate_normalized_stats.py to populate these columns';
END $$;
