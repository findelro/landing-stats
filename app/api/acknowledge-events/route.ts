import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventIds } = body;

    if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
      return NextResponse.json(
        { error: 'eventIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Validate that all IDs are numbers
    if (!eventIds.every(id => typeof id === 'number' && !isNaN(id))) {
      return NextResponse.json(
        { error: 'All eventIds must be valid numbers' },
        { status: 400 }
      );
    }

    // First, get the domains for the selected event IDs
    const { data: selectedEvents, error: fetchError } = await supabase
      .from('metrics_events')
      .select('domain, event_type')
      .in('id', eventIds);

    if (fetchError) {
      console.error('Supabase fetch error:', fetchError);
      throw fetchError;
    }

    // Extract unique domains and event types from selected events
    const domains = [...new Set(selectedEvents?.map(e => e.domain) || [])];
    const eventTypes = [...new Set(selectedEvents?.map(e => e.event_type) || [])];

    if (domains.length === 0) {
      return NextResponse.json(
        { error: 'No valid domains found for selected events' },
        { status: 400 }
      );
    }

    // Validate event types are acknowledgeable
    const acknowledgeableTypes = ['probe_attempt', 'checkout_expired', 'checkout_not_found'];
    const invalidTypes = eventTypes.filter(t => !acknowledgeableTypes.includes(t));

    if (invalidTypes.length > 0) {
      return NextResponse.json(
        { error: `Cannot acknowledge event types: ${invalidTypes.join(', ')}. Only probe_attempt, checkout_expired, and checkout_not_found can be acknowledged.` },
        { status: 400 }
      );
    }

    // Update ALL events with these domains and event types to mark them as acknowledged
    const { data, error } = await supabase
      .from('metrics_events')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString()
      })
      .in('domain', domains)
      .in('event_type', eventTypes)
      .select('id');

    if (error) {
      console.error('Supabase update error:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      acknowledgedCount: data?.length || 0,
      domainsAcknowledged: domains,
      eventTypesAcknowledged: eventTypes,
      message: `Successfully acknowledged ${data?.length || 0} event(s) across ${domains.length} domain(s) for event types: ${eventTypes.join(', ')}`
    });
  } catch (error: unknown) {
    console.error('API Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'An error occurred while acknowledging events';
    const errorCode = (error as { code?: string }).code;

    return NextResponse.json(
      {
        error: errorMessage,
        code: errorCode || 'UNKNOWN_ERROR',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
