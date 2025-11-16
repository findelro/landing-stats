-- Migration 007: Update get_dashboard_data to use is_bot flag
--
-- Context: Modified get_dashboard_data function to use the new is_bot flag
-- instead of checking device_normalized != 'Bot'.
--
-- Changes:
-- - Filter bots using: NOT COALESCE(is_bot, false) instead of device_normalized != 'Bot'
-- - When include_bots is true, return "Bot" placeholder for bot records in browser/os/device stats
-- - Preserves actual bot user agent information in the database
--
-- Date: 2025-11-16
-- Author: Database optimization

CREATE OR REPLACE FUNCTION public.get_dashboard_data(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  domains text[] DEFAULT NULL::text[],
  exclude_self_referrals boolean DEFAULT true,
  group_referrers_by_domain boolean DEFAULT true,
  min_views integer DEFAULT 1,
  max_results_per_section integer DEFAULT 50,
  include_bots boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
  result_json JSON;
  domain_data JSON;
  referrer_data JSON;
  browser_data JSON;
  os_data JSON;
  device_data JSON;
  country_data JSON;
BEGIN
  -- Get domain stats (no grouping needed as each domain is unique)
  WITH filtered_views AS (
    SELECT
      pv.domain_normalized,
      pv.ip
    FROM
      metrics_page_views pv
    WHERE
      pv.timestamp >= start_date
      AND pv.timestamp <= end_date
      AND (domains IS NULL OR pv.domain_normalized = ANY(domains))
      AND (include_bots OR NOT COALESCE(pv.is_bot, false))
      AND NOT EXISTS (
        SELECT 1 FROM domains_under_contract duc
        WHERE duc.domain = pv.domain_normalized
      )
  ),
  domain_counts AS (
    SELECT
      domain_normalized AS domain,
      COUNT(*) AS views,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_views
    GROUP BY
      domain_normalized
    HAVING
      COUNT(*) >= min_views
  ),
  total_visitors AS (
    SELECT
      SUM(visitors) AS total
    FROM
      domain_counts
  ),
  domain_result AS (
    SELECT
      dc.domain,
      dc.views,
      dc.visitors,
      ROUND((dc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      domain_counts dc,
      total_visitors tv
    ORDER BY
      dc.views DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(domain_result) INTO domain_data FROM domain_result;

  -- Get referrer stats with grouping
  WITH filtered_views AS (
    SELECT
      pv.referrer_normalized,
      pv.domain_normalized,
      pv.ip
    FROM
      metrics_page_views pv
    WHERE
      pv.timestamp >= start_date
      AND pv.timestamp <= end_date
      AND pv.referrer_normalized IS NOT NULL
      AND (domains IS NULL OR pv.domain_normalized = ANY(domains))
      AND (include_bots OR NOT COALESCE(pv.is_bot, false))
      AND NOT EXISTS (
        SELECT 1 FROM domains_under_contract duc
        WHERE duc.domain = pv.domain_normalized
      )
      AND (
        NOT exclude_self_referrals
        OR NOT (
          pv.referrer_normalized = pv.domain_normalized
          OR pv.referrer_normalized LIKE '%.' || pv.domain_normalized
          OR pv.domain_normalized LIKE '%.' || pv.referrer_normalized
        )
      )
  ),
  referrer_counts AS (
    SELECT
      CASE
        WHEN group_referrers_by_domain THEN
          -- Extract root domain
          regexp_replace(referrer_normalized, '^.*?([^.]+\\.[^.]+)$', '\\1')
        ELSE
          referrer_normalized
      END AS referrer,
      COUNT(*) AS views,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_views
    GROUP BY
      CASE
        WHEN group_referrers_by_domain THEN
          regexp_replace(referrer_normalized, '^.*?([^.]+\\.[^.]+)$', '\\1')
        ELSE
          referrer_normalized
      END
    HAVING
      COUNT(*) >= min_views
  ),
  total_visitors AS (
    SELECT
      SUM(visitors) AS total
    FROM
      referrer_counts
  ),
  referrer_result AS (
    SELECT
      rc.referrer,
      rc.views,
      rc.visitors,
      ROUND((rc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      referrer_counts rc,
      total_visitors tv
    ORDER BY
      rc.views DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(referrer_result) INTO referrer_data FROM referrer_result;

  -- Get browser stats with grouping
  -- If is_bot = true, return "Bot" as placeholder, otherwise use actual browser
  WITH filtered_views AS (
    SELECT
      CASE
        WHEN pv.is_bot THEN 'Bot'
        ELSE COALESCE(pv.browser_normalized, 'Other')
      END AS browser,
      pv.domain_normalized,
      pv.ip
    FROM
      metrics_page_views pv
    WHERE
      pv.timestamp >= start_date
      AND pv.timestamp <= end_date
      AND (domains IS NULL OR pv.domain_normalized = ANY(domains))
      AND (include_bots OR NOT COALESCE(pv.is_bot, false))
      AND NOT EXISTS (
        SELECT 1 FROM domains_under_contract duc
        WHERE duc.domain = pv.domain_normalized
      )
  ),
  browser_counts AS (
    SELECT
      browser,
      COUNT(*) AS views,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_views
    GROUP BY
      browser
    HAVING
      COUNT(*) >= min_views
  ),
  total_visitors AS (
    SELECT
      SUM(visitors) AS total
    FROM
      browser_counts
  ),
  browser_result AS (
    SELECT
      bc.browser,
      bc.views,
      bc.visitors,
      ROUND((bc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      browser_counts bc,
      total_visitors tv
    ORDER BY
      bc.views DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(browser_result) INTO browser_data FROM browser_result;

  -- Get OS stats with grouping
  -- If is_bot = true, return "Bot" as placeholder, otherwise use actual OS
  WITH filtered_views AS (
    SELECT
      CASE
        WHEN pv.is_bot THEN 'Bot'
        ELSE COALESCE(pv.os_normalized, 'Other')
      END AS os,
      pv.domain_normalized,
      pv.ip
    FROM
      metrics_page_views pv
    WHERE
      pv.timestamp >= start_date
      AND pv.timestamp <= end_date
      AND (domains IS NULL OR pv.domain_normalized = ANY(domains))
      AND (include_bots OR NOT COALESCE(pv.is_bot, false))
      AND NOT EXISTS (
        SELECT 1 FROM domains_under_contract duc
        WHERE duc.domain = pv.domain_normalized
      )
  ),
  os_counts AS (
    SELECT
      os,
      COUNT(*) AS views,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_views
    GROUP BY
      os
    HAVING
      COUNT(*) >= min_views
  ),
  total_visitors AS (
    SELECT
      SUM(visitors) AS total
    FROM
      os_counts
  ),
  os_result AS (
    SELECT
      oc.os,
      oc.views,
      oc.visitors,
      ROUND((oc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      os_counts oc,
      total_visitors tv
    ORDER BY
      oc.views DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(os_result) INTO os_data FROM os_result;

  -- Get device stats with grouping
  -- If is_bot = true, return "Bot" as placeholder, otherwise use actual device
  WITH filtered_views AS (
    SELECT
      CASE
        WHEN pv.is_bot THEN 'Bot'
        ELSE COALESCE(pv.device_normalized, 'Other')
      END AS device,
      pv.domain_normalized,
      pv.ip
    FROM
      metrics_page_views pv
    WHERE
      pv.timestamp >= start_date
      AND pv.timestamp <= end_date
      AND (domains IS NULL OR pv.domain_normalized = ANY(domains))
      AND (include_bots OR NOT COALESCE(pv.is_bot, false))
      AND NOT EXISTS (
        SELECT 1 FROM domains_under_contract duc
        WHERE duc.domain = pv.domain_normalized
      )
  ),
  device_counts AS (
    SELECT
      device,
      COUNT(*) AS views,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_views
    GROUP BY
      device
    HAVING
      COUNT(*) >= min_views
  ),
  total_visitors AS (
    SELECT
      SUM(visitors) AS total
    FROM
      device_counts
  ),
  device_result AS (
    SELECT
      dc.device,
      dc.views,
      dc.visitors,
      ROUND((dc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      device_counts dc,
      total_visitors tv
    ORDER BY
      dc.views DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(device_result) INTO device_data FROM device_result;

  -- Get country stats with grouping
  WITH filtered_views AS (
    SELECT
      pv.country,
      pv.domain_normalized,
      pv.ip
    FROM
      metrics_page_views pv
    WHERE
      pv.timestamp >= start_date
      AND pv.timestamp <= end_date
      AND pv.country IS NOT NULL
      AND (domains IS NULL OR pv.domain_normalized = ANY(domains))
      AND (include_bots OR NOT COALESCE(pv.is_bot, false))
      AND NOT EXISTS (
        SELECT 1 FROM domains_under_contract duc
        WHERE duc.domain = pv.domain_normalized
      )
  ),
  country_counts AS (
    SELECT
      country,
      COUNT(*) AS views,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_views
    GROUP BY
      country
    HAVING
      COUNT(*) >= min_views
  ),
  total_visitors AS (
    SELECT
      SUM(visitors) AS total
    FROM
      country_counts
  ),
  country_result AS (
    SELECT
      cc.country,
      cc.views,
      cc.visitors,
      ROUND((cc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      country_counts cc,
      total_visitors tv
    ORDER BY
      cc.views DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(country_result) INTO country_data FROM country_result;

  -- Compile the complete dashboard data
  result_json = json_build_object(
    'domains', COALESCE(domain_data, '[]'::json),
    'referrers', COALESCE(referrer_data, '[]'::json),
    'browsers', COALESCE(browser_data, '[]'::json),
    'os', COALESCE(os_data, '[]'::json),
    'devices', COALESCE(device_data, '[]'::json),
    'countries', COALESCE(country_data, '[]'::json)
  );

  RETURN result_json;
END;
$function$;

-- Verify function was updated
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'get_dashboard_data'
    ) THEN
        RAISE NOTICE 'Successfully updated get_dashboard_data function to use is_bot flag';
    ELSE
        RAISE EXCEPTION 'Failed to update get_dashboard_data function';
    END IF;
END $$;
