import { NextRequest, NextResponse } from 'next/server';
import { getSniperDomains } from '@/lib/sniper-api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter');

    // Map filter to API parameter
    let apiFilter: 'active' | 'finished' | undefined;
    if (filter === 'active') {
      apiFilter = 'active';
    } else if (filter === 'finished') {
      apiFilter = 'finished';
    }

    const domains = await getSniperDomains(apiFilter);

    return NextResponse.json({ data: domains });
  } catch (error) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred while fetching bidding data';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
