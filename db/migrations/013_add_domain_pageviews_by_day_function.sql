-- Migration: 013_add_domain_pageviews_by_day_function
-- Description: Add function to get daily pageview counts for a domain
-- This bypasses the PostgREST 1000 row limit by aggregating in the database
-- Created: 2025-12-25

-- Function to get pageviews aggregated by day for a specific domain
-- Used by the Pageviews Over Time chart on the domain detail page
CREATE OR REPLACE FUNCTION get_domain_pageviews_by_day(
  p_domain TEXT,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_include_bots BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  day DATE,
  pageviews BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(timestamp) as day,
    COUNT(*)::BIGINT as pageviews
  FROM metrics_page_views
  WHERE domain_normalized = p_domain
    AND timestamp >= p_start_date
    AND timestamp <= p_end_date
    AND (p_include_bots OR browser_normalized != 'Bot')
  GROUP BY DATE(timestamp)
  ORDER BY day;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION get_domain_pageviews_by_day TO authenticated;
GRANT EXECUTE ON FUNCTION get_domain_pageviews_by_day TO anon;

-- Function to get total pageview count for a domain (bypasses PostgREST 1000 row limit)
CREATE OR REPLACE FUNCTION get_domain_pageview_count(
  p_domain TEXT,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_include_bots BOOLEAN DEFAULT TRUE
)
RETURNS BIGINT AS $$
DECLARE
  total BIGINT;
BEGIN
  SELECT COUNT(*)::BIGINT INTO total
  FROM metrics_page_views
  WHERE domain_normalized = p_domain
    AND timestamp >= p_start_date
    AND timestamp <= p_end_date
    AND (p_include_bots OR browser_normalized != 'Bot');

  RETURN total;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_domain_pageview_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_domain_pageview_count TO anon;
