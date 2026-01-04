import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { SniperDomain } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all'; // 'all', 'active', 'finished'

    let whereClause = '';
    if (filter === 'active') {
      whereClause = "WHERE state NOT IN ('won', 'lost', 'cancelled', 'error')";
    } else if (filter === 'finished') {
      whereClause = "WHERE state IN ('won', 'lost', 'cancelled', 'error')";
    }

    const domains = await query<SniperDomain>(`
      SELECT
        domain_name,
        state,
        strategy,
        max_bid,
        current_price,
        minimum_next_bid,
        winning,
        current_end_time,
        original_end_time,
        auction_id,
        created_at
      FROM sniper_domains
      ${whereClause}
      ORDER BY
        CASE
          WHEN state IN ('won', 'lost', 'cancelled', 'error') THEN 1
          ELSE 0
        END,
        current_end_time NULLS LAST,
        created_at DESC
    `);

    return NextResponse.json({ data: domains });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching bidding data' },
      { status: 500 }
    );
  }
}
