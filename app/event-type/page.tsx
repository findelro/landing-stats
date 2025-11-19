'use client';

import { useState, useEffect, Suspense } from 'react';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import DateRangePicker from '@/components/DateRangePicker';
import StatsCard from '@/components/StatsCard';
import Header from '@/components/Header';

interface EventDetailStats {
  domain: string;
  event_type: string;
  timestamp: string;
  ip: string;
  country: string;
  browser: string;
  os: string;
  device: string;
}

function EventTypeContent() {
  const searchParams = useSearchParams();
  const eventType = searchParams.get('eventType');

  // Date range state
  const [dateRange, setDateRange] = useState({
    startDate: searchParams.get('startDate') || format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd')
  });

  // Include bots state
  const [includeBots, setIncludeBots] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventData, setEventData] = useState<EventDetailStats[]>([]);

  // Handle date range change
  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate });
  };

  const handleIncludeBotsChange = (include: boolean) => {
    setIncludeBots(include);
  };

  // Fetch event type detail data
  useEffect(() => {
    const fetchEventData = async () => {
      if (!eventType) {
        setError("No event type specified");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/event-type?eventType=${encodeURIComponent(eventType)}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&includeBots=${includeBots}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch data');
        }

        const result = await response.json();
        setEventData(result.data);
      } catch (err) {
        console.error('Error fetching event type data:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventData();
  }, [eventType, dateRange.startDate, dateRange.endDate, includeBots]);

  return (
    <>
      <Header title={`Event Analysis: ${eventType || 'Other'}`} />
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Date picker */}
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : error ? (
              // Error state
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            ) : (
              <StatsCard>
                {eventData.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No events found for &quot;{eventType}&quot; in the selected date range
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {eventData.length} event{eventData.length !== 1 ? 's' : ''} found
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full divide-y divide-gray-100">
                        <thead className="bg-white">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                              Timestamp
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                              Domain
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                              Country
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                              Browser
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                              OS
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                              Device
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                              IP
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {eventData.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                                {new Date(item.timestamp).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs truncate" title={item.domain}>
                                {item.domain}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {item.country || 'Other'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {item.browser || 'Other'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {item.os || 'Other'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {item.device || 'Other'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                                {item.ip}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </StatsCard>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export default function EventTypeDrillDown() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    }>
      <EventTypeContent />
    </Suspense>
  );
}
