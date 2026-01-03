import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (!domain) {
      return NextResponse.json(
        { error: 'domain is required' },
        { status: 400 }
      );
    }

    // Fetch domain info, estimate, comparables, and whois in parallel
    const [domainResult, estimateResult, whoisResult] = await Promise.all([
      supabase
        .from('domains_on_afternic')
        .select('domain, min_offer, buy_now_price, status')
        .eq('domain', domain)
        .single(),
      supabase
        .from('domain_estimates')
        .select('estimate')
        .eq('domain', domain)
        .single(),
      supabase
        .from('whois_data')
        .select('reg_year')
        .eq('domain', domain)
        .single()
    ]);

    // Fetch comparable mappings
    const { data: comparableMappings } = await supabase
      .from('domain_comparables_map')
      .select('similar_domain')
      .eq('source_domain', domain)
      .eq('is_relevant', true);

    // Domain might not exist in our portfolio
    if (domainResult.error && domainResult.error.code !== 'PGRST116') {
      console.error('Error fetching domain:', domainResult.error);
    }

    const domainData = domainResult.data;
    const estimate = estimateResult.data?.estimate ?? null;
    const regYear = whoisResult.data?.reg_year ?? null;

    // Fetch sales history for the comparable domains
    let comparables: { domain: string; price: number }[] = [];
    if (comparableMappings && comparableMappings.length > 0) {
      const similarDomains = comparableMappings.map(m => m.similar_domain);
      const { data: salesData } = await supabase
        .from('domain_market_sales_history')
        .select('domain, sale_price')
        .in('domain', similarDomains)
        .order('sale_price', { ascending: false })
        .limit(10);

      comparables = (salesData || []).map(s => ({
        domain: s.domain,
        price: Number(s.sale_price)
      }));
    }

    return NextResponse.json({
      data: {
        domain,
        minOffer: domainData?.min_offer ?? null,
        buyNowPrice: domainData?.buy_now_price ?? null,
        estimate: estimate ? Number(estimate) : null,
        comparables,
        regYear,
        status: domainData?.status ?? null
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching domain pricing data' },
      { status: 500 }
    );
  }
}
