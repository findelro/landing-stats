'use client';

import { useState, useEffect, Suspense } from 'react';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import DateRangePicker from '@/components/DateRangePicker';
import StatsCard from '@/components/StatsCard';
import Header from '@/components/Header';

interface EventDetailStats {
  id: number;
  domain: string;
  event_type: string;
  timestamp: string;
  ip: string;
  country: string;
  browser: string;
  os: string;
  device: string;
  acknowledged: boolean;
}

function ActionTypeContent() {
  const searchParams = useSearchParams();
  const actionType = searchParams.get('actionType');

  // Date range state
  const [dateRange, setDateRange] = useState({
    startDate: searchParams.get('startDate') || format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: searchParams.get('endDate') || format(new Date(), 'yyyy-MM-dd')
  });

  // Include bots state
  const [includeBots, setIncludeBots] = useState(false);

  // Include acknowledged state
  const [includeAcknowledged, setIncludeAcknowledged] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventData, setEventData] = useState<EventDetailStats[]>([]);

  // Selection state for acknowledgment
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Handle date range change
  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate });
  };

  const handleIncludeBotsChange = (include: boolean) => {
    setIncludeBots(include);
  };

  const handleIncludeAcknowledgedChange = (include: boolean) => {
    setIncludeAcknowledged(include);
  };

  // Handle individual checkbox toggle
  const handleCheckboxChange = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Handle select all toggle
  const handleSelectAll = () => {
    if (selectedIds.size === eventData.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all
      setSelectedIds(new Set(eventData.map(item => item.id)));
    }
  };

  // Handle acknowledge button click
  const handleAcknowledge = async () => {
    if (selectedIds.size === 0) return;

    setIsAcknowledging(true);
    setError(null);

    try {
      const response = await fetch('/api/acknowledge-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventIds: Array.from(selectedIds)
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to acknowledge events');
      }

      // Clear selections and refresh data
      setSelectedIds(new Set());

      // Refetch the data
      const dataResponse = await fetch(
        `/api/action-type?actionType=${encodeURIComponent(actionType!)}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&includeBots=${includeBots}&excludeAcknowledged=${!includeAcknowledged}`
      );

      if (dataResponse.ok) {
        const result = await dataResponse.json();
        setEventData(result.data);
      }
    } catch (err) {
      console.error('Error acknowledging events:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsAcknowledging(false);
    }
  };

  // Fetch action type detail data
  useEffect(() => {
    const fetchEventData = async () => {
      if (!actionType) {
        setError("No action type specified");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/action-type?actionType=${encodeURIComponent(actionType)}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&includeBots=${includeBots}&excludeAcknowledged=${!includeAcknowledged}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch data');
        }

        const result = await response.json();
        setEventData(result.data);
      } catch (err) {
        console.error('Error fetching action type data:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventData();
  }, [actionType, dateRange.startDate, dateRange.endDate, includeBots, includeAcknowledged]);

  // Clear selections when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [eventData]);

  return (
    <>
      <Header title={`Action Analysis: ${actionType || 'Other'}`} />
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Date picker and filters */}
            <div className="flex justify-end items-center gap-4">
              {actionType === 'probe_attempt' && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAcknowledged}
                    onChange={(e) => handleIncludeAcknowledgedChange(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span>Include Ack&apos;d</span>
                </label>
              )}
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
                    No actions found for &quot;{actionType}&quot; in the selected date range
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {eventData.length} action{eventData.length !== 1 ? 's' : ''} found
                      </h3>
                      {actionType === 'probe_attempt' && (
                        <button
                          onClick={handleAcknowledge}
                          disabled={selectedIds.size === 0 || isAcknowledging}
                          className={`px-4 py-2 rounded font-medium ${
                            selectedIds.size === 0 || isAcknowledging
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {isAcknowledging ? 'Acknowledging...' : `Ack ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full divide-y divide-gray-100">
                        <thead className="bg-white">
                          <tr>
                            {actionType === 'probe_attempt' && (
                              <th scope="col" className="px-4 py-3 text-left">
                                <input
                                  type="checkbox"
                                  checked={eventData.length > 0 && selectedIds.size === eventData.length}
                                  onChange={handleSelectAll}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                              </th>
                            )}
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
                          {eventData.map((item) => (
                            <tr key={item.id} className={`hover:bg-gray-50 ${actionType === 'probe_attempt' && item.acknowledged ? 'opacity-50 bg-gray-50' : ''}`}>
                              {actionType === 'probe_attempt' && (
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => handleCheckboxChange(item.id)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                    disabled={item.acknowledged}
                                  />
                                </td>
                              )}
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

export default function ActionTypeDrillDown() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    }>
      <ActionTypeContent />
    </Suspense>
  );
}
