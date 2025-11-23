import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const referrerDomain = searchParams.get('referrerDomain');
    
    if (!startDate || !endDate || !referrerDomain) {
      return NextResponse.json(
        { error: 'startDate, endDate, and referrerDomain are required' },
        { status: 400 }
      );
    }

    // Fetch referrer page visits with target pages - use PostgreSQL date casting for dates only!
    const { data, error } = await supabase
      .from('metrics_page_views')
      .select('referrer, domain, path, timestamp, ip')
      .ilike('referrer_normalized', `%${referrerDomain}%`)
      .gte('timestamp::date', startDate)
      .lte('timestamp::date', endDate);
    
    if (error) {
      console.error('API Error:', error);
      return NextResponse.json(
        { error: 'An error occurred while fetching referrer data' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Process the data to aggregate by referrer page and target page
    const referrerTargetMap = new Map();
    const visitorsByPair = new Map();

    data.forEach(item => {
      const referrerPage = item.referrer || 'Direct / None';
      const targetPage = `${item.domain}${item.path}`;
      const pairKey = `${referrerPage}|${targetPage}`;
      
      // Count views
      if (!referrerTargetMap.has(pairKey)) {
        referrerTargetMap.set(pairKey, {
          referrerPage,
          targetPage,
          views: 0,
          visitors: 0
        });
      }
      
      referrerTargetMap.get(pairKey).views++;
      
      // Track unique visitors
      if (!visitorsByPair.has(pairKey)) {
        visitorsByPair.set(pairKey, new Set());
      }
      visitorsByPair.get(pairKey).add(item.ip);
    });

    // Calculate visitors count for each pair
    visitorsByPair.forEach((visitors, pairKey) => {
      if (referrerTargetMap.has(pairKey)) {
        referrerTargetMap.get(pairKey).visitors = visitors.size;
      }
    });

    // Convert to array and calculate percentages
    const totalViews = data.length;
    const resultArray = Array.from(referrerTargetMap.values()).map(item => ({
      ...item,
      percentage: Math.round((item.views / totalViews) * 1000) / 10
    }));

    // Sort by views descending
    resultArray.sort((a, b) => b.views - a.views);

    return NextResponse.json({ data: resultArray });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching data' },
      { status: 500 }
    );
  }
} 