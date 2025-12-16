'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import DateRangePicker from '@/components/DateRangePicker';
import StatsCard from '@/components/StatsCard';
import TableWithPercentage from '@/components/TableWithPercentage';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import { 
  DomainStats, 
  ReferrerStats, 
  BrowserStats, 
  OSStats, 
  DeviceStats, 
  CountryStats 
} from '@/lib/types';
import { APP_CONFIG } from '@/lib/config';

// Dynamically import the VectorMap component with no SSR to prevent hydration errors
const InteractiveVectorMap = dynamic(() => import('@/components/VectorMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>
  )
});

export default function Home() {
  // Date range state
  const [dateRange, setDateRange] = useState({
    startDate: format(new Date(Date.now() - APP_CONFIG.API.DEFAULT_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });

  // Include bots state
  const [includeBots, setIncludeBots] = useState(false);

  // Stats data state
  const [domainsData, setDomainsData] = useState<DomainStats[]>([]);
  const [referrersData, setReferrersData] = useState<ReferrerStats[]>([]);
  const [browsersData, setBrowsersData] = useState<BrowserStats[]>([]);
  const [osData, setOsData] = useState<OSStats[]>([]);
  const [devicesData, setDevicesData] = useState<DeviceStats[]>([]);
  const [countriesData, setCountriesData] = useState<CountryStats[]>([]);
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    code?: string;
    attempts?: number;
    timestamp?: string;
  } | null>(null);

  // Handle date range change
  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate });
  };

  const handleIncludeBotsChange = (include: boolean) => {
    setIncludeBots(include);
  };

  // Manual retry function
  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    // Trigger re-fetch by updating a dependency (force re-run of useEffect)
    setDateRange(prev => ({ ...prev }));
  };

  // Fetch all stats
  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch all stats from the API
        const response = await fetch(
          `/api/stats?type=all&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&maxResults=${APP_CONFIG.API.MAX_RESULTS_PER_SECTION}&includeBots=${includeBots}`
        );
        
        if (!response.ok) {
          const errorData = await response.json();
          const error = new Error(errorData.error || 'Failed to fetch data') as Error & {
            code?: string;
            attempts?: number;
            timestamp?: string;
          };
          error.code = errorData.code;
          error.attempts = errorData.attempts;
          error.timestamp = errorData.timestamp;
          throw error;
        }
        
        const result = await response.json();
        const dashboardData = result.data;
        
        // Update state with the fetched data
        // Note: The domain structure is the same, but other data types don't have domain property anymore
        setDomainsData(dashboardData.domains);
        
        // Map the data to match the expected structure if necessary
        const mappedReferrers = dashboardData.referrers.map((item: Omit<ReferrerStats, 'domain'>) => ({
          ...item,
          domain: '' 
        }));
        
        const mappedBrowsers = dashboardData.browsers.map((item: Omit<BrowserStats, 'domain'>) => ({
          ...item,
          domain: '' 
        }));
        
        const mappedOs = dashboardData.os.map((item: Omit<OSStats, 'domain'>) => ({
          ...item,
          domain: '' 
        }));
        
        const mappedDevices = dashboardData.devices.map((item: Omit<DeviceStats, 'domain'>) => ({
          ...item,
          domain: '' 
        }));
        
        const mappedCountries = dashboardData.countries.map((item: Omit<CountryStats, 'domain'>) => ({
          ...item,
          domain: '' 
        }));
        
        setReferrersData(mappedReferrers);
        setBrowsersData(mappedBrowsers);
        setOsData(mappedOs);
        setDevicesData(mappedDevices);
        setCountriesData(mappedCountries);
      } catch (err: unknown) {
        console.error('Error fetching stats:', err);
        const error = err as Error & {
          code?: string;
          attempts?: number;
          timestamp?: string;
        };
        setError({
          message: error.message || 'An unknown error occurred',
          code: error.code,
          attempts: error.attempts,
          timestamp: error.timestamp,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [dateRange.startDate, dateRange.endDate, includeBots]);

  return (
    <>
      <Header title="Domain Analytics Dashboard" />
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Date Range Picker */}
            <div className="flex justify-end items-center">
              <DateRangePicker
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                onRangeChange={handleDateRangeChange}
                includeBots={includeBots}
                onIncludeBotsChange={handleIncludeBotsChange}
              />
            </div>

            {isLoading ? (
              // Loading state
              <div className="flex items-center justify-center py-12">
                <div className={`animate-spin rounded-full border-b-2 border-blue-500 ${APP_CONFIG.UI.LOADING_SPINNER_SIZE.MEDIUM}`}></div>
              </div>
            ) : error ? (
              // Error state with retry button
              <div className="bg-red-50 border border-red-200 rounded-lg p-6" role="alert">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-red-800">
                      Failed to Load Data
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p className="mb-2">{error.message}</p>
                      {error.code && (
                        <p className="text-xs text-red-600">
                          Error code: {error.code}
                          {error.attempts && ` (after ${error.attempts} attempt${error.attempts > 1 ? 's' : ''})`}
                        </p>
                      )}
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={handleRetry}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                      >
                        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Domains and Referrers Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Domains Stats */}
                  <StatsCard>
                    <TableWithPercentage 
                      data={domainsData} 
                      title="Domains"
                      nameKey="domain"
                      initialItemsToShow={APP_CONFIG.TABLE_PAGINATION.DOMAINS.INITIAL_ITEMS}
                      itemsPerLoad={APP_CONFIG.TABLE_PAGINATION.DOMAINS.ITEMS_PER_LOAD}
                    />
                  </StatsCard>

                  {/* Referrers Stats */}
                  <StatsCard>
                    <TableWithPercentage 
                      data={referrersData} 
                      title="Referrers"
                      nameKey="referrer"
                      startDate={dateRange.startDate}
                      endDate={dateRange.endDate}
                      initialItemsToShow={APP_CONFIG.TABLE_PAGINATION.REFERRERS.INITIAL_ITEMS}
                      itemsPerLoad={APP_CONFIG.TABLE_PAGINATION.REFERRERS.ITEMS_PER_LOAD}
                    />
                  </StatsCard>
                </div>

                {/* Stats Tables Row */}
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

                {/* World Map and Countries side by side */}
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
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
