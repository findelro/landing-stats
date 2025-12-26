import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get('domain');

  try {
    let query;

    if (domain) {
      // Get earliest date for a specific domain
      query = supabase
        .from('metrics_page_views')
        .select('timestamp')
        .eq('domain_normalized', domain)
        .order('timestamp', { ascending: true })
        .limit(1);
    } else {
      // Get global earliest date
      query = supabase
        .from('metrics_page_views')
        .select('timestamp')
        .order('timestamp', { ascending: true })
        .limit(1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching earliest date:', error);
      return NextResponse.json(
        { error: 'Failed to fetch earliest date' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ earliestDate: null });
    }

    // Extract just the date part (YYYY-MM-DD)
    const earliestDate = data[0].timestamp.split('T')[0];

    return NextResponse.json({ earliestDate });
  } catch (err) {
    console.error('Error in earliest date API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
