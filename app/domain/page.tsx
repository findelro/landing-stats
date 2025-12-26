'use client';

import { useState, useEffect, Suspense } from 'react';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import DateRangePicker from '@/components/DateRangePicker';
import StatsCard from '@/components/StatsCard';
import TableWithPercentage from '@/components/TableWithPercentage';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import { 
  DomainHit, 
  BrowserStats, 
  OSStats, 
  DeviceStats, 
  CountryStats 
} from '@/lib/types';
import { APP_CONFIG } from '@/lib/config';
import PaginatedTableFooter from '@/components/PaginatedTableFooter';

// Import the getCountryFlag function from TableWithPercentage
// Helper function to get country flag emoji
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) {
    return '🏴';
  }
  
  // Special case for "ZZ" or "unknown" - return white flag
  if (countryCode.toUpperCase() === 'ZZ' || countryCode.toLowerCase() === 'unknown') {
    return '🏳️';
  }
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}

// Dynamically import the VectorMap component with no SSR to prevent hydration errors
const InteractiveVectorMap = dynamic(() => import('@/components/VectorMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>
  )
});

// Dynamically import the PageviewsChart component with no SSR
const PageviewsChart = dynamic(() => import('@/components/PageviewsChart'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>
  )
});

function DomainContent() {
  const searchParams = useSearchParams();
  const domain = searchParams.get('domain');

  // Date range state
  const [dateRange, setDateRange] = useState({
    startDate: searchParams.get('startDate') || format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd')
  });

  // Include bots state
  const [includeBots, setIncludeBots] = useState(true);

  // Data state
  const [hits, setHits] = useState<DomainHit[]>([]);
  const [browsersData, setBrowsersData] = useState<BrowserStats[]>([]);
  const [osData, setOsData] = useState<OSStats[]>([]);
  const [devicesData, setDevicesData] = useState<DeviceStats[]>([]);
  const [countriesData, setCountriesData] = useState<CountryStats[]>([]);
  const [pageviewsByDay, setPageviewsByDay] = useState<{ day: string; pageviews: number }[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [earliestDate, setEarliestDate] = useState<string | undefined>();
  const [showAllHits, setShowAllHits] = useState(false);
  const [hitsToShow, setHitsToShow] = useState<number>(APP_CONFIG.TABLE_PAGINATION.DETAIL_HITS.INITIAL_ITEMS);
  const INITIAL_HITS_TO_SHOW = APP_CONFIG.TABLE_PAGINATION.DETAIL_HITS.INITIAL_ITEMS;
  const HITS_PER_LOAD = APP_CONFIG.TABLE_PAGINATION.DETAIL_HITS.ITEMS_PER_LOAD;

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle date range change
  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate });
  };

  const handleIncludeBotsChange = (include: boolean) => {
    setIncludeBots(include);
  };

  // Fetch domain stats
  useEffect(() => {
    const fetchDomainStats = async () => {
      if (!domain) {
        setError("No domain specified");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(
          `/api/stats/domain?domain=${encodeURIComponent(domain)}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&type=all&includeBots=${includeBots}`
        );
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch data');
        }
        
        const result = await response.json();
        const domainData = result.data;
        
        setHits(domainData.hits);
        setBrowsersData(domainData.browsers);
        setOsData(domainData.os);
        setDevicesData(domainData.devices);
        setCountriesData(domainData.countries);
        setPageviewsByDay(domainData.pageviewsByDay || []);
        setTotalCount(domainData.totalCount || 0);
      } catch (err) {
        console.error('Error fetching domain stats:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDomainStats();
  }, [domain, dateRange.startDate, dateRange.endDate, includeBots]);

  // Reset showAllHits and hitsToShow when hits change
  useEffect(() => {
    setShowAllHits(false);
    setHitsToShow(APP_CONFIG.TABLE_PAGINATION.DETAIL_HITS.INITIAL_ITEMS);
  }, [hits]);

  // Debug country data
  useEffect(() => {
    if (hits.length > 0) {
      console.log("Hits with country data:", hits.slice(0, 5).map(hit => ({
        ip: hit.ip,
        country: hit.country,
        flagPath: `/images/country/${hit.country?.toLowerCase() || 'unknown'}.png`
      })));
    }
  }, [hits]);

  // Fetch earliest date for this domain (LTD button)
  useEffect(() => {
    if (!domain) return;
    const fetchEarliestDate = async () => {
      try {
        const response = await fetch(`/api/stats/earliest?domain=${encodeURIComponent(domain)}`);
        if (response.ok) {
          const data = await response.json();
          setEarliestDate(data.earliestDate);
        }
      } catch (err) {
        console.error('Error fetching earliest date:', err);
      }
    };
    fetchEarliestDate();
  }, [domain]);

  return (
    <>
      <Header title={`Domain Analysis: ${domain || 'Other'}`} />
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Date picker */}
            <div className="flex justify-between items-center">
              {!isLoading && !error && (
                <h2 className="text-sm font-medium text-gray-700">
                  {totalCount.toLocaleString()} pageviews found
                </h2>
              )}
              {isLoading && <div className="w-32"></div>} {/* Empty space placeholder when loading */}
              <DateRangePicker
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                onRangeChange={handleDateRangeChange}
                includeBots={includeBots}
                onIncludeBotsChange={handleIncludeBotsChange}
                earliestDate={earliestDate}
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            ) : (
              <>
                {/* Stats Tables Row - Reusing the same components from homepage */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Browsers Stats */}
                  <StatsCard>
                    <TableWithPercentage 
                      data={browsersData} 
                      title="Browsers"
                      nameKey="browser"
                      showAllByDefault={true}
                    />
                  </StatsCard>

                  {/* OS Stats */}
                  <StatsCard>
                    <TableWithPercentage 
                      data={osData} 
                      title="OS"
                      nameKey="os"
                      showAllByDefault={true}
                    />
                  </StatsCard>

                  {/* Devices Stats */}
                  <StatsCard>
                    <TableWithPercentage
                      data={devicesData}
                      title="Devices"
                      nameKey="device"
                      showAllByDefault={true}
                    />
                  </StatsCard>
                </div>

                {/* Pageviews Over Time Chart */}
                <StatsCard title="Pageviews Over Time">
                  <PageviewsChart
                    pageviewsByDay={pageviewsByDay}
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                  />
                </StatsCard>

                {/* World Map and Countries side by side - Reusing the same components from homepage */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Map Visualization */}
                  <StatsCard title="Visitor Locations" className="lg:col-span-3">
                    <div className="h-96">
                      <InteractiveVectorMap data={countriesData} className="h-full w-full" />
                    </div>
                  </StatsCard>

                  {/* Countries Stats */}
                  <StatsCard className="lg:col-span-2">
                    <div className="h-96 overflow-y-auto overflow-x-hidden">
                      <TableWithPercentage 
                        data={countriesData} 
                        title="Countries"
                        nameKey="country"
                        showFlags={true}
                        initialItemsToShow={APP_CONFIG.TABLE_PAGINATION.COUNTRIES.INITIAL_ITEMS}
                        itemsPerLoad={APP_CONFIG.TABLE_PAGINATION.COUNTRIES.ITEMS_PER_LOAD}
                      />
                    </div>
                  </StatsCard>
                </div>

                {/* Individual Hits Table - Moved to the bottom */}
                <StatsCard title="Pageviews">
                  {hits.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      No pageviews found in the selected date range
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <div className="mb-2">
                          <button 
                            onClick={() => console.log("Hits data:", hits)} 
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Debug Country Data
                          </button>
                        </div>
                        <table className="w-full divide-y divide-gray-100">
                          <thead className="bg-white">
                            <tr>
                              <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                                Page
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                                IP
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                                Date
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                                Referrer
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {(showAllHits ? hits : hits.slice(0, hitsToShow)).map((hit, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs truncate" title={hit.page}>
                                  {hit.page}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">
                                  <div className="flex items-center">
                                    {hit.country && hit.country !== 'unknown' && (
                                      <span className="mr-2 text-lg" title={hit.country}>
                                        {getCountryFlag(hit.country)}
                                      </span>
                                    )}
                                    <span className="font-mono">{hit.ip}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">
                                  {format(new Date(hit.timestamp), 'MM/dd/yy HH:mm')}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title={hit.referrer || ''}>
                                  {hit.referrer || ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <PaginatedTableFooter
                        itemsToShow={hitsToShow}
                        totalItems={hits.length}
                        initialItemsToShow={INITIAL_HITS_TO_SHOW}
                        itemsPerLoad={HITS_PER_LOAD}
                        showAll={showAllHits}
                        onLoadMore={() => setHitsToShow(Math.min(hitsToShow + HITS_PER_LOAD, hits.length))}
                        onShowAll={() => { setShowAllHits(true); setHitsToShow(hits.length); }}
                        onShowLess={() => { setShowAllHits(false); setHitsToShow(INITIAL_HITS_TO_SHOW); }}
                      />
                    </>
                  )}
                </StatsCard>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export default function DomainAnalysis() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    }>
      <DomainContent />
    </Suspense>
  );
} 