-- Migration: Update get_events_dashboard_data function to support exclude_acknowledged parameter
-- Purpose: Allow /actions page to filter out acknowledged events by default
-- Created: 2025-11-27

CREATE OR REPLACE FUNCTION public.get_events_dashboard_data(
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  max_results_per_section integer DEFAULT 50,
  include_bots boolean DEFAULT true,
  exclude_acknowledged boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
  result_json JSON;
  event_type_data JSON;
  browser_data JSON;
  os_data JSON;
  device_data JSON;
  country_data JSON;
BEGIN
  -- Get event type stats
  WITH filtered_events AS (
    SELECT
      ev.event_type,
      ev.ip
    FROM
      metrics_events ev
    WHERE
      ev.timestamp >= start_date
      AND ev.timestamp <= end_date
      AND (include_bots OR COALESCE(ev.is_bot, false) = false)
      AND (NOT exclude_acknowledged OR COALESCE(ev.acknowledged, false) = false)
  ),
  event_type_counts AS (
    SELECT
      COALESCE(event_type, 'Other') AS event_type,
      COUNT(*) AS count,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_events
    GROUP BY
      COALESCE(event_type, 'Other')
  ),
  total_visitors AS (
    SELECT
      SUM(visitors) AS total
    FROM
      event_type_counts
  ),
  event_type_result AS (
    SELECT
      etc.event_type,
      etc.count,
      etc.visitors,
      ROUND((etc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      event_type_counts etc,
      total_visitors tv
    ORDER BY
      etc.count DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(event_type_result) INTO event_type_data FROM event_type_result;

  -- Get browser stats (with Bot handling)
  WITH filtered_events AS (
    SELECT
      CASE
        WHEN ev.is_bot THEN 'Bot'
        ELSE COALESCE(ev.browser_normalized, 'Other')
      END AS browser,
      ev.ip
    FROM
      metrics_events ev
    WHERE
      ev.timestamp >= start_date
      AND ev.timestamp <= end_date
      AND (include_bots OR COALESCE(ev.is_bot, false) = false)
      AND (NOT exclude_acknowledged OR COALESCE(ev.acknowledged, false) = false)
  ),
  browser_counts AS (
    SELECT
      browser,
      COUNT(*) AS count,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_events
    GROUP BY
      browser
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
      bc.count,
      bc.visitors,
      ROUND((bc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      browser_counts bc,
      total_visitors tv
    ORDER BY
      bc.count DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(browser_result) INTO browser_data FROM browser_result;

  -- Get OS stats (with Bot handling)
  WITH filtered_events AS (
    SELECT
      CASE
        WHEN ev.is_bot THEN 'Bot'
        ELSE COALESCE(ev.os_normalized, 'Other')
      END AS os,
      ev.ip
    FROM
      metrics_events ev
    WHERE
      ev.timestamp >= start_date
      AND ev.timestamp <= end_date
      AND (include_bots OR COALESCE(ev.is_bot, false) = false)
      AND (NOT exclude_acknowledged OR COALESCE(ev.acknowledged, false) = false)
  ),
  os_counts AS (
    SELECT
      os,
      COUNT(*) AS count,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_events
    GROUP BY
      os
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
      oc.count,
      oc.visitors,
      ROUND((oc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      os_counts oc,
      total_visitors tv
    ORDER BY
      oc.count DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(os_result) INTO os_data FROM os_result;

  -- Get device stats (with Bot handling)
  WITH filtered_events AS (
    SELECT
      CASE
        WHEN ev.is_bot THEN 'Bot'
        ELSE COALESCE(ev.device_normalized, 'Other')
      END AS device,
      ev.ip
    FROM
      metrics_events ev
    WHERE
      ev.timestamp >= start_date
      AND ev.timestamp <= end_date
      AND (include_bots OR COALESCE(ev.is_bot, false) = false)
      AND (NOT exclude_acknowledged OR COALESCE(ev.acknowledged, false) = false)
  ),
  device_counts AS (
    SELECT
      device,
      COUNT(*) AS count,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_events
    GROUP BY
      device
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
      dc.count,
      dc.visitors,
      ROUND((dc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      device_counts dc,
      total_visitors tv
    ORDER BY
      dc.count DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(device_result) INTO device_data FROM device_result;

  -- Get country stats (countries don't get Bot label, just filtered)
  WITH filtered_events AS (
    SELECT
      ev.country,
      ev.ip
    FROM
      metrics_events ev
    WHERE
      ev.timestamp >= start_date
      AND ev.timestamp <= end_date
      AND ev.country IS NOT NULL
      AND (include_bots OR COALESCE(ev.is_bot, false) = false)
      AND (NOT exclude_acknowledged OR COALESCE(ev.acknowledged, false) = false)
  ),
  country_counts AS (
    SELECT
      country,
      COUNT(*) AS count,
      COUNT(DISTINCT ip) AS visitors
    FROM
      filtered_events
    GROUP BY
      country
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
      cc.count,
      cc.visitors,
      ROUND((cc.visitors::numeric / NULLIF(tv.total, 0)) * 100, 1) AS percentage
    FROM
      country_counts cc,
      total_visitors tv
    ORDER BY
      cc.count DESC
    LIMIT max_results_per_section
  )
  SELECT json_agg(country_result) INTO country_data FROM country_result;

  -- Compile the complete events dashboard data
  result_json = json_build_object(
    'event_types', COALESCE(event_type_data, '[]'::json),
    'browsers', COALESCE(browser_data, '[]'::json),
    'os', COALESCE(os_data, '[]'::json),
    'devices', COALESCE(device_data, '[]'::json),
    'countries', COALESCE(country_data, '[]'::json)
  );

  RETURN result_json;
END;
$function$;
