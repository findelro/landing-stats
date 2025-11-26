import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get('actionType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeBots = searchParams.get('includeBots') === 'true';
    const excludeAcknowledged = searchParams.get('excludeAcknowledged') !== 'false'; // Default to true

    if (!actionType || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'actionType, startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Build the query - use timestamp strings with full day range
    let query = supabase
      .from('metrics_events')
      .select('id, domain, event_type, timestamp, ip, country, browser_normalized, os_normalized, device_normalized, acknowledged')
      .gte('timestamp', `${startDate}T00:00:00Z`)
      .lte('timestamp', `${endDate}T23:59:59Z`)
      .eq('event_type', actionType)
      .order('timestamp', { ascending: false })
      .limit(1000); // Limit to 1000 actions for performance

    // Filter out acknowledged events by default
    if (excludeAcknowledged) {
      query = query.eq('acknowledged', false);
    }

    // Filter bots if needed
    if (!includeBots) {
      query = query.or('is_bot.is.null,is_bot.eq.false');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    // Map the data to match the expected structure
    const mappedData = (data || []).map(item => ({
      id: item.id,
      domain: item.domain,
      event_type: item.event_type,
      timestamp: item.timestamp,
      ip: item.ip || 'Unknown',
      country: item.country || 'Other',
      browser: item.browser_normalized || 'Other',
      os: item.os_normalized || 'Other',
      device: item.device_normalized || 'Other',
      acknowledged: item.acknowledged || false
    }));

    return NextResponse.json({ data: mappedData });
  } catch (error: unknown) {
    console.error('API Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'An error occurred while fetching action type data';
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
