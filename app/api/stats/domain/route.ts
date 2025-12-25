import { NextRequest, NextResponse } from 'next/server';
import {
  getDomainHits,
  getBrowserStatsForDomain,
  getOSStatsForDomain,
  getDeviceStatsForDomain,
  getCountryStatsForDomain,
  getDomainPageviewsByDay,
  getDomainPageviewCount
} from '@/lib/metrics';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const domain = searchParams.get('domain');
    const type = searchParams.get('type');
    const includeBots = searchParams.get('includeBots') === 'true';
    
    if (!startDate || !endDate || !domain) {
      return NextResponse.json(
        { error: 'startDate, endDate, and domain are required' },
        { status: 400 }
      );
    }

    // If type is 'all', return all domain-specific stats
    if (type === 'all') {
      const [hits, browsers, os, devices, countries, pageviewsByDay, totalCount] = await Promise.all([
        getDomainHits(domain, startDate, endDate, includeBots),
        getBrowserStatsForDomain(domain, startDate, endDate, includeBots),
        getOSStatsForDomain(domain, startDate, endDate, includeBots),
        getDeviceStatsForDomain(domain, startDate, endDate, includeBots),
        getCountryStatsForDomain(domain, startDate, endDate, includeBots),
        getDomainPageviewsByDay(domain, startDate, endDate, includeBots),
        getDomainPageviewCount(domain, startDate, endDate, includeBots)
      ]);

      return NextResponse.json({
        data: {
          hits,
          browsers,
          os,
          devices,
          countries,
          pageviewsByDay,
          totalCount
        }
      });
    }

    // Default: return just the hits data (backward compatibility)
    const data = await getDomainHits(domain, startDate, endDate, includeBots);
    
    return NextResponse.json({ data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching domain data' },
      { status: 500 }
    );
  }
}