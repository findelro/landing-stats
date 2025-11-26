-- Migration: Add acknowledgment tracking to metrics_events
-- Purpose: Allow users to acknowledge/review specific events (e.g., probe_attempt)
-- Created: 2025-11-24

-- Add acknowledgment tracking columns
ALTER TABLE metrics_events
ADD COLUMN acknowledged BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN acknowledged_at TIMESTAMPTZ;

-- Add index for efficient filtering of unacknowledged events by type
-- Full index to support acknowledgment queries for any event_type
CREATE INDEX idx_metrics_events_acknowledged
ON metrics_events(event_type, acknowledged);

-- Add documentation comments
COMMENT ON COLUMN metrics_events.acknowledged IS 'Whether this event has been acknowledged/reviewed by the user';
COMMENT ON COLUMN metrics_events.acknowledged_at IS 'Timestamp when the event was acknowledged';
